import type { CustomerProfile } from "@/data/customers";
import type { Product } from "@/data/products";
import { mergeObservabilityHeaders } from "@/lib/observability";

async function readJsonError(response: Response): Promise<string> {
  try {
    const t = await response.text();
    if (!t) return response.statusText;
    try {
      const j = JSON.parse(t) as { detail?: unknown; message?: unknown };
      const d = j.detail ?? j.message;
      if (typeof d === "string") return d;
    } catch {
      return t.slice(0, 400);
    }
  } catch {
    return response.statusText;
  }
  return response.statusText;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0];
    const b = parts[parts.length - 1]?.[0];
    if (a && b) return (a + b).toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "C";
}

function mapLoyaltyTier(raw: unknown): CustomerProfile["tier"] {
  const s = String(raw ?? "").toLowerCase();
  if (s === "vip" || s === "platinum") return "Platinum";
  if (s === "insider" || s === "gold") return "Gold";
  return "Silver";
}

function splitPreferences(prefs: unknown): string[] {
  if (typeof prefs !== "string" || !prefs.trim()) return ["Classic"];
  return prefs
    .split(/[.;]\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function mapUpcomingEvents(raw: unknown): { name: string; date: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { name: string; date: string }[] = [];
  for (const ev of raw) {
    if (!ev || typeof ev !== "object") continue;
    const o = ev as Record<string, unknown>;
    const label = String(o.label ?? o.name ?? "Event");
    const dateRaw = String(o.date ?? "");
    let date = dateRaw;
    if (dateRaw.length >= 10) {
      const d = dateRaw.slice(0, 10);
      date = d;
    }
    out.push({ name: label, date });
  }
  return out;
}

export function mapRetailRowToCustomerProfile(row: Record<string, unknown>): CustomerProfile {
  const profile = (row.profile as Record<string, unknown> | null) ?? {};
  const id = String(row.user_id ?? row.id ?? "");
  const name = String(profile.display_name ?? id);
  return {
    id,
    name,
    email: String(profile.email ?? ""),
    phone: String(profile.phone ?? ""),
    memberSince: "2024",
    tier: mapLoyaltyTier(profile.loyalty_tier),
    preferredSize: "6",
    preferredFit: "Regular",
    stylePreferences: splitPreferences(profile.preferences),
    colorPreferences: Array.isArray(profile.colorPreferences)
      ? (profile.colorPreferences as string[]).slice(0, 8)
      : ["Navy", "Black", "Cream"],
    recentPurchases: [],
    upcomingEvents: mapUpcomingEvents(profile.upcoming_events),
    notes:
      typeof profile.interaction_notes === "string"
        ? profile.interaction_notes
        : typeof profile.preferences === "string"
          ? profile.preferences
          : "",
    totalSpend: 0,
    lastVisit: undefined,
    avatar: initialsFromName(name),
  };
}

export function mapCatalogRowToProduct(row: Record<string, unknown>): Product {
  const id = String(row.id ?? "");
  const name = String(row.name ?? "");
  const brandRaw = String(row.brand ?? "AnnTaylor");
  const brand: Product["brand"] = brandRaw.toLowerCase().includes("loft") ? "Loft" : "AnnTaylor";
  const category = String(row.category ?? "General");
  const colors = Array.isArray(row.colors) ? (row.colors as string[]).filter(Boolean) : [];
  const sizes = Array.isArray(row.sizes) ? (row.sizes as string[]).filter(Boolean) : [];
  const imageName = String(row.imageAssetName ?? "placeholder.svg");
  const image = `/api/v1/catalog/media/${encodeURIComponent(imageName)}`;
  const style = colors.length ? colors.slice(0, 6) : ["Classic"];
  return {
    id,
    name,
    brand,
    price: Number(row.price ?? 0),
    category,
    occasion: [category],
    style,
    sizes: sizes.length ? sizes : ["S", "M", "L"],
    colors: colors.length ? colors : ["Navy"],
    image,
    description: String(row.description ?? ""),
    fit: String(row.fit ?? "Regular"),
  };
}

export async function loadCustomerProfiles(): Promise<CustomerProfile[]> {
  const r = await fetch("/api/v1/retail/customers", mergeObservabilityHeaders());
  if (!r.ok) throw new Error(await readJsonError(r));
  const raw = (await r.json()) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => mapRetailRowToCustomerProfile(x as Record<string, unknown>));
}

export async function loadCatalogProducts(): Promise<Product[]> {
  const r = await fetch("/api/v1/catalog/products", mergeObservabilityHeaders());
  if (!r.ok) throw new Error(await readJsonError(r));
  const raw = (await r.json()) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => mapCatalogRowToProduct(x as Record<string, unknown>));
}
