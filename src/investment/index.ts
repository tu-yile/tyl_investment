import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveInvestmentRuntimePathsFromRoot } from "./runtime/paths.js";
import type { WorkflowExecutionResult, WorkflowId, WorkflowTriggerType } from "./workflows/types.js";
import { todayInShanghai } from "./lib/filesystem.js";
import { startLarkGatewaySubsystem } from "../lark/bootstrap.js";
import { startWorkflow, listWorkflows, resumeWorkflow } from "./workflows/registry.js"

const WORKFLOW_IDS: WorkflowId[] = [
  "daily-position-decision",
  "emergency-reassessment",
  "post-close-update",
];

const WORKFLOW_TRIGGER_TYPES: WorkflowTriggerType[] = [
  "manual",
  "scheduled",
  "event_driven",
];

// 命令形态保持很轻，优先服务本地手工运行和后续接入网关。
function parseArgs(argv: string[]): { command: string; options: string[] } {
  const [command = "help", ...options] = argv;
  return { command, options };
}

function parseOption(options: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return options.find((option) => option.startsWith(prefix))?.slice(prefix.length);
}

function hasOption(options: string[], name: string): boolean {
  return options.includes(`--${name}`);
}

function parseWorkflowId(options: string[]): WorkflowId {
  const workflowId = parseOption(options, "workflow");
  if (!workflowId || !WORKFLOW_IDS.includes(workflowId as WorkflowId)) {
    throw new Error(`Missing or invalid --workflow. Expected one of: ${WORKFLOW_IDS.join(", ")}`);
  }
  return workflowId as WorkflowId;
}

function parseTriggerType(options: string[]): WorkflowTriggerType {
  const triggerType = parseOption(options, "trigger-type");
  if (!triggerType) {
    return "manual";
  }
  if (!WORKFLOW_TRIGGER_TYPES.includes(triggerType as WorkflowTriggerType)) {
    throw new Error(`Invalid --trigger-type. Expected one of: ${WORKFLOW_TRIGGER_TYPES.join(", ")}`);
  }
  return triggerType as WorkflowTriggerType;
}

function printWorkflowResult(result: WorkflowExecutionResult): void {
  console.log(`workflow: ${result.workflowId}`);
  console.log(`status: ${result.status}`);
  console.log(`thread: ${result.threadId}`);
  console.log(`run date: ${result.runDate}`);
  if (result.artifacts.outputMarkdownPath) {
    console.log(`output markdown: ${result.artifacts.outputMarkdownPath}`);
  }
  if (result.artifacts.actionLogPath) {
    console.log(`action log: ${result.artifacts.actionLogPath}`);
  }
  if (result.artifacts.portfolioMemoryPath) {
    console.log(`portfolio memory: ${result.artifacts.portfolioMemoryPath}`);
  }
  if (result.interrupts?.length) {
    console.log(`awaiting approval: ${JSON.stringify(result.interrupts[0]?.value ?? {}, null, 2)}`);
  }
  if (result.approvalDecision) {
    console.log(`approval decision: ${result.approvalDecision.decision}`);
  }
}

async function validateMarkdown(root: string): Promise<void> {
  const { loadCollection } = await import("./lib/loaders.js");
  const { validateRegisteredWorkflows } = await import("./workflows/registry.js");
  const runtimePaths = resolveInvestmentRuntimePathsFromRoot(root);
  // validate 只校验运行时真正依赖的 Markdown 资产，说明性 README 与 workflow 文档不参与。
  const targets = [
    runtimePaths.configRoot,
    runtimePaths.agentsRoot,
    path.join(runtimePaths.knowledgeRoot, "industries"),
    path.join(runtimePaths.knowledgeRoot, "companies"),
  ];

  for (const target of targets) {
    const docs = await loadCollection(target);
    for (const doc of docs) {
      if (path.basename(doc.path) === "README.md") {
        continue;
      }
      if (!doc.frontmatter.kind) {
        throw new Error(`Missing kind in ${doc.path}`);
      }
    }
  }

  // workflow 配置以 registry 为准，额外校验注册定义本身是否完整。
  await validateRegisteredWorkflows(root);
}

function printUsage(): void {
  console.log("usage:");
  console.log("  node dist/index.js validate-md");
  console.log("  node dist/index.js workflow:list");
  console.log("  node dist/index.js workflow:run --workflow=daily-position-decision --date=2026-04-09");
  console.log("  node dist/index.js workflow:resume --workflow=daily-position-decision --thread-id=daily-position-decision:2026-04-09");
  console.log("  node dist/index.js init-test-runtime [--reset]");
  console.log("  node dist/index.js cleanup-test-runtime [--force-test-path]");
  console.log("  node dist/index.js rebuild-state");
  console.log("  node dist/index.js gateway");
}

export async function runInvestmentCli(argv: string[]): Promise<void> {
  const { command, options } = parseArgs(argv);
  const repoRoot = process.cwd();
  const investmentRoot = path.join(repoRoot, "investment");

  // 这里的命令映射就是 v1 的最小操作面：
  // 校验、跑 workflow、审批写回、重建组合记忆。
  switch (command) {
    case "validate-md": {
      await validateMarkdown(investmentRoot);
      console.log(`validated markdown under ${investmentRoot}`);
      return;
    }
    case "workflow:list": {
      const workflows = await listWorkflows();
      for (const workflow of workflows) {
        const resumeTag = workflow.supportsResume ? "resume" : "start-only";
        console.log(
          `- ${workflow.id} [${workflow.implementationStatus}] ${workflow.metadata.name} -> ${workflow.metadata.outputName} (${resumeTag})`,
        );
      }
      return;
    }
    case "workflow:run": {
      const workflowId = parseWorkflowId(options);
      const runDate = parseOption(options, "date") ?? todayInShanghai();
      const threadId = parseOption(options, "thread-id");
      const triggerType = parseTriggerType(options);
      const result = await startWorkflow({
        workflowId,
        investmentRoot,
        runDate,
        threadId,
        triggerType,
      });
      printWorkflowResult(result);
      return;
    }
    case "workflow:resume": {
      const workflowId = parseWorkflowId(options);
      const threadId = parseOption(options, "thread-id");
      if (!threadId) {
        throw new Error("workflow:resume requires --thread-id");
      }
      const runDate = parseOption(options, "date");
      if (workflowId === "daily-position-decision") {
        const decision = parseOption(options, "decision") ?? "approve";
        const reviewer = parseOption(options, "reviewer") ?? "unknown";
        const notes = parseOption(options, "notes") ?? "";
        const result = await resumeWorkflow({
          workflowId,
          investmentRoot,
          runDate,
          threadId,
          decision: decision === "reject" ? "reject" : "approve",
          reviewer,
          notes,
        });
        printWorkflowResult(result);
        return;
      }
      const result = await resumeWorkflow({
        workflowId,
        investmentRoot,
        runDate,
        threadId,
      });
      printWorkflowResult(result);
      return;
    }
    case "rebuild-state": {
      const { rebuildPortfolioMemory } = await import("./lib/state-manager.js");
      const outputPath = await rebuildPortfolioMemory(investmentRoot);
      console.log(`rebuilt portfolio memory: ${outputPath}`);
      return;
    }
    case "init-test-runtime": {
      const { initializeTestRuntime } = await import("./runtime/test-runtime.js");
      const testRuntimePath = await initializeTestRuntime(repoRoot, hasOption(options, "reset"));
      console.log(`initialized test runtime: ${testRuntimePath}`);
      return;
    }
    case "cleanup-test-runtime": {
      const { cleanupTestRuntime } = await import("./runtime/test-runtime.js");
      const deletedPath = await cleanupTestRuntime(repoRoot, hasOption(options, "force-test-path"));
      console.log(`cleaned test runtime: ${deletedPath}`);
      return;
    }
    case "gateway": {
      
      await startLarkGatewaySubsystem();
      return;
    }
    default: {
      printUsage();
    }
  }
}

function isDirectExecution(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectExecution()) {
  runInvestmentCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
