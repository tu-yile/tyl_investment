import { pathToFileURL } from "node:url";
import { runAgentCommand } from "./commands/agent-run.js";
import { runGatewayCommand } from "./commands/gateway.js";
import { runRebuildStateCommand } from "./commands/rebuild-state.js";
import { runScheduleCommand } from "./commands/schedule-run.js";
import { runValidateMarkdownCommand } from "./commands/validate-md.js";

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
  console.log("  node dist/index.js rebuild-state");
  console.log("  node dist/index.js schedule:run [--config=investment/config/schedules.json]");
  console.log("  node dist/index.js gateway");
}

export async function runInvestmentCli(argv: string[]): Promise<void> {
  const { command, options } = parseArgs(argv);
  const repoRoot = process.cwd();

  switch (command) {
    case "validate-md": {
      await runValidateMarkdownCommand();
      return;
    }
    case "agent:run": {
      await runAgentCommand(options, repoRoot);
      return;
    }
    case "rebuild-state": {
      await runRebuildStateCommand();
      return;
    }
    case "schedule:run": {
      await runScheduleCommand(options, repoRoot);
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
