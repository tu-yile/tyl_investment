import path from "node:path";
import { loadCollection } from "../lib/loaders.js";
import { resolveCurrentInvestmentRuntimePaths } from "../runtime/paths.js";
import { validateRegisteredWorkflows } from "../workflows/registry.js";

export async function runValidateMarkdownCommand(): Promise<void> {
  const runtimePaths = resolveCurrentInvestmentRuntimePaths();
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

  await validateRegisteredWorkflows();
  console.log(`validated markdown under ${runtimePaths.investmentRoot}`);
}
