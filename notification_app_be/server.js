const express = require("express");
const axios = require("axios");
const { Log } = require("../logging_middleware/index");

const app = express();
app.use(express.json());

const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJyb3NobmlqYXlhbjE3QGdtYWlsLmNvbSIsImV4cCI6MTc3ODA2MTY2OSwiaWF0IjoxNzc4MDYwNzY5LCJpc3MiOiJBZmZvcmQgTWVkaWNhbCBUZWNobm9sb2dpZXMgUHJpdmF0ZSBMaW1pdGVkIiwianRpIjoiY2NiNjFjZWQtN2Q4NC00NTRiLTgxNGItYmY0ZDcxOWQ2YjJkIiwibG9jYWxlIjoiZW4tSU4iLCJuYW1lIjoicm9zaG5pIGoiLCJzdWIiOiIxNjMxMjU4OS0wZmFmLTRiZWMtOWM5Zi1iZjBkZmVkYTkwYjYifSwiZW1haWwiOiJyb3NobmlqYXlhbjE3QGdtYWlsLmNvbSIsIm5hbWUiOiJyb3NobmkgaiIsInJvbGxObyI6ImNiLnNjLnU0Y3NlMjMzNDUiLCJhY2Nlc3NDb2RlIjoiUFRCTW1RIiwiY2xpZW50SUQiOiIxNjMxMjU4OS0wZmFmLTRiZWMtOWM5Zi1iZjBkZmVkYTkwYjYiLCJjbGllbnRTZWNyZXQiOiJuYkt0Q1BlUHRWaGZHbUFXIn0.k42XIOU_Vhi6yN4eoHRGTefFHErYHwXl9aqMrf14WGs";
const BASE_URL = "http://20.207.122.201/evaluation-service";
const apiHeaders = { Authorization: `Bearer ${ACCESS_TOKEN}` };

const TYPE_WEIGHT = { Placement: 3, Result: 2, Event: 1 };

function getPriorityScore(notification) {
  const typeWeight = TYPE_WEIGHT[notification.Type] || 1;
  const ts = new Date(notification.Timestamp).getTime();
  const minutesAgo = (Date.now() - ts) / 60000;
  const recency = 1 / (minutesAgo + 1);
  return typeWeight * 10 + recency;
}

class MinHeap {
  constructor(compareFn) { this.heap = []; this.cmp = compareFn; }
  push(item) { this.heap.push(item); this._up(this.heap.length - 1); }
  pop() {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) { this.heap[0] = last; this._down(0); }
    return top;
  }
  peek() { return this.heap[0]; }
  size() { return this.heap.length; }
  _up(i) {
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.cmp(this.heap[i], this.heap[p]) < 0) {
        [this.heap[i], this.heap[p]] = [this.heap[p], this.heap[i]]; i = p;
      } else break;
    }
  }
  _down(i) {
    const n = this.heap.length;
    while (true) {
      let s = i; const l = 2*i+1, r = 2*i+2;
      if (l < n && this.cmp(this.heap[l], this.heap[s]) < 0) s = l;
      if (r < n && this.cmp(this.heap[r], this.heap[s]) < 0) s = r;
      if (s !== i) { [this.heap[i], this.heap[s]] = [this.heap[s], this.heap[i]]; i = s; }
      else break;
    }
  }
}

function getTopN(notifications, n) {
  const heap = new MinHeap((a, b) => getPriorityScore(a) - getPriorityScore(b));
  for (const notif of notifications) {
    heap.push(notif);
    if (heap.size() > n) heap.pop();
  }
  const result = [];
  while (heap.size() > 0) result.push(heap.pop());
  return result.reverse();
}

// GET /notifications - fetch all notifications
app.get("/notifications", async (req, res) => {
  await Log("backend", "info", "handler", "GET /notifications called");
  try {
    const response = await axios.get(`${BASE_URL}/notifications`, { headers: apiHeaders });
    const notifications = response.data.notifications;
    await Log("backend", "info", "handler", `Fetched ${notifications.length} notifications`);
    res.status(200).json({ success: true, count: notifications.length, notifications });
  } catch (err) {
    await Log("backend", "error", "handler", `GET /notifications failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /notifications/priority?n=10 - get top N priority notifications
app.get("/notifications/priority", async (req, res) => {
  const n = parseInt(req.query.n) || 10;
  await Log("backend", "info", "handler", `GET /notifications/priority called with n=${n}`);
  try {
    const response = await axios.get(`${BASE_URL}/notifications`, { headers: apiHeaders });
    const notifications = response.data.notifications;

    await Log("backend", "info", "service", `Computing top ${n} from ${notifications.length} notifications using min-heap`);
    const topN = getTopN(notifications, n);

    const result = topN.map((notif, i) => ({
      rank: i + 1,
      ID: notif.ID,
      Type: notif.Type,
      Message: notif.Message,
      Timestamp: notif.Timestamp,
      priorityScore: parseFloat(getPriorityScore(notif).toFixed(4)),
    }));

    await Log("backend", "info", "handler", `GET /notifications/priority completed: returned ${result.length} items`);
    res.status(200).json({ success: true, topN: n, notifications: result });
  } catch (err) {
    await Log("backend", "error", "handler", `GET /notifications/priority failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = 3002;
app.listen(PORT, async () => {
  await Log("backend", "info", "service", `Notification app server started on port ${PORT}`);
  console.log(`Notification App running at http://localhost:${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  GET http://localhost:${PORT}/notifications`);
  console.log(`  GET http://localhost:${PORT}/notifications/priority?n=10`);
});