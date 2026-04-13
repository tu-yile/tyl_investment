import path from "node:path";
import { pathToFileURL } from "node:url";
import type { WorkflowExecutionResult, WorkflowId, WorkflowTriggerType } from "./workflows/types.js";

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
  if (result.artifacts.outputJsonPath) {
    console.log(`output json: ${result.artifacts.outputJsonPath}`);
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
  const { validateRegisteredWorkflowMetadata } = await import("./workflows/registry.js");
  // validate 只校验运行时真正依赖的 Markdown 资产，说明性 README 不参与。
  const targets = [
    "config",
    "workflows",
    "agents",
    "knowledge/industries",
    "knowledge/companies",
    "portfolio/positions",
    "portfolio/candidates",
    "state",
  ];

  for (const target of targets) {
    const docs = await loadCollection(path.join(root, target));
    for (const doc of docs) {
      if (path.basename(doc.path) === "README.md") {
        continue;
      }
      if (!doc.frontmatter.kind) {
        throw new Error(`Missing kind in ${doc.path}`);
      }
    }
  }

  // workflow Markdown 现在是 registry 的配套资产。
  // 这里额外校验 code definition 与 markdown frontmatter 是否一致。
  await validateRegisteredWorkflowMetadata(root);
}

function printUsage(): void {
  console.log("usage:");
  console.log("  node dist/index.js validate-md");
  console.log("  node dist/index.js workflow:list");
  console.log("  node dist/index.js workflow:run --workflow=daily-position-decision --date=2026-04-09");
  console.log("  node dist/index.js workflow:resume --workflow=daily-position-decision --thread-id=daily-position-decision:2026-04-09");
  console.log("  node dist/index.js daily-run --date=2026-04-09");
  console.log("  node dist/index.js approve-sheet --date=2026-04-09 --decision=approve --reviewer=TuYile");
  console.log("  node dist/index.js db:sync-markdown --source-root=/path/to/legacy/investment");
  console.log("  node dist/index.js rebuild-state");
  console.log("  node dist/index.js gateway");
}

export async function runInvestmentCli(argv: string[]): Promise<void> {
  const { command, options } = parseArgs(argv);
  const repoRoot = process.cwd();
  const investmentRoot = path.join(repoRoot, "investment");

  // 这里的命令映射就是 v1 的最小操作面：
  // 校验、跑每日流、审批写回、重建组合记忆。
  switch (command) {
    case "validate-md": {
      await validateMarkdown(investmentRoot);
      console.log(`validated markdown under ${investmentRoot}`);
      return;
    }
    case "workflow:list": {
      const { listWorkflows } = await import("./workflows/registry.js");
      const workflows = await listWorkflows(investmentRoot);
      for (const workflow of workflows) {
        const resumeTag = workflow.supportsResume ? "resume" : "start-only";
        console.log(
          `- ${workflow.id} [${workflow.implementationStatus}] ${workflow.metadata.name} -> ${workflow.metadata.outputName} (${resumeTag})`,
        );
      }
      return;
    }
    case "workflow:run": {
      const { todayInShanghai } = await import("./lib/filesystem.js");
      const { startWorkflow } = await import("./workflows/registry.js");
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
      const { resumeWorkflow } = await import("./workflows/registry.js");
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
    case "daily-run": {
      const { todayInShanghai } = await import("./lib/filesystem.js");
      const { startWorkflow } = await import("./workflows/registry.js");
      const { buildDailyRunThreadId } = await import("./workflows/daily-position-decision/index.js");
      const runDate = parseOption(options, "date") ?? todayInShanghai();
      const threadId = parseOption(options, "thread-id") ?? buildDailyRunThreadId(runDate);
      const result = await startWorkflow({
        workflowId: "daily-position-decision",
        investmentRoot,
        runDate,
        threadId,
        triggerType: "manual",
      });
      printWorkflowResult(result);
      return;
    }
    case "approve-sheet": {
      const { todayInShanghai } = await import("./lib/filesystem.js");
      const { resumeWorkflow } = await import("./workflows/registry.js");
      const { buildDailyRunThreadId } = await import("./workflows/daily-position-decision/index.js");
      const runDate = parseOption(options, "date") ?? todayInShanghai();
      const threadId = parseOption(options, "thread-id") ?? buildDailyRunThreadId(runDate);
      const decision = parseOption(options, "decision") ?? "approve";
      const reviewer = parseOption(options, "reviewer") ?? "unknown";
      const notes = parseOption(options, "notes") ?? "";
      const result = await resumeWorkflow({
        workflowId: "daily-position-decision",
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
    case "rebuild-state": {
      const { rebuildPortfolioMemory } = await import("./lib/state-manager.js");
      const outputPath = await rebuildPortfolioMemory(investmentRoot);
      console.log(`rebuilt portfolio memory: ${outputPath}`);
      return;
    }
    case "db:sync-markdown": {
      const { syncMarkdownStateToDb } = await import("./lib/state-manager.js");
      const sourceRoot = parseOption(options, "source-root");
      const portfolioId = parseOption(options, "portfolio-id");
      const tradeDate = parseOption(options, "trade-date");
      const result = await syncMarkdownStateToDb(investmentRoot, {
        sourceRoot,
        portfolioId,
        tradeDate,
      });
      console.log(`sqlite runtime sync source: ${result.sourceRoot}`);
      console.log(`portfolio: ${result.portfolioId}`);
      console.log(`trade date: ${result.tradeDate}`);
      console.log(`inserted: ${JSON.stringify(result.inserted, null, 2)}`);
      console.log(`conflicts: ${result.conflicts.length}`);
      if (result.conflicts.length > 0) {
        console.log(JSON.stringify(result.conflicts, null, 2));
      }
      return;
    }
    case "gateway": {
      const { startLarkGatewaySubsystem } = await import("../lark/bootstrap.js");
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
