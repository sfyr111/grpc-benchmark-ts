# Jito 多IP请求测试工具使用指南

## 适用场景

本工具专为测试Jito节点的IP限制机制设计。通过配置多个IP地址作为代理（自行搭建），并发请求自定义Jito节点，实时监测多IP的请求成功率，验证多IP代理在请求限制方面的效果。

测试原理：

- jito sendBundle /api/v1/bundles 有一个方法 getTipAccounts，与 sendBundle 有相同的 IP 限制机制，通过请求 getTipAccounts 方法，统计 HTTP 状态码 200（成功响应）和 429（请求过于频繁）的数量，评估 Jito 节点对 IP 请求的限制情况。（实际上也可以直接请求 sendBundle，但参数更麻烦）
- 注意：jito 的限制包含 IP 和 发送 tip 的钱包账户。

## 环境配置

1. [可选] 复制 `.env.jito.example` 文件并重命名为 `.env`
2. 根据实际需求修改配置项：
   - `JITO_URL`: 自定义 Jito 服务地址，选填，默认 `https://amsterdam.mainnet.block-engine.jito.wtf`
   - `JITO_CONCURRENCY`: 每秒请求并发量，选填，默认 `10`
3. 注意：JITO_URL 需要是自己代理的多 IP Jito节点，官方 URL 只是方便来测试，不是本工具主要用途。

## 运行步骤

1. 安装依赖：

```
pnpm install
# or
npm install
```

2. 启动测试：

```

npx tsx src/grpc-bench/benchmark-jito.ts

```

## 运行说明

- 程序启动后会每 10 秒输出一次统计信息，包括：
  - 总请求量
  - 成功响应量
  - 平均每秒成功请求数
  - 429 错误次数
- 测试将持续运行，直到手动终止（Ctrl+C）

## 配置示例

```

JITO_URL = https://amsterdam.mainnet.block-engine.jito.wtf
JITO_CONCURRENCY = 20

```

## 输出示例

```
[00:57:07.219] INFO: 统计 - 过去 10 秒：发送请求总量: 298, 成功响应量: 181, 平均每秒成功: 18.1, 429 错误次数: 118
[00:57:17.220] INFO: 统计 - 过去 10 秒：发送请求总量: 299, 成功响应量: 180, 平均每秒成功: 18.0, 429 错误次数: 118
[00:57:27.221] INFO: 统计 - 过去 10 秒：发送请求总量: 300, 成功响应量: 180, 平均每秒成功: 18.0, 429 错误次数: 121
[00:57:37.223] INFO: 统计 - 过去 10 秒：发送请求总量: 300, 成功响应量: 180, 平均每秒成功: 18.0, 429 错误次数: 120
[00:57:47.223] INFO: 统计 - 过去 10 秒：发送请求总量: 300, 成功响应量: 180, 平均每秒成功: 18.0, 429 错误次数: 120
```
