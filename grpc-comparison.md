# GRPC 性能对比工具

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

你可以通过创建 `.env` 文件来配置环境变量，或者直接在命令行中传递环境变量参数。

#### 环境变量

| 变量名                         | 描述                 | 默认值                                               |
| ------------------------------ | -------------------- | ---------------------------------------------------- |
| `GRPC_URL_1`                   | 第一个 gRPC 服务 URL | `https://solana-yellowstone-grpc.publicnode.com:443` |
| `GRPC_NAME_1`                  | 第一个 gRPC 服务名称 | `GRPC-1`                                             |
| `GRPC_TOKEN_1`                 | 第一个 gRPC 服务令牌 | 无                                                   |
| `GRPC_URL_2`                   | 第二个 gRPC 服务 URL | `https://solana-yellowstone-grpc.publicnode.com:443` |
| `GRPC_NAME_2`                  | 第二个 gRPC 服务名称 | `GRPC-2`                                             |
| `GRPC_TOKEN_2`                 | 第二个 gRPC 服务令牌 | 无                                                   |
| `GRPC_COMPARISON_DURATION_SEC` | 测试持续时间（秒）   | `30`                                                 |

创建一个 `.env` 文件并添加以下内容：

```env
GRPC_URL_1=https://solana-yellowstone-grpc.publicnode.com:443
GRPC_URL_2=https://your-grpc-server.com:443
GRPC_TOKEN_2=your_x_token_here
GRPC_COMPARISON_DURATION_SEC=30
```

### 支持多个端点

你可以通过环境变量配置多个 gRPC 端点进行对比测试。环境变量命名格式为 `GRPC_URL_N`，其中 `N` 为任意正整数（如 `GRPC_URL_1`、`GRPC_URL_2` 等）。例如：

```env
GRPC_URL_1=https://grpc1.example.com:443
GRPC_URL_2=https://grpc2.example.com:443
GRPC_TOKEN_2=your_x_token_here
GRPC_URL_3=https://grpc3.example.com:443
```

程序会自动检测所有配置的端点并进行性能对比。如果只配置了一个端点，程序仍可运行，但仅输出该端点接收 slot 的时间，无法进行对比分析。

### 认证支持

工具支持使用 X-Token 认证方式连接需要认证的 gRPC 服务（如 Shyft 等）。只需在环境变量中设置对应的 `GRPC_TOKEN_N` 即可。例如：

```env
GRPC_URL_1=https://grpc.shyft.to
GRPC_TOKEN_1=your_shyft_x_token_here
```

对于不需要认证的 gRPC 服务，可以不设置 token。

## 测试说明

### 与之前 benchmark 的区别

- **测试目标不同**
  之前的 benchmark (latency-serial.ts) 通过发送 ping pong 消息来测试 gRPC 的响应延迟。这种方法主要测量的是 gRPC 协议的底层通信延迟，无法反映真实场景中的 gRPC 性能，例如 gRPC 服务端处理慢块的延迟。

- **测试方法改进**
  新的测试方法通过对比多个 gRPC 服务的性能，横向评估它们的延迟。由于 gRPC 返回的最小粒度是 slot，无法精确到毫秒，因此不存在一个简单直接的方法来测量 gRPC 延迟。新的测试方法通过对比多个 gRPC 服务接收相同 slot 的时间差，来评估它们的相对延迟。

- **指标定义**

  - **落后时平均延迟**：指在多个 gRPC 服务中，当某个服务比其他服务慢时，该服务相对于其他服务延迟的平均值。分母是该服务比其他服务慢的次数。
  - **总体平均延迟**：指所有 gRPC 服务接收相同 slot 的平均延迟，分母是每个 gRPC 接收 slot 的总次数。该延迟是相对本次测试中所有 gRPC 服务中延迟最小的服务而言的。例如，一次测试中，GRPC-1 最快得到 slot 123456，GRPC-2 延迟 12.38ms 得到 slot 123456，那么 GRPC-1 的总体平均延迟是 0ms，GRPC-2 的总体平均延迟是 12.38ms。

- **注意事项**
  目前市面上可以免费使用的 gRPC 服务几乎只有 `https://solana-yellowstone-grpc.publicnode.com:443`。该服务背后有不同的区域负载（例如美国、德国），因此每次测试结果可能差异较大，不适合作为基准。

### 运行测试

```bash
npx tsx src/grpc-bench/grpc-comparison.ts
```

```bash
# 直接使用环境变量
GRPC_URL_1=https://solana-yellowstone-grpc.publicnode.com:443 \
GRPC_URL_2=https://your-grpc-server.com:443 \
GRPC_TOKEN_2=your_x_token_here \
GRPC_COMPARISON_DURATION_SEC=30 \
npx tsx src/grpc-bench/grpc-comparison.ts
```

## 输出示例

```plaintext
[12:06:42.505] INFO: 开始对比多个 GRPC 服务性能...
[12:06:42.506] INFO: 测试持续时间: 30秒
[12:06:42.506] INFO: 测试端点: GRPC-1, GRPC-2
[12:06:42.506] INFO: 连接到 GRPC-1: https://solana-yellowstone-grpc.publicnode.com:443
[12:06:42.586] INFO: GRPC-1 订阅成功，等待数据...
[12:06:42.586] INFO: 连接到 GRPC-2: https://solana-yellowstone-grpc.publicnode.com:443
[12:06:42.593] INFO: GRPC-2 订阅成功，等待数据...
[12:06:43.547] INFO: 所有端点都已接收到第一个 slot, 开始正式统计...
[12:06:43.930] INFO: GRPC-2 接收 slot 323139140: 首次接收
[12:06:43.930] INFO: GRPC-1 接收 slot 323139140: 延迟 7.77ms (相对于 GRPC-2)
...
[12:07:12.612] INFO: 测试完成，分析结果...
[12:07:12.612] INFO: ===== GRPC-1 性能分析 =====
[12:07:12.612] INFO: 总接收区块数: 74
[12:07:12.612] INFO: 首先接收区块数: 11 (14.86%)
[12:07:12.612] INFO: 延迟统计 (相对于最快端点):
[12:07:12.612] INFO:   平均延迟: 3.86ms
[12:07:12.612] INFO:   最小延迟: 0.19ms
[12:07:12.612] INFO:   最大延迟: 13.92ms
[12:07:12.612] INFO:   样本数量: 63
[12:07:12.612] INFO: ===== GRPC-2 性能分析 =====
[12:07:12.612] INFO: 总接收区块数: 74
[12:07:12.612] INFO: 首先接收区块数: 63 (85.14%)
[12:07:12.612] INFO: 延迟统计 (相对于最快端点):
[12:07:12.612] INFO:   平均延迟: 28.69ms
[12:07:12.612] INFO:   最小延迟: 0.20ms
[12:07:12.612] INFO:   最大延迟: 308.03ms
[12:07:12.612] INFO:   样本数量: 11
[12:07:12.613] INFO: ===== 端点性能对比 =====
[12:07:12.613] INFO: GRPC-2  : 首先接收  85.14%, 落后时平均延迟  28.69ms, 总体平均延迟   4.27ms
[12:07:12.613] INFO: GRPC-1  : 首先接收  14.86%, 落后时平均延迟   3.86ms, 总体平均延迟   3.29ms
[12:07:12.613] INFO: 测试完成，正在关闭连接...
[12:07:12.613] INFO: 所有连接已关闭，测试结束
```

## 联系方式

Telegram: @bloxflux
