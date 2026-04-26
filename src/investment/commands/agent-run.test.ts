import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareAgentRunSpec } from "./agent-run.js";

test("prepareAgentRunSpec uses generated industry analyst prompt when subject is specified", async () => {
  const spec = await prepareAgentRunSpec(
    ["--agent=industry-analyst", "--subject=power-equipment"],
    process.cwd(),
  );

  assert.equal(spec.agentId, "industry-analyst");
  assert.match(spec.baseInstructions, /电力设备与储能/);
  assert.match(spec.baseInstructions, /kind: industry_knowledge/);
  assert.match(spec.baseInstructions, /industry_id: power-equipment/);
  assert.equal(spec.contextBlocks.length, 0);
});

test("prepareAgentRunSpec uses generated company analyst prompt when subject is specified", async () => {
  const spec = await prepareAgentRunSpec(
    ["--agent=company-analyst", "--subject=300750"],
    process.cwd(),
  );

  assert.equal(spec.agentId, "company-analyst");
  assert.match(spec.baseInstructions, /宁德时代/);
  assert.match(spec.baseInstructions, /kind: thesis/);
  assert.match(spec.baseInstructions, /ticker: 300750/);
  assert.equal(spec.contextBlocks.length, 0);
});

test("prepareAgentRunSpec keeps legacy context behavior for regular agents", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-run-test-"));
  const contextFile = path.join(tempDir, "context.md");
  await fs.writeFile(contextFile, "  file context  \n", "utf8");

  try {
    const spec = await prepareAgentRunSpec(
      ["--agent=information-collector", "--context=inline context", `--context-file=${contextFile}`],
      process.cwd(),
    );

    assert.equal(spec.agentId, "information-collector");
    assert.match(spec.baseInstructions, /你是 Research Agent/);
    assert.match(spec.baseInstructions, /### Research Brief/);
    assert.deepEqual(spec.contextBlocks, ["inline context", "file context"]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("prepareAgentRunSpec requires subject for industry analyst", async () => {
  await assert.rejects(
    () => prepareAgentRunSpec(["--agent=industry-analyst"], process.cwd()),
    /Missing --subject for --agent=industry-analyst/,
  );
});

test("prepareAgentRunSpec requires subject for company analyst", async () => {
  await assert.rejects(
    () => prepareAgentRunSpec(["--agent=company-analyst"], process.cwd()),
    /Missing --subject for --agent=company-analyst/,
  );
});
