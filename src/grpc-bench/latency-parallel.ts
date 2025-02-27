import Client from "@triton-one/yellowstone-grpc";
import { performance } from "perf_hooks";

import { config } from "./config";
import { logger } from "./logger";
import { PingInfo, sendPing } from "./ping";
import { processResults } from "./stats";

// 主测试函数
async function testGRPCLatency(
  url: string,
  totalRounds: number = 50,
  concurrency: number = 10,
  token?: string
) {
  const latencies: number[] = [];
  let receivedPongs = 0;
  let sentPings = 0;
  let isWarmupDone = false; // 预热标志
  const pendingPings: Map<number, PingInfo> = new Map(); // 跟踪待完成的 ping

  try {
    const client = new Client(url, token, {
      // "grpc.max_receive_message_length": 64 * 1024 * 1024,
    });

    const stream = await client.subscribe();

    // 处理 pong 响应
    stream.on("data", (data) => {
      const pongTime = performance.now();
      if (data.pong) {
        const pongId = data.pong.id;
        const pingInfo = pendingPings.get(pongId);
        if (pingInfo) {
          const latency = pongTime - pingInfo.sendTime;
          pendingPings.delete(pongId);

          if (!isWarmupDone) {
            logger.info(`Warmup round: ${latency.toFixed(2)}ms`);
            isWarmupDone = true;
            // 发送初始的多个 ping 请求
            for (let i = 0; i < concurrency; i++) {
              sendPing(stream, ++sentPings, pendingPings);
            }
            return;
          }

          latencies.push(latency);
          receivedPongs++;
          logger.info(`Round ${receivedPongs}: ${latency.toFixed(2)}ms`);

          if (receivedPongs >= totalRounds) {
            stream.end();
            processResults(latencies);
          } else {
            // 发送新的 ping 请求以维持并发
            sendPing(stream, ++sentPings, pendingPings);
          }
        } else {
          logger.warn(`Received pong with unknown id: ${pongId}`);
        }
      }
    });

    stream.on("error", (error) => {
      logger.error("Stream error:", error);
      process.exit(1);
    });

    stream.on("end", () => {
      logger.info("Stream closed");
    });

    // 发送预热 ping
    sendPing(stream, 0, pendingPings); // 使用 0 表示预热轮次
  } catch (error) {
    logger.error("测试过程发生错误:", error);
    process.exit(1);
  }
}

async function main() {
  logger.info(`GRPC_URL: ${config.GRPC_URL}`);
  if (config.GRPC_TOKEN) {
    logger.info(`GRPC_TOKEN: 已配置`);
  }
  logger.info(`TOTAL_ROUNDS: ${config.TOTAL_ROUNDS}`);
  logger.info(`CONCURRENCY: ${config.CONCURRENCY}`);

  await testGRPCLatency(
    config.GRPC_URL,
    config.TOTAL_ROUNDS,
    config.CONCURRENCY,
    config.GRPC_TOKEN
  );
}

main().catch((error) => {
  logger.error("Unhandled error:", error);
  process.exit(1);
});
