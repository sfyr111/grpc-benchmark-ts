import Client, { CommitmentLevel, SubscribeRequest } from "@triton-one/yellowstone-grpc";

async function main() {
  // 创建订阅客户端
  // const client = new Client(
  // 如遇到TypeError: Client is not a constructor错误
  // 请使用以下方式创建
  // 见 https://github.com/rpcpool/yellowstone-grpc/issues/428
  // @ts-ignore
  const client = new Client(
    process.env.GRPC_URL || "https://solana-yellowstone-grpc.publicnode.com:443",
    undefined,
    {
      "grpc.max_receive_message_length": 16 * 1024 * 1024, // 16MB
    }
  );

  // 创建订阅数据流
  const stream = await client.subscribe();

  // 创建订阅请求
  const request: SubscribeRequest = {
    accounts: {},
    slots: { slot: { filterByCommitment: true } }, // 指定只获取processed的slot
    transactions: {},
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    accountsDataSlice: [],
    commitment: CommitmentLevel.PROCESSED, // 指定级别为processed
    ping: undefined,
  };

  // 发送订阅请求
  await new Promise<void>((resolve, reject) => {
    stream.write(request, (err: any) => {
      if (err === null || err === undefined) {
        resolve();
      } else {
        reject(err);
      }
    });
  }).catch((reason) => {
    console.error(reason);
    throw reason;
  });

  // 获取订阅数据
  stream.on("data", async (data: any) => {
    console.log(data);
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
  setInterval(async () => {
    await new Promise<void>((resolve, reject) => {
      stream.write(pingRequest, (err: any) => {
        if (err === null || err === undefined) {
          resolve();
        } else {
          reject(err);
        }
      });
    }).catch((reason) => {
      console.error(reason);
      throw reason;
    });
  }, 5000);
}

main();
