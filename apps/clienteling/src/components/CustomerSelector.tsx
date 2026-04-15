import { useState } from "react";
import { CustomerProfile } from "@/data/customers";
import { Search, User, Crown, Star, Diamond } from "lucide-react";
import { Input } from "@/components/ui/input";

interface CustomerSelectorProps {
  customers: CustomerProfile[];
  selectedCustomer: CustomerProfile | null;
  onSelectCustomer: (customer: CustomerProfile) => void;
}

const tierIcon = {
  Silver: Star,
  Gold: Crown,
  Platinum: Diamond,
};

const tierColor = {
  Silver: "text-muted-foreground",
  Gold: "text-warning",
  Platinum: "text-secondary",
};

export function CustomerSelector({
  customers,
  selectedCustomer,
  onSelectCustomer,
}: CustomerSelectorProps) {
  const [search, setSearch] = useState("");

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-card border-border font-body text-sm"
        />
      </div>
      <div className="space-y-2">
        {filtered.map((customer) => {
          const TierIcon = tierIcon[customer.tier];
          const isSelected = selectedCustomer?.id === customer.id;
          return (
            <button
              key={customer.id}
              onClick={() => onSelectCustomer(customer)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                isSelected
                  ? "border-secondary bg-secondary/5"
                  : "border-border hover:border-secondary/40 bg-card"
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-display text-sm font-semibold ${
                isSelected ? "bg-secondary text-secondary-foreground" : "bg-muted text-foreground"
              }`}>
                {customer.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm text-foreground truncate">{customer.name}</span>
                  <TierIcon className={`h-3.5 w-3.5 ${tierColor[customer.tier]}`} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Size {customer.preferredSize} · {customer.tier}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
