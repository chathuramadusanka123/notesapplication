import express from "express";
import mongoose from "mongoose";

import { dbPingDuration, dbUp, register } from "../lib/metrics.js";

const router = express.Router();
let shuttingDown = false;

export function markShuttingDown() {
  shuttingDown = true;
}

// Liveness: the process is running. Docker HEALTHCHECK uses this.
router.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Readiness: able to serve traffic (MongoDB reachable, not shutting down).
// The load balancer uses this, so a server that lost its database stops getting traffic.
router.get("/ready", async (_req, res) => {
  if (shuttingDown) return res.status(503).json({ status: "shutting_down" });
  if (mongoose.connection.readyState !== 1) {
    dbUp.set(0);
    return res.status(503).json({ status: "db_disconnected" });
  }
  const end = dbPingDuration.startTimer();
  try {
    await Promise.race([
      mongoose.connection.db.admin().ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ping timeout")), 2000)),
    ]);
    end();
    dbUp.set(1);
    res.status(200).json({ status: "ready" });
  } catch (error) {
    end();
    dbUp.set(0);
    res.status(503).json({ status: "db_unreachable", detail: error.message });
  }
});

// Prometheus scrapes this. Blocked from the internet at the load balancer.
router.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

export default router;
