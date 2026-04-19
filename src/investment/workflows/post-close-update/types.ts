// 盘后更新流当前也只保留类型骨架。
// 这里的目标是明确 future workflow 也会沿用 shared/private state 模式。

export interface PostCloseSharedState {
  executionResultsLoaded: boolean;
  positionsLoaded: boolean;
  thesesLoaded: boolean;
}

export interface PostClosePrivateState {
  updatedTickers: string[];
  newObservationItems: string[];
  artifacts: {
    outputMarkdownPath?: string;
    portfolioMemoryPath?: string;
  };
  runtime: {
    nodeStatus: "planned";
    errors: string[];
  };
}
