import type { NotificationEvent } from "@/lib/stylist-api";

/** Load fitting-room (and future) notification events from the worker (Postgres-backed). */
export async function fetchNotifications(params: {
  claimedBy?: string;
  limit?: number;
} = {}): Promise<{ events: NotificationEvent[] }> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set("limit", String(params.limit));
  const q = qs.toString();
  const url = q ? `/api/v1/notifications?${q}` : "/api/v1/notifications";
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Failed to load notifications");
  }
  const data = (await res.json()) as { events?: NotificationEvent[] };
  return { events: Array.isArray(data.events) ? data.events : [] };
}
