/** Customer profile for clienteling UI — rows come from GET /api/v1/retail/customers (profile_json). */

export interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  memberSince: string;
  tier: "Silver" | "Gold" | "Platinum";
  preferredSize: string;
  preferredFit: string;
  stylePreferences: string[];
  colorPreferences: string[];
  recentPurchases: { name: string; date: string; price: number }[];
  upcomingEvents: { name: string; date: string }[];
  notes: string;
  totalSpend: number;
  /** ISO date (yyyy-mm-dd) for last store or digital touchpoint */
  lastVisit?: string;
  avatar: string;
}
