import { printWorkflowResult } from "../cli-output.js";
import { parseOption, parseTriggerType, parseWorkflowId } from "../cli-options.js";
import { todayInShanghai } from "../lib/filesystem.js";
import { startWorkflow } from "../workflows/registry.js";

export async function runWorkflowRunCommand(options: string[]): Promise<void> {
  const workflowId = parseWorkflowId(options);
  const runDate = parseOption(options, "date") ?? todayInShanghai();
  const threadId = parseOption(options, "thread-id");
  const triggerType = parseTriggerType(options);
  const result = await startWorkflow({
    workflowId,
    runDate,
    threadId,
    triggerType,
  });
  printWorkflowResult(result);
}
