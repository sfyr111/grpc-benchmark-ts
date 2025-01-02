## 安装

### 前提条件

- **Node.js** v22.0.0 (推荐)

### 安装依赖

使用 `pnpm`：

```bash
pnpm install
```

使用 `npm`：

```bash
npm install
```

## 使用

### 配置

你可以通过创建 `.env` 文件来配置环境变量，或者直接在命令行中传递参数。

#### 环境变量

| 变量名         | 描述                                 | 默认值                                               |
| -------------- | ------------------------------------ | ---------------------------------------------------- |
| `GRPC_URL`     | 要测试的 gRPC 服务 URL               | `https://solana-yellowstone-grpc.publicnode.com:443` |
| `TOTAL_ROUNDS` | 要发送的总 ping 请求数量             | `100`                                                |
| `CONCURRENCY`  | 并发数量，即同时进行的 ping 请求数量 | `10`                                                 |

创建一个 `.env` 文件并添加以下内容：

```env
GRPC_URL=https://solana-yellowstone-grpc.publicnode.com:443
TOTAL_ROUNDS=100
CONCURRENCY=10
```

#### 命令行参数

你还可以通过命令行参数覆盖默认配置。例如：

```bash
npx tsx src/grpc-bench/latency_serial.ts --grpc_url=https://your-grpc-server.com:443 --total_rounds=200 --concurrency=20
```

### 测试说明

串行测试：
串行方式测试ping之后pong的返回时间，每个ping间隔100ms；

```bash
npx tsx src/grpc-bench/latency_serial.ts --total_rounds=10
```

并发测试：
简单的并发方式，保持n个ping请求；

```bash
npx tsx src/grpc-bench/latency_parallel.ts
```

### 输出示例

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

### 联系方式

Telegram: @bloxflux
