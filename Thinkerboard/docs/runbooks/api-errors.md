# Runbook: ErrorBudgetFastBurn / NotesListSlow / EventLoopLag / HighMemory

**Means:** the API is returning too many 5xx errors, or is slow, so the SLO is at risk.

1. **Grafana -> ThinkBoard dashboard:** which route, since when? Did a deploy happen just before?
2. **Logs:** `sudo docker logs --since 15m thinkboard | grep '"level":50'` - errors include the
   request id (`req.id`), route and stack trace.
3. **MongoDB slow?** Compare "MongoDB ping time" on the dashboard. Slow DB = slow API.
4. **Overloaded?** Event loop lag and CPU high on all servers -> scale out (Auto Scaling, or
   raise the desired count) and look for a heavy route (e.g. listing thousands of notes).
5. **Memory climbing steadily** -> possible leak: note the time it started, restart to recover,
   and investigate with the deploy history.
6. **Caused by a release** -> roll back first, investigate second.
