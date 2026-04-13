// 兼容旧调用路径：daily workflow 的真实实现已迁移到 workflows/daily-position-decision。
export {
  buildDailyRunThreadId,
  resumeDailyRunApproval,
  startDailyRunGraph,
} from "../workflows/daily-position-decision/index.js";
