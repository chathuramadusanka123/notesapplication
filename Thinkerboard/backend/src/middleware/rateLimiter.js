import defaultRatelimit from "../config/upstash.js";
import logger from "../lib/logger.js";
import { rateLimited, rateLimiterErrors } from "../lib/metrics.js";

// Fail open by default: if Upstash is down, let requests through instead of
// turning a rate-limiter outage into a full site outage. Set RATE_LIMIT_FAIL_OPEN=false
// to fail closed (block requests) instead.
const failOpen = process.env.RATE_LIMIT_FAIL_OPEN !== "false";
const TIMEOUT_MS = 1000;

export function createRateLimiter(ratelimit = defaultRatelimit) {
  return async function rateLimiter(req, res, next) {
    if (!ratelimit) return next();

    try {
      // One limit per client IP (req.ip uses X-Forwarded-For because "trust proxy" is set),
      // instead of one shared limit for every user of the site.
      const { success } = await Promise.race([
        ratelimit.limit(req.ip || "unknown"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("rate limiter timeout")), TIMEOUT_MS)),
      ]);

      if (!success) {
        rateLimited.inc();
        return res.status(429).json({ message: "Too many requests, please try again later" });
      }
      next();
    } catch (error) {
      rateLimiterErrors.inc();
      logger.warn({ err: error, failOpen }, "rate limiter unavailable");
      if (failOpen) return next();
      res.status(503).json({ message: "Service temporarily unavailable" });
    }
  };
}

export default createRateLimiter();
