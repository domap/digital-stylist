import type { ComponentType } from "react";
import { format, parseISO, isValid } from "date-fns";
import { Loader2, DollarSign, CalendarClock, Award } from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCustomerData } from "@/hooks/useCustomerData";
import type { CustomerProfile } from "@/data/customers";
import { cn } from "@/lib/utils";

function formatVisitDate(isoOrRaw: string): string {
  const d = parseISO(isoOrRaw);
  if (isValid(d)) return format(d, "MMM d, yyyy");
  return isoOrRaw;
}

interface CustomerInsightsViewProps {
  customer: CustomerProfile | null;
}

export function CustomerInsightsView({ customer }: CustomerInsightsViewProps) {
  const { data, isLoading, isError, error } = useCustomerData(customer);

  if (!customer) {
    return (
      <div className="h-full min-h-[320px] rounded-2xl ios-surface flex items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground max-w-sm font-body">
          Select a customer from the sidebar to view purchase history, brand affinity, and loyalty metrics.
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-full min-h-[200px] rounded-2xl ios-surface flex items-center justify-center p-6">
        <p className="text-sm text-destructive font-body">{error instanceof Error ? error.message : "Could not load insights."}</p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="h-full min-h-[320px] rounded-2xl ios-surface flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground font-body">Loading customer insights…</p>
      </div>
    );
  }

  const radarData = data.brandAffinity.map((b) => ({
    subject: b.category,
    affinity: b.score,
  }));

  return (
    <div className="h-full min-h-0 overflow-auto rounded-2xl ios-surface">
      <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-semibold tracking-tight text-foreground">Customer Insights</h1>
          <p className="text-sm text-muted-foreground mt-1 font-body">{customer.name}</p>
        </div>

        {/* Key metrics — tablet-friendly grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <MetricCard
            icon={DollarSign}
            label="Total spend"
            value={`$${data.metrics.totalSpend.toLocaleString()}`}
            sub="Lifetime"
          />
          <MetricCard
            icon={CalendarClock}
            label="Last visit"
            value={formatVisitDate(data.metrics.lastVisit)}
            sub="Last touchpoint"
          />
          <MetricCard icon={Award} label="Loyalty tier" value={data.metrics.loyaltyTier} sub="Program status" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 items-start">
          {/* Purchase history timeline */}
          <Card className="border-border/80 shadow-sm rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-display font-semibold">Purchase history</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="relative border-l border-border ml-2 md:ml-3 space-y-0">
                {data.purchaseHistory.map((entry, idx) => (
                  <li key={entry.id} className="pl-5 md:pl-6 pb-5 last:pb-0 relative">
                    <span
                      className={cn(
                        "absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background",
                        idx === 0 ? "bg-secondary" : "bg-muted-foreground/40",
                      )}
                    />
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                      <div>
                        <p className="text-sm font-medium text-foreground font-body">{entry.title}</p>
                        <p className="text-xs text-muted-foreground font-body">
                          {formatVisitDate(entry.date)} · {entry.channel}
                        </p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums text-foreground shrink-0">${entry.amount.toLocaleString()}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Brand affinity radar */}
          <Card className="border-border/80 shadow-sm rounded-2xl">
            <CardHeader className="pb-0">
              <CardTitle className="text-base font-display font-semibold">Brand affinity</CardTitle>
              <p className="text-xs text-muted-foreground font-body font-normal">Relative strength by category (0–100)</p>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="w-full min-h-[280px] md:min-h-[320px] touch-pan-x touch-pan-y [&_.recharts-polar-angle-axis-tick_text]:fill-muted-foreground [&_.recharts-polar-radius-axis-tick_text]:fill-muted-foreground/80">
                <ResponsiveContainer width="100%" height="100%" minHeight={280}>
                  <RadarChart cx="50%" cy="50%" outerRadius="78%" data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fontFamily: "var(--font-body)" }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tickCount={5} tick={{ fontSize: 10 }} />
                    <Radar
                      name="Affinity"
                      dataKey="affinity"
                      stroke="hsl(var(--secondary))"
                      fill="hsl(var(--secondary))"
                      fillOpacity={0.35}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card/80 backdrop-blur-sm px-4 py-4 md:py-5 flex gap-3 items-start min-h-[88px] touch-target">
      <div className="rounded-xl bg-muted p-2.5 text-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-body">{label}</p>
        <p className="text-lg md:text-xl font-semibold tracking-tight text-foreground font-display truncate">{value}</p>
        <p className="text-xs text-muted-foreground font-body">{sub}</p>
      </div>
    </div>
  );
}
