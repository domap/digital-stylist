import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import type { Product } from "@/data/products";
import { useCatalogProducts } from "@/hooks/useRetailData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useShoppingBag } from "@/hooks/useShoppingBag";
import { ArrowLeft, Bell, Heart, Ruler, Shirt, Sparkles, Package, CalendarClock, Truck, ShoppingBag, ShoppingCart } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchAssociatePdpRecommendations, type AssociatePdpRecommendationsResponse } from "@/lib/stylist-api";

/** Cap associate PDP cross-sell list in UI (server may return more). */
const MAX_PDP_RECO = 4;

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addLine, itemCount } = useShoppingBag();
  const { data: catalogProducts = [], isLoading: catalogLoading, error: catalogError } = useCatalogProducts();
  const product = useMemo(() => catalogProducts.find((p) => p.id === id), [catalogProducts, id]);
  const brandRaw = product?.brand;
  const isAnnTaylor = brandRaw === "AnnTaylor";
  // Clienteling is Ann Taylor-focused. Only Ann Taylor items are purchasable in-store in this demo.
  // LOFT and any other/missing brands are online-only (dropship).
  const isInStoreEligible = isAnnTaylor;
  const brand = ((brandRaw ?? "AnnTaylor") as "AnnTaylor" | "Loft") satisfies "AnnTaylor" | "Loft";
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [fulfillment, setFulfillment] = useState<"online" | "store">("online");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const storeCities = ["New York, NY", "Columbus, OH", "Chicago, IL", "Boston, MA", "Austin, TX", "Charlotte, NC"];

  const [recoOpen, setRecoOpen] = useState(false);
  const [recoError, setRecoError] = useState<string>("");
  const [reco, setReco] = useState<AssociatePdpRecommendationsResponse | null>(null);

  const canAddToBag = useMemo(
    () => selectedSize.length > 0 && selectedColor.length > 0,
    [selectedSize, selectedColor]
  );

  useEffect(() => {
    // Only Ann Taylor items are in-store eligible in this demo. Avoid lingering "store" fulfillment when navigating.
    if (!isInStoreEligible && fulfillment === "store") setFulfillment("online");
  }, [fulfillment, isInStoreEligible]);

  useEffect(() => {
    if (!product?.id) return;
    let cancelled = false;
    setReco(null);
    setRecoOpen(false);
    setRecoError("");
    const customerId =
      typeof window !== "undefined" ? window.localStorage.getItem("clienteling.selectedCustomerId") : null;
    void fetchAssociatePdpRecommendations({
      customerId: customerId || null,
      productId: product.id,
    })
      .then((data) => {
        if (!cancelled) setReco(data);
      })
      .catch((e) => {
        if (!cancelled) setRecoError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [product?.id]);

  const recoProducts = useMemo(() => {
    if (!reco?.recommendations?.length) return [];
    const byId = new Map(catalogProducts.map((p) => [p.id, p]));
    return reco.recommendations
      .slice(0, MAX_PDP_RECO)
      .map((r) => ({ r, p: byId.get(r.productId) }))
      .filter((x): x is { r: (typeof reco.recommendations)[number]; p: Product } => Boolean(x.p));
  }, [reco, catalogProducts]);

  if (catalogLoading && !product) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-muted-foreground font-body text-sm">Loading product…</p>
      </div>
    );
  }

  if (catalogError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background gap-4 px-6">
        <p className="text-destructive text-sm font-body text-center">{String(catalogError)}</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Catalog
        </Button>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground font-body">Product not found</p>
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Catalog
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Dialog open={recoOpen} onOpenChange={setRecoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Recommendations for this customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {recoError ? <p className="text-sm text-rose-600 font-body">{recoError}</p> : null}
            {reco?.why ? <p className="text-sm text-muted-foreground font-body leading-relaxed">{reco.why}</p> : null}

            {recoProducts.length ? (
              <div className="space-y-2">
                {recoProducts.map(({ r, p }) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors"
                    onClick={() => {
                      setRecoOpen(false);
                      navigate(`/product/${p.id}`);
                    }}
                  >
                    <div className="grid grid-cols-[64px_1fr] gap-3 p-3 items-start">
                      <img src={p.image} alt={p.name} className="w-16 h-20 object-cover rounded-lg border border-border" />
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground leading-snug">{p.name}</p>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
                            {r.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground font-body">{r.reason}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between gap-4">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors font-body"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Clienteling Suite
        </button>
        {itemCount > 0 ? (
          <Link to="/cart" className="relative inline-flex">
            <Button type="button" variant="outline" size="sm" className="font-body gap-2 pr-2.5">
              <ShoppingCart className="h-4 w-4" />
              Cart
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[10px] font-semibold text-background tabular-nums">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            </Button>
          </Link>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="font-body gap-2 opacity-60"
            disabled
            title="Add items to your bag to open the cart"
          >
            <ShoppingCart className="h-4 w-4" />
            Cart
          </Button>
        )}
      </header>

      {recoProducts.length > 0 ? (
        <button
          type="button"
          onClick={() => setRecoOpen(true)}
          className="w-full border-b border-border bg-amber-50/90 dark:bg-amber-950/30 px-6 py-3 text-left flex items-center justify-between gap-4 hover:bg-amber-50 dark:hover:bg-amber-950/45 transition-colors"
        >
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200">
              <Bell className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-semibold text-foreground font-body">Styling suggestions for this customer</p>
              <p className="text-xs text-muted-foreground font-body mt-0.5">
                {recoProducts.length} curated pick{recoProducts.length === 1 ? "" : "s"} while they view this PDP — tap to open details
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100 shrink-0">
            View
          </span>
        </button>
      ) : recoError ? (
        <div className="w-full border-b border-border bg-muted/40 px-6 py-2">
          <p className="text-xs text-muted-foreground font-body">{recoError}</p>
        </div>
      ) : null}

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Image */}
          <div className="aspect-[4/5] overflow-hidden rounded-lg bg-muted">
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Details */}
          <div className="space-y-5">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-body">{product.category}</p>
              <h1 className="font-display text-2xl font-semibold text-foreground leading-tight">{product.name}</h1>
              <p className="text-xl font-semibold text-foreground">${product.price}</p>
              {!isInStoreEligible ? (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium text-foreground">
                  <Truck className="h-3.5 w-3.5" />
                  Dropship available
                </div>
              ) : null}
            </div>

            <p className="text-sm text-muted-foreground font-body leading-relaxed">{product.description}</p>

            <Separator />

            {/* Fit & Sizes */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Ruler className="h-3.5 w-3.5" />
                Fit & Sizing
              </div>
              <p className="text-sm font-body">
                <span className="font-semibold text-foreground">Fit:</span> {product.fit}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {product.sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSelectedSize(s)}
                    className={`px-2.5 py-1 rounded-md border text-xs font-body transition-colors ${
                      selectedSize === s
                        ? "border-secondary bg-secondary/10 text-foreground"
                        : "border-border text-foreground hover:border-secondary/40"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Colors */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Colors</p>
              <div className="flex flex-wrap gap-1.5">
                {product.colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedColor(c)}
                    className={`px-2.5 py-1 rounded-md border text-xs font-body transition-colors ${
                      selectedColor === c
                        ? "border-secondary bg-secondary/10 text-foreground"
                        : "border-border text-foreground hover:border-secondary/40"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Occasions */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Perfect For
              </div>
              <div className="flex flex-wrap gap-1.5">
                {product.occasion.map((o) => (
                  <Badge key={o} variant="outline" className="text-xs">{o}</Badge>
                ))}
              </div>
            </div>

            {/* Fabric */}
            {product.fabric && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Shirt className="h-3.5 w-3.5" />
                  Fabric
                </div>
                <p className="text-sm text-muted-foreground font-body">{product.fabric}</p>
              </div>
            )}

            {/* Care */}
            {product.careInstructions && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Package className="h-3.5 w-3.5" />
                  Care Instructions
                </div>
                <p className="text-sm text-muted-foreground font-body">{product.careInstructions}</p>
              </div>
            )}

            {/* Styling Tips */}
            {product.stylingTips && (
              <div className="space-y-1 bg-muted/50 rounded-lg p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-secondary">✨ Stylist Tip</p>
                <p className="text-sm text-foreground font-body italic leading-relaxed">{product.stylingTips}</p>
              </div>
            )}

            <Separator />

            {/* Actions */}
            <div className="space-y-3 pt-1 border border-border rounded-lg p-4 bg-card">
              <div className={`grid gap-3 ${isInStoreEligible ? "grid-cols-2" : "grid-cols-1"}`}>
                <button
                  type="button"
                  onClick={() => setFulfillment("online")}
                  className={`rounded-md border px-3 py-2 text-left transition-colors ${
                    fulfillment === "online" ? "border-foreground bg-foreground/5" : "border-border hover:border-foreground/40"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide">
                    Buy Online{!isInStoreEligible ? " (Dropship)" : ""}
                  </p>
                  <p className="text-[11px] text-green-600">{!isInStoreEligible ? "Ships to home" : "Available"}</p>
                </button>
                {isInStoreEligible ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFulfillment("store");
                      setStatusMessage(`Available in Store: ${storeCities.join(", ")}. Reserve for pickup.`);
                    }}
                    className={`rounded-md border px-3 py-2 text-left transition-colors ${
                      fulfillment === "store" ? "border-foreground bg-foreground/5" : "border-border hover:border-foreground/40"
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide">Buy In Store</p>
                    <p className="text-[11px] text-rose-500">Limited</p>
                  </button>
                ) : null}
              </div>

              <div className="flex items-center justify-between">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Quantity</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="h-8 w-8 rounded border border-border text-sm"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  >
                    -
                  </button>
                  <div className="h-8 min-w-10 rounded border border-border px-3 flex items-center justify-center text-sm">
                    {quantity}
                  </div>
                  <button
                    type="button"
                    className="h-8 w-8 rounded border border-border text-sm"
                    onClick={() => setQuantity((q) => Math.min(9, q + 1))}
                  >
                    +
                  </button>
                </div>
              </div>

              <Button
                className="w-full font-body"
                disabled={!canAddToBag}
                onClick={() => {
                  if (!canAddToBag || !product) {
                    setStatusMessage("Please select size and color before adding to bag.");
                    return;
                  }
                  addLine({
                    productId: product.id,
                    name: product.name,
                    brand,
                    image: product.image,
                    price: product.price,
                    size: selectedSize,
                    color: selectedColor,
                    quantity,
                    fulfillment,
                  });
                  toast.success("Added to bag", {
                    description: `${quantity}× ${product.name} · ${selectedSize} · ${selectedColor}`,
                  });
                  setStatusMessage(
                    `Added ${quantity} item(s) to bag • Size ${selectedSize} • ${selectedColor} • ${fulfillment === "online" ? "Buy Online" : "Buy In Store"}`
                  );
                }}
              >
                <ShoppingBag className="h-4 w-4 mr-2" />
                Add to Bag
              </Button>

              <Button
                type="button"
                variant="secondary"
                className="w-full font-body justify-between"
                disabled={itemCount === 0}
                title={itemCount === 0 ? "Add at least one item to your bag to view the cart" : "Open shopping bag"}
                onClick={() => {
                  if (itemCount > 0) navigate("/cart");
                }}
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                View cart
                {itemCount > 0 ? (
                  <span className="ml-auto tabular-nums text-xs font-semibold text-muted-foreground">{itemCount} in bag</span>
                ) : null}
              </Button>

              {brand === "Loft" ? (
                <Button
                  variant="outline"
                  className="w-full font-body"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.localStorage.setItem(
                        "stylist.pending_appointment_request",
                        JSON.stringify({ brand, productName: product.name })
                      );
                      window.localStorage.setItem("last_active_view", "stylist");
                    }
                    navigate("/");
                  }}
                >
                  <CalendarClock className="h-4 w-4 mr-2" />
                  Appointment with a Stylist
                </Button>
              ) : null}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="w-full font-body"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      const raw = window.localStorage.getItem("customer.wishlist");
                      const wishlist = raw ? (JSON.parse(raw) as Product[]) : [];
                      const exists = wishlist.some((p) => p.id === product.id);
                      if (!exists) {
                        window.localStorage.setItem(
                          "customer.wishlist",
                          JSON.stringify([...wishlist, product])
                        );
                      }
                      setStatusMessage(
                        exists
                          ? `${product.name} is already in the customer wishlist.`
                          : `${product.name} added to customer wishlist.`
                      );
                    }
                  }}
                >
                  <Heart className="h-4 w-4 mr-2" />
                  Add to Wishlist
                </Button>
              </div>
              {statusMessage ? <p className="text-xs text-secondary font-body">{statusMessage}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
