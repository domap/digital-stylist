import type { BrandAffinityPoint, PurchaseHistoryEntry } from "@/types/customer-data";
import type { CustomerProfile } from "@/data/customers";

type SeedBundle = {
  purchaseHistory: PurchaseHistoryEntry[];
  brandAffinity: BrandAffinityPoint[];
};

const sarahHistory: PurchaseHistoryEntry[] = [
  { id: "ph-1", title: "Tailored Navy Blazer", date: "2026-03-02", amount: 189, channel: "In-store" },
  { id: "ph-2", title: "Silk Button-Front Blouse", date: "2026-02-14", amount: 98, channel: "Online" },
  { id: "ph-3", title: "Wide-Leg Trousers", date: "2026-01-28", amount: 120, channel: "In-store" },
  { id: "ph-4", title: "Pearl Drop Earrings", date: "2025-12-12", amount: 48, channel: "App" },
  { id: "ph-5", title: "Cashmere Wrap Scarf", date: "2025-11-03", amount: 98, channel: "In-store" },
  { id: "ph-6", title: "Classic Black Sheath Dress", date: "2025-09-20", amount: 179, channel: "Online" },
];

const jenniferHistory: PurchaseHistoryEntry[] = [
  { id: "ph-j1", title: "Floral Midi Skirt", date: "2026-03-10", amount: 110, channel: "In-store" },
  { id: "ph-j2", title: "Cashmere V-Neck Sweater", date: "2026-02-05", amount: 148, channel: "Online" },
  { id: "ph-j3", title: "Gold Evening Heels", date: "2025-12-01", amount: 158, channel: "In-store" },
  { id: "ph-j4", title: "Rose Gold Clutch", date: "2025-10-18", amount: 88, channel: "App" },
];

const sarahAffinity: BrandAffinityPoint[] = [
  { category: "Ann Taylor", score: 92 },
  { category: "LOFT", score: 58 },
  { category: "Workwear", score: 88 },
  { category: "Accessories", score: 72 },
  { category: "Occasion", score: 76 },
];

const jenniferAffinity: BrandAffinityPoint[] = [
  { category: "Ann Taylor", score: 78 },
  { category: "LOFT", score: 82 },
  { category: "Workwear", score: 52 },
  { category: "Accessories", score: 85 },
  { category: "Occasion", score: 90 },
];

const byId: Record<string, SeedBundle> = {
  "cust-001": { purchaseHistory: sarahHistory, brandAffinity: sarahAffinity },
  "cust-002": { purchaseHistory: jenniferHistory, brandAffinity: jenniferAffinity },
};

function purchaseFromRecent(customer: CustomerProfile): PurchaseHistoryEntry[] {
  return customer.recentPurchases.map((p, i) => ({
    id: `gen-${customer.id}-${i}`,
    title: p.name,
    date: parseDisplayDate(p.date),
    amount: p.price,
    channel: "In-store" as const,
  }));
}

/** Best-effort parse "Mar 2, 2026" → ISO date */
function parseDisplayDate(display: string): string {
  const t = Date.parse(display);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function defaultAffinity(style: string[]): BrandAffinityPoint[] {
  const work = style.some((s) => /professional|classic/i.test(s)) ? 70 : 45;
  const occ = style.some((s) => /elegant|statement|romantic/i.test(s)) ? 80 : 55;
  return [
    { category: "Ann Taylor", score: 75 },
    { category: "LOFT", score: 65 },
    { category: "Workwear", score: work },
    { category: "Accessories", score: 60 },
    { category: "Occasion", score: occ },
  ];
}

export function getInsightsSeedForCustomer(customer: CustomerProfile): SeedBundle {
  const seeded = byId[customer.id];
  if (seeded) return seeded;
  return {
    purchaseHistory: purchaseFromRecent(customer),
    brandAffinity: defaultAffinity(customer.stylePreferences),
  };
}
