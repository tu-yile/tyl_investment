Collector request:

research_question:
Turn the supplied facts into a collector-style report without external research.

intended_use:
Validate the standalone information-collector agent invocation path with a minimal context that does not require web search.

caller_agent:
codex test harness

context:
Use only the facts below as source material.

Provided facts:
- Company: NVIDIA Corporation
- Business description: NVIDIA describes itself as a full-stack computing infrastructure company.
- Headquarters: Santa Clara, California, United States
- Latest reported quarterly revenue: $35.1 billion
- Reporting period: fiscal third quarter ended October 27, 2024
- Source note: these facts are intentionally provided in-context for CLI path testing

scope:
Restate the provided facts clearly. Do not add new facts.

time_range:
Provided facts only

geography:
United States

depth:
quick

must_verify:
None beyond the supplied context

source_preference:
Provided context only

excluded_sources:
External websites
Web search

output_format:
collector report

constraints:
Do not browse. Do not use external sources. Return concise output and use an empty signals object unless a normalized event is strictly necessary.
