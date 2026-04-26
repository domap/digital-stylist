/**
 * API bridge: same surface as ds-composable, backed by digital-stylist worker + orchestration.
 * Catalog/customers from GET /api/v1/... ; chat from POST /v1/chat → /v1/invoke.
 */

import type {
  ApiCustomer,
  ApiProduct,
  ChatRequest,
  ChatResponse,
  ChatTurn,
  InitialSuggestionResponse,
  ThreadSuggestionResponse,
} from "@/types/stylist";
import { mergeObservabilityHeaders } from "@/lib/observability";

export type CheckoutIntentDecision = "SHOW_SUMMARY" | "REFINE";
export type CheckoutIntentResponse = {
  decision: CheckoutIntentDecision;
  confidence: number;
  reason: string;
};

export type FittingRoomReserveResponse = {
  reservationId: string;
  slotLabel: string;
  storeId: string;
  totalCost: number;
  notificationChannels: ("email" | "sms")[];
  message: string;
};

export type NotificationEvent = {
  id: string;
  createdAt: string;
  type: "FITTING_ROOM_RESERVED";
  payload: {
    id: string;
    createdAt: string;
    storeId: string;
    slotLabel: string;
    customerId?: string;
    productIds: string[];
    totalCost: number;
    notificationChannels: ("email" | "sms")[];
    source?: "connect" | "clienteling";
  };
  claimedBy?: string;
  claimedAt?: string;
  task?: {
    taskId: string;
    status: "open" | "in_progress" | "done";
    assignedTo?: string;
    assignedAt?: string;
    doneAt?: string;
  };
};

export type AssociatePdpRecommendationsResponse = {
  customerId: string | null;
  productId: string;
  why: string;
  recommendations: { productId: string; label: string; reason: string }[];
};

export interface AssociateQuickNotesResponse {
  notes: string;
}

function mapProduct(p: Record<string, unknown>): ApiProduct {
  const colors = Array.isArray(p.colors) ? (p.colors as string[]) : [];
  const sizes = Array.isArray(p.sizes) ? (p.sizes as string[]) : [];
  const brandRaw = String(p.brand ?? "AnnTaylor");
  const brand: ApiProduct["brand"] = brandRaw.toLowerCase().includes("loft") ? "Loft" : "AnnTaylor";
  const cat = String(p.category ?? "General");
  return {
    id: String(p.id ?? ""),
    name: String(p.name ?? ""),
    brand,
    imageAssetName: String(p.imageAssetName ?? "placeholder.svg"),
    price: Number(p.price ?? 0),
    category: cat,
    occasion: [cat],
    style: colors.length ? colors.slice(0, 8) : ["Classic"],
    sizes: sizes.length ? sizes : ["S", "M", "L"],
    colors: colors.length ? colors : ["Navy", "Black"],
    description: String(p.description ?? ""),
    fit: String(p.fit ?? "Regular"),
  };
}

function mapRetailCustomer(row: Record<string, unknown>): ApiCustomer {
  const profile = (row.profile as Record<string, unknown> | null) ?? {};
  const id = String(row.user_id ?? row.id ?? "");
  const tierRaw = String(profile.loyalty_tier ?? "Gold").toUpperCase();
  const tier: ApiCustomer["tier"] =
    tierRaw === "VIP" || tierRaw === "PLATINUM"
      ? "Platinum"
      : tierRaw === "INSIDER" || tierRaw === "GOLD"
        ? "Gold"
        : tierRaw === "SILVER"
          ? "Silver"
          : "Gold";
  const prefs =
    typeof profile.preferences === "string"
      ? profile.preferences.split(/[.;]/).map((s) => s.trim()).filter(Boolean).slice(0, 6)
      : ["Classic"];
  const notes =
    typeof profile.interaction_notes === "string"
      ? profile.interaction_notes
      : typeof profile.preferences === "string"
        ? profile.preferences
        : "";
  return {
    id,
    name: String(profile.display_name ?? id),
    preferredEmail: profile.email ? String(profile.email) : undefined,
    tier,
    preferredSize: "6",
    preferredFit: "Regular",
    stylePreferences: prefs.length ? prefs : ["Classic"],
    colorPreferences: ["Navy", "Black", "Cream"],
    upcomingEvents: [],
    notes,
  };
}

export async function classifyCheckoutIntent(params: {
  message: string;
  history: ChatTurn[];
  lastAssistantReply?: string;
}): Promise<CheckoutIntentResponse> {
  void params;
  return { decision: "REFINE", confidence: 0.5, reason: "Checkout intent not available in this stack." };
}

export async function reserveFittingRoom(_params: {
  storeId: string;
  slotLabel: string;
  customerId?: string;
  productIds: string[];
  source?: "connect" | "clienteling";
}): Promise<FittingRoomReserveResponse> {
  throw new Error("Fitting room reservation is not enabled in this build.");
}

export async function fetchCatalogProducts(): Promise<ApiProduct[]> {
  const response = await fetch("/api/v1/catalog/products", mergeObservabilityHeaders());
  if (!response.ok) throw new Error("Failed to fetch catalog products.");
  const raw = (await response.json()) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => mapProduct(x as Record<string, unknown>));
}

export async function fetchCustomers(): Promise<ApiCustomer[]> {
  const response = await fetch("/api/v1/retail/customers", mergeObservabilityHeaders());
  if (!response.ok) throw new Error("Failed to fetch customers.");
  const raw = (await response.json()) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => mapRetailCustomer(x as Record<string, unknown>));
}

export async function fetchAssociatePdpRecommendations(params: {
  customerId?: string | null;
  productId: string;
}): Promise<AssociatePdpRecommendationsResponse> {
  void params;
  return {
    customerId: params.customerId ?? null,
    productId: params.productId,
    why: "Recommendations service not configured.",
    recommendations: [],
  };
}

type InvokeJson = {
  thread_id?: string;
  assistant_message?: string;
  state?: Record<string, unknown>;
};

/** Turn worker/orchestration error bodies into a single readable line for the UI. */
function summarizeWorkerChatError(status: number, bodyText: string): string {
  const prefix = `Chat failed (HTTP ${status})`;
  const raw = (bodyText ?? "").trim();
  if (!raw) return `${prefix}.`;
  try {
    const j = JSON.parse(raw) as { detail?: unknown };
    if (typeof j.detail === "string") {
      return `${prefix}: ${j.detail}`;
    }
    if (Array.isArray(j.detail)) {
      const bits = j.detail
        .map((d) => {
          if (d && typeof d === "object" && "msg" in d) return String((d as { msg: string }).msg);
          return JSON.stringify(d);
        })
        .filter(Boolean)
        .slice(0, 4);
      if (bits.length) return `${prefix}: ${bits.join(" · ")}`;
    }
  } catch {
    /* not JSON */
  }
  const oneLine = raw.replace(/\s+/g, " ");
  return oneLine.length > 1200 ? `${prefix}: ${oneLine.slice(0, 1200)}…` : `${prefix}: ${oneLine}`;
}

export async function sendStylistChat(request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch(
    "/v1/chat",
    mergeObservabilityHeaders({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
      message: request.message,
      thread_id: request.sessionId,
      context_metadata: {
        channel: request.channel,
        mode: request.mode,
        customer_id: request.customerId,
        appointmentContext: request.appointmentContext,
        context: request.context,
        history_turns: request.history?.length ?? 0,
      },
      merge_session_defaults: true,
    }),
    }),
  );
  if (!response.ok) {
    const t = await response.text();
    throw new Error(summarizeWorkerChatError(response.status, t));
  }
  let data: InvokeJson;
  try {
    data = (await response.json()) as InvokeJson;
  } catch {
    throw new Error("Chat response was not valid JSON.");
  }
  const state = data.state ?? {};
  let recommendedProductIds: string[] = [];
  const recs = state.recommendations;
  if (Array.isArray(recs)) {
    recommendedProductIds = recs
      .map((x: unknown) => {
        if (x && typeof x === "object" && "id" in x) return String((x as { id: string }).id);
        if (typeof x === "string") return x;
        return "";
      })
      .filter(Boolean);
  }
  return {
    reply: (data.assistant_message ?? "").trim(),
    recommendedProductIds,
    recommendedDisplayMode: "default",
    agentTrace: [],
  };
}

export async function fetchInitialSuggestions(
  customerId?: string,
  tryOnProductIds?: string[],
): Promise<InitialSuggestionResponse> {
  const response = await fetch(
    "/api/v1/retail/associate/initial-suggestions",
    mergeObservabilityHeaders({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId?.trim() || null,
        try_on_product_ids: tryOnProductIds?.filter(Boolean) ?? [],
      }),
    }),
  );
  if (!response.ok) throw new Error("Failed to load suggested prompts.");
  const data = (await response.json()) as { suggestions?: string[] };
  return { suggestions: Array.isArray(data.suggestions) ? data.suggestions : [] };
}

export async function fetchThreadSuggestions(
  customerId: string | undefined,
  history: ChatTurn[],
  tryOnProductIds?: string[],
): Promise<ThreadSuggestionResponse> {
  const response = await fetch(
    "/api/v1/retail/associate/thread-suggestions",
    mergeObservabilityHeaders({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId?.trim() || null,
        try_on_product_ids: tryOnProductIds?.filter(Boolean) ?? [],
        history: history.map((t) => ({ role: t.role, content: t.content })),
      }),
    }),
  );
  if (!response.ok) throw new Error("Failed to load thread prompts.");
  const data = (await response.json()) as { suggestions?: string[] };
  return { suggestions: Array.isArray(data.suggestions) ? data.suggestions : [] };
}

export async function fetchAssociateQuickNotes(customerId?: string): Promise<AssociateQuickNotesResponse> {
  const cid = customerId?.trim();
  if (!cid) return { notes: "" };
  const response = await fetch(
    "/api/v1/retail/associate/quick-notes",
    mergeObservabilityHeaders({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: cid }),
    }),
  );
  if (!response.ok) throw new Error("Failed to load quick notes.");
  const data = (await response.json()) as { notes?: string };
  return { notes: typeof data.notes === "string" ? data.notes : "" };
}
