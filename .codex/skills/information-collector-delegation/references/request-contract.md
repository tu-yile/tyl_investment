# Information Collector Request Contract

Use this contract when another agent needs to call `information-collector` through `npm run investment:agent:run`.

## Request Template

```text
Collector request:

research_question:
intended_use:
caller_agent:
context:
scope:
time_range:
geography:
depth: quick | standard | deep
must_verify:
source_preference:
excluded_sources:
output_format:
constraints:
```

## Field Guidance

- `research_question`: The exact question `information-collector` should collect around.
- `intended_use`: How the downstream agent will use the collected information. This is the most important field for relevance.
- `caller_agent`: The role requesting collection, such as company analyst, industry analyst, risk officer, or portfolio manager.
- `context`: Existing assumptions, prior findings, target company, market, thesis, or user constraints.
- `scope`: What to include and exclude.
- `time_range`: The relevant period. Use exact dates for current or historical collection.
- `geography`: Country, region, market, or global scope.
- `depth`: `quick` for core facts, `standard` for evidence plus uncertainty, `deep` for broader coverage and counter-signals.
- `must_verify`: Facts, data points, claims, or entities that require extra verification.
- `source_preference`: Required or preferred source types.
- `excluded_sources`: Sources or source classes to avoid.
- `output_format`: Default to `collector report`; request a specific downstream handoff shape only if needed.
- `constraints`: Token budget, language, citation style, latency, browsing restrictions, or confidentiality requirements.

## Default Assumptions

If fields are missing, assume:

- `depth`: `standard`
- `time_range`: latest available plus relevant history
- `geography`: infer from the entity or question
- `output_format`: `collector report`
- `source_preference`: primary sources first, then reputable secondary sources

Ask a clarification question only when the missing field would materially change the research direction.

## Context File Template

```text
Collector request:

research_question:

intended_use:

caller_agent:

context:

scope:

time_range:

geography:

depth:

must_verify:

source_preference:

excluded_sources:

output_format:

constraints:
```

## Run Command

```bash
npm run investment:agent:run -- --agent=information-collector --context-file=tmp/context.md --output=tmp/information-collector.md
```

## Consumption Rules

- Treat `information-collector` output as research input, not final judgment.
- Preserve source provenance, dates, and uncertainty from the collector output.
- If the downstream agent needs a different format, transform the collector output after reading it instead of overloading the collector request with analysis instructions.
