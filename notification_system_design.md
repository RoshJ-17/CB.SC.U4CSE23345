# Notification System Design

# Stage 1

# REST API Design for Campus Notification Platform

 The notification backend is implemented as an Express server on `http://localhost:3002`. The vehicle maintenance scheduler runs separately on `http://localhost:3001`. Both servers use the shared `logging_middleware` for all log calls.

# Base URL
http://localhost:3002

# Common Headers
```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
}
```
# Endpoints

# 1. Get All Notifications
```
GET /notifications
```
**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `type` | string | Filter: `Placement`, `Event`, `Result` |
| `isRead` | boolean | Filter by read status |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20) |

**Response 200:**
```json
{
  "success": true,
  "count": 15,
  "notifications": [
    {
      "ID": "d146095a-0d86-4a34-9e69-3900a14576bc",
      "Type": "Result",
      "Message": "mid-sem",
      "Timestamp": "2026-04-22 17:51:30"
    }
  ]
}
```

# 2. Get Top N Priority Notifications
```
GET /notifications/priority?n=10
```
**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `n` | number | Number of top notifications to return (default: 10) |

**Response 200:**
```json
{
  "success": true,
  "topN": 10,
  "notifications": [
    {
      "rank": 1,
      "ID": "b283218f-ea5a-4b7c-93a9-1f2f240d64b0",
      "Type": "Placement",
      "Message": "CSX Corporation hiring",
      "Timestamp": "2026-04-22 17:51:18",
      "priorityScore": 30.0167
    }
  ]
}
```

# 3. Get a Single Notification
```
GET /notifications/:id
```
**Response 200:**
```json
{
  "id": "uuid",
  "type": "Placement",
  "message": "CSX Corporation hiring",
  "isRead": false,
  "createdAt": "2026-04-22T17:51:18Z"
}
```

# 4. Mark Notification as Read
```
PATCH /notifications/:id/read
```
**Response 200:**
```json
{
  "id": "uuid",
  "isRead": true,
  "message": "Notification marked as read"
}
```

# 5. Mark All Notifications as Read
```
PATCH /notifications/read-all
```
**Response 200:**
```json
{
  "updated": 15,
  "message": "All notifications marked as read"
}
```

# 6. Delete a Notification
```
DELETE /notifications/:id
```
**Response 200:**
```json
{
  "message": "Notification deleted successfully"
}
```

---

# Real-Time Notification Mechanism

**Technology: WebSocket via Socket.IO**

When HR publishes a notification, the server emits an event to all connected student sockets immediately.

**Server emits:**
```json
{
  "event": "new_notification",
  "data": {
    "id": "uuid",
    "type": "Placement",
    "message": "TCS hiring drive tomorrow",
    "createdAt": "2026-04-22T18:00:00Z"
  }
}
```

**Client listens:**
```javascript
socket.on("new_notification", (data) => {
  // Prepend to notification list in UI
  addNotificationToInbox(data);
});
```

---

# Stage 2

# Database Design

# Recommended Database: PostgreSQL

Why PostgreSQL:
- Notifications have fixed, structured fields — a relational schema fits perfectly
- Filtering by `studentID`, `type`, `isRead`, and sorting by `createdAt` are all efficient with proper indexes
- ACID compliance guarantees no notification is lost even under high concurrency
- Supports `ENUM` types natively for notification categories
- Scales well with read replicas and partitioning for large datasets

---

# Schema


CREATE TABLE students (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TYPE notification_type AS ENUM ('Placement', 'Event', 'Result');

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type       notification_type NOT NULL,
  message    TEXT NOT NULL,
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_notif_student       ON notifications(student_id);
CREATE INDEX idx_notif_student_read  ON notifications(student_id, is_read);
CREATE INDEX idx_notif_created       ON notifications(created_at DESC);
CREATE INDEX idx_notif_type          ON notifications(type);


---

# Problems as Data Grows & Solutions

| Problem | Solution |
|---|---|
| Slow queries with 5M+ rows | Composite index on `(student_id, is_read, created_at DESC)` |
| Table too large | Partition `notifications` by month using PostgreSQL partitioning |
| High read load | Add a read replica; route all GET queries there |
| Old data bloat | Archive notifications older than 6 months to a cold storage table |
| Cache miss storms | Use Redis to cache per-student notification lists with 60s TTL |

---

# Key Queries


-- Fetch unread notifications for a student (paginated)
SELECT id, type, message, created_at
FROM notifications
WHERE student_id = $1 AND is_read = FALSE
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;

-- Fetch by type
SELECT id, type, message, created_at
FROM notifications
WHERE student_id = $1 AND type = $2
ORDER BY created_at DESC;


---

# Stage 3

# Query Analysis

**Original slow query:**

SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;


# Problems:

1. `SELECT *` — fetches all columns unnecessarily, including large `message` text. Only required columns should be selected.
2. No index on `(studentID, isRead)`— causes a full table scan across 5,000,000 rows every time.
3. `ORDER BY createdAt DESC`- without an index triggers an expensive filesort on the entire result set.

# Fix:

```sql
-- Create composite index covering all three query clauses
CREATE INDEX idx_notif_student_read_time
ON notifications(student_id, is_read, created_at DESC);

-- Optimised query
SELECT id, type, message, created_at
FROM notifications
WHERE student_id = 1042 AND is_read = FALSE
ORDER BY created_at DESC
LIMIT 20;
```
Before fix:Full table scan — O(N) ~= 5,000,000 row reads  
After fix:Index seek + range scan — O(log N + K) where K = matching rows ≈ near-instant

---

# Should we add indexes on every column?

No.This is harmful advice because:
- Every index adds overhead to INSERT,UPDATE, and DELETE operations (each write must update all indexes)
- Indexes consume significant disk space
- Too many indexes confuse the query planner, sometimes causing slower query plans
- The correct approach is to add targeted composite indexes based on actual query patterns only

---

# Find all students who received a Placement notification in the last 7 days:


SELECT DISTINCT s.id, s.name, s.email
FROM students s
JOIN notifications n ON s.id = n.student_id
WHERE n.type = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days';


---

# Stage 4

# Performance: Notifications Fetched on Every Page Load

Problem:Every page load triggers a DB query for every student. At 50,000 students with frequent page loads, this overwhelms the database.

# Solutions and Tradeoffs

# 1. Server-Side Redis Cache 
Cache each student's notification list in Redis with a TTL of 60 seconds.
- On first request: fetch from DB, store in Redis
- Subsequent requests within TTL: served from Redis, zero DB load
- Invalidate cache when a new notification is created for that student
- Tradeoff:Added infrastructure (Redis), cache invalidation logic needed

# 2. Pagination + Lazy Loading
Never load all notifications at once. Fetch top 20 on load; load more on scroll.
- Each request is fast and lightweight
- Tradeoff:More total API calls, but each is extremely fast

# 3. Read Replica
Route all `GET /notifications` queries to a PostgreSQL read replica.
- Removes read pressure from the primary DB entirely
- Tradeoff:Slight replication lag (typically under 1 second)

# 4. WebSocket Push (Avoid Polling)
On page load, fetch only the initial batch. New notifications arrive via Socket.IO in real time.
- Eliminates the need for repeated API calls during a session
- Tradeoff:WebSocket connection overhead per client

# 5. Client-Side Caching
Store the last notification response in browser memory with a short TTL. Serve from cache instantly on revisit; refresh in background.
- Zero extra infrastructure
- Tradeoff: Stale data possible within TTL window

Best strategy: Combine Redis caching + pagination + WebSocket push.

---

# Stage 5

# Notify All — Redesign for Reliability

Original pseudocode:

function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)
        save_to_db(student_id, message)
        push_to_app(student_id, message)

# Shortcomings:

1. Sequential loop — 50,000 students processed one by one. Far too slow.
2. No fault tolerance — if `send_email` throws at student 200, the remaining 49,800 are never processed.
3. Tight coupling — email and DB save happen together. If the email API is down, the DB is also not updated.
4. No retry mechanism — a failed email is permanently lost.
5. Blocking — the HR must wait for all 50,000 emails before getting a response.

# Should DB save and email happen together?

No. DB save should happen immediately and independently. Email delivery is an asynchronous concern. If we couple them, a temporary email API failure would mean students never see their notifications in the app either.

# Redesigned Pseudocode (Message Queue Architecture):

function notify_all(student_ids: array, message: string):
    // Step 1: Save ALL notifications to DB instantly in a single bulk transaction
    bulk_insert_to_db(student_ids, message)

    // Step 2: Enqueue one job per student per channel (non-blocking)
    for student_id in student_ids:
        email_queue.push({ student_id, message })
        push_queue.push({ student_id, message })

    return { status: "accepted", count: len(student_ids) }
    // HR gets instant response; processing happens in background

// Email worker (many instances running in parallel):
function email_worker():
    while true:
        job = email_queue.pop()
        result = send_email(job.student_id, job.message)
        if result.failed:
            if job.retry_count < 3:
                email_queue.push_with_delay(job, delay=exponential_backoff(job.retry_count))
            else:
                dead_letter_queue.push(job)  // log permanently failed jobs
        else:
            mark_email_sent(job.student_id)

// Push notification worker:
function push_worker():
    while true:
        job = push_queue.pop()
        push_to_app(job.student_id, job.message)

Improvements:
- HR gets an instant `202 Accepted` response
- DB is always updated regardless of email status
- Failed emails are retried with exponential backoff
- Workers scale horizontally to process 50,000 jobs fast
- Dead letter queue captures permanently failed jobs for investigation


# Stage 6

# Priority Inbox — Top N Notifications

# Approach: Min-Heap of Size N

priority_score = type_weight * 10 + recency_score

type_weight:
  Placement → 3  (highest importance)
  Result    → 2
  Event     → 1  (lowest importance)

recency_score = 1 / (minutes_since_notification + 1)
  (newer notifications get a higher recency boost)

# Why Min-Heap?

A min-heap of size N always holds the N highest-priority items seen so far:
- When a new notification arrives: compare it with the heap's minimum
- If new item's priority > heap minimum → replace the minimum with the new item
- This gives O(log N) insertion and O(1) access to the minimum

This is much more efficient than sorting all notifications on every update.

| Operation | Sorting approach | Min-Heap approach |
|---|---|---|
| Initial load | O(M log M) | O(M log N) |
| New notification arrives | O(M log M) again | O(log N) |
| Get top N | O(N) | O(N log N) |

The Express API wrapping it is in `notification_app_be/server.js`.

# Implemented API Endpoints (Express Server — Port 3002)

# GET /notifications
Fetches all notifications from the external evaluation API.

**Request:**
```
GET http://localhost:3002/notifications
```

**Response 200:**
```json
{
  "success": true,
  "count": 15,
  "notifications": [
    {
      "ID": "d146095a-0d86-4a34-9e69-3900a14576bc",
      "Type": "Result",
      "Message": "mid-sem",
      "Timestamp": "2026-04-22 17:51:30"
    }
  ]
}
```

---

#### GET /notifications/priority?n=10
Returns the top N highest-priority notifications using the Min-Heap algorithm.  
Priority is computed as `type_weight * 10 + recency_score` where Placement=3, Result=2, Event=1.

**Request:**
```
GET http://localhost:3002/notifications/priority?n=10
```

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `n` | number | Number of top notifications to return (default: 10) |

**Response 200:**
```json
{
  "success": true,
  "topN": 10,
  "notifications": [
    {
      "rank": 1,
      "ID": "b283218f-ea5a-4b7c-93a9-1f2f240d64b0",
      "Type": "Placement",
      "Message": "CSX Corporation hiring",
      "Timestamp": "2026-04-22 17:51:18",
      "priorityScore": 30.0167
    },
    {
      "rank": 2,
      "ID": "8a7412bd-6065-4d09-8501-a37f11cc848b",
      "Type": "Placement",
      "Message": "Advanced Micro Devices Inc. hiring",
      "Timestamp": "2026-04-22 17:49:42",
      "priorityScore": 30.0153
    },
    {
      "rank": 3,
      "ID": "1d893de7-fbba-4c77-927b-e3076fe805d5",
      "Type": "Result",
      "Message": "mid-sem",
      "Timestamp": "2026-04-22 17:51:30",
      "priorityScore": 20.0167
    }
  ]
}
```
