const express = require("express");
const axios = require("axios");
const { Log } = require("../logging_middleware/index");

const app = express();
app.use(express.json());

const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJyb3NobmlqYXlhbjE3QGdtYWlsLmNvbSIsImV4cCI6MTc3ODA2MTY2OSwiaWF0IjoxNzc4MDYwNzY5LCJpc3MiOiJBZmZvcmQgTWVkaWNhbCBUZWNobm9sb2dpZXMgUHJpdmF0ZSBMaW1pdGVkIiwianRpIjoiY2NiNjFjZWQtN2Q4NC00NTRiLTgxNGItYmY0ZDcxOWQ2YjJkIiwibG9jYWxlIjoiZW4tSU4iLCJuYW1lIjoicm9zaG5pIGoiLCJzdWIiOiIxNjMxMjU4OS0wZmFmLTRiZWMtOWM5Zi1iZjBkZmVkYTkwYjYifSwiZW1haWwiOiJyb3NobmlqYXlhbjE3QGdtYWlsLmNvbSIsIm5hbWUiOiJyb3NobmkgaiIsInJvbGxObyI6ImNiLnNjLnU0Y3NlMjMzNDUiLCJhY2Nlc3NDb2RlIjoiUFRCTW1RIiwiY2xpZW50SUQiOiIxNjMxMjU4OS0wZmFmLTRiZWMtOWM5Zi1iZjBkZmVkYTkwYjYiLCJjbGllbnRTZWNyZXQiOiJuYkt0Q1BlUHRWaGZHbUFXIn0.k42XIOU_Vhi6yN4eoHRGTefFHErYHwXl9aqMrf14WGs";
const BASE_URL = "http://20.207.122.201/evaluation-service";
const apiHeaders = { Authorization: `Bearer ${ACCESS_TOKEN}` };

// 0/1 Knapsack DP
function knapsack(tasks, capacity) {
  const n = tasks.length;
  const dp = new Array(capacity + 1).fill(0);
  const picked = Array.from({ length: n }, () => new Array(capacity + 1).fill(false));

  for (let i = 0; i < n; i++) {
    const { Duration, Impact } = tasks[i];
    for (let w = capacity; w >= Duration; w--) {
      if (dp[w - Duration] + Impact > dp[w]) {
        dp[w] = dp[w - Duration] + Impact;
        picked[i][w] = true;
      }
    }
  }

  const selectedTasks = [];
  let w = capacity;
  for (let i = n - 1; i >= 0; i--) {
    if (picked[i][w]) {
      selectedTasks.push(tasks[i]);
      w -= tasks[i].Duration;
    }
  }

  return { maxImpact: dp[capacity], selectedTasks };
}

// GET /schedule - fetch depots + vehicles and return optimal schedule
app.get("/schedule", async (req, res) => {
  await Log("backend", "info", "handler", "GET /schedule called");

  try {
    await Log("backend", "info", "service", "Fetching depots from external API");
    const depotsRes = await axios.get(`${BASE_URL}/depots`, { headers: apiHeaders });
    const depots = depotsRes.data.depots;
    await Log("backend", "info", "service", `Depots fetched: count=${depots.length}`);

    await Log("backend", "info", "service", "Fetching vehicles from external API");
    const vehiclesRes = await axios.get(`${BASE_URL}/vehicles`, { headers: apiHeaders });
    const vehicles = vehiclesRes.data.vehicles;
    await Log("backend", "info", "service", `Vehicles fetched: count=${vehicles.length}`);

    const results = [];

    for (const depot of depots) {
      await Log("backend", "info", "service", `Running knapsack for depot ${depot.ID}, budget=${depot.MechanicHours}h`);
      const { maxImpact, selectedTasks } = knapsack(vehicles, depot.MechanicHours);
      const hoursUsed = selectedTasks.reduce((s, t) => s + t.Duration, 0);

      await Log("backend", "info", "service", `Depot ${depot.ID}: impact=${maxImpact}, hoursUsed=${hoursUsed}, tasks=${selectedTasks.length}`);

      results.push({
        depotID: depot.ID,
        mechanicHoursBudget: depot.MechanicHours,
        hoursUsed,
        totalImpact: maxImpact,
        tasksSelected: selectedTasks.length,
        selectedTasks: selectedTasks.map(t => ({
          TaskID: t.TaskID,
          Duration: t.Duration,
          Impact: t.Impact,
        })),
      });
    }

    await Log("backend", "info", "handler", "GET /schedule completed successfully");
    res.status(200).json({ success: true, depotSchedules: results });

  } catch (err) {
    await Log("backend", "error", "handler", `GET /schedule failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /schedule/:depotId - schedule for a specific depot
app.get("/schedule/:depotId", async (req, res) => {
  const depotId = parseInt(req.params.depotId);
  await Log("backend", "info", "handler", `GET /schedule/${depotId} called`);

  try {
    const depotsRes = await axios.get(`${BASE_URL}/depots`, { headers: apiHeaders });
    const depot = depotsRes.data.depots.find(d => d.ID === depotId);

    if (!depot) {
      await Log("backend", "warn", "handler", `Depot ${depotId} not found`);
      return res.status(404).json({ success: false, error: `Depot ${depotId} not found` });
    }

    const vehiclesRes = await axios.get(`${BASE_URL}/vehicles`, { headers: apiHeaders });
    const vehicles = vehiclesRes.data.vehicles;

    const { maxImpact, selectedTasks } = knapsack(vehicles, depot.MechanicHours);
    const hoursUsed = selectedTasks.reduce((s, t) => s + t.Duration, 0);

    await Log("backend", "info", "handler", `GET /schedule/${depotId} completed: impact=${maxImpact}`);

    res.status(200).json({
      success: true,
      depotID: depot.ID,
      mechanicHoursBudget: depot.MechanicHours,
      hoursUsed,
      totalImpact: maxImpact,
      tasksSelected: selectedTasks.length,
      selectedTasks: selectedTasks.map(t => ({
        TaskID: t.TaskID,
        Duration: t.Duration,
        Impact: t.Impact,
      })),
    });

  } catch (err) {
    await Log("backend", "error", "handler", `GET /schedule/${depotId} failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = 3001;
app.listen(PORT, async () => {
  await Log("backend", "info", "service", `Vehicle scheduler server started on port ${PORT}`);
  console.log(`Vehicle Scheduler running at http://localhost:${PORT}`);
  console.log(`Test it: GET http://localhost:${PORT}/schedule`);
});