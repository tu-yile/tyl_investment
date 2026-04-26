import type { WorkflowExecutionResult } from "./workflows/types.js";

export function printWorkflowResult(result: WorkflowExecutionResult): void {
  console.log(`workflow: ${result.workflowId}`);
  console.log(`status: ${result.status}`);
  console.log(`thread: ${result.threadId}`);
  console.log(`run date: ${result.runDate}`);
  if (result.artifacts.outputMarkdownPath) {
    console.log(`output markdown: ${result.artifacts.outputMarkdownPath}`);
  }
  if (result.artifacts.actionLogPath) {
    console.log(`action log: ${result.artifacts.actionLogPath}`);
  }
  if (result.artifacts.portfolioMemoryPath) {
    console.log(`portfolio memory: ${result.artifacts.portfolioMemoryPath}`);
  }
  if (result.interrupts?.length) {
    console.log(`awaiting approval: ${JSON.stringify(result.interrupts[0]?.value ?? {}, null, 2)}`);
  }
  if (result.approvalDecision) {
    console.log(`approval decision: ${result.approvalDecision.decision}`);
  }
}
