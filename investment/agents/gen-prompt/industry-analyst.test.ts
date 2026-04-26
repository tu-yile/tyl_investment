import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parseMarkdownDocument } from "#src/investment/lib/frontmatter.js";
import {
  buildIndustryAnalystPrompt,
  renderIndustryAnalystBasePrompt,
} from "./industry-analyst.js";

test("industry analyst markdown files stay aligned and parse cleanly", async () => {
  const prodPath = path.join(process.cwd(), "investment/agents/industry-analyst.md");
  const testPath = path.join(process.cwd(), "investment/runtime/test/agents/industry-analyst.md");
  const [prodRaw, testRaw] = await Promise.all([
    fs.readFile(prodPath, "utf8"),
    fs.readFile(testPath, "utf8"),
  ]);

  assert.equal(prodRaw, testRaw);

  const prodDoc = parseMarkdownDocument(prodPath, prodRaw);
  assert.equal(prodDoc.frontmatter.agent_id, "industry-analyst");
  assert.match(prodDoc.body, /{{INDUSTRY_NAME}}/);
  assert.doesNotMatch(prodDoc.body, /{{INDUSTRY_ID}}/);
  assert.match(prodDoc.body, /完整知识库正文/);
});

test("renderIndustryAnalystBasePrompt replaces placeholders with the assigned industry", async () => {
  const prodPath = path.join(process.cwd(), "investment/agents/industry-analyst.md");
  const template = await fs.readFile(prodPath, "utf8");

  const rendered = renderIndustryAnalystBasePrompt(template, {
    industryId: "smart-evs",
    name: "智能电动车",
    currentView: "positive",
    recentChange: "export_supportive",
    keySignals: [],
    watchpoints: [],
    path: "/tmp/smart-evs.md",
    sections: {},
  });

  assert.match(rendered, /智能电动车/);
  assert.doesNotMatch(rendered, /{{INDUSTRY_NAME}}/);
  assert.doesNotMatch(rendered, /{{INDUSTRY_ID}}/);
});

test("buildIndustryAnalystPrompt builds a concrete industry analyst prompt from industry id only", async () => {
  const built = await buildIndustryAnalystPrompt("power-equipment");
  assert.equal(built.industry.industryId, "power-equipment");
  assert.match(built.prompt, /电力设备与储能/);
  assert.doesNotMatch(built.prompt, /{{INDUSTRY_NAME}}/);
  assert.match(built.prompt, /## Attached Industry Knowledge Base/);
  assert.match(built.prompt, /kind: industry_knowledge/);
  assert.match(built.prompt, /industry_id: power-equipment/);
  assert.match(built.prompt, /电网投资维持强度/);
});

test("buildIndustryAnalystPrompt also resolves industries by display name", async () => {
  const built = await buildIndustryAnalystPrompt("智能电动车");
  assert.equal(built.industry.industryId, "smart-evs");
  assert.match(built.prompt, /智能电动车/);
  assert.match(built.prompt, /kind: industry_knowledge/);
  assert.match(built.prompt, /industry_id: smart-evs/);
  assert.match(built.prompt, /出口维持弹性/);
  assert.doesNotMatch(built.prompt, /电网投资维持强度/);
});

test("buildIndustryAnalystPrompt rejects unknown industries with a diagnosable error", async () => {
  await assert.rejects(
    () => buildIndustryAnalystPrompt("不存在的行业"),
    /Unknown industry: 不存在的行业/,
  );
});
