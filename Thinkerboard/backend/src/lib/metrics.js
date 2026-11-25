import client from "prom-client";

// Prometheus metrics, served at GET /metrics
export const register = new client.Registry();
client.collectDefaultMetrics({ register }); // CPU, memory, event-loop lag, GC

export const httpRequests = new client.Counter({
  name: "http_requests_total",
  help: "HTTP requests handled",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

export const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency",
  labelNames: ["method", "route"],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

export const dbUp = new client.Gauge({
  name: "mongodb_up",
  help: "1 if the last MongoDB ping succeeded, 0 if not",
  registers: [register],
});

export const dbPingDuration = new client.Histogram({
  name: "mongodb_ping_duration_seconds",
  help: "Time for a MongoDB ping",
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});

export const rateLimited = new client.Counter({
  name: "rate_limited_requests_total",
  help: "Requests rejected with 429 by the rate limiter",
  registers: [register],
});

export const rateLimiterErrors = new client.Counter({
  name: "rate_limiter_errors_total",
  help: "Times the rate limiter (Upstash) could not be reached",
  registers: [register],
});

export const notesOperations = new client.Counter({
  name: "notes_operations_total",
  help: "Successful note operations",
  labelNames: ["operation"],
  registers: [register],
});

// Records every request. Uses the route pattern (/api/notes/:id), not the real URL,
// so each note id does not create a new time series.
export function metricsMiddleware(req, res, next) {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    const route = req.route ? `${req.baseUrl}${req.route.path}` : req.baseUrl || "unmatched";
    if (route === "/metrics") return;
    end({ method: req.method, route });
    httpRequests.inc({ method: req.method, route, status: String(res.statusCode) });
  });
  next();
}
