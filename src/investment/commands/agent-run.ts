import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseOption, parseOptions } from "../cli-options.js";
import {
  buildBearCaseContract,
  buildCioContract,
  buildCompanyContract,
  buildIndustryContract,
  buildInformationCollectorContract,
  buildMacroContract,
  buildPortfolioContract,
  buildRiskContract,
} from "../llm/contracts.js";
import { extractAgentMarkdown, resolveStandaloneAgentsRoot, runAgentWithBaseInstructions } from "../llm/prompting.js";

interface MarkdownAgentDescriptor {
  id: string;
}

export interface StandaloneAgentRunSpec {
  agentId: string;
  baseInstructions: string;
  responseContract: string;
  contextBlocks: string[];
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
  switch (agentId) {
    case "information-collector":
      return buildInformationCollectorContract();
    case "macro-policy-analyst":
      return buildMacroContract();
    case "industry-analyst":
      return buildIndustryContract();
    case "company-analyst":
      return buildCompanyContract();
    case "bear-case-analyst":
      return buildBearCaseContract();
    case "portfolio-manager":
      return buildPortfolioContract();
    case "risk-officer":
      return buildRiskContract();
    case "chief-investment-officer":
      return buildCioContract();
    default:
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

async function loadContextBlocks(options: string[], repoRoot: string): Promise<string[]> {
  const inlineContexts = parseOptions(options, "context");
  const contextFiles = await Promise.all(
    parseOptions(options, "context-file").map(async (value) => {
      const pathname = path.isAbsolute(value) ? value : path.join(repoRoot, value);
      return fs.readFile(pathname, "utf8");
    }),
  );
  return [...inlineContexts, ...contextFiles].map((block) => block.trim()).filter(Boolean);
}

async function loadGeneratedAgentModule<T>(repoRoot: string, moduleName: string): Promise<T> {
  const modulePath = path.join(repoRoot, "dist", "investment", "agents", "gen-prompt", moduleName);
  return import(pathToFileURL(modulePath).href) as Promise<T>;
}

export async function prepareAgentRunSpec(options: string[], repoRoot: string): Promise<StandaloneAgentRunSpec> {
  const agentId = await parseAgentId(options);
  const responseContract = buildStandaloneAgentPromptGuide(agentId);
  const contextBlocks = await loadContextBlocks(options, repoRoot);
  const subjectRef = parseOption(options, "subject");

  if (agentId === "industry-analyst") {
    if (!subjectRef) {
      throw new Error("Missing --subject for --agent=industry-analyst");
    }
    const module = await loadGeneratedAgentModule<{
      buildIndustryAnalystPrompt: (industryRef: string) => Promise<{ prompt: string }>;
    }>(repoRoot, "industry-analyst.js");
    const built = await module.buildIndustryAnalystPrompt(subjectRef);
    return {
      agentId,
      baseInstructions: built.prompt,
      responseContract,
      contextBlocks,
    };
  }

  if (agentId === "company-analyst") {
    if (!subjectRef) {
      throw new Error("Missing --subject for --agent=company-analyst");
    }
    const module = await loadGeneratedAgentModule<{
      buildCompanyAnalystPrompt: (companyRef: string) => Promise<{ prompt: string }>;
    }>(repoRoot, "company-analyst.js");
    const built = await module.buildCompanyAnalystPrompt(subjectRef);
    return {
      agentId,
      baseInstructions: built.prompt,
      responseContract,
      contextBlocks,
    };
  }

  return {
    agentId,
    baseInstructions: await extractAgentMarkdown(agentId),
    responseContract,
    contextBlocks,
  };
}

export async function runAgentCommand(options: string[], repoRoot: string): Promise<void> {
  const spec = await prepareAgentRunSpec(options, repoRoot);
  const finalText = await runAgentWithBaseInstructions(
    spec.agentId,
    spec.baseInstructions,
    spec.responseContract,
    spec.contextBlocks,
  );
  const outputPath = parseOption(options, "output");
  if (outputPath) {
    const pathname = path.isAbsolute(outputPath) ? outputPath : path.join(repoRoot, outputPath);
    await fs.mkdir(path.dirname(pathname), { recursive: true });
    await fs.writeFile(pathname, finalText, "utf8");
    console.log(`agent: ${spec.agentId}`);
    console.log(`output: ${pathname}`);
    return;
  }
  console.log(finalText);
}
