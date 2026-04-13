import type { CodexAppServerDefaults } from "#src/codex-app-server/types.js";

export const codexAppServerDefaultsConfig: CodexAppServerDefaults = {
  executable: process.env.CODEX_PATH || undefined,
  model: process.env.CODEX_MODEL || undefined,
  networkAccessEnabled: true,
  webSearchMode: "live",
  approvalPolicy: "on-request",
  sandboxMode: "workspace-write",
  skipGitRepoCheck: false,
};

export type CodexAppServerDefaultsConfig = typeof codexAppServerDefaultsConfig;
