import ss from "simple-statistics";
import { logger } from "./logger";

// 处理并统计结果的函数
export function processResults(latencies: number[]) {
  if (latencies.length === 0) {
    logger.warn("没有收集到任何延迟数据。");
    process.exit(0);
  }

  const avg = ss.mean(latencies);
  const min = ss.min(latencies);
  const max = ss.max(latencies);
  const stdDev = ss.standardDeviation(latencies);
  const median = ss.median(latencies);
  const p90 = ss.quantile(latencies, 0.9);
  const p99 = ss.quantile(latencies, 0.99);

  logger.info(`
延迟统计:
  平均延迟: ${avg.toFixed(2)}ms
  最小延迟: ${min.toFixed(2)}ms
  最大延迟: ${max.toFixed(2)}ms
  标准差: ${stdDev.toFixed(2)}ms
  中位数 (p50): ${median.toFixed(2)}ms
  百分位数 (p90): ${p90.toFixed(2)}ms
  百分位数 (p99): ${p99.toFixed(2)}ms
  样本数量: ${latencies.length}
  `);

  process.exit(0);
}
