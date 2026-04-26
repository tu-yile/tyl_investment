import { pathToFileURL } from "node:url";
import { runAgentCommand } from "./commands/agent-run.js";
import { runCleanupTestRuntimeCommand } from "./commands/cleanup-test-runtime.js";
import { runGatewayCommand } from "./commands/gateway.js";
import { runInitTestRuntimeCommand } from "./commands/init-test-runtime.js";
import { runRebuildStateCommand } from "./commands/rebuild-state.js";
import { runValidateMarkdownCommand } from "./commands/validate-md.js";
import { runWorkflowListCommand } from "./commands/workflow-list.js";
import { runWorkflowResumeCommand } from "./commands/workflow-resume.js";
import { runWorkflowRunCommand } from "./commands/workflow-run.js";

// 命令形态保持很轻，优先服务本地手工运行和后续接入网关。
function parseArgs(argv: string[]): { command: string; options: string[] } {
  const [command = "help", ...options] = argv;
  return { command, options };
}

function printUsage(): void {
  console.log("usage:");
  console.log("  node dist/index.js validate-md");
  console.log("  node dist/index.js agent:run --agent=information-collector --context-file=tmp/context.md");
  console.log("  node dist/index.js agent:run --agent=industry-analyst --subject=power-equipment");
  console.log("  node dist/index.js agent:run --agent=company-analyst --subject=300750");
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

  // 这里的命令映射就是 v1 的最小操作面：
  // 校验、跑 workflow、审批写回、重建组合记忆。
  switch (command) {
    case "validate-md": {
      await runValidateMarkdownCommand();
      return;
    }
    case "agent:run": {
      await runAgentCommand(options, repoRoot);
      return;
    }
    case "workflow:list": {
      await runWorkflowListCommand();
      return;
    }
    case "workflow:run": {
      await runWorkflowRunCommand(options);
      return;
    }
    case "workflow:resume": {
      await runWorkflowResumeCommand(options);
      return;
    }
    case "rebuild-state": {
      await runRebuildStateCommand();
      return;
    }
    case "init-test-runtime": {
      await runInitTestRuntimeCommand(options, repoRoot);
      return;
    }
    case "cleanup-test-runtime": {
      await runCleanupTestRuntimeCommand(options, repoRoot);
      return;
    }
    case "gateway": {
      await runGatewayCommand();
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
