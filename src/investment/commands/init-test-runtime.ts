import { hasOption } from "../cli-options.js";
import { initializeTestRuntime } from "../runtime/test-runtime.js";

export async function runInitTestRuntimeCommand(options: string[], repoRoot: string): Promise<void> {
  const testRuntimePath = await initializeTestRuntime(repoRoot, hasOption(options, "reset"));
  console.log(`initialized test runtime: ${testRuntimePath}`);
}
