import { hasOption } from "../cli-options.js";
import { cleanupTestRuntime } from "../runtime/test-runtime.js";

export async function runCleanupTestRuntimeCommand(options: string[], repoRoot: string): Promise<void> {
  const deletedPath = await cleanupTestRuntime(repoRoot, hasOption(options, "force-test-path"));
  console.log(`cleaned test runtime: ${deletedPath}`);
}
