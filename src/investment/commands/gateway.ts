import { startLarkGatewaySubsystem } from "../../lark/bootstrap.js";

export async function runGatewayCommand(): Promise<void> {
  await startLarkGatewaySubsystem();
}
