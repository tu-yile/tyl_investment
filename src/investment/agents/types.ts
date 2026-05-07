export type AgentId =
  | "information-collector"
  | "macro-policy-analyst"
  | "industry-analyst"
  | "company-analyst"
  | "bear-case-analyst"
  | "portfolio-manager"
  | "risk-officer"
  | "chief-investment-officer";

export type ArtifactType =
  | "report"
  | "assessment"
  | "decision_packet"
  | "knowledge_proposal";

export type ArtifactScopeType =
  | "portfolio"
  | "ticker"
  | "industry"
  | "thesis";

export interface StoredArtifactRef {
  artifactId: string;
  agentId: AgentId;
  artifactType: ArtifactType;
  scopeType: ArtifactScopeType;
  scopeKey: string;
  reportPath: string;
}

export interface RegisteredAgentDescriptor {
  id: AgentId;
  markdownPath: string;
}
