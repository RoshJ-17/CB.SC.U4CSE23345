# cb.sc.u4cse23345

#backend

---

## Folder Structure

```
cb.sc.u4cse23345/
├── logging_middleware/              # Reusable logging package (used by all modules)
│   ├── index.js                     # Log(stack, level, package, message) function
│   └── package.json
│
├── vehicle_maintence_scheduler/     # Vehicle Maintenance Scheduler Microservice
│   ├── solution.js                  # 0/1 Knapsack DP algorithm
│   └── package.json
│
├── notification_app_be/             # Campus Notifications Backend (Stage 6)
│   ├── priority_inbox.js            # Min-Heap top-N priority inbox
│   └── package.json
│
├── notification_system_design.md    # Stages 1–6 written design document
├── .gitignore
├── package.json                     # Root package with helper scripts
└── README.md
```

---

## Setup

### Option A — Install each folder separately

```bash
cd logging_middleware
npm install

cd ../vehicle_maintence_scheduler
npm install

cd ../notification_app_be
npm install
```

### Option B — Install all at once from root

```bash
npm run install:all
```

---

## Run Vehicle Scheduling

```bash
cd vehicle_maintence_scheduler
node server.js
```

---

## Run Notification (Stage 6)

```bash
cd notification_app_be
node server.js
```

---

## Logging Middleware

All modules use the shared `Log(stack, level, package, message)` function from `logging_middleware/index.js`. Logs are sent to the evaluation server via POST with a Bearer token. The function fails silently so logging never crashes the application.

**Valid values:**
- `stack`: `backend`
- `level`: `debug`, `info`, `warn`, `error`, `fatal`
- `package`: `handler`, `service`, `db`, `route`, `middleware`, `utils`, etc.

---

## Design Document

See [`notification_system_design.md`](./notification_system_design.md) for full answers to all 6 stages

