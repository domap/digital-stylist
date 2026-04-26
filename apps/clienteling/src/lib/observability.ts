/**
 * Correlation headers for API calls (worker logs merge X-Request-Id / X-Trace-Id from context).
 */

const TRACE_KEY = "digital-stylist.trace-id";

function getOrCreateTraceId(): string {
  try {
    const existing = sessionStorage.getItem(TRACE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(TRACE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Merge observability headers into a fetch RequestInit (new Headers instance). */
export function mergeObservabilityHeaders(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("X-Trace-Id", getOrCreateTraceId());
  headers.set("X-Request-Id", crypto.randomUUID());
  const out: RequestInit = { ...init, headers };
  if (import.meta.env.VITE_OBSERVABILITY === "1" && import.meta.env.DEV) {
    console.debug("[observability] correlation headers", Object.fromEntries(headers.entries()));
  }
  return out;
}
