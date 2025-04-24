import { spawn } from "child_process";
import { logger } from "./logger";

// Run the GRPC comparison test with the properly configured endpoints
function runComparisonTest(token1?: string, token2?: string, token3?: string) {
  logger.info("开始对比三个 GRPC 端点的性能...");

  // Environment variables for the comparison test
  const env = {
    ...process.env,
    // 设置三个端点进行比较
    // 端点 1: QuikNode
    GRPC_URL_1: "https://blissful-dry-feather.solana-mainnet.quiknode.pro:10000",
    // 从命令行参数获取token
    ...(token1 && { GRPC_TOKEN_1: token1 }),

    // 端点 3: 自定义 IP
    GRPC_URL_2: "http://208.91.110.168:10000",
    // 从命令行参数获取token
    ...(token2 && { GRPC_TOKEN_2: token2 }),

    // Fountainhead
    GRPC_URL_3: "https://grpc-ny-enterprise.fountainhead.land",

    GRPC_URL_4: "https://grpc-ams-enterprise.fountainhead.land",

    GRPC_URL_5: "https://grpc-fra-enterprise.fountainhead.land",
    // 测试持续时间
    GRPC_COMPARISON_DURATION_SEC: "30",
  };

  // 运行对比测试脚本
  const child = spawn("npx", ["tsx", "src/grpc-bench/grpc-comparison.ts"], {
    env,
    stdio: "inherit",
  });

  child.on("close", (code) => {
    if (code === 0) {
      logger.info("GRPC 对比测试成功完成");
    } else {
      logger.error(`GRPC 对比测试失败，错误码: ${code}`);
    }
  });
}

// Run the serial ping test on a single endpoint
function runSerialPingTest(token?: string) {
  logger.info("Starting serial ping-pong test on the working QuikNode endpoint...");

  // Environment variables for the ping test
  const env = {
    ...process.env,
    GRPC_URL: "https://blissful-dry-feather.solana-mainnet.quiknode.pro:10000",
    ...(token && { GRPC_TOKEN: token }),
    TOTAL_ROUNDS: "10",
  };

  // Run the latency test script
  const child = spawn("npx", ["tsx", "src/grpc-bench/latency-serial.ts"], {
    env,
    stdio: "inherit",
  });

  child.on("close", (code) => {
    if (code === 0) {
      logger.info("Serial ping-pong test completed successfully");
    } else {
      logger.error(`Serial ping-pong test failed with code ${code}`);
    }
  });
}

// Run the parallel ping test on a single endpoint
function runParallelPingTest(token?: string) {
  logger.info("Starting parallel ping-pong test on the working QuikNode endpoint...");

  // Environment variables for the parallel ping test
  const env = {
    ...process.env,
    GRPC_URL: "https://blissful-dry-feather.solana-mainnet.quiknode.pro:10000",
    ...(token && { GRPC_TOKEN: token }),
    TOTAL_ROUNDS: "20",
    CONCURRENCY: "5",
  };

  // Run the parallel latency test script
  const child = spawn("npx", ["tsx", "src/grpc-bench/latency-parallel.ts"], {
    env,
    stdio: "inherit",
  });

  child.on("close", (code) => {
    if (code === 0) {
      logger.info("Parallel ping-pong test completed successfully");
    } else {
      logger.error(`Parallel ping-pong test failed with code ${code}`);
    }
  });
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const tokens: { [key: string]: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--token1=")) {
      tokens.token1 = args[i].split("=")[1];
    } else if (args[i].startsWith("--token2=")) {
      tokens.token2 = args[i].split("=")[1];
    } else if (args[i].startsWith("--token3=")) {
      tokens.token3 = args[i].split("=")[1];
    } else if (args[i] === "--token1" && i + 1 < args.length) {
      tokens.token1 = args[++i];
    } else if (args[i] === "--token2" && i + 1 < args.length) {
      tokens.token2 = args[++i];
    } else if (args[i] === "--token3" && i + 1 < args.length) {
      tokens.token3 = args[++i];
    }
  }

  return tokens;
}

// Main function to run the tests
async function main() {
  // 解析命令行参数
  const tokens = parseArgs();
  logger.info(`已接收从命令行传入的token参数：${Object.keys(tokens).length}个`);

  // 三种测试方式，取消注释您想运行的测试

  // 1. 串行 ping 测试 (对单个节点进行基本延迟测试)
  // runSerialPingTest(tokens.token1);

  // 2. 并行 ping 测试 (测试节点处理并发连接的能力)
  // runParallelPingTest(tokens.token1);

  // 3. 对比测试 (同时测试三个端点性能)
  runComparisonTest(tokens.token1, tokens.token2, tokens.token3);
}

main().catch((error: any) => {
  logger.error("Unhandled error:", error.message);
  process.exit(1);
});
