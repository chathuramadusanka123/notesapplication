# ThinkBoard — running a MERN app like a production service

ThinkBoard is a MERN notes app (MongoDB, Express, React, Node) with full CRUD and Upstash rate limiting.
The app itself started from a well-known MERN tutorial; **this repository is about operating it reliably**:
health checks, metrics, structured logs, graceful shutdown, tests, containers, CI, monitoring with SLOs,
alerting, runbooks and incident drills.

> Status: phase 1 (app hardening, Docker, CI, local monitoring) done. Next: AWS with Terraform.

## Reliability problems found in the original app, and the fixes

| Problem | Impact | Fix |
|---|---|---|
| Rate limiter used **one shared key for all users** | 100 requests/min from anyone blocked everyone | Limit per client IP (`trust proxy` for the load balancer) |
| Rate limiter covered page files (HTML/JS/CSS) too | Every page load used up the limit and called Upstash | Limit `/api/notes` only |
| Upstash outage → every request failed | A rate-limiter outage became a full outage | **Fail open** with a 1 s timeout, configurable, alert on errors |
| Malformed note id → **500** | Client mistakes counted as server failures in the SLO | 404 for invalid ids |
| Missing title/content → **500** | Same | 400 with validation messages |
| App exited on the first MongoDB connection error | Short Atlas blips caused crash loops | Retry with backoff |
| No health or readiness endpoints | Load balancer could not tell if a server can serve | `/health` (process) and `/ready` (MongoDB ping) |
| No metrics, `console.log` only | No way to measure SLIs or debug in production | Prometheus metrics, JSON logs with request ids |
| Deploys/scale-in cut off in-flight requests | Errors during every release | Graceful shutdown on SIGTERM |
| No `.gitignore` | `.env` with secrets could be committed by accident | `.gitignore` + `.env.example` |

## Architecture (local)

```
Browser -> app container (Express: API + built React app) -> MongoDB
                |  /metrics
            Prometheus <- blackbox exporter (synthetic checks on /, /ready, /api/notes)
                |  alerts
          Alertmanager -> Slack #alerts
                |
             Grafana (golden signals, SLO, error budget)
```

## Service level objectives (30 days)

| SLI | SLO |
|---|---|
| API requests that do not fail with 5xx (429 and 4xx excluded) | 99.5% |
| `GET /api/notes` latency, 95th percentile | under 300 ms |
| Synthetic checks on `/` and `/ready` | 99.5% |

Alerts: `SiteDown`, `NotReady`, `MongoDBDown`, `ErrorBudgetFastBurn`, `NotesListSlow`,
`RateLimitSpike`, `RateLimiterUnavailable`, `EventLoopLag`, `HighMemory` — each with a runbook in
[`Thinkerboard/docs/runbooks`](Thinkerboard/docs/runbooks).

## Endpoints

| Path | Purpose |
|---|---|
| `/api/notes` | CRUD API (rate limited per IP) |
| `/health` | Liveness: the process is up |
| `/ready` | Readiness: MongoDB answers a ping; 503 while shutting down |
| `/metrics` | Prometheus metrics (to be blocked from the internet at the load balancer) |
| `/version.txt` | Git commit of the running build |

## Run it

**Everything in Docker (app, local MongoDB, monitoring):**
```bash
cd Thinkerboard
docker compose up -d --build
```
App http://localhost:5001 · Grafana http://localhost:3000 (admin/admin) · Prometheus http://localhost:9090

**Development (hot reload):**
```bash
cp Thinkerboard/backend/.env.example Thinkerboard/backend/.env   # add your Atlas/Upstash values
cd Thinkerboard/backend && npm install && npm run dev
cd Thinkerboard/frontend && npm install && npm run dev            # http://localhost:5173
```

**Tests:**
```bash
cd Thinkerboard/backend
npm run test:unit   # no database needed
npm test            # includes CRUD tests (downloads an in-memory MongoDB, or set MONGO_TEST_URI)
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `MONGO_URI` | (required) | MongoDB connection string |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | empty | Rate limiting is off when not set |
| `RATE_LIMIT_MAX` | 100 | API requests per IP per minute |
| `RATE_LIMIT_FAIL_OPEN` | true | Let requests through if Upstash is down |
| `LOG_LEVEL` | info | pino log level |
| `NOTES_LIMIT` | 1000 | Maximum notes returned by `GET /api/notes` |
| `SHUTDOWN_DELAY_MS` | 5000 | Time for the load balancer to stop sending traffic before shutdown |

## CI (GitHub Actions)

Backend tests (with a MongoDB service) and frontend lint/build → build the Docker image → start it with
MongoDB and smoke-test pages, health and full CRUD → check graceful shutdown exits cleanly → Trivy scan →
push to Docker Hub tagged with the commit SHA (on `main`, once `DOCKERHUB_USER` is set).

## Roadmap

- [x] App hardening, tests, Docker, CI, local monitoring and runbooks
- [ ] AWS with Terraform: VPC, load balancer, Auto Scaling across 2 AZs, secrets in SSM
- [ ] Continuous deployment with rolling updates and rollback
- [ ] Logs in Grafana Loki
- [ ] JMeter load test and capacity findings
- [ ] Incident drills (Atlas IP removed, Upstash down, bad deploy, backup/restore) with postmortems
- [ ] Kubernetes
