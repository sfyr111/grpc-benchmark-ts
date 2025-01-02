import Client from "@triton-one/yellowstone-grpc";
import { performance } from "perf_hooks";

import { config } from "./config";
import { logger } from "./logger";
import { PingInfo, sendPing } from "./ping";
import { processResults } from "./stats";

// 主测试函数
async function testGRPCLatency(url: string, rounds: number = 10) {
  const latencies: number[] = [];
  let receivedPongs = 0;
  let isWarmupDone = false; // 添加预热标志
  const pendingPings: Map<number, PingInfo> = new Map(); // 跟踪待完成的 ping

  try {
    const client = new Client(url, undefined, {
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
            // 预热轮次
            logger.info(`Warmup round: ${latency.toFixed(2)}ms`);
            isWarmupDone = true;
            // 发送第一个正式的 ping
            setTimeout(() => sendPing(stream, 1, pendingPings), 100);
            return;
          }

          latencies.push(latency);
          receivedPongs++;
          logger.info(`Round ${receivedPongs}: ${latency.toFixed(2)}ms`);

          if (receivedPongs >= rounds) {
            stream.end();
            processResults(latencies);
          } else {
            setTimeout(() => sendPing(stream, receivedPongs + 1, pendingPings), 100);
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

    // 首先发送预热 ping
    sendPing(stream, 0, pendingPings); // 使用 0 表示预热轮次
  } catch (error) {
    logger.error("测试过程发生错误:", error);
    process.exit(1);
  }
}

async function main() {
  logger.info(`GRPC_URL: ${config.GRPC_URL}`);
  logger.info(`TOTAL_ROUNDS: ${config.TOTAL_ROUNDS}`);
  // logger.info(`CONCURRENCY: ${config.CONCURRENCY}`);

  await testGRPCLatency(config.GRPC_URL, config.TOTAL_ROUNDS);
}

main().catch((error) => {
  logger.error("Unhandled error:", error);
  process.exit(1);
});
