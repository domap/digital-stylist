export type FollowUpTaskType =
  | "birthday"
  | "anniversary"
  | "new_collection"
  | "event_reminder"
  | "win_back"
  | "fitting_room_reserved";

export interface FollowUpTask {
  id: string;
  customerId: string;
  type: FollowUpTaskType;
  title: string;
  summary: string;
  /** ISO date or display label */
  dueLabel: string;
  priority: "high" | "medium" | "low";
  meta?: {
    reservationId?: string;
    slotLabel?: string;
    productIds?: string[];
    totalCost?: number;
    source?: "connect" | "clienteling";
  };
}
