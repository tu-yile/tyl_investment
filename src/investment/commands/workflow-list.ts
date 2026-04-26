import { listWorkflows } from "../workflows/registry.js";

export async function runWorkflowListCommand(): Promise<void> {
  const workflows = await listWorkflows();
  for (const workflow of workflows) {
    const resumeTag = workflow.supportsResume ? "resume" : "start-only";
    console.log(
      `- ${workflow.id} [${workflow.implementationStatus}] ${workflow.metadata.name} -> ${workflow.metadata.outputName} (${resumeTag})`,
    );
  }
}
