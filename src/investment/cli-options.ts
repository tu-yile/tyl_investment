import type { WorkflowId, WorkflowTriggerType } from "./workflows/types.js";

const WORKFLOW_IDS: WorkflowId[] = [
  "daily-position-decision",
  "emergency-reassessment",
  "post-close-update",
];

const WORKFLOW_TRIGGER_TYPES: WorkflowTriggerType[] = [
  "manual",
  "scheduled",
  "event_driven",
];

export function parseOption(options: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return options.find((option) => option.startsWith(prefix))?.slice(prefix.length);
}

export function parseOptions(options: string[], name: string): string[] {
  const prefix = `--${name}=`;
  return options
    .filter((option) => option.startsWith(prefix))
    .map((option) => option.slice(prefix.length));
}

export function hasOption(options: string[], name: string): boolean {
  return options.includes(`--${name}`);
}

export function parseWorkflowId(options: string[]): WorkflowId {
  const workflowId = parseOption(options, "workflow");
  if (!workflowId || !WORKFLOW_IDS.includes(workflowId as WorkflowId)) {
    throw new Error(`Missing or invalid --workflow. Expected one of: ${WORKFLOW_IDS.join(", ")}`);
  }
  return workflowId as WorkflowId;
}

export function parseTriggerType(options: string[]): WorkflowTriggerType {
  const triggerType = parseOption(options, "trigger-type");
  if (!triggerType) {
    return "manual";
  }
  if (!WORKFLOW_TRIGGER_TYPES.includes(triggerType as WorkflowTriggerType)) {
    throw new Error(`Invalid --trigger-type. Expected one of: ${WORKFLOW_TRIGGER_TYPES.join(", ")}`);
  }
  return triggerType as WorkflowTriggerType;
}
