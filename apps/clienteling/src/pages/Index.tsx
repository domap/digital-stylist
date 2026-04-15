import { useEffect, useMemo, useRef, useState } from "react";
import type { CustomerProfile } from "@/data/customers";
import type { Product } from "@/data/products";
import { useCatalogProducts, useRetailCustomerProfiles } from "@/hooks/useRetailData";
import { CustomerSelector } from "@/components/CustomerSelector";
import { CustomerProfilePanel } from "@/components/CustomerProfilePanel";
import { DigitalStylistContainer } from "@/components/DigitalStylistContainer";
import { ProductCatalog } from "@/components/ProductCatalog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  WandSparkles,
  Users,
  UserCircle2,
  LayoutList,
  Plus,
  LayoutDashboard,
  ListTodo,
} from "lucide-react";
import { CustomerInsightsView } from "@/components/CustomerInsightsView";
import { AssociateTaskQueue } from "@/components/AssociateTaskQueue";
import { useNotifications } from "@/hooks/useNotifications";
import { toast } from "@/hooks/use-toast";
import type { FollowUpTask } from "@/types/follow-up-task";
import { useShoppingBag } from "@/hooks/useShoppingBag";
import { AnnTaylorPromoHero } from "@/components/AnnTaylorPromoHero";

const ASSOCIATE_NAME = "Ava";
const ASSOCIATE_INITIALS = "A";

export default function Index() {
  const { data: catalogProducts = [], isLoading: catalogLoading, error: catalogError } = useCatalogProducts();
  const {
    data: remoteCustomers = [],
    isSuccess: customersReady,
    isLoading: customersLoading,
    error: customersError,
  } = useRetailCustomerProfiles();

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const selectionHydrated = useRef(false);

  const [guestContextId, setGuestContextId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("clienteling.guestContextId");
  });
  const [itemsTriedByCustomerId, setItemsTriedByCustomerId] = useState<Record<string, string[]>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem("clienteling.itemsTriedByCustomerId");
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, string[]>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });
  const [itemsConsideredByCustomerId, setItemsConsideredByCustomerId] = useState<Record<string, string[]>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem("clienteling.itemsConsideredByCustomerId");
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, string[]>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });
  type MainView = "catalog" | "stylist" | "insights" | "tasks";
  const [activeView, setActiveView] = useState<MainView>(() => {
    const v = typeof window !== "undefined" ? window.localStorage.getItem("last_active_view") : null;
    if (v === "stylist" || v === "insights" || v === "tasks") return v;
    return "catalog";
  });
  const [showCustomerPanel, setShowCustomerPanel] = useState(false);
  const { events: notificationEvents } = useNotifications({ enabled: true, pollMs: 4000 });
  const fittingRoomToastedIdsRef = useRef(new Set<string>());
  const { addLine } = useShoppingBag();

  const liveTasks: FollowUpTask[] = useMemo(() => {
    return notificationEvents
      .filter((e) => e.type === "FITTING_ROOM_RESERVED")
      // Only list real reservations with inventory staged for try-on.
      .filter((e) => e.payload.slotLabel?.trim() && (e.payload.productIds?.length ?? 0) > 0)
      // Open only (e.g. CONNECT disappears after associate claims / Start helping).
      .filter((e) => e.task?.status === "open")
      .map((e) => {
        const custId = e.payload.customerId ?? "guest";
        const source = e.payload.source ?? "clienteling";
        return {
          id: `live-${e.id}`,
          customerId: custId,
          type: "fitting_room_reserved",
          title: "Fitting room reserved — stage items",
          summary: `Ref ${e.payload.id} · ${e.payload.slotLabel} · ${e.payload.productIds.length} items · Total $${e.payload.totalCost}`,
          dueLabel: "Now",
          priority: "high",
          meta: {
            reservationId: e.payload.id,
            slotLabel: e.payload.slotLabel,
            productIds: e.payload.productIds,
            totalCost: e.payload.totalCost,
            source,
          },
        } satisfies FollowUpTask;
      });
  }, [notificationEvents]);

  const [addedCustomers, setAddedCustomers] = useState<CustomerProfile[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("digitalStylist.addedCustomers");
      if (!raw) return [];
      const parsed = JSON.parse(raw) as CustomerProfile[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!customersReady || selectionHydrated.current) return;
    selectionHydrated.current = true;
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("clienteling.selectedCustomerId");
    if (saved) {
      const found =
        remoteCustomers.find((c) => c.id === saved) ?? addedCustomers.find((c) => c.id === saved);
      if (found) {
        setSelectedCustomer(found);
        return;
      }
    }
    setSelectedCustomer(remoteCustomers[0] ?? null);
  }, [customersReady, remoteCustomers, addedCustomers]);

  useEffect(() => {
    window.localStorage.setItem("digitalStylist.addedCustomers", JSON.stringify(addedCustomers));
  }, [addedCustomers]);

  const allCustomers = useMemo(() => {
    return [...remoteCustomers, ...addedCustomers].map((c) => {
      const tried = itemsTriedByCustomerId[c.id];
      const considered = itemsConsideredByCustomerId[c.id];
      const triedLine =
        tried && tried.length
          ? `Items tried (recent): ${tried
              .map((id) => catalogProducts.find((p) => p.id === id)?.name ?? id)
              .slice(0, 8)
              .join(", ")}`
          : "";
      const consideredLine =
        considered && considered.length
          ? `Previously considered: ${considered
              .map((id) => catalogProducts.find((p) => p.id === id)?.name ?? id)
              .slice(0, 8)
              .join(", ")}`
          : "";
      if (!triedLine && !consideredLine) return c;
      return {
        ...c,
        notes: `${c.notes}${triedLine || consideredLine ? "\n\n" : ""}${[triedLine, consideredLine].filter(Boolean).join("\n")}`,
      };
    });
  }, [
    addedCustomers,
    remoteCustomers,
    catalogProducts,
    itemsTriedByCustomerId,
    itemsConsideredByCustomerId,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedCustomer?.id) {
      window.localStorage.setItem("clienteling.selectedCustomerId", selectedCustomer.id);
      window.localStorage.removeItem("clienteling.guestContextId");
      setGuestContextId(null);
    } else {
      window.localStorage.removeItem("clienteling.selectedCustomerId");
    }
  }, [selectedCustomer?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (guestContextId) window.localStorage.setItem("clienteling.guestContextId", guestContextId);
    else window.localStorage.removeItem("clienteling.guestContextId");
  }, [guestContextId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("clienteling.itemsTriedByCustomerId", JSON.stringify(itemsTriedByCustomerId));
    } catch {
      // ignore
    }
  }, [itemsTriedByCustomerId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("clienteling.itemsConsideredByCustomerId", JSON.stringify(itemsConsideredByCustomerId));
    } catch {
      // ignore
    }
  }, [itemsConsideredByCustomerId]);

  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPreferredSize, setNewCustomerPreferredSize] = useState("6");
  const [newCustomerPreferredFit, setNewCustomerPreferredFit] = useState("Regular");

  const initialsFromName = (name: string) =>
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "C";

  const handleSuggestProduct = (product: Product) => {
    setActiveView("stylist");
  };

  useEffect(() => {
    window.localStorage.setItem("last_active_view", activeView);
  }, [activeView]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem("stylist.pending_appointment_request")) {
      setActiveView("stylist");
      window.localStorage.setItem("last_active_view", "stylist");
    }
  }, []);

  useEffect(() => {
    for (const e of notificationEvents) {
      if (e.type !== "FITTING_ROOM_RESERVED") continue;
      if (e.task?.status !== "open") continue;
      if (!e.payload.slotLabel?.trim() || !(e.payload.productIds?.length ?? 0)) continue;
      if (fittingRoomToastedIdsRef.current.has(e.id)) continue;
      fittingRoomToastedIdsRef.current.add(e.id);
      toast({
        title: "Fitting room reserved",
        description: `Ref ${e.payload.id} · ${e.payload.slotLabel} · ${e.payload.productIds.length} items`,
      });
      break;
    }
  }, [notificationEvents]);

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-gradient-to-b from-[#f4f6fb] to-[#eef2f8] p-2 gap-0">
      <aside className="w-[72px] shrink-0 rounded-2xl ios-surface flex flex-col overflow-hidden">
        <div className="h-14 border-b border-border flex items-center justify-center">
          <div className="bg-black text-white text-[8px] leading-tight tracking-wider px-1.5 py-1 text-center font-semibold">
            ANN
            <br />
            TAYLOR
          </div>
        </div>
        <div className="flex-1 py-3 space-y-1">
          <button
            title="Catalog"
            className={`w-full h-12 touch-target flex items-center justify-center transition-colors ${
              activeView === "catalog" ? "bg-muted text-foreground border-l-2 border-black" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
            onClick={() => setActiveView("catalog")}
          >
            <LayoutList className="h-5 w-5" />
          </button>
          <button
            title="Customers"
            className={`w-full h-12 touch-target flex items-center justify-center transition-colors ${
              showCustomerPanel ? "bg-muted text-foreground border-l-2 border-black" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
            onClick={() => setShowCustomerPanel(true)}
          >
            <Users className="h-5 w-5" />
          </button>
          <button
            title="Store AI Assistant"
            className={`w-full h-12 touch-target flex items-center justify-center transition-colors ${
              activeView === "stylist" ? "bg-muted text-foreground border-l-2 border-black" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
            onClick={() => setActiveView("stylist")}
          >
            <WandSparkles className="h-5 w-5" />
          </button>
          <button
            title="Customer insights"
            className={`w-full h-12 touch-target flex items-center justify-center transition-colors ${
              activeView === "insights" ? "bg-muted text-foreground border-l-2 border-black" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
            onClick={() => setActiveView("insights")}
          >
            <LayoutDashboard className="h-5 w-5" />
          </button>
          <button
            title="Task queue"
            className={`w-full h-12 touch-target flex items-center justify-center transition-colors ${
              activeView === "tasks" ? "bg-muted text-foreground border-l-2 border-black" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
            onClick={() => setActiveView("tasks")}
          >
            <ListTodo className="h-5 w-5" />
          </button>
        </div>
      </aside>

      {showCustomerPanel && (
        <aside className="ml-2 w-80 shrink-0 rounded-2xl ios-surface flex flex-col overflow-hidden">
          <div className="h-14 px-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Customer
            </div>
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowCustomerPanel(false)}>
              Hide
            </button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 text-xs font-body px-3 py-2 rounded-md border transition-colors ${
                    selectedCustomer === null ? "border-secondary bg-secondary/10 text-foreground" : "border-border bg-card hover:border-secondary/40"
                  }`}
                  onClick={() => {
                    setSelectedCustomer(null);
                    setActiveView("stylist");
                  }}
                >
                  Guest session
                </button>
                <button
                  type="button"
                  className="flex items-center justify-center gap-1 text-xs font-body px-3 py-2 rounded-md border border-border bg-card hover:border-secondary/40"
                  onClick={() => setShowAddCustomer((v) => !v)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>

              {showAddCustomer && (
                <div className="space-y-3 rounded-lg border border-border bg-card p-3">
                  <Input
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="Customer name"
                    className="bg-card font-body"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={newCustomerPreferredSize}
                      onChange={(e) => setNewCustomerPreferredSize(e.target.value)}
                      placeholder="Preferred size"
                      className="bg-card font-body"
                    />
                    <Input
                      value={newCustomerPreferredFit}
                      onChange={(e) => setNewCustomerPreferredFit(e.target.value)}
                      placeholder="Preferred fit"
                      className="bg-card font-body"
                    />
                  </div>
                  <button
                    type="button"
                    className="w-full text-xs font-body px-3 py-2 rounded-md border border-secondary bg-secondary/10 hover:bg-secondary/15 transition-colors"
                    onClick={() => {
                      const name = newCustomerName.trim();
                      if (!name) return;

                      const next: CustomerProfile = {
                        id: `cust-${Date.now()}`,
                        name,
                        email: "",
                        phone: "",
                        memberSince: new Date().getFullYear().toString(),
                        tier: "Silver",
                        preferredSize: newCustomerPreferredSize || "6",
                        preferredFit: newCustomerPreferredFit || "Regular",
                        stylePreferences: ["Classic"],
                        colorPreferences: ["Black"],
                        recentPurchases: [],
                        upcomingEvents: [],
                        notes: "Added by associate.",
                        totalSpend: 0,
                        lastVisit: new Date().toISOString().slice(0, 10),
                        avatar: initialsFromName(name),
                      };

                      setAddedCustomers((prev) => [next, ...prev]);
                      setSelectedCustomer(next);
                      setActiveView("stylist");
                      setShowAddCustomer(false);
                      setNewCustomerName("");
                    }}
                  >
                    Create customer
                  </button>
                </div>
              )}

              <CustomerSelector customers={allCustomers} selectedCustomer={selectedCustomer} onSelectCustomer={setSelectedCustomer} />
              {selectedCustomer && (
                <div className="border-t border-border pt-4">
                  <CustomerProfilePanel customer={selectedCustomer} />
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>
      )}

      <main className="flex-1 min-w-0 min-h-0 flex ml-2">
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="h-14 rounded-2xl ios-surface px-6 flex items-center justify-end gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-muted text-foreground flex items-center justify-center text-xs font-display font-semibold">
                {ASSOCIATE_INITIALS}
              </div>
              <div className="text-[18px] font-semibold tracking-tight">Hi {ASSOCIATE_NAME}</div>
            </div>
            <button
              type="button"
              title="Select customer"
              onClick={() => setShowCustomerPanel((prev) => !prev)}
              className="flex items-center justify-center p-1 rounded-md hover:bg-muted/60 transition-colors"
            >
              <UserCircle2 className="h-6 w-6 text-muted-foreground" />
            </button>
          </div>

          <div className="flex-1 min-h-0 transition-all duration-300 pt-2">
            <div className={activeView === "catalog" ? "h-full" : "hidden"}>
              <ScrollArea className="h-full">
                <div className="p-3 md:p-4 space-y-4 md:space-y-5">
                  <AnnTaylorPromoHero />
                  {catalogError || customersError ? (
                    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                      {catalogError instanceof Error ? catalogError.message : String(catalogError ?? "")}
                      {customersError instanceof Error ? customersError.message : String(customersError ?? "")}
                    </div>
                  ) : null}
                  {(catalogLoading || customersLoading) && catalogProducts.length === 0 ? (
                    <div className="text-sm text-muted-foreground font-body px-1">Loading catalog and customers…</div>
                  ) : null}
                  <ProductCatalog
                    products={catalogProducts}
                    customer={selectedCustomer}
                    onSuggestProduct={handleSuggestProduct}
                  />
                </div>
              </ScrollArea>
            </div>
            <div className={activeView === "stylist" ? "h-full" : "hidden"}>
              <DigitalStylistContainer
                customer={selectedCustomer}
                products={catalogProducts}
                guestId={selectedCustomer ? null : guestContextId}
                associateName={ASSOCIATE_NAME}
                onItemsTriedChange={({ customerId, productIds }) => {
                  setItemsTriedByCustomerId((prev) => {
                    const existing = prev[customerId] ?? [];
                    const merged = [...new Set([...productIds, ...existing])].slice(0, 24);
                    return { ...prev, [customerId]: merged };
                  });
                }}
              />
            </div>
            <div className={activeView === "insights" ? "h-full min-h-0" : "hidden"}>
              <CustomerInsightsView customer={selectedCustomer} />
            </div>
            <div className={activeView === "tasks" ? "h-full min-h-0" : "hidden"}>
              <AssociateTaskQueue
                products={catalogProducts}
                customers={allCustomers}
                selectedCustomerId={selectedCustomer?.id ?? null}
                liveTasks={liveTasks}
                onStartHelping={({ customerId, productIds, reservationId, slotLabel, totalCost }) => {
                  const cust = allCustomers.find((c) => c.id === customerId) ?? null;
                  if (cust) {
                    setSelectedCustomer(cust);
                    setGuestContextId(null);
                  } else {
                    // Guest flow: explicitly switch to guest context (no profile).
                    setSelectedCustomer(null);
                    window.localStorage.removeItem("clienteling.selectedCustomerId");
                    const gid = (reservationId && reservationId.trim()) ? `guest-${reservationId.trim()}` : `guest-${Date.now()}`;
                    setGuestContextId(gid);
                  }
                  setActiveView("stylist");
                  window.localStorage.setItem("last_active_view", "stylist");

                  // Pre-stage selected items in cart so the associate can immediately assist.
                  for (const pid of productIds ?? []) {
                    const p = catalogProducts.find((x) => x.id === pid);
                    if (!p) continue;
                    const size = p.sizes?.[0] ?? "";
                    const color = p.colors?.[0] ?? "";
                    if (!size || !color) continue;
                    addLine({
                      productId: p.id,
                      name: p.name,
                      brand: (p.brand ?? "AnnTaylor") as "AnnTaylor" | "Loft",
                      image: p.image,
                      price: p.price,
                      size,
                      color,
                      quantity: 1,
                      fulfillment: "store",
                    });
                  }

                  // Seed the Store AI Assistant with the accepted items (prioritize associate ask).
                  try {
                    const effectiveGuestId =
                      cust?.id ? null : (reservationId && reservationId.trim()) ? `guest-${reservationId.trim()}` : `guest-${Date.now()}`;
                    window.localStorage.setItem(
                      "stylist.pending_fitting_room_help",
                      JSON.stringify({
                        customerId: cust?.id ?? null,
                        guestId: effectiveGuestId,
                        reservationId: reservationId ?? null,
                        slotLabel: slotLabel ?? null,
                        totalCost: totalCost ?? null,
                        productIds: productIds ?? [],
                      })
                    );
                  } catch {
                    // ignore
                  }
                }}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
