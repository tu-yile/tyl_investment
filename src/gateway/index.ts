import { pathToFileURL } from "node:url";
import { startLarkGatewaySubsystem } from "#src/lark/bootstrap.js";

export async function runGatewayCli(): Promise<void> {
  await startLarkGatewaySubsystem();
}

function isDirectExecution(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectExecution()) {
  runGatewayCli().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
