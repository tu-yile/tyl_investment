---
name: information-collector-delegation
description: Delegate research collection to the existing `information-collector` agent through `npm run investment:agent:run -- --agent=information-collector ...`. Use when Codex or another agent needs to gather market, industry, company, or policy information before analysis; convert a broad question into a collector context file; run the collector command; and consume its output as evidence input rather than building a separate research agent.
---

# Information Collector Delegation

## Purpose

Use this skill when the current task needs additional facts, recent developments, or source-backed evidence before analysis. Do not build a separate research worker. Instead, prepare a focused context for the existing `information-collector` agent and invoke it through the project CLI.

## Default Workflow

1. Identify the caller's decision context: what the downstream agent needs to decide, write, model, or verify.
2. Convert the task into a collector context using `references/request-contract.md`.
3. Write the context to a temporary markdown file when the CLI requires `--context-file`.
4. Run:

```bash
npm run investment:agent:run -- --agent=information-collector --context-file=tmp/context.md --output=tmp/information-collector.md
```

5. Read the collector output and extract the facts, coverage, missing items, and source signals needed by the downstream agent.
6. Keep the downstream agent responsible for interpretation and final judgment. Treat the collector output as evidence input, not a final decision.

## Invocation Modes

- **Command-prep mode**: Turn a broad question into a precise context file for `information-collector`.
- **Delegation mode**: Execute `investment:agent:run` with `--agent=information-collector`, then hand the result back to the caller.
- **Design mode**: When improving the multi-agent system, standardize when and how other agents should call `information-collector` rather than defining a separate research agent.

Do not create a separate research subagent prompt from this skill unless the user explicitly asks for a new agent design outside the current project convention.

## Context File Guidance

The context file should be explicit about:

- The exact research question.
- Why the caller needs the information.
- Scope boundaries and exclusions.
- Time range and geography.
- Facts that must be verified.
- Preferred source types.
- Desired output shape if the caller needs a specific handoff format.

Keep the context narrowly scoped. `information-collector` is strongest when asked for clean fact collection and coverage, not final analysis.

## Command Pattern

Default command:

```bash
npm run investment:agent:run -- --agent=information-collector --context-file=tmp/context.md --output=tmp/information-collector.md
```

Use `--context-file` for anything non-trivial. If the surrounding tool supports inline context and the task is small, inline context is acceptable, but file-based context is the default pattern in this repo.

## Handoff Standard

After running the collector:

1. Read the output file.
2. Separate factual collection from your own interpretation.
3. Summarize the output for the caller in the format the caller needs.
4. Preserve source dates, uncertainty, and missing coverage noted by `information-collector`.

## References

- Read `references/request-contract.md` when turning a vague request into a collector-ready context file.
