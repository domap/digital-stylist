/** Enriched dashboard payload produced by {@link useCustomerData}. */
export interface CustomerKeyMetrics {
  totalSpend: number;
  lastVisit: string;
  loyaltyTier: "Silver" | "Gold" | "Platinum";
}

export interface PurchaseHistoryEntry {
  id: string;
  title: string;
  /** ISO date yyyy-mm-dd */
  date: string;
  amount: number;
  channel: "In-store" | "Online" | "App";
}

/** One spoke on the brand-affinity radar (0–100). */
export interface BrandAffinityPoint {
  category: string;
  score: number;
}

export interface CustomerDataPayload {
  customerId: string;
  metrics: CustomerKeyMetrics;
  purchaseHistory: PurchaseHistoryEntry[];
  brandAffinity: BrandAffinityPoint[];
}
