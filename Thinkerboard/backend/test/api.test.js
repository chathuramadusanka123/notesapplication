// Tests that need no database: health checks, metrics, validation, error handling, rate limiting.
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

import { createApp } from "../src/app.js";
import { createRateLimiter } from "../src/middleware/rateLimiter.js";

const app = createApp({ rateLimiter: (_req, _res, next) => next() });

test("GET /health returns 200", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: "ok" });
});

test("GET /ready returns 503 when MongoDB is not connected", async () => {
  const res = await request(app).get("/ready");
  assert.equal(res.status, 503);
  assert.equal(res.body.status, "db_disconnected");
});

test("GET /metrics exposes request counters by route pattern", async () => {
  await request(app).get("/api/notes/not-a-real-id");
  const res = await request(app).get("/metrics");
  assert.equal(res.status, 200);
  assert.match(res.text, /http_requests_total\{method="GET",route="\/api\/notes\/:id",status="404"\}/);
  assert.match(res.text, /process_cpu_seconds_total/);
});

test("malformed note id returns 404, not 500", async () => {
  for (const method of ["get", "put", "delete"]) {
    const res = await request(app)[method]("/api/notes/not-a-real-id").send({ title: "a", content: "b" });
    assert.equal(res.status, 404, `${method} should be 404`);
  }
});

test("creating a note without a title returns 400, not 500", async () => {
  const res = await request(app).post("/api/notes").send({ content: "no title" });
  assert.equal(res.status, 400);
  assert.ok(res.body.errors.some((e) => e.includes("title")));
});

test("invalid JSON body returns 400", async () => {
  const res = await request(app).post("/api/notes").set("Content-Type", "application/json").send("{bad json");
  assert.equal(res.status, 400);
});

test("unknown /api route returns JSON 404", async () => {
  const res = await request(app).get("/api/nothing-here");
  assert.equal(res.status, 404);
  assert.equal(res.body.message, "Not found");
});

test("responses carry an x-request-id header for tracing", async () => {
  const res = await request(app).get("/api/notes/abc").set("x-request-id", "trace-123");
  assert.equal(res.headers["x-request-id"], "trace-123");
});

// --- rate limiter ---
function appWith(limiter) {
  const a = express();
  a.set("trust proxy", 1);
  a.get("/x", limiter, (_req, res) => res.json({ ok: true }));
  return a;
}

test("rate limiter returns 429 when the limit is reached", async () => {
  const limiter = createRateLimiter({ limit: async () => ({ success: false }) });
  const res = await request(appWith(limiter)).get("/x");
  assert.equal(res.status, 429);
});

test("rate limiter limits each client IP separately", async () => {
  const keys = [];
  const limiter = createRateLimiter({ limit: async (key) => (keys.push(key), { success: true }) });
  await request(appWith(limiter)).get("/x").set("X-Forwarded-For", "1.1.1.1");
  await request(appWith(limiter)).get("/x").set("X-Forwarded-For", "2.2.2.2");
  assert.deepEqual(keys, ["1.1.1.1", "2.2.2.2"]);
});

test("rate limiter fails open when Upstash is unreachable", async () => {
  const limiter = createRateLimiter({ limit: async () => { throw new Error("ECONNREFUSED"); } });
  const res = await request(appWith(limiter)).get("/x");
  assert.equal(res.status, 200);
});
