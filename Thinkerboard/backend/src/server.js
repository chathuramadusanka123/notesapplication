import "dotenv/config"; // must be first: loads .env before other modules read it

import mongoose from "mongoose";

import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import logger from "./lib/logger.js";
import { markShuttingDown } from "./routes/healthRoutes.js";

const PORT = process.env.PORT || 5001;
const SHUTDOWN_DELAY_MS = Number(process.env.SHUTDOWN_DELAY_MS || 5000);

if (!process.env.MONGO_URI) {
  logger.fatal("MONGO_URI is not set");
  process.exit(1);
}

const app = createApp();

connectDB()
  .then(() => {
    const server = app.listen(PORT, () => logger.info({ port: PORT }, "Server started"));
    server.keepAliveTimeout = 65000; // longer than the load balancer's 60s idle timeout

    // Graceful shutdown: on a deploy or scale-in the container gets SIGTERM.
    // 1) /ready starts returning 503 so the load balancer stops sending new requests
    // 2) wait a few seconds, 3) finish in-flight requests, 4) close MongoDB, 5) exit.
    let stopping = false;
    const shutdown = (signal) => {
      if (stopping) return;
      stopping = true;
      logger.info({ signal }, "Shutting down");
      markShuttingDown();
      setTimeout(() => {
        server.close(async () => {
          await mongoose.connection.close();
          logger.info("Shutdown complete");
          process.exit(0);
        });
        setTimeout(() => process.exit(1), 10000).unref(); // hard stop if requests hang
      }, SHUTDOWN_DELAY_MS);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  })
  .catch((error) => {
    logger.fatal({ err: error }, "Could not connect to MongoDB, exiting");
    process.exit(1);
  });

process.on("unhandledRejection", (reason) => logger.error({ err: reason }, "Unhandled promise rejection"));
