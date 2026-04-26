import fs from "node:fs/promises";
import path from "node:path";
import type { IndustryRecord, ThesisRecord } from "../types.js";
import { buildAgentRuntimeHeader, runAgentTurn, stringifyPromptContext } from "./app-server-client.js";

// Prompting 层只负责“把 agent 文档 + 运行时上下文”拼成一次可执行 turn。
// 这样 executors 文件只关心字段映射和业务校验。

export function nowIso(): string {
  return new Date().toISOString();
}

export function resolveStandaloneAgentsRoot(): string {
  return path.join(process.cwd(), "investment", "agents");
}

export async function extractAgentMarkdown(agentId: string): Promise<string> {
  return fs.readFile(path.join(resolveStandaloneAgentsRoot(), `${agentId}.md`), "utf8");
}

export function buildPrompt(agentId: string, responseContract: string, contextBlocks: string[]): string {
  return [
    buildAgentRuntimeHeader(agentId),
    "",
    "Response Contract:",
    responseContract,
    "",
    ...contextBlocks,
  ].join("\n");
}

export async function runAgent(
  agentId: string,
  responseContract: string,
  contextBlocks: string[],
): Promise<string> {
  const agentMarkdown = await extractAgentMarkdown(agentId);
  return runAgentWithBaseInstructions(agentId, agentMarkdown, responseContract, contextBlocks);
}

export async function runAgentWithBaseInstructions(
  agentId: string,
  baseInstructions: string,
  responseContract: string,
  contextBlocks: string[],
): Promise<string> {
  const prompt = buildPrompt(agentId, responseContract, contextBlocks);
  const result = await runAgentTurn({
    agentId,
    repoRoot: process.cwd(),
    baseInstructions,
    prompt,
  });
  return result.finalText;
}

export function thesisDigest(thesis: ThesisRecord): Record<string, unknown> {
  return {
    thesisId: thesis.thesisId,
    ticker: thesis.ticker,
    companyName: thesis.companyName,
    industryId: thesis.industryId,
    status: thesis.status,
    catalystStrength: thesis.catalystStrength,
    valuationView: thesis.valuationView,
    riskLevel: thesis.riskLevel,
    confidenceBase: thesis.confidenceBase,
    monitoringFlags: thesis.monitoringFlags,
    coreClaim: thesis.sections["Core Claim"] ?? "",
    keyDebate: thesis.sections["Key Debate"] ?? "",
  };
}

export function industryDigest(industry: IndustryRecord): Record<string, unknown> {
  return {
    industryId: industry.industryId,
    name: industry.name,
    currentView: industry.currentView,
    recentChange: industry.recentChange,
    keySignals: industry.keySignals,
    watchpoints: industry.watchpoints,
  };
}

export { stringifyPromptContext };
