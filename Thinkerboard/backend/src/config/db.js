import mongoose from "mongoose";

import logger from "../lib/logger.js";
import { dbUp } from "../lib/metrics.js";

mongoose.connection.on("connected", () => dbUp.set(1));
mongoose.connection.on("disconnected", () => {
  dbUp.set(0);
  logger.warn("MongoDB disconnected");
});
mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));

// Retry with backoff instead of exiting on the first failure, so a short Atlas
// blip at startup does not crash-loop the container.
export const connectDB = async ({ retries = 5 } = {}) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10,
      });
      logger.info("MongoDB connected");
      return;
    } catch (error) {
      logger.error({ err: error, attempt, retries }, "MongoDB connection failed");
      if (attempt === retries) throw error;
      await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 15000)));
    }
  }
};
