import axios from "axios";

const API_GATEWAY = process.env.API_GATEWAY || "http://localhost:8080/api/v1";
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || "super_secret_internal_key_123";

/**
 * Computes field-level difference between previous and current object states.
 * Excludes timestamp/internal fields unless explicitly needed.
 */
export const computeDiff = (previous = {}, current = {}) => {
  const prev = previous || {};
  const curr = current || {};
  const ignoredKeys = new Set(["createdAt", "updatedAt", "_id", "password", "token"]);
  
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(curr)]);
  const diff = {};
  const previousValue = {};
  const newValue = {};

  for (const key of allKeys) {
    if (ignoredKeys.has(key)) continue;

    const valBefore = prev[key];
    const valAfter = curr[key];

    // Deep equality or stringified comparison for arrays/objects
    const isEqual =
      valBefore === valAfter ||
      (typeof valBefore === "object" &&
        typeof valAfter === "object" &&
        JSON.stringify(valBefore) === JSON.stringify(valAfter));

    if (!isEqual && (valBefore !== undefined || valAfter !== undefined)) {
      diff[key] = { from: valBefore ?? null, to: valAfter ?? null };
      previousValue[key] = valBefore ?? null;
      newValue[key] = valAfter ?? null;
    }
  }

  const statusChange = diff.status
    ? { from: diff.status.from, to: diff.status.to }
    : diff.state
    ? { from: diff.state.from, to: diff.state.to }
    : null;

  return {
    diff,
    previousValue: Object.keys(previousValue).length > 0 ? previousValue : null,
    newValue: Object.keys(newValue).length > 0 ? newValue : null,
    statusChange,
  };
};

/**
 * Publishes a business audit event to api-gateway internal audit ingestion endpoint.
 */
export const publishAuditEvent = async (event) => {
  try {
    const payload = {
      timestamp: new Date().toISOString(),
      service: "super-admin-service",
      hospitalId: event.hospitalId,
      actionPerformed: event.actionPerformed,
      actionType: event.actionType || "WORKFLOW",
      performedByUserId: event.performedByUserId || event.userId || "system",
      performedByRole: event.performedByRole || event.userRole || "SUPER_ADMIN",
      userId: event.userId || event.performedByUserId,
      userRole: event.userRole || event.performedByRole,
      previousValue: event.previousValue || null,
      newValue: event.newValue || null,
      statusChange: event.statusChange || null,
      remarks: event.remarks || null,
      path: event.path || (event.hospitalId ? `/hospital/${event.hospitalId}` : "/hospital"),
      method: event.method || "POST",
      metadata: event.metadata || {},
    };

    // Fire-and-forget async request to Gateway
    axios
      .post(`${API_GATEWAY}/audit/events/internal`, payload, {
        headers: {
          "x-internal-service-key": INTERNAL_SERVICE_SECRET,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      })
      .catch((err) => {
        console.warn("⚠️ Failed to deliver audit event to Gateway:", err.message);
      });
  } catch (err) {
    console.warn("⚠️ Error in publishAuditEvent:", err.message);
  }
};
