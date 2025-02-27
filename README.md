# GRPC 延迟测试

## 安装

### 前提条件

- **Node.js** v22.0.0 (推荐)

### 安装依赖

```bash
pnpm install
# or
npm install
```

## 使用

### 配置

你可以通过创建 `.env` 文件来配置环境变量，或者直接在命令行中传递参数。

#### 环境变量

| 变量名         | 描述                                 | 默认值                                               |
| -------------- | ------------------------------------ | ---------------------------------------------------- |
| `GRPC_URL`     | 要测试的 gRPC 服务 URL               | `https://solana-yellowstone-grpc.publicnode.com:443` |
| `GRPC_TOKEN`   | gRPC 服务认证令牌 (X-Token)          | 无                                                   |
| `TOTAL_ROUNDS` | 要发送的总 ping 请求数量             | `50`                                                 |
| `CONCURRENCY`  | 并发数量，即同时进行的 ping 请求数量 | `10`                                                 |

创建一个 `.env` 文件并添加以下内容：

```env
GRPC_URL=https://solana-yellowstone-grpc.publicnode.com:443
TOTAL_ROUNDS=50
CONCURRENCY=10
```

#### 命令行参数

你还可以通过命令行参数覆盖默认配置。例如：

```bash
npx tsx src/grpc-bench/latency-serial.ts --grpc_url=https://solana-yellowstone-grpc.publicnode.com:443 --total_rounds=10
```

## 测试说明

### 串行测试

串行方式测试 ping 之后 pong 的返回时间，每个 ping 间隔 100ms；

```bash
npx tsx src/grpc-bench/latency-serial.ts --total_rounds=10
```

### 并发测试

简单的并发方式，保持 n 个 ping 请求；
注意: 有些服务商会限制每秒订阅数量导致报错（例如 shyft 100/s），可适当调小并发数量。

```bash
npx tsx src/grpc-bench/latency-parallel.ts --grpc_url=https://solana-yellowstone-grpc.publicnode.com:443 --total_rounds=50 --concurrency=10
```

### GRPC 服务对比测试

新增的 `grpc-comparison` 工具用于对比多个 GRPC 服务的性能，通过分析它们接收相同 slot 的时间差来评估相对延迟。适用于需要横向评估多个 GRPC 服务性能的场景。

```bash
npx tsx src/grpc-bench/grpc-comparison.ts
```

更多详情请参考 [grpc-comparison.md](./grpc-comparison.md)。

## 输出示例

```plaintext
[11:09:18.626] INFO: GRPC_URL: https://grpc.chainbuff.com
[11:09:18.749] INFO: Warmup round: 83.12ms
[11:09:18.761] INFO: Round 1: 12.38ms
[11:09:18.762] INFO: Round 2: 12.86ms
[11:09:18.762] INFO: Round 3: 13.31ms
[11:09:18.763] INFO: Round 4: 13.88ms
[11:09:18.763] INFO: Round 5: 14.35ms
...
[11:09:19.672] INFO:
延迟统计:
  平均延迟: 10.65ms
  最小延迟: 9.38ms
  最大延迟: 19.50ms
  标准差: 1.93ms
  中位数 (p50): 9.75ms
  百分位数 (p90): 13.58ms
  百分位数 (p99): 18.83ms
  样本数量: 100
```

## 联系方式

Telegram: @bloxflux
