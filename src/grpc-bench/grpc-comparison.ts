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
  isAvailable: boolean; // 标记端点是否可用
  hasReceivedData: boolean; // 标记端点是否真正收到过数据
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
  // 添加一个集合来存储活跃的端点
  const activeEndpoints: Set<string> = new Set();

  endpoints.forEach((endpoint) => {
    firstSlotReceived[endpoint.name] = false;
    // 初始假设所有端点都是活跃的
    activeEndpoints.add(endpoint.name);
  });

  // 添加一个标志来指示是否已经开始正式统计
  let startedFormalStats = false;

  // 初始化每个端点的统计数据
  endpoints.forEach((endpoint) => {
    endpointStats[endpoint.name] = {
      totalLatency: 0,
      latencies: [],
      firstReceived: 0,
      totalReceived: 0,
      isAvailable: true, // 初始假设所有端点都可用
      hasReceivedData: false, // 初始设置为未收到数据
    };
  });

  // 设置超时检查，在测试时间的1/3和5秒中的最小值处检查不可用的端点
  const availabilityCheckTimeout = setTimeout(
    () => {
      const unavailableEndpoints: string[] = [];

      endpoints.forEach((endpoint) => {
        if (!firstSlotReceived[endpoint.name]) {
          logger.warn(`${endpoint.name} 未接收到任何数据，标记为不可用`);
          endpointStats[endpoint.name].isAvailable = false;
          activeEndpoints.delete(endpoint.name);
          unavailableEndpoints.push(endpoint.name);
        }
      });

      if (unavailableEndpoints.length > 0) {
        logger.warn(`以下端点已被标记为不可用: ${unavailableEndpoints.join(", ")}`);
      }

      // 如果还没有开始正式统计，但有至少两个活跃端点，则开始统计
      if (!startedFormalStats && activeEndpoints.size >= 2) {
        startedFormalStats = true;
        logger.info(`有${activeEndpoints.size}个活跃端点, 开始正式统计...`);

        // 将之前收集的数据纳入统计
        processCollectedData();
      } else if (!startedFormalStats && activeEndpoints.size < 2) {
        logger.warn(`活跃端点不足两个 (当前${activeEndpoints.size}个), 无法进行对比分析`);

        // 如果活跃端点不足两个，提前结束测试
        logger.info("由于可用端点不足, 提前结束测试");
        endTest();
      }
    },
    Math.min(Math.floor((testDurationSec * 1000) / 3), 5000)
  ); // 取测试时间的1/3和5秒中的最小值

  // 存储尚未处理的数据，用于在开始正式统计后进行处理
  const pendingBlockData: Map<number, BlockData[]> = new Map();

  // 函数：处理已收集但尚未统计的数据
  function processCollectedData() {
    // 处理所有待处理的数据
    for (const [slot, blockDataList] of pendingBlockData.entries()) {
      // 如果这个 slot 已经在 blockDataBySlot 中处理过，跳过
      if (blockDataBySlot.has(slot)) {
        continue;
      }

      // 只处理有活跃端点数据的区块，且只考虑真正收到数据的端点
      const activeEndpointData = blockDataList.filter(
        (data) => activeEndpoints.has(data.endpoint) && endpointStats[data.endpoint].hasReceivedData
      );

      if (activeEndpointData.length >= 2) {
        // 至少需要两个活跃端点的数据才有比较意义
        // 更新总接收数 - 确保每个活跃端点都计数一次
        activeEndpoints.forEach((endpoint) => {
          if (activeEndpointData.some((data) => data.endpoint === endpoint)) {
            endpointStats[endpoint].totalReceived++;
          }
        });

        // 找出最早收到此区块的时间
        const earliestTimestamp = Math.min(...activeEndpointData.map((bd) => bd.timestamp));

        // 计算每个端点的延迟
        activeEndpointData.forEach((bd) => {
          const latency = bd.timestamp - earliestTimestamp;
          if (latency > 0) {
            endpointStats[bd.endpoint].latencies.push(latency);
            endpointStats[bd.endpoint].totalLatency += latency;
            logger.info(
              `${bd.endpoint} 接收 slot ${bd.slot}: 延迟 ${latency.toFixed(2)}ms (相对于 ${activeEndpointData.find((b) => b.timestamp === earliestTimestamp)!.endpoint})`
            );
          } else {
            endpointStats[bd.endpoint].firstReceived++;
            logger.info(`${bd.endpoint} 接收 slot ${bd.slot}: 首次接收`);
          }
        });
      }
    }

    // 清空待处理数据
    pendingBlockData.clear();
  }

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

      // logger.info(`${endpoint.name} 订阅请求成功，等待数据...`);

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

          // 标记此端点已收到数据
          if (!firstSlotReceived[endpoint.name]) {
            firstSlotReceived[endpoint.name] = true;
            endpointStats[endpoint.name].hasReceivedData = true; // 标记为真正收到数据
            logger.info(`${endpoint.name} 成功接收到第一个 slot ${currentSlot}, 确认为可用端点`);

            // 如果尚未开始正式统计，检查活跃端点数量
            if (!startedFormalStats) {
              // 计算真正收到数据的端点数量
              const receivedDataCount = Object.values(endpointStats).filter(
                (s) => s.hasReceivedData
              ).length;

              // 如果所有端点都收到了数据，开始正式统计
              if (receivedDataCount === endpoints.length) {
                startedFormalStats = true;
                logger.info("所有端点都已接收到数据, 开始正式统计...");

                // 处理之前收集的数据
                processCollectedData();
              }
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

          // 如果尚未开始正式统计，先保存数据
          if (!startedFormalStats) {
            if (!pendingBlockData.has(currentSlot)) {
              pendingBlockData.set(currentSlot, []);
            }
            pendingBlockData.get(currentSlot)!.push({
              endpoint: endpoint.name,
              slot: currentSlot,
              timestamp,
            });
            return;
          }

          // 检查当前活跃的端点是否都收到了该slot
          const activeEndpointCount = activeEndpoints.size;
          const blockDataList = blockDataBySlot.get(currentSlot)!;

          // 只统计当前活跃的端点中都接收到该slot的情况
          const receivedEndpoints = new Set(blockDataList.map((bd) => bd.endpoint));
          const allActiveEndpointsReceived = Array.from(activeEndpoints).every((ep) =>
            receivedEndpoints.has(ep)
          );

          if (blockDataList.length === activeEndpointCount && allActiveEndpointsReceived) {
            // 确保每个活跃端点只被计数一次
            activeEndpoints.forEach((endpoint) => {
              // 检查此端点是否收到了该 slot
              if (blockDataList.some((bd) => bd.endpoint === endpoint)) {
                endpointStats[endpoint].totalReceived++;
              }
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
        // 标记此端点为不可用
        endpointStats[endpoint.name].isAvailable = false;
        activeEndpoints.delete(endpoint.name);

        // 检查是否还有足够的活跃端点
        if (activeEndpoints.size < 2) {
          logger.warn(
            `由于 ${endpoint.name} 出错, 活跃端点不足两个 (当前${activeEndpoints.size}个), 无法进行对比分析`
          );
          if (!startedFormalStats) {
            logger.info("由于可用端点不足, 提前结束测试");
            endTest();
          }
        }
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
      // 标记此端点为不可用
      endpointStats[endpoint.name].isAvailable = false;
      activeEndpoints.delete(endpoint.name);
    }
  }

  // 创建一个函数来执行测试结束的清理工作
  function endTest() {
    clearInterval(checkInterval);
    clearTimeout(availabilityCheckTimeout);

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
        try {
          streams[endpoint.name].end();
        } catch (error) {
          logger.error(`关闭 ${endpoint.name} 流时出错:`, error);
        }
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

    // 只对有数据的端点进行对比
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

    if (sortedEndpoints.length >= 2) {
      for (const endpoint of sortedEndpoints) {
        const firstPercent = (endpoint.stats.firstReceived / endpoint.stats.totalReceived) * 100;
        const avgLatencyWhenSlower =
          endpoint.stats.latencies.length > 0
            ? endpoint.stats.totalLatency / endpoint.stats.latencies.length
            : 0;
        const avgLatencyTotal =
          endpoint.stats.totalReceived > 0
            ? endpoint.stats.totalLatency / endpoint.stats.totalReceived
            : 0;

        logger.info(
          `${endpoint.name.padEnd(8)}: 首先接收 ${firstPercent.toFixed(2).padStart(6)}%, 落后时平均延迟 ${avgLatencyWhenSlower.toFixed(2).padStart(6)}ms, 总体平均延迟 ${avgLatencyTotal.toFixed(2).padStart(6)}ms`
        );
      }
    } else if (sortedEndpoints.length === 1) {
      logger.info(`只有一个可用端点 ${sortedEndpoints[0].name}, 无法进行对比分析`);
    } else {
      logger.info("没有任何可用端点收集到数据，无法进行对比分析");
    }

    // 清理所有资源并退出
    logger.info("测试完成，正在关闭连接...");

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
      endTest();
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
