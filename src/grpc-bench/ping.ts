import { SubscribeRequest } from "@triton-one/yellowstone-grpc";
import { performance } from "perf_hooks";
import { logger } from "./logger";

export interface PingInfo {
  id: number;
  sendTime: number;
}

// 发送 Ping 请求
export function sendPing(stream: any, round: number, pendingPings: Map<number, PingInfo>) {
  const pingRequest: SubscribeRequest = {
    ping: { id: round },
    accounts: {},
    accountsDataSlice: [],
    transactions: {},
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    slots: {},
  };

  const sendTime = performance.now();
  pendingPings.set(round, { id: round, sendTime });

  stream.write(pingRequest, (err: any) => {
    if (err) {
      logger.error(`Ping ${round} failed:`, err);
      pendingPings.delete(round);
    }
  });
}
