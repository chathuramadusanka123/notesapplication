# Runbook: MongoDBDown / NotReady

**Means:** the app cannot ping MongoDB. `/ready` returns 503, so the load balancer stops
sending traffic to that server. If every server is affected, the site cannot load or save notes.

1. `curl -s localhost:5001/ready` on a server - what `status` does it give?
   - `db_disconnected` / `db_unreachable` -> continue below.
2. **Atlas status:** check the Atlas cluster page and status.mongodb.com.
3. **Network Access (most common):** Atlas -> Network Access. Is the server's public IP
   still on the allow list? A new server from Auto Scaling has a new IP unless you use an Elastic IP or NAT.
4. **Credentials:** were the database user's password or the `MONGO_URI` secret changed?
   Logs show `bad auth` / `Authentication failed`.
5. **Free tier limits (M0):** many connections or heavy load can be throttled. Check the
   Atlas Metrics tab (connections, operations).
6. The app retries the connection on startup and mongoose reconnects automatically once
   MongoDB is back; `/ready` turns green without a restart. If not, restart the container.
