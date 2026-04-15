import type { FollowUpTask } from "@/types/follow-up-task";

export const followUpTasks: FollowUpTask[] = [
  {
    id: "fu-1",
    customerId: "cust-001",
    type: "birthday",
    title: "Birthday outreach",
    summary: "Sarah’s birthday is next week — send a personalized note and gift idea.",
    dueLabel: "Apr 4, 2026",
    priority: "high",
  },
  {
    id: "fu-2",
    customerId: "cust-002",
    type: "anniversary",
    title: "Anniversary dinner follow-up",
    summary: "Check in on outfit for Apr 5 anniversary reservation.",
    dueLabel: "Apr 3, 2026",
    priority: "high",
  },
  {
    id: "fu-3",
    customerId: "cust-001",
    type: "new_collection",
    title: "New collection drop",
    summary: "Spring suiting arrivals align with her workwear refresh interest.",
    dueLabel: "This week",
    priority: "medium",
  },
  {
    id: "fu-4",
    customerId: "cust-002",
    type: "event_reminder",
    title: "Garden party season",
    summary: "Suggest floral midi and accessories for upcoming events.",
    dueLabel: "Apr 8, 2026",
    priority: "medium",
  },
  {
    id: "fu-5",
    customerId: "cust-001",
    type: "win_back",
    title: "Digital browse, no purchase",
    summary: "She viewed accessories online — offer styling appointment.",
    dueLabel: "Mar 30, 2026",
    priority: "low",
  },
];
