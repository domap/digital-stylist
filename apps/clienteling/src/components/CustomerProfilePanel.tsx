import { CustomerProfile } from "@/data/customers";
import { Badge } from "@/components/ui/badge";
import { Calendar, Heart, ShoppingBag, Ruler, Palette } from "lucide-react";

interface CustomerProfilePanelProps {
  customer: CustomerProfile;
}

export function CustomerProfilePanel({ customer }: CustomerProfilePanelProps) {
  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-display text-lg font-semibold">
          {customer.avatar}
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">{customer.name}</h3>
          <p className="text-xs text-muted-foreground">Member since {customer.memberSince} · ${customer.totalSpend.toLocaleString()} lifetime</p>
        </div>
      </div>

      {/* Preferences */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Ruler className="h-3.5 w-3.5" />
          Size & Fit
        </div>
        <p className="text-sm text-foreground">Size {customer.preferredSize} · {customer.preferredFit} fit</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Heart className="h-3.5 w-3.5" />
          Style Preferences
        </div>
        <div className="flex flex-wrap gap-1.5">
          {customer.stylePreferences.map((s) => (
            <Badge key={s} variant="secondary" className="text-xs font-body">{s}</Badge>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Palette className="h-3.5 w-3.5" />
          Color Preferences
        </div>
        <div className="flex flex-wrap gap-1.5">
          {customer.colorPreferences.map((c) => (
            <Badge key={c} variant="outline" className="text-xs font-body">{c}</Badge>
          ))}
        </div>
      </div>

      {/* Recent Purchases */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ShoppingBag className="h-3.5 w-3.5" />
          Recent Purchases
        </div>
        <div className="space-y-2">
          {customer.recentPurchases.map((p, i) => (
            <div key={i} className="flex justify-between items-center text-sm">
              <span className="text-foreground">{p.name}</span>
              <span className="text-muted-foreground text-xs">${p.price}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming Events */}
      {customer.upcomingEvents.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            Upcoming Events
          </div>
          <div className="space-y-2">
            {customer.upcomingEvents.map((e, i) => (
              <div key={i} className="flex justify-between items-center text-sm">
                <span className="text-foreground">{e.name}</span>
                <span className="text-muted-foreground text-xs">{e.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {customer.notes && (
        <div className="bg-muted rounded-lg p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Associate Notes</p>
          <p className="text-sm text-foreground italic">{customer.notes}</p>
        </div>
      )}
    </div>
  );
}
