import path from "node:path";
import { readText } from "../lib/filesystem.js";
import { resolveCurrentInvestmentRuntimePaths } from "../runtime/paths.js";
import type {
  AgentId,
  RegisteredAgentDescriptor,
} from "./types.js";

const agentDescriptors: RegisteredAgentDescriptor[] = [
  { id: "information-collector", markdownPath: "agents/information-collector.md" },
  { id: "macro-policy-analyst", markdownPath: "agents/macro-policy-analyst.md" },
  { id: "industry-analyst", markdownPath: "agents/industry-analyst.md" },
  { id: "company-analyst", markdownPath: "agents/company-analyst.md" },
  { id: "bear-case-analyst", markdownPath: "agents/bear-case-analyst.md" },
  { id: "portfolio-manager", markdownPath: "agents/portfolio-manager.md" },
  { id: "risk-officer", markdownPath: "agents/risk-officer.md" },
  { id: "chief-investment-officer", markdownPath: "agents/chief-investment-officer.md" },
];

export function listAgents(): RegisteredAgentDescriptor[] {
  return [...agentDescriptors];
}

export async function validateRegisteredAgents(): Promise<void> {
  const runtimePaths = resolveCurrentInvestmentRuntimePaths();
  for (const descriptor of listAgents()) {
    const pathname = path.join(runtimePaths.investmentRoot, descriptor.markdownPath);
    const markdown = await readText(pathname);
    if (!markdown.trim()) {
      throw new Error(`Agent markdown is empty: ${pathname}`);
    }
  }
}
