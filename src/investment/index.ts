import path from "node:path";
import { todayInShanghai } from "./lib/filesystem.js";
import { loadCollection } from "./lib/loaders.js";
import { runDailyWorkflow } from "./lib/daily-workflow.js";
import { approveSheet, rebuildPortfolioMemory } from "./lib/state-manager.js";

// 命令形态保持很轻，优先服务本地手工运行和后续接入网关。
function parseArgs(argv: string[]): { command: string; options: string[] } {
  const [command = "help", ...options] = argv;
  return { command, options };
}

function parseOption(options: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return options.find((option) => option.startsWith(prefix))?.slice(prefix.length);
}

async function validateMarkdown(root: string): Promise<void> {
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
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));
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
    case "daily-run": {
      const runDate = parseOption(options, "date") ?? todayInShanghai();
      const result = await runDailyWorkflow(investmentRoot, runDate);
      await rebuildPortfolioMemory(investmentRoot);
      console.log(`daily run completed for ${runDate}`);
      console.log(`operation sheet: ${result.outputMarkdownPath}`);
      return;
    }
    case "approve-sheet": {
      const outputPath = await approveSheet(investmentRoot, options);
      console.log(`approval recorded: ${outputPath}`);
      return;
    }
    case "rebuild-state": {
      const outputPath = await rebuildPortfolioMemory(investmentRoot);
      console.log(`rebuilt portfolio memory: ${outputPath}`);
      return;
    }
    default: {
      console.log("usage:");
      console.log("  node dist/investment/index.js validate-md");
      console.log("  node dist/investment/index.js daily-run --date=2026-04-09");
      console.log("  node dist/investment/index.js approve-sheet --date=2026-04-09 --decision=approve --reviewer=TuYile");
      console.log("  node dist/investment/index.js rebuild-state");
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
