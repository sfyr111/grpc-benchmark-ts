import Client from "@triton-one/yellowstone-grpc";
import { logger } from "./logger";

// Test connection to a GRPC endpoint
async function testConnection(url: string, label: string, token?: string) {
  logger.info(`Testing connection to ${label}: ${url}`);

  try {
    const client = new Client(url, token, {});
    logger.info(`Client created for ${label}`);

    try {
      logger.info(`Attempting to subscribe to ${label}...`);
      const stream = await client.subscribe();

      stream.on("data", (data) => {
        logger.info(`Received data from ${label}:`, typeof data);
        if (data.pong) {
          logger.info(`Received pong from ${label}`);
        } else if (data.slot) {
          logger.info(`Received slot ${data.slot} from ${label}`);
        } else {
          logger.info(`Received other data type from ${label}`);
        }
      });

      stream.on("error", (error: any) => {
        logger.error(`Stream error from ${label}:`, error.message);
        try {
          logger.error(
            `Error details: ${JSON.stringify(
              {
                code: error.code,
                details: error.details,
                metadata: error.metadata,
              },
              null,
              2
            )}`
          );
        } catch (e: any) {
          logger.error(`Could not stringify error: ${e.message}`);
        }
      });

      stream.on("end", () => {
        logger.info(`Stream from ${label} ended`);
      });

      // Send a ping request
      logger.info(`Sending ping to ${label}...`);
      stream.write({
        ping: { id: 1 },
        accounts: {},
        accountsDataSlice: [],
        transactions: {},
        transactionsStatus: {},
        blocks: {},
        blocksMeta: {},
        entry: {},
        slots: {},
      });

      // Wait for 5 seconds to collect some data
      await new Promise((resolve) => setTimeout(resolve, 5000));

      logger.info(`Test for ${label} completed`);
      stream.end();
    } catch (streamError: any) {
      logger.error(`Failed to subscribe to ${label}:`, streamError.message);
      if (streamError.stack) {
        logger.error(`Stack trace:`, streamError.stack);
      }
    }
  } catch (clientError: any) {
    logger.error(`Failed to create client for ${label}:`, clientError.message);
    if (clientError.stack) {
      logger.error(`Stack trace:`, clientError.stack);
    }
  }
}

async function main() {
  // Test the three endpoints
  try {
    await testConnection("https://grpc-ny-enterprise.fountainhead.land", "Fountainhead");

    await testConnection(
      "https://blissful-dry-feather.solana-mainnet.quiknode.pro:10000",
      "QuikNode",
      "521dcb2a92c6135f9c11718137d71ba3a2d0dab4"
    );

    await testConnection("http://208.91.110.168:10000", "Custom IP", "xToken");

    logger.info("All tests completed");
  } catch (error: any) {
    logger.error("Error during tests:", error.message);
  }
}

main().catch((error: any) => {
  logger.error("Unhandled error:", error.message);
  process.exit(1);
});
