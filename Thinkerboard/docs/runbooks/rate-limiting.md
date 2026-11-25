# Runbook: RateLimitSpike / RateLimiterUnavailable

**Design:** each client IP may make `RATE_LIMIT_MAX` (default 100) API requests per minute.
If Upstash cannot be reached, the app **fails open** (lets requests through) so a rate-limiter
outage does not become a full outage. Set `RATE_LIMIT_FAIL_OPEN=false` to block instead.

## RateLimitSpike (many 429s)
1. Logs: which IPs get 429? `sudo docker logs --since 15m thinkboard | grep '"statusCode":429'`
2. One IP with huge volume -> likely abuse or a broken script. Consider blocking it (security
   group / AWS WAF).
3. Many normal users -> the limit may be too low. Raise `RATE_LIMIT_MAX` and redeploy.

## RateLimiterUnavailable
1. Check status.upstash.com and the Upstash console.
2. Was the token rotated? Logs show the error message.
3. While failing open the site still works, but without protection - watch traffic closely.
