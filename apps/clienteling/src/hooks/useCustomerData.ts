import { useQuery } from "@tanstack/react-query";
import type { CustomerProfile } from "@/data/customers";
import { getInsightsSeedForCustomer } from "@/data/customer-insights";
import type { CustomerDataPayload } from "@/types/customer-data";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function resolveLastVisit(customer: CustomerProfile): string {
  if (customer.lastVisit?.trim()) return customer.lastVisit.trim();
  const first = customer.recentPurchases[0]?.date;
  if (first) {
    const t = Date.parse(first);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

async function loadCustomerData(customer: CustomerProfile): Promise<CustomerDataPayload> {
  await sleep(180);
  const seed = getInsightsSeedForCustomer(customer);
  const sortedHistory = [...seed.purchaseHistory].sort((a, b) => b.date.localeCompare(a.date));
  return {
    customerId: customer.id,
    metrics: {
      totalSpend: customer.totalSpend,
      lastVisit: resolveLastVisit(customer),
      loyaltyTier: customer.tier,
    },
    purchaseHistory: sortedHistory,
    brandAffinity: seed.brandAffinity,
  };
}

/**
 * Fetches enriched customer dashboard data (metrics, purchase timeline, brand affinity).
 * Simulates a short network round-trip; swap `queryFn` for a real API when available.
 */
export function useCustomerData(customer: CustomerProfile | null) {
  return useQuery({
    queryKey: ["customerData", customer?.id ?? "none"],
    queryFn: () => loadCustomerData(customer!),
    enabled: customer != null,
  });
}
