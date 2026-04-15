import path from "node:path";
import { readText } from "../lib/filesystem.js";
import { resolveInvestmentRuntimePathsFromRoot } from "../runtime/paths.js";
import {
  builtInAgentDefinitions,
} from "../llm/agent-executors.js";
import { runAgentDefinition } from "./runtime.js";
import type {
  AgentDefinition,
  AgentId,
  RegisteredAgentDescriptor,
} from "./types.js";

const agentRegistry = new Map<AgentId, AgentDefinition<any, any, any, any>>();

function registerBuiltinAgents(): void {
  for (const definition of builtInAgentDefinitions) {
    registerAgent(definition);
  }
}

export function registerAgent(definition: AgentDefinition<any, any, any, any>): void {
  if (agentRegistry.has(definition.id)) {
    throw new Error(`agent already registered: ${definition.id}`);
  }
  agentRegistry.set(definition.id, definition);
}

export function getAgentDefinition(agentId: AgentId): AgentDefinition<any, any, any, any> {
  const definition = agentRegistry.get(agentId);
  if (!definition) {
    throw new Error(`Unknown agent: ${agentId}`);
  }
  return definition;
}

export function listAgents(): RegisteredAgentDescriptor[] {
  return [...agentRegistry.values()].map((definition) => ({
    id: definition.id,
    markdownPath: definition.markdownPath,
  }));
}

export async function validateRegisteredAgents(investmentRoot: string): Promise<void> {
  const runtimePaths = resolveInvestmentRuntimePathsFromRoot(investmentRoot);
  for (const descriptor of listAgents()) {
    const pathname = path.join(runtimePaths.envRoot, descriptor.markdownPath);
    const markdown = await readText(pathname);
    if (!markdown.trim()) {
      throw new Error(`Agent markdown is empty: ${pathname}`);
    }
  }
}

export async function runRegisteredAgent<
  TSharedState,
  TPrivateState,
>(
  agentId: AgentId,
  sharedState: TSharedState,
  privateState: TPrivateState,
  ctx: Parameters<typeof runAgentDefinition<TSharedState, TPrivateState, unknown>>[3],
): Promise<TPrivateState> {
  const definition = getAgentDefinition(agentId) as AgentDefinition<TSharedState, TPrivateState, unknown, any>;
  return runAgentDefinition(definition, sharedState, privateState, ctx);
}

registerBuiltinAgents();
