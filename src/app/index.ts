import { startLarkGatewaySubsystem } from "#src/lark/bootstrap.js";

startLarkGatewaySubsystem().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
