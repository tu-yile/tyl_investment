// 这条 workflow 还未实现。
// 先把 shared/private state 的入口位定下来，后续实现时不用再回头重构 workflow 平台接口。

export interface EmergencySharedState {
  triggerEventSummary?: string;
  impactedTickers: string[];
  impactedIndustryIds: string[];
}

export interface EmergencyPrivateState {
  recommendations: string[];
  riskAlerts: string[];
  artifacts: {
    outputMarkdownPath?: string;
    outputJsonPath?: string;
  };
  runtime: {
    nodeStatus: "planned";
    errors: string[];
  };
}
