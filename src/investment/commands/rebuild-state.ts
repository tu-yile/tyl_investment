import { rebuildPortfolioMemory } from "../lib/state-manager.js";

export async function runRebuildStateCommand(): Promise<void> {
  const outputPath = await rebuildPortfolioMemory();
  console.log(`rebuilt portfolio memory: ${outputPath}`);
}
