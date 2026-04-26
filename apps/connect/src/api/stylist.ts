import { getApiBaseUrl } from "./config";
import { mergeObservabilityHeaders } from "@/lib/observability";
import type {
  ApiCustomer,
  ApiProduct,
  ChatResponse,
  ChatTurn,
  InventoryCheckRequest,
  InventoryCheckResponse,
  CheckoutIntentRequest,
  CheckoutIntentResponse,
  FittingRoomReserveRequest,
  FittingRoomReserveResponse,
  OtpStartRequest,
  OtpStartResponse,
  OtpVerifyRequest,
  OtpVerifyResponse,
} from "./types";

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const jsonBody = method !== "GET" && method !== "HEAD";
  const base = getApiBaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path}`;
  const merged = mergeObservabilityHeaders({
    ...init,
    headers: {
      ...(jsonBody ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  return fetch(url, merged);
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
      ? profile.preferences
          .split(/[.;]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 6)
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

export async function fetchCatalog(): Promise<ApiProduct[]> {
  const res = await apiFetch("/api/v1/catalog/products");
  if (!res.ok) throw new Error("Failed to load catalog");
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => mapProduct(x as Record<string, unknown>));
}

export async function fetchCustomers(): Promise<ApiCustomer[]> {
  const res = await apiFetch("/api/v1/retail/customers");
  if (!res.ok) throw new Error("Failed to load customers");
  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => mapRetailCustomer(x as Record<string, unknown>));
}

type InvokeJson = {
  thread_id?: string;
  assistant_message?: string;
  state?: Record<string, unknown>;
};

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

export async function sendAnnChat(params: {
  message: string;
  history: ChatTurn[];
  customerId?: string;
  sessionId: string;
  context?: { source?: string; productId?: string };
}): Promise<ChatResponse> {
  const res = await apiFetch("/v1/chat", {
    method: "POST",
    body: JSON.stringify({
      message: params.message,
      thread_id: params.sessionId,
      context_metadata: {
        channel: "connect",
        mode: "customer_led",
        customer_id: params.customerId,
        source: "consumer_app",
        context: params.context,
        history_turns: params.history.length,
      },
      merge_session_defaults: true,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(summarizeWorkerChatError(res.status, t));
  }
  let data: InvokeJson;
  try {
    data = (await res.json()) as InvokeJson;
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

/** Demo: all SKUs available for fitting-room staging (no inventory microservice in this stack). */
export async function checkInventory(params: InventoryCheckRequest): Promise<InventoryCheckResponse> {
  void params;
  return {
    storeId: params.storeId,
    availability: params.productIds.map((productId) => ({ productId, inStock: true })),
    canStageInStore: true,
    unavailableProductIds: [],
  };
}

/** No LLM classifier endpoint — always refine so the graph handles the turn. */
export async function classifyCheckoutIntent(params: CheckoutIntentRequest): Promise<CheckoutIntentResponse> {
  void params;
  return { decision: "REFINE", confidence: 0.5, reason: "Checkout intent classifier not deployed." };
}

/** Persist reservation on the worker (Postgres + ``pg_notify`` for Clienteling). */
export async function reserveFittingRoom(params: FittingRoomReserveRequest): Promise<FittingRoomReserveResponse> {
  const res = await apiFetch("/api/v1/fitting-room/reservations", {
    method: "POST",
    body: JSON.stringify({
      storeId: params.storeId,
      slotLabel: params.slotLabel,
      customerId: params.customerId,
      productIds: params.productIds,
      source: params.source ?? "connect",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Reservation failed — is orchestration + worker + Postgres running?");
  }
  return (await res.json()) as FittingRoomReserveResponse;
}

/** Demo OTP — use code 424242; verify matches retail customer email when possible. */
export async function startOtp(params: OtpStartRequest): Promise<OtpStartResponse> {
  void params;
  return { ok: true, channels: ["email"], expiresInSec: 600, code: "424242" };
}

export async function verifyOtp(params: OtpVerifyRequest): Promise<OtpVerifyResponse> {
  const code = params.code.trim();
  if (code !== "424242" && code !== "000000") throw new Error("Invalid code");
  const customers = await fetchCustomers();
  const email = params.email.trim().toLowerCase();
  const match = customers.find((c) => (c.preferredEmail ?? "").toLowerCase() === email);
  if (!match) {
    throw new Error("No customer profile with that email — pick a seeded profile email or use Guest.");
  }
  return { ok: true, customerId: match.id, name: match.name };
}

export type VoiceIntentSurface = "connect" | "clienteling" | "cart";

/** Worker LLM: raw speech-to-text → concise shopper intent for chat. */
export async function refineVoiceTranscriptToIntent(
  transcript: string,
  surface: VoiceIntentSurface = "connect",
): Promise<string> {
  const t = transcript.trim();
  if (!t) return t;
  try {
    const res = await apiFetch("/api/v1/voice/transcript-to-intent", {
      method: "POST",
      body: JSON.stringify({ transcript: t, surface }),
    });
    if (!res.ok) return t;
    const data = (await res.json()) as { message?: string };
    const m = typeof data.message === "string" ? data.message.trim() : "";
    return m || t;
  } catch {
    return t;
  }
}
