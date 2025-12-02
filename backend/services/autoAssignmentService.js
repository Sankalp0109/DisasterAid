import { autoMatchRequest } from "./matchingService.js";
import { Request } from "../models/Request.js";
import { priorityOrderValue } from "../config/matchingWeights.js";

// In-memory priority queue (simple array implementation). For production, replace with Redis/Bull.
const pendingQueue = [];
let processing = false;
let workerTimer = null;
let backfillTimer = null;

function sortQueue() {
  pendingQueue.sort((a, b) => b.order - a.order || a.enqueuedAt - b.enqueuedAt);
}

export function enqueueAutoAssignment(requestId, priority) {
  pendingQueue.push({
    requestId,
    priority,
    order: priorityOrderValue(priority),
    enqueuedAt: Date.now(),
    attempts: 0,
  });
  sortQueue();
  // Kick off processing asynchronously
  setImmediate(processQueue);
}

async function processQueue() {
  if (processing) return; // Avoid concurrent runners
  processing = true;
  try {
    while (pendingQueue.length > 0) {
      const item = pendingQueue.shift();
      let request = null;
      try {
        request = await Request.findById(item.requestId).select("status priority location needs assignments");
        if (!request) {
          continue; // Skip invalid
        }
        // Skip if already assigned or progressed
        if (["assigned", "in-progress", "fulfilled", "closed", "cancelled"].includes(request.status)) {
          continue;
        }
        const result = await autoMatchRequest(item.requestId);
        if (!result.success || result.assignments.length === 0) {
          // Requeue with backoff if no assignment created yet (except low priority)
          if (item.priority !== "low" && item.attempts < 3) {
            item.attempts += 1;
            item.order = item.order - item.attempts; // Slightly reduce ordering to prevent starvation
            pendingQueue.push(item);
            sortQueue();
          }
        }
      } catch (err) {
        console.error("Auto-assignment error for request", item.requestId, err.message);
        if (item.attempts < 3) {
          item.attempts += 1;
          pendingQueue.push(item);
          sortQueue();
        }
      }
    }
  } finally {
    processing = false;
  }
}

export function getQueueSnapshot() {
  return pendingQueue.map(q => ({ requestId: q.requestId, priority: q.priority, attempts: q.attempts }));
}

// Scan DB for pending requests and enqueue them (used on server startup or manual backfill)
export async function backfillPendingRequests({ statuses = ["new", "triaged"], limit = 500 } = {}) {
  try {
    const pending = await Request.find({
      status: { $in: statuses },
    })
      .select("_id priority status assignments createdAt")
      .sort({ createdAt: 1 })
      .limit(limit);

    let enqueued = 0;
    for (const req of pending) {
      // Skip if already has assignments recorded
      if (Array.isArray(req.assignments) && req.assignments.length > 0) continue;
      enqueueAutoAssignment(req._id, req.priority);
      enqueued += 1;
    }
    return { success: true, scanned: pending.length, enqueued };
  } catch (err) {
    console.error("Backfill enqueue error:", err.message);
    return { success: false, error: err.message };
  }
}

// Background worker to keep processing queue and periodically backfill
export function startAutoAssignmentWorker({ intervalMs = 2000, backfillEveryMs = 30000 } = {}) {
  if (workerTimer) return; // already started
  console.log(`🛠️ Starting auto-assignment worker: interval=${intervalMs}ms, backfill=${backfillEveryMs}ms`);
  workerTimer = setInterval(() => {
    // Kick the processor regularly to avoid missed setImmediate
    setImmediate(processQueue);
  }, intervalMs);

  backfillTimer = setInterval(() => {
    backfillPendingRequests({ limit: 200 }).then((res) => {
      if (res?.success && res.enqueued > 0) {
        console.log(`↩️ Periodic backfill enqueued ${res.enqueued} requests`);
      }
    }).catch(() => {});
  }, backfillEveryMs);
}
