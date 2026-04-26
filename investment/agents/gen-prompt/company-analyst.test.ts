import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parseMarkdownDocument } from "#src/investment/lib/frontmatter.js";
import {
  buildCompanyAnalystPrompt,
  renderCompanyAnalystBasePrompt,
} from "./company-analyst.js";

test("company analyst markdown files stay aligned and parse cleanly", async () => {
  const prodPath = path.join(process.cwd(), "investment/agents/company-analyst.md");
  const testPath = path.join(process.cwd(), "investment/runtime/test/agents/company-analyst.md");
  const [prodRaw, testRaw] = await Promise.all([
    fs.readFile(prodPath, "utf8"),
    fs.readFile(testPath, "utf8"),
  ]);

  assert.equal(prodRaw, testRaw);

  const prodDoc = parseMarkdownDocument(prodPath, prodRaw);
  assert.equal(prodDoc.frontmatter.agent_id, "company-analyst");
  assert.match(prodDoc.body, /{{COMPANY_NAME}}/);
  assert.match(prodDoc.body, /完整 thesis 知识库正文/);
});

test("renderCompanyAnalystBasePrompt replaces placeholders with the assigned company", async () => {
  const prodPath = path.join(process.cwd(), "investment/agents/company-analyst.md");
  const template = await fs.readFile(prodPath, "utf8");

  const rendered = renderCompanyAnalystBasePrompt(template, {
    thesisId: "thesis-002594",
    ticker: "002594",
    companyName: "比亚迪",
    industryId: "smart-evs",
    status: "strengthened",
    catalystStrength: "moderate",
    valuationView: "okay",
    riskLevel: "medium",
    confidenceBase: 0.74,
    lastUpdated: "2026-04-08",
    monitoringFlags: [],
    path: "/tmp/byd.md",
    sections: {},
  });

  assert.match(rendered, /比亚迪/);
  assert.doesNotMatch(rendered, /{{COMPANY_NAME}}/);
});

test("buildCompanyAnalystPrompt builds a concrete company analyst prompt from ticker only", async () => {
  const built = await buildCompanyAnalystPrompt("300750");
  assert.equal(built.thesis.ticker, "300750");
  assert.match(built.prompt, /宁德时代/);
  assert.doesNotMatch(built.prompt, /{{COMPANY_NAME}}/);
  assert.match(built.prompt, /## Attached Company Thesis Knowledge Base/);
  assert.match(built.prompt, /kind: thesis/);
  assert.match(built.prompt, /ticker: 300750/);
  assert.match(built.prompt, /全球电池和储能龙头地位/);
});

test("buildCompanyAnalystPrompt also resolves companies by display name", async () => {
  const built = await buildCompanyAnalystPrompt("比亚迪");
  assert.equal(built.thesis.ticker, "002594");
  assert.match(built.prompt, /比亚迪/);
  assert.match(built.prompt, /kind: thesis/);
  assert.match(built.prompt, /ticker: 002594/);
  assert.match(built.prompt, /整车与供应链协同/);
  assert.doesNotMatch(built.prompt, /全球电池和储能龙头地位/);
});

test("buildCompanyAnalystPrompt also resolves companies by thesis id", async () => {
  const built = await buildCompanyAnalystPrompt("thesis-300750");
  assert.equal(built.thesis.companyName, "宁德时代");
  assert.match(built.prompt, /宁德时代/);
  assert.match(built.prompt, /thesis_id: thesis-300750/);
});

test("buildCompanyAnalystPrompt rejects unknown companies with a diagnosable error", async () => {
  await assert.rejects(
    () => buildCompanyAnalystPrompt("不存在的公司"),
    /Unknown company: 不存在的公司/,
  );
});
