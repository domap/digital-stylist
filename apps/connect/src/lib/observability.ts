/** Correlation headers for Connect → orchestration → worker. */

const TRACE_KEY = "digital-stylist.connect.trace-id";

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

export function mergeObservabilityHeaders(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("X-Trace-Id", getOrCreateTraceId());
  headers.set("X-Request-Id", crypto.randomUUID());
  return { ...init, headers };
}
