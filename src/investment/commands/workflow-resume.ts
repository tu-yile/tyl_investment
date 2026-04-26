import { printWorkflowResult } from "../cli-output.js";
import { parseOption, parseWorkflowId } from "../cli-options.js";
import { resumeWorkflow } from "../workflows/registry.js";

export async function runWorkflowResumeCommand(options: string[]): Promise<void> {
  const workflowId = parseWorkflowId(options);
  const threadId = parseOption(options, "thread-id");
  if (!threadId) {
    throw new Error("workflow:resume requires --thread-id");
  }
  const runDate = parseOption(options, "date");
  if (workflowId === "daily-position-decision") {
    const decision = parseOption(options, "decision") ?? "approve";
    const reviewer = parseOption(options, "reviewer") ?? "unknown";
    const notes = parseOption(options, "notes") ?? "";
    const result = await resumeWorkflow({
      workflowId,
      runDate,
      threadId,
      decision: decision === "reject" ? "reject" : "approve",
      reviewer,
      notes,
    });
    printWorkflowResult(result);
    return;
  }
  const result = await resumeWorkflow({
    workflowId,
    runDate,
    threadId,
  });
  printWorkflowResult(result);
}
