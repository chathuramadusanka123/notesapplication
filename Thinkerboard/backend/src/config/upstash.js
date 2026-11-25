import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import dotenv from "dotenv";

dotenv.config();

// Requests allowed per client IP per minute (default 100)
const max = Number(process.env.RATE_LIMIT_MAX || 100);

// If Upstash is not configured (local dev, tests), rate limiting is switched off.
const configured = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const ratelimit = configured
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(max, "60 s"),
      prefix: "thinkboard",
    })
  : null;

export default ratelimit;
