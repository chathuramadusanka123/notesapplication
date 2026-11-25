import pino from "pino";

// JSON logs to stdout: Docker, Loki or CloudWatch can collect and search them.
// LOG_LEVEL: debug | info | warn | error | silent (tests use silent)
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "thinkboard-api" },
  redact: ["req.headers.authorization", "req.headers.cookie"],
});

export default logger;
