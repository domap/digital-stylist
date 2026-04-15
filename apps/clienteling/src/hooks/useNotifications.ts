import { useEffect, useState } from "react";
import type { NotificationEvent } from "@/lib/stylist-api";
import { fetchNotifications } from "@/lib/notifications-api";

export function useNotifications(params: { enabled?: boolean; pollMs?: number }) {
  const { enabled = true, pollMs = 4000 } = params;
  const [events, setEvents] = useState<NotificationEvent[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let pollTimer: number | null = null;
    let es: EventSource | null = null;

    const refresh = async () => {
      try {
        const res = await fetchNotifications({ limit: 20 });
        if (cancelled) return;
        setEvents(res.events);
      } catch {
        /* keep last snapshot on transient errors */
      }
    };

    const schedulePoll = () => {
      if (pollTimer != null) window.clearTimeout(pollTimer);
      pollTimer = window.setTimeout(() => {
        void tick();
      }, pollMs);
    };

    const tick = async () => {
      if (cancelled) return;
      await refresh();
      if (!cancelled) schedulePoll();
    };

    try {
      es = new EventSource("/api/v1/notifications/stream");
      es.onmessage = () => {
        void refresh();
      };
      es.onerror = () => {
        es?.close();
        es = null;
      };
    } catch {
      /* EventSource unavailable — polling only */
    }

    void tick();
    return () => {
      cancelled = true;
      if (pollTimer != null) window.clearTimeout(pollTimer);
      es?.close();
    };
  }, [enabled, pollMs]);

  return { events };
}

