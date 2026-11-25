# Runbook: SiteDown / AppScrapeFailing

**Means:** the home page or the app's /metrics cannot be reached for over a minute.
**Impact:** users cannot open ThinkBoard.

1. **Confirm:** open the site and `/health`. Down for everyone, or one server?
2. **What changed?** Check the latest GitHub Actions run and any deploy in the last hour.
3. **Load balancer (AWS):** EC2 -> Target groups -> how many targets are healthy?
4. **On a server:**
   ```bash
   sudo docker ps -a                        # is the app container Up?
   sudo docker logs --tail 100 thinkboard   # JSON logs; look for "level":50 (error) or 60 (fatal)
   curl -s localhost:5001/health; curl -s localhost:5001/ready
   ```
   - Container exited with "MONGO_URI is not set" -> the secret was not loaded (check SSM parameter / env file).
   - "Could not connect to MongoDB" -> see `mongodb-down.md`.
   - Started after a deploy -> roll back (below).
5. **Roll back:** run the deploy with the previous good image tag (the commit SHA), or locally
   `docker run ... <user>/thinkboard:<good-sha>`.
6. **After:** post an update in the incident channel and write a postmortem in `docs/postmortems/`.
