import { ConversationChannel } from "@/types/stylist";

const STORAGE_KEY = "stylist_channel";

function isValidChannel(value: string | null): value is ConversationChannel {
  return value === "associate_console" || value === "customer_app";
}

export function getRuntimeChannel(): ConversationChannel {
  if (typeof window === "undefined") return "associate_console";

  const fromQuery = new URLSearchParams(window.location.search).get("channel");
  if (isValidChannel(fromQuery)) return fromQuery;

  const fromStorage = window.localStorage.getItem(STORAGE_KEY);
  if (isValidChannel(fromStorage)) return fromStorage;

  return "associate_console";
}
