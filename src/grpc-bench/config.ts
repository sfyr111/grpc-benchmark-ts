import { Command } from "commander";
import dotenv from "dotenv";
import { logger } from "./logger";

// 加载环境变量
dotenv.config();

// 定义命令行参数解析
const program = new Command();

program
  .option("--grpc_url <url>", "gRPC 服务 URL")
  .option("--total_rounds <number>", "总共发送的 ping 请求数量", "50")
  .option("--concurrency <number>", "并发数量，即同时进行的 ping 请求数量", "10");

program.parse(process.argv);

const options = program.opts();

// 解析并验证配置
export const config = {
  GRPC_URL:
    options.grpc_url ||
    process.env.GRPC_URL ||
    "https://solana-yellowstone-grpc.publicnode.com:443",
  TOTAL_ROUNDS: options.total_rounds
    ? parseInt(options.total_rounds, 10)
    : process.env.TOTAL_ROUNDS
      ? parseInt(process.env.TOTAL_ROUNDS, 10)
      : 50,
  CONCURRENCY: options.concurrency
    ? parseInt(options.concurrency, 10)
    : process.env.CONCURRENCY
      ? parseInt(process.env.CONCURRENCY, 10)
      : 10,
};

// 验证配置
if (!options.grpc_url && !process.env.GRPC_URL) {
  logger.warn("未设置 GRPC_URL 环境变量，使用默认值");
}

if (isNaN(config.TOTAL_ROUNDS) || config.TOTAL_ROUNDS <= 0) {
  logger.warn(
    `无效的 TOTAL_ROUNDS 值 (${options.total_rounds || process.env.TOTAL_ROUNDS})，使用默认值 50`
  );
  config.TOTAL_ROUNDS = 50;
}

if (isNaN(config.CONCURRENCY) || config.CONCURRENCY <= 0) {
  logger.warn(
    `无效的 CONCURRENCY 值 (${options.concurrency || process.env.CONCURRENCY})，使用默认值 10`
  );
  config.CONCURRENCY = 10;
}
