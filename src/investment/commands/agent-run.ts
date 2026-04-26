import fs from "node:fs/promises";
import path from "node:path";
import { getAgentDefinition } from "../agents/registry.js";
import type { AgentId } from "../agents/types.js";
import { parseOption, parseOptions } from "../cli-options.js";
import { runAgent } from "../llm/prompting.js";
import { resolveStandaloneAgentsRoot } from "../llm/prompting.js";

interface MarkdownAgentDescriptor {
  id: string;
}

async function listMarkdownAgents(): Promise<MarkdownAgentDescriptor[]> {
  const agentsRoot = resolveStandaloneAgentsRoot();
  const entries = await fs.readdir(agentsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
    .map((entry) => ({
      id: path.basename(entry.name, ".md"),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function parseAgentId(options: string[]): Promise<string> {
  const agentId = parseOption(options, "agent");
  const agents = await listMarkdownAgents();
  const agentIds = agents.map((agent) => agent.id);
  if (!agentId || !agentIds.includes(agentId)) {
    throw new Error(`Missing or invalid --agent. Expected one of: ${agentIds.join(", ")}`);
  }
  return agentId;
}

function buildStandaloneAgentPromptGuide(agentId: string): string {
  try {
    return getAgentDefinition(agentId as AgentId).buildPromptGuide();
  } catch {
    return [
      "Return exactly two top-level sections:",
      "",
      "## Analysis",
      "Write the agent's analysis in Markdown.",
      "",
      "## Handoff",
      "Return a fenced JSON block with any structured fields this standalone run should hand off.",
      "If there are no structured fields, return an empty object.",
    ].join("\n");
  }
}

export async function runAgentCommand(options: string[], repoRoot: string): Promise<void> {
  const agentId = await parseAgentId(options);
  const inlineContexts = parseOptions(options, "context");
  const contextFiles = await Promise.all(
    parseOptions(options, "context-file").map(async (value) => {
      const pathname = path.isAbsolute(value) ? value : path.join(repoRoot, value);
      return fs.readFile(pathname, "utf8");
    }),
  );
  const contextBlocks = [...inlineContexts, ...contextFiles].map((block) => block.trim()).filter(Boolean);
  const finalText = await runAgent(
    agentId,
    buildStandaloneAgentPromptGuide(agentId),
    contextBlocks,
  );
  const outputPath = parseOption(options, "output");
  if (outputPath) {
    const pathname = path.isAbsolute(outputPath) ? outputPath : path.join(repoRoot, outputPath);
    await fs.mkdir(path.dirname(pathname), { recursive: true });
    await fs.writeFile(pathname, finalText, "utf8");
    console.log(`agent: ${agentId}`);
    console.log(`output: ${pathname}`);
    return;
  }
  console.log(finalText);
}
