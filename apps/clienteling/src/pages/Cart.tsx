import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Mic, Minus, Plus, Send, ShoppingBag, Sparkles, Store, Clock, Shirt, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ProductCard } from "@/components/ProductCard";
import { useCatalogProducts } from "@/hooks/useRetailData";
import { getRuntimeChannel } from "@/lib/runtime-channel";
import { sendStylistChat } from "@/lib/stylist-api";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { speakPlainText, stripForSpeech } from "@/lib/voice";
import { refineVoiceTranscriptToIntent } from "@/lib/voice-intent";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useShoppingBag } from "@/hooks/useShoppingBag";
import type { BagLine } from "@/lib/shopping-bag";

const FITTING_KEY = "clienteling.fitting_room_hold";

type FittingHold = { room: string; slotLabel: string; lineCount: number; savedAt: string };

function loadFittingHold(): FittingHold | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(FITTING_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FittingHold;
  } catch {
    return null;
  }
}

function saveFittingHold(hold: FittingHold) {
  sessionStorage.setItem(FITTING_KEY, JSON.stringify(hold));
}

function clearFittingHold() {
  sessionStorage.removeItem(FITTING_KEY);
}

const MOCK_FITTING_SLOTS = [
  "Today · 2:30 PM",
  "Today · 3:15 PM",
  "Today · 4:00 PM",
  "Tomorrow · 11:00 AM",
  "Tomorrow · 1:30 PM",
];

/** Tap-to-send cross-sell / upsell prompts for the cart assistant (bag context is prepended on send). */
const CART_CROSS_SELL_PROMPTS = [
  "What accessories or jewelry would cross-sell well with the items in this bag?",
  "Suggest shoes and a handbag that upsell this outfit for a polished head-to-toe look.",
  "What layering piece—blazer, wrap, or scarf—should I add before checkout?",
  "Any belt, hosiery, or shapewear to recommend with these pieces?",
  "The customer is on the fence—what one compelling add-on would you pitch?",
];

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function buildBagContextForAssistant(lines: BagLine[], subtotal: number): string {
  if (lines.length === 0) return "";
  const detail = lines
    .map((l) => `${l.quantity}× ${l.name} (${l.brand}, size ${l.size}, color ${l.color})`)
    .join("; ");
  return `Shopping bag context: ${detail}. Subtotal ${formatMoney(subtotal)}.`;
}

export default function Cart() {
  const navigate = useNavigate();
  const { data: catalogProducts = [] } = useCatalogProducts();
  const { lines, subtotal, setQuantity, removeLine, clear } = useShoppingBag();
  const [tryOnOpen, setTryOnOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(MOCK_FITTING_SLOTS[0]);
  const [fittingHold, setFittingHold] = useState<FittingHold | null>(() => loadFittingHold());
  const [lastSuspended, setLastSuspended] = useState<{ orderId: string; lines: BagLine[]; total: number } | null>(
    null
  );
  const [askInput, setAskInput] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askReply, setAskReply] = useState<string | null>(null);
  const [askProductIds, setAskProductIds] = useState<string[]>([]);
  const [askError, setAskError] = useState<string | null>(null);
  const [voiceRefining, setVoiceRefining] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);

  const canCheckout = lines.length > 0;

  const askRecommendedProducts = useMemo(
    () => catalogProducts.filter((p) => askProductIds.includes(p.id)),
    [askProductIds, catalogProducts],
  );

  const roomLabel = useMemo(() => {
    const n = (lines.length % 5) + 1;
    return `Fitting ${n}`;
  }, [lines.length]);

  const handleTryOnBook = () => {
    if (!canCheckout) return;
    const hold: FittingHold = {
      room: roomLabel,
      slotLabel: selectedSlot,
      lineCount: lines.reduce((s, l) => s + l.quantity, 0),
      savedAt: new Date().toISOString(),
    };
    saveFittingHold(hold);
    setFittingHold(hold);
    setTryOnOpen(false);
    toast.success("Fitting room booked", {
      description: `${hold.room} · ${hold.slotLabel}. Items will be staged at the fitting desk.`,
    });
  };

  const dismissSuspendedSummary = () => setLastSuspended(null);

  const sendAskToAssistant = async (question: string, opts?: { speakReply?: boolean }) => {
    const q = question.trim();
    if (!q) {
      toast.message("Enter a question or tap a suggested prompt.");
      return;
    }
    if (!canCheckout) {
      toast.message("Add items to the bag to get suggestions based on this cart.");
      return;
    }
    setAskInput(q);
    setAskLoading(true);
    setAskError(null);
    const channel = getRuntimeChannel();
    const payload = `${buildBagContextForAssistant(lines, subtotal)}\n\nQuestion (cross-sell / upsell / styling): ${q}`;
    try {
      const response = await sendStylistChat({
        message: payload,
        channel,
        mode: channel === "associate_console" ? "clienteling" : "customer_led",
        history: [],
      });
      setAskReply(response.reply);
      setAskProductIds(
        response.appointment && Object.keys(response.appointment).length > 0 ? [] : response.recommendedProductIds
      );
      if (opts?.speakReply) {
        queueMicrotask(() => speakPlainText(stripForSpeech(response.reply)));
      }
    } catch {
      setAskError("Could not reach the Store AI Assistant. Check that the API is running.");
      toast.error("Assistant unavailable");
    } finally {
      setAskLoading(false);
    }
  };

  const handleSuspendConfirm = () => {
    if (!canCheckout) return;
    const orderId = `SUSP-${Date.now().toString(36).toUpperCase().slice(-8)}`;
    const snapshot = [...lines];
    const total = subtotal;
    setLastSuspended({ orderId, lines: snapshot, total });
    clear();
    clearFittingHold();
    setFittingHold(null);
    setSuspendOpen(false);
    toast.success("Transaction suspended", {
      description: `${orderId} — customer pays at register.`,
    });
  };

  const saveCartAsConsideredAndClear = () => {
    if (lines.length === 0) return;
    const customerId = typeof window !== "undefined" ? window.localStorage.getItem("clienteling.selectedCustomerId") : null;
    if (!customerId) {
      toast.message("Select a customer to save considered items.");
      clear();
      return;
    }
    const ids = Array.from(new Set(lines.map((l) => l.productId).filter(Boolean)));
    try {
      const key = "clienteling.itemsConsideredByCustomerId";
      const raw = window.localStorage.getItem(key);
      const prev = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
      const existing = Array.isArray(prev?.[customerId]) ? prev[customerId] : [];
      const merged = [...new Set([...ids, ...existing])].slice(0, 50);
      window.localStorage.setItem(key, JSON.stringify({ ...(prev ?? {}), [customerId]: merged }));
    } catch {
      // ignore
    }
    clear();
    toast.success("Cart cleared", { description: "Saved these as previously considered items." });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors font-body"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Clienteling Suite
        </button>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground">Shopping bag</h1>
            <p className="text-sm text-muted-foreground font-body mt-1">
              Items added from product pages. Use Try On for a fitting room hold, or Suspend to send the sale to the
              register.
            </p>
          </div>
          <div className="rounded-full border border-border bg-muted/30 p-3">
            <ShoppingBag className="h-6 w-6 text-foreground" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={lines.length === 0} onClick={saveCartAsConsideredAndClear}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear cart & save as considered
          </Button>
        </div>

        {fittingHold ? (
          <div className="rounded-xl border border-secondary/40 bg-secondary/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <Shirt className="h-5 w-5 text-secondary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground">Fitting room reserved</p>
                <p className="text-xs text-muted-foreground font-body mt-0.5">
                  {fittingHold.room} · {fittingHold.slotLabel} · {fittingHold.lineCount} pcs
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => {
                clearFittingHold();
                setFittingHold(null);
                toast.message("Fitting hold cleared");
              }}
            >
              Clear hold
            </Button>
          </div>
        ) : null}

        {lastSuspended ? (
          <div className="rounded-xl border border-border bg-card px-4 py-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suspended order</p>
                <p className="font-mono text-lg font-semibold text-foreground mt-1">{lastSuspended.orderId}</p>
                <p className="text-sm text-muted-foreground font-body mt-1">
                  Placed on POS hold. Customer pays at the register with this number. No payment is captured in this demo
                  app.
                </p>
              </div>
              <Badge variant="outline" className="shrink-0">
                <Store className="h-3 w-3 mr-1" />
                Pay at register
              </Badge>
            </div>
            <Separator />
            <ul className="text-sm text-muted-foreground font-body space-y-1 max-h-40 overflow-y-auto">
              {lastSuspended.lines.map((l) => (
                <li key={l.lineId}>
                  {l.quantity}× {l.name} · {l.size} · {l.color}
                </li>
              ))}
            </ul>
            <p className="text-sm font-semibold text-foreground">Total due {formatMoney(lastSuspended.total)}</p>
            <Button type="button" variant="outline" size="sm" onClick={dismissSuspendedSummary}>
              Dismiss
            </Button>
          </div>
        ) : null}

        {lines.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-body">Your bag is empty.</p>
            <Button className="mt-4 font-body" onClick={() => navigate("/")}>
              Browse catalog
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {lines.map((line) => (
              <li
                key={line.lineId}
                className="flex gap-4 rounded-xl border border-border bg-card p-4"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/product/${line.productId}`)}
                  className="h-24 w-20 shrink-0 rounded-md overflow-hidden bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <img src={line.image} alt="" className="h-full w-full object-cover" />
                </button>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground text-sm leading-snug">{line.name}</p>
                      <p className="text-xs text-muted-foreground font-body mt-0.5">
                        {line.brand} · {line.size} · {line.color}
                      </p>
                      <p className="text-xs text-muted-foreground font-body">
                        {line.fulfillment === "online" ? "Ship / digital path" : "Buy in store"}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-foreground shrink-0">{formatMoney(line.price * line.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-md border border-border bg-background">
                      <button
                        type="button"
                        className="h-8 w-8 flex items-center justify-center hover:bg-muted"
                        aria-label="Decrease quantity"
                        onClick={() => setQuantity(line.lineId, line.quantity - 1)}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-sm w-8 text-center tabular-nums">{line.quantity}</span>
                      <button
                        type="button"
                        className="h-8 w-8 flex items-center justify-center hover:bg-muted"
                        aria-label="Increase quantity"
                        onClick={() => setQuantity(line.lineId, line.quantity + 1)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      aria-label="Remove"
                      onClick={() => removeLine(line.lineId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-xl border border-border bg-card p-4 md:p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-secondary/15 p-2 text-secondary shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="font-display text-lg font-semibold text-foreground">Ask the Store AI Assistant</h2>
              <p className="text-sm text-muted-foreground font-body">
                Request cross-sell or upsell ideas grounded in what&apos;s in this bag. Suggested prompts below; or type
                your own.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Suggested prompts
            </p>
            <div className="flex flex-col gap-2">
              {CART_CROSS_SELL_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={!canCheckout || askLoading || voiceListening || voiceRefining}
                  className="w-full text-left rounded-xl border border-border bg-background px-4 py-3 text-xs font-medium leading-snug touch-target hover:border-foreground/40 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  onClick={() => void sendAskToAssistant(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="cart-ask-input" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Your question
            </label>
            <Textarea
              id="cart-ask-input"
              value={askInput}
              onChange={(e) => setAskInput(e.target.value)}
              placeholder={
                canCheckout
                  ? "e.g. What necklace works with the dress she added?"
                  : "Add items to the bag to ask with cart context…"
              }
              disabled={!canCheckout || askLoading || voiceRefining || voiceListening}
              className="min-h-[88px] resize-y font-body text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <VoiceInputButton
                disabled={!canCheckout || askLoading || voiceRefining}
                className="h-10 w-10"
                onListeningChange={setVoiceListening}
                onTranscript={(raw) => {
                  void (async () => {
                    setVoiceRefining(true);
                    try {
                      const refined = await refineVoiceTranscriptToIntent(raw, "cart");
                      await sendAskToAssistant(refined, { speakReply: true });
                    } finally {
                      setVoiceRefining(false);
                    }
                  })();
                }}
              />
              <Button
                type="button"
                className="w-full sm:w-auto font-body"
                disabled={!canCheckout || askLoading || voiceRefining || voiceListening || !askInput.trim()}
                onClick={() => void sendAskToAssistant(askInput)}
              >
                {askLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Ask assistant
              </Button>
            </div>
            {(voiceListening || voiceRefining) && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground font-body" role="status" aria-live="polite">
                {voiceRefining ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 mt-0.5 animate-spin" aria-hidden />
                ) : (
                  <Mic className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-70" aria-hidden />
                )}
                <span>
                  {voiceRefining
                    ? "Processing voice — refining what you said, then asking the assistant."
                    : "Listening — pause when you’re done, or tap the mic to stop."}
                </span>
              </div>
            )}
          </div>

          {askError ? <p className="text-sm text-destructive font-body">{askError}</p> : null}

          {askReply ? (
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-3 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Assistant reply</p>
              <p className="text-sm text-foreground font-body whitespace-pre-wrap leading-relaxed">{askReply}</p>
              {askRecommendedProducts.length > 0 ? (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-semibold text-muted-foreground">Suggested products</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {askRecommendedProducts.map((p) => (
                      <ProductCard key={p.id} product={p} compact returnView="catalog" />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {lines.length > 0 ? (
          <>
            <Separator />
            <div className="flex items-center justify-between text-base">
              <span className="font-body text-muted-foreground flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Subtotal
              </span>
              <span className="font-semibold text-foreground">{formatMoney(subtotal)}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <Button
                type="button"
                variant="default"
                className="w-full font-body h-11"
                disabled={!canCheckout}
                onClick={() => setTryOnOpen(true)}
              >
                <Clock className="h-4 w-4 mr-2" />
                Try on — book fitting room
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full font-body h-11 border-secondary/50"
                disabled={!canCheckout}
                onClick={() => setSuspendOpen(true)}
              >
                <Store className="h-4 w-4 mr-2" />
                Suspend — pay at register
              </Button>
            </div>
            <p className="text-xs text-muted-foreground font-body">
              <strong className="text-foreground">Try On</strong> reserves a fitting room and stages these pieces.{" "}
              <strong className="text-foreground">Suspend</strong> creates a POS-suspended transaction so the customer
              completes payment at the register.
            </p>
          </>
        ) : null}
      </div>

      <Dialog open={tryOnOpen} onOpenChange={setTryOnOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Book a fitting room</DialogTitle>
            <DialogDescription className="font-body text-left">
              We&apos;ll hold the styles in your bag for an in-store try-on. Associates pull items to {roomLabel} for
              the time you choose.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Available times</p>
            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
              {MOCK_FITTING_SLOTS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm font-body transition-colors ${
                    selectedSlot === slot ? "border-foreground bg-foreground/5" : "border-border hover:border-foreground/30"
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setTryOnOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleTryOnBook}>
              Confirm booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Suspend for register payment</DialogTitle>
            <DialogDescription className="font-body text-left">
              Sends the current bag to POS as a <strong>suspend transaction</strong> with this total. The customer
              completes payment at the register. No payment is captured in this demo app.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm font-body">
            <p className="text-foreground font-medium">{lines.reduce((n, l) => n + l.quantity, 0)} items</p>
            <p className="text-muted-foreground">Total {formatMoney(subtotal)}</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setSuspendOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSuspendConfirm}>
              Pay at register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
