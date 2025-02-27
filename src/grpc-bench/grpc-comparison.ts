import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc";
import dotenv from "dotenv";
import { performance } from "perf_hooks";
import { logger } from "./logger";

// 加载环境变量
dotenv.config();

interface GrpcEndpoint {
  name: string;
  url: string;
  token?: string;
}

interface BlockData {
  endpoint: string;
  slot: number;
  timestamp: number;
}

interface EndpointStats {
  totalLatency: number;
  latencies: number[];
  firstReceived: number;
  totalReceived: number;
}

async function compareGrpcEndpoints(endpoints: GrpcEndpoint[], testDurationSec: number = 30) {
  logger.info("开始对比多个 GRPC 服务性能...");
  logger.info(`测试持续时间: ${testDurationSec}秒`);
  logger.info(`测试端点: ${endpoints.map((e) => e.name).join(", ")}`);

  const startTime = Date.now();
  const endTime = startTime + testDurationSec * 1000;
  const clients: { [key: string]: any } = {};
  const streams: { [key: string]: any } = {};
  const pingIntervals: { [key: string]: NodeJS.Timeout } = {}; // 存储 ping 定时器
  const blockDataBySlot: Map<number, BlockData[]> = new Map();

  // 每个端点的统计数据
  const endpointStats: { [key: string]: EndpointStats } = {};

  // 添加一个标志来跟踪每个端点是否已经接收到第一个 slot
  const firstSlotReceived: { [key: string]: boolean } = {};
  endpoints.forEach((endpoint) => {
    firstSlotReceived[endpoint.name] = false;
  });

  // 添加一个标志来指示是否所有端点都已经接收到第一个 slot
  let allEndpointsReceivedFirstSlot = false;

  // 初始化每个端点的统计数据
  endpoints.forEach((endpoint) => {
    endpointStats[endpoint.name] = {
      totalLatency: 0,
      latencies: [],
      firstReceived: 0,
      totalReceived: 0,
    };
  });

  // 连接到所有 GRPC 服务
  for (const endpoint of endpoints) {
    try {
      logger.info(`连接到 ${endpoint.name}: ${endpoint.url}`);

      clients[endpoint.name] = new Client(endpoint.url, endpoint.token, {
        "grpc.max_receive_message_length": 16 * 1024 * 1024, // 16MB
      });

      // 创建订阅数据流
      streams[endpoint.name] = await clients[endpoint.name].subscribe();

      // 创建订阅请求
      const request: SubscribeRequest = {
        accounts: {},
        slots: { slot: { filterByCommitment: true } },
        transactions: {},
        transactionsStatus: {},
        blocks: {},
        blocksMeta: {},
        entry: {},
        accountsDataSlice: [],
        commitment: CommitmentLevel.PROCESSED,
        ping: undefined,
      };

      // 发送订阅请求
      await new Promise<void>((resolve, reject) => {
        streams[endpoint.name].write(request, (err: any) => {
          if (err === null || err === undefined) {
            resolve();
          } else {
            reject(err);
          }
        });
      }).catch((reason) => {
        logger.error(reason);
        throw reason;
      });

      logger.info(`${endpoint.name} 订阅成功，等待数据...`);

      // 监听数据
      streams[endpoint.name].on("data", (data: any) => {
        // 处理 ping 消息
        if (data.pong) {
          logger.debug(`${endpoint.name} 收到 pong 消息`);
          return;
        }

        if (data.slot) {
          const currentSlot = parseInt(data.slot.slot);
          const timestamp = performance.now();

          // 如果还没有所有端点都接收到第一个 slot
          if (!allEndpointsReceivedFirstSlot) {
            // 标记当前端点已经接收到第一个 slot
            firstSlotReceived[endpoint.name] = true;

            // 检查是否所有端点都已经接收到第一个 slot
            allEndpointsReceivedFirstSlot = Object.values(firstSlotReceived).every(Boolean);

            // 如果还没有所有端点都接收到第一个 slot，跳过统计
            if (!allEndpointsReceivedFirstSlot) {
              logger.debug(`${endpoint.name} 接收到第一个 slot ${currentSlot}，等待其他端点...`);
              return;
            } else {
              logger.info("所有端点都已接收到第一个 slot, 开始正式统计...");
            }
          }

          // 记录此区块数据
          if (!blockDataBySlot.has(currentSlot)) {
            blockDataBySlot.set(currentSlot, []);
          }

          blockDataBySlot.get(currentSlot)!.push({
            endpoint: endpoint.name,
            slot: currentSlot,
            timestamp,
          });

          // 只有当所有端点都接收到该 slot 时才进行统计
          const blockDataList = blockDataBySlot.get(currentSlot)!;
          if (blockDataList.length === endpoints.length) {
            // 更新总接收数
            endpoints.forEach((e) => {
              endpointStats[e.name].totalReceived++;
            });

            // 找出最早收到此区块的时间
            const earliestTimestamp = Math.min(...blockDataList.map((bd) => bd.timestamp));

            // 计算每个端点的延迟
            blockDataList.forEach((bd) => {
              const latency = bd.timestamp - earliestTimestamp;
              if (latency > 0) {
                endpointStats[bd.endpoint].latencies.push(latency);
                endpointStats[bd.endpoint].totalLatency += latency;
                logger.info(
                  `${bd.endpoint} 接收 slot ${currentSlot}: 延迟 ${latency.toFixed(2)}ms (相对于 ${blockDataList.find((b) => b.timestamp === earliestTimestamp)!.endpoint})`
                );
              } else {
                endpointStats[bd.endpoint].firstReceived++;
                logger.info(`${bd.endpoint} 接收 slot ${currentSlot}: 首次接收`);
              }
            });

            // 清理旧数据
            const oldSlots = [...blockDataBySlot.keys()].filter((slot) => slot < currentSlot - 100);
            for (const slot of oldSlots) {
              blockDataBySlot.delete(slot);
            }
          }
        }
      });

      // 错误处理
      streams[endpoint.name].on("error", (error: any) => {
        logger.error(`${endpoint.name} GRPC 流错误:`, error);
      });

      // 为保证连接稳定，需要定期向服务端发送ping请求以维持连接
      const pingRequest: SubscribeRequest = {
        accounts: {},
        slots: {},
        transactions: {},
        transactionsStatus: {},
        blocks: {},
        blocksMeta: {},
        entry: {},
        accountsDataSlice: [],
        commitment: undefined,
        ping: { id: 1 },
      };

      // 每5秒发送一次ping请求
      pingIntervals[endpoint.name] = setInterval(async () => {
        try {
          if (streams[endpoint.name] && !streams[endpoint.name].destroyed) {
            await new Promise<void>((resolve, reject) => {
              streams[endpoint.name].write(pingRequest, (err: any) => {
                if (err === null || err === undefined) {
                  resolve();
                } else {
                  reject(err);
                }
              });
            });
          }
        } catch (error) {
          logger.error(`${endpoint.name} 发送 ping 请求失败:`, error);
        }
      }, 5000);
    } catch (error) {
      logger.error(`连接 ${endpoint.name} 失败:`, error);
    }
  }

  // 设置定时器检查测试是否应该结束，并显示进度
  const checkInterval = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
    const remainingSec = testDurationSec - elapsedSec;
    const progressPercent = Math.floor((elapsedSec / testDurationSec) * 100);

    // 每5秒显示一次进度
    if (elapsedSec % 5 === 0 && elapsedSec > 0) {
      logger.info(
        `===== 测试进度: ${progressPercent}% [${elapsedSec}/${testDurationSec}秒] - 剩余时间: ${remainingSec}秒 =====`
      );
    }

    if (Date.now() >= endTime) {
      clearInterval(checkInterval);

      // 清除所有 ping 定时器
      for (const endpoint of endpoints) {
        if (pingIntervals[endpoint.name]) {
          clearInterval(pingIntervals[endpoint.name]);
          delete pingIntervals[endpoint.name];
        }
      }

      // 关闭所有流
      for (const endpoint of endpoints) {
        if (streams[endpoint.name]) {
          streams[endpoint.name].end();
        }
      }

      // 分析结果
      logger.info("测试完成，分析结果...");

      // 计算每个端点的统计数据
      for (const endpoint of endpoints) {
        const stats = endpointStats[endpoint.name];

        if (stats.totalReceived > 0) {
          // 计算延迟统计
          const avgLatency =
            stats.latencies.length > 0 ? stats.totalLatency / stats.latencies.length : 0;
          const minLatency = stats.latencies.length > 0 ? Math.min(...stats.latencies) : 0;
          const maxLatency = stats.latencies.length > 0 ? Math.max(...stats.latencies) : 0;

          // 计算标准差
          let stdDev = 0;
          if (stats.latencies.length > 0) {
            const variance =
              stats.latencies.reduce((sum, val) => sum + Math.pow(val - avgLatency, 2), 0) /
              stats.latencies.length;
            stdDev = Math.sqrt(variance);
          }

          // 计算百分位数
          const sortedLatencies = [...stats.latencies].sort((a, b) => a - b);
          const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
          const p90 = sortedLatencies[Math.floor(sortedLatencies.length * 0.9)] || 0;
          const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;

          logger.info(`===== ${endpoint.name} 性能分析 =====`);
          logger.info(`总接收区块数: ${stats.totalReceived}`);
          logger.info(
            `首先接收区块数: ${stats.firstReceived} (${((stats.firstReceived / stats.totalReceived) * 100).toFixed(2)}%)`
          );

          if (stats.latencies.length > 0) {
            logger.info(`延迟统计 (相对于最快端点):`);
            logger.info(`  平均延迟: ${avgLatency.toFixed(2)}ms`);
            logger.info(`  最小延迟: ${minLatency.toFixed(2)}ms`);
            logger.info(`  最大延迟: ${maxLatency.toFixed(2)}ms`);
            // logger.info(`  标准差: ${stdDev.toFixed(2)}ms`);
            // logger.info(`  中位数 (p50): ${p50.toFixed(2)}ms`);
            // logger.info(`  百分位数 (p90): ${p90.toFixed(2)}ms`);
            // logger.info(`  百分位数 (p99): ${p99.toFixed(2)}ms`);
            logger.info(`  样本数量: ${stats.latencies.length}`);
          } else {
            logger.info(`该端点始终是最快的，没有延迟数据`);
          }
        } else {
          logger.info(`${endpoint.name}: 没有收集到数据`);
        }
      }

      // 比较端点性能
      logger.info("===== 端点性能对比 =====");

      // 按首先接收区块的百分比排序
      const sortedEndpoints = endpoints
        .map((e) => ({
          name: e.name,
          stats: endpointStats[e.name],
        }))
        .filter((e) => e.stats.totalReceived > 0)
        .sort(
          (a, b) =>
            b.stats.firstReceived / b.stats.totalReceived -
            a.stats.firstReceived / a.stats.totalReceived
        );

      for (const endpoint of sortedEndpoints) {
        const firstPercent = (endpoint.stats.firstReceived / endpoint.stats.totalReceived) * 100;
        const avgLatencyWhenSlower =
          endpoint.stats.latencies.length > 0
            ? endpoint.stats.totalLatency / endpoint.stats.latencies.length
            : 0;
        const avgLatencyTotal =
          endpoint.stats.latencies.length > 0
            ? endpoint.stats.totalLatency / endpoint.stats.totalReceived
            : 0;

        logger.info(
          `${endpoint.name.padEnd(8)}: 首先接收 ${firstPercent.toFixed(2).padStart(6)}%, 落后时平均延迟 ${avgLatencyWhenSlower.toFixed(2).padStart(6)}ms, 总体平均延迟 ${avgLatencyTotal.toFixed(2).padStart(6)}ms`
        );
      }

      // 清理所有资源并退出
      logger.info("测试完成，正在关闭连接...");

      // 清除所有 ping 定时器
      for (const endpoint of endpoints) {
        if (pingIntervals[endpoint.name]) {
          clearInterval(pingIntervals[endpoint.name]);
          delete pingIntervals[endpoint.name];
        }
      }

      // 关闭流和客户端连接
      (async () => {
        try {
          for (const endpoint of endpoints) {
            try {
              if (streams[endpoint.name]) {
                streams[endpoint.name].end();
              }
            } catch (streamError) {
              logger.error(`关闭 ${endpoint.name} 流时出错:`, streamError);
            }

            try {
              if (clients[endpoint.name] && typeof clients[endpoint.name].close === "function") {
                await clients[endpoint.name].close();
              }
            } catch (clientError) {
              logger.error(`关闭 ${endpoint.name} 客户端时出错:`, clientError);
            }
          }
          logger.info("所有连接已关闭，测试结束");
          process.exit(0); // 确保进程退出
        } catch (error) {
          logger.error("关闭连接时出错:", error);
          process.exit(1);
        }
      })();
    }
  }, 1000);
}

async function main() {
  // 从环境变量读取 GRPC 端点
  const endpoints: GrpcEndpoint[] = [];

  // 读取环境变量中的所有 GRPC 端点
  const endpointKeys = Object.keys(process.env).filter((key) => key.startsWith("GRPC_URL_"));
  endpointKeys.forEach((key) => {
    const index = key.replace("GRPC_URL_", "");
    endpoints.push({
      name: process.env[`GRPC_NAME_${index}`] || `GRPC-${index}`,
      url: process.env[key] || "",
      token: process.env[`GRPC_TOKEN_${index}`],
    });
  });

  // 如果没有配置任何端点，使用默认值
  if (endpoints.length === 0) {
    logger.info("没有配置任何端点，使用默认值");
    endpoints.push({
      name: "GRPC-1",
      url: "https://solana-yellowstone-grpc.publicnode.com:443",
    });
    endpoints.push({
      name: "GRPC-2",
      url: "https://solana-yellowstone-grpc.publicnode.com:443",
    });
  }

  const testDuration = parseInt(process.env.GRPC_COMPARISON_DURATION_SEC || "30");

  await compareGrpcEndpoints(endpoints, testDuration);
}

main().catch((error) => {
  logger.error("未处理的错误:", error);
  process.exit(1);
});
