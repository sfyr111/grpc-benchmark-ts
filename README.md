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

## 测试工具说明

本项目提供了两种不同的 GRPC 测试方法，分别适用于不同场景：

### 1. GRPC 服务对比测试（推荐）

**grpc-comparison** 工具用于对比多个 GRPC 服务的性能，通过分析它们接收相同 slot 的时间差来评估相对延迟。这种方法更接近实际使用场景，能够准确反映 GRPC 服务在处理 Solana 区块时的实际表现。

#### 与 ping-pong 测试的主要区别

- **更接近真实场景**：测量的是接收真实区块数据的延迟，而不仅仅是网络通信延迟
- **支持多端点对比**：可同时测试多个 GRPC 服务，直观对比它们的性能差异
- **精确的性能指标**：提供"首先接收百分比"、"落后时平均延迟"等更有意义的指标

#### 使用方法

```bash
npx tsx src/grpc-bench/grpc-comparison.ts
```

配置多个端点进行对比：

```bash
GRPC_URL_1=https://grpc1.example.com:443 \
GRPC_URL_2=https://grpc2.example.com:443 \
GRPC_COMPARISON_DURATION_SEC=30 \
npx tsx src/grpc-bench/grpc-comparison.ts
```

详细配置和使用说明请参考 [grpc-comparison.md](./grpc-comparison.md)。

### 2. Ping-Pong 延迟测试（基础测试）

这种方法通过发送 ping 请求并测量收到 pong 回复的时间来测试 GRPC 服务的基本网络通信延迟。适用于简单评估 GRPC 服务的网络连接质量，但不能完全反映服务处理实际区块数据的性能。

#### 串行测试

连续发送 ping 请求，每个间隔 100ms：

```bash
npx tsx src/grpc-bench/latency-serial.ts --total_rounds=10
```

#### 并发测试

同时保持多个 ping 请求：

```bash
npx tsx src/grpc-bench/latency-parallel.ts --concurrency=10
```

#### 配置参数

| 变量名         | 描述                                 | 默认值                                               |
| -------------- | ------------------------------------ | ---------------------------------------------------- |
| `GRPC_URL`     | 要测试的 gRPC 服务 URL               | `https://solana-yellowstone-grpc.publicnode.com:443` |
| `GRPC_TOKEN`   | gRPC 服务认证令牌 (X-Token)          | 无                                                   |
| `TOTAL_ROUNDS` | 要发送的总 ping 请求数量             | `50`                                                 |
| `CONCURRENCY`  | 并发数量，即同时进行的 ping 请求数量 | `10`                                                 |

## 输出示例

### GRPC 服务对比测试输出示例

```plaintext
[12:06:42.505] INFO: 开始对比多个 GRPC 服务性能...
[12:06:42.506] INFO: 测试持续时间: 30秒
[12:06:42.506] INFO: 测试端点: GRPC-1, GRPC-2
[12:06:43.547] INFO: 所有端点都已接收到第一个 slot, 开始正式统计...
[12:07:12.613] INFO: ===== 端点性能对比 =====
[12:07:12.613] INFO: GRPC-2  : 首先接收  85.14%, 落后时平均延迟  28.69ms, 总体平均延迟   4.27ms
[12:07:12.613] INFO: GRPC-1  : 首先接收  14.86%, 落后时平均延迟   3.86ms, 总体平均延迟   3.29ms
```

### Ping-Pong 测试输出示例

```plaintext
[11:09:18.626] INFO: GRPC_URL: https://grpc.example.com
[11:09:18.761] INFO: Round 1: 12.38ms
[11:09:18.762] INFO: Round 2: 12.86ms
[11:09:19.672] INFO:
延迟统计:
  平均延迟: 10.65ms
  最小延迟: 9.38ms
  最大延迟: 19.50ms
  样本数量: 100
```

## 联系方式

Telegram: @bloxflux
