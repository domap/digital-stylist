/**
 * JSON or plain logs for the orchestration gateway (align with worker STYLIST_LOG_FORMAT=json).
 */

const useJson = (process.env.STYLIST_LOG_FORMAT ?? "").toLowerCase() === "json";

/**
 * @param {string} event
 * @param {Record<string, unknown>} fields
 */
export function logEvent(event, fields = {}) {
  const base = {
    ts: new Date().toISOString(),
    level: "info",
    component: "orchestration",
    event,
    ...fields,
  };
  if (useJson) {
    console.log(JSON.stringify(base));
  } else {
    const rest = { ...fields };
    console.log(`[orchestration] ${event}`, Object.keys(rest).length ? rest : "");
  }
}
