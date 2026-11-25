import express from "express";
import cors from "cors";
import path from "path";
import { randomUUID } from "crypto";
import pinoHttp from "pino-http";

import notesRoutes from "./routes/notesRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import defaultRateLimiter from "./middleware/rateLimiter.js";
import logger from "./lib/logger.js";
import { metricsMiddleware } from "./lib/metrics.js";

export function createApp({ rateLimiter = defaultRateLimiter } = {}) {
  const app = express();

  // Behind the AWS load balancer: use X-Forwarded-For for the real client IP
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  if (process.env.NODE_ENV !== "production") {
    app.use(cors({ origin: "http://localhost:5173" }));
  }

  app.use(metricsMiddleware);

  // Health checks and metrics first: never rate-limited, never logged per request
  app.use(healthRoutes);

  // One JSON log line per request, with a request id to trace it
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.headers["x-request-id"] || randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    })
  );

  app.use(express.json({ limit: "100kb" }));

  // Rate limit the API only, not the page files (HTML, JS, CSS)
  app.use("/api/notes", rateLimiter, notesRoutes);
  app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));

  if (process.env.NODE_ENV === "production") {
    // FRONTEND_DIST is set in the Docker image; the default matches the original layout
    const dist = path.resolve(process.env.FRONTEND_DIST || "../frontend/dist");
    app.use(express.static(dist, { maxAge: "1y", index: false }));
    // A missing JS/CSS file is a real 404, not the React page
    app.use("/assets", (_req, res) => res.status(404).end());
    app.get("*", (_req, res) => {
      res.set("Cache-Control", "no-cache");
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  // Bad JSON body -> 400; anything else unexpected -> 500 (logged)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ message: "Invalid JSON" });
    if (err.type === "entity.too.large") return res.status(413).json({ message: "Request too large" });
    (req.log || logger).error({ err }, "unhandled error");
    res.status(500).json({ message: "Internal server error" });
  });

  return app;
}

export default createApp;
