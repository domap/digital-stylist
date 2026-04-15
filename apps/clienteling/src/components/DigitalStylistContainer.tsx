import { useEffect, useMemo, useRef, useState } from "react";
import { CustomerProfile } from "@/data/customers";
import type { Product } from "@/data/products";
import { AnnTaylorPromoHero } from "@/components/AnnTaylorPromoHero";
import { fetchAssociateQuickNotes, fetchInitialSuggestions, fetchThreadSuggestions, sendStylistChat } from "@/lib/stylist-api";
import { getRuntimeChannel } from "@/lib/runtime-channel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductCard } from "@/components/ProductCard";
import { StylistSlotPicker } from "@/components/StylistSlotPicker";
import { AppointmentContext, AppointmentPayload, AppointmentSlot, type RecommendedDisplayMode } from "@/types/stylist";
import { StylistRationale } from "@/lib/stylist-rationale";
import { ChevronDown, FileText, Loader2, Mic, RefreshCcw, Send, ShoppingCart, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useShoppingBag } from "@/hooks/useShoppingBag";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { speakPlainText, stripForSpeech } from "@/lib/voice";
import { refineVoiceTranscriptToIntent } from "@/lib/voice-intent";

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  products?: Product[];
  recommendedDisplayMode?: RecommendedDisplayMode;
  completeTheLookUrl?: string;
  appointment?: AppointmentPayload;
  /** Tap-to-send lines for this turn (clarification answers). */
  quickReplies?: string[];
  /** Associate console: contextual cross-sell / upsell prompts for this turn (after results). */
  contextualSuggestions?: string[];
}

interface DigitalStylistContainerProps {
  customer: CustomerProfile | null;
  /** Catalog rows from GET /api/v1/catalog/products (same-origin proxy). */
  products: Product[];
  guestId?: string | null;
  /** Shown in the welcome message after “Hello” (e.g. associate first name). */
  associateName?: string;
  onItemsTriedChange?: (params: { customerId: string; productIds: string[] }) => void;
}

const MAX_QUICK_PROMPTS = 3;

function AssociateSuggestionChips({
  loading,
  chips,
  onPick,
  label,
}: {
  loading: boolean;
  chips: string[];
  onPick: (text: string) => void;
  label?: string;
}) {
  if (loading) {
    return <div className="text-xs text-muted-foreground px-1 py-2">Loading suggested prompts…</div>;
  }
  const visible = chips.slice(0, MAX_QUICK_PROMPTS);
  if (!visible.length) return null;
  return (
    <div className="space-y-1.5">
      {label ? (
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">{label}</p>
      ) : null}
      <div className="flex flex-col gap-2">
        {visible.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="w-full text-left rounded-xl border border-border bg-white px-4 py-3 text-xs font-medium leading-snug touch-target hover:border-black transition-colors"
            onClick={() => onPick(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DigitalStylistContainer({
  customer,
  products: catalogProducts,
  guestId,
  associateName,
  onItemsTriedChange,
}: DigitalStylistContainerProps) {
  const [input, setInput] = useState("");
  const { addLine, lines: bagLines } = useShoppingBag();
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [contextualSuggestions, setContextualSuggestions] = useState<string[]>([]);
  const customerKey = customer?.id ?? (guestId ? `guest:${guestId}` : "guest");
  const storageKey = `digitalStylist.state.${customerKey}`;
  const tryOnStorageKey = `digitalStylist.tryOn.${customerKey}`;
  const [associateNotes, setAssociateNotes] = useState<string>("");
  const [isLoadingAssociateNotes, setIsLoadingAssociateNotes] = useState(false);
  const [showQuickNotes, setShowQuickNotes] = useState(false);
  const [taskQuickNotes, setTaskQuickNotes] = useState<string>("");
  const [taskPromptChips, setTaskPromptChips] = useState<string[] | null>(null);
  const [taskTryOnProductIds, setTaskTryOnProductIds] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string>(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  });
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true);
  const [isLoadingThreadChips, setIsLoadingThreadChips] = useState(false);
  /** True while the stylist API call for this turn is in flight (show thinking UI). */
  const [isAwaitingStylistReply, setIsAwaitingStylistReply] = useState(false);
  const speakAssistantAfterNextReplyRef = useRef(false);
  const [voiceRefining, setVoiceRefining] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  /** Tracks prior `customerKey` so we can tell a real customer switch from first mount / same customer. */
  const prevCustomerKeyRef = useRef<string | null>(null);
  const prevSuggestionsCustomerKeyRef = useRef(customerKey);
  /** Avoid writing the previous customer's messages under the new `storageKey` in the same effect flush as `resetSession`. */
  const skipNextPersistRef = useRef(false);
  const channel = getRuntimeChannel();

  const customerName = useMemo(() => customer?.name ?? "", [customer?.name]);
  /** Hide try-on staging for SKUs already in the bag (customer-led only). Associates keep try-ons visible for context even when staged into the bag. */
  const bagProductIds = useMemo(() => new Set(bagLines.map((l) => l.productId)), [bagLines]);
  const taskTryOnProducts = useMemo(() => {
    const ids = taskTryOnProductIds ?? [];
    const picked = ids.map((id) => catalogProducts.find((p) => p.id === id)).filter(Boolean) as Product[];
    const forAssociate = channel === "associate_console";
    const visible = forAssociate ? picked : picked.filter((p) => !bagProductIds.has(p.id));
    return visible.slice(0, 6);
  }, [taskTryOnProductIds.join("|"), bagProductIds, channel, catalogProducts]);
  /** After the associate sends at least one message, quick prompts follow the thread instead of profile-only openers. */
  const hasAssociateTurns = useMemo(() => messages.some((m) => m.role === "user"), [messages]);

  const profileQuickPrompts = channel === "associate_console" && !hasAssociateTurns;
  const quickPromptChips =
    channel === "associate_console" && taskPromptChips && taskPromptChips.length > 0
      ? taskPromptChips
      : profileQuickPrompts
        ? suggestions
        : channel === "associate_console"
          ? contextualSuggestions.length > 0
            ? contextualSuggestions
            : suggestions
          : [];
  const quickPromptsLoading =
    channel === "associate_console" &&
    !(taskPromptChips && taskPromptChips.length > 0) &&
    (profileQuickPrompts
      ? isLoadingSuggestions
      : contextualSuggestions.length === 0 && isLoadingThreadChips);

  useEffect(() => {
    if (channel !== "associate_console") return;
    if (!messages.some((m) => m.role === "user")) return;
    const hist = messages.map((m) => ({ role: m.role, content: m.content }));
    setIsLoadingThreadChips(true);
    const tryOn = taskTryOnProductIds.filter(Boolean);
    fetchThreadSuggestions(customer?.id, hist, tryOn.length ? tryOn : undefined)
      .then((data) => setContextualSuggestions(data.suggestions ?? []))
      .catch(() => {})
      .finally(() => setIsLoadingThreadChips(false));
    // Intentionally omits `messages` from deps: refresh thread chips when staged try-ons change, using latest thread on that render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, customerKey, customer?.id, taskTryOnProductIds.join("|")]);

  useEffect(() => {
    const keyChanged = prevSuggestionsCustomerKeyRef.current !== customerKey;
    prevSuggestionsCustomerKeyRef.current = customerKey;
    if (keyChanged) {
      setSuggestions([]);
      setContextualSuggestions([]);
    }
    setIsLoadingThreadChips(false);
    setIsLoadingSuggestions(true);
    // On context switch, skip try-ons for this fetch — sibling effects clear and reload staged IDs from storage.
    const tryOn = (keyChanged ? [] : taskTryOnProductIds).filter(Boolean);
    fetchInitialSuggestions(customer?.id, tryOn.length ? tryOn : undefined)
      .then((data) => setSuggestions(data.suggestions ?? []))
      .catch(() => setSuggestions([]))
      .finally(() => setIsLoadingSuggestions(false));
  }, [customerKey, customer?.id, taskTryOnProductIds.join("|")]);

  useEffect(() => {
    setAssociateNotes("");
    setIsLoadingAssociateNotes(true);
    fetchAssociateQuickNotes(customer?.id)
      .then((data) => setAssociateNotes(data.notes ?? ""))
      .catch(() => setAssociateNotes(""))
      .finally(() => setIsLoadingAssociateNotes(false));
  }, [customerKey]);

  useEffect(() => {
    // Collapse notes when customer context changes (including unique guest).
    setShowQuickNotes(false);
    setTaskQuickNotes("");
    setTaskPromptChips(null);
    setTaskTryOnProductIds([]);
  }, [customerKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(tryOnStorageKey);
      if (!raw) return;
      const ids = JSON.parse(raw) as string[];
      if (Array.isArray(ids) && ids.length) setTaskTryOnProductIds(ids.filter(Boolean));
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryOnStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (taskTryOnProductIds.length) window.localStorage.setItem(tryOnStorageKey, JSON.stringify(taskTryOnProductIds));
      else window.localStorage.removeItem(tryOnStorageKey);
    } catch {
      // ignore
    }
  }, [taskTryOnProductIds, tryOnStorageKey]);

  useEffect(() => {
    if (!customer?.id) return;
    if (!taskTryOnProductIds.length) return;
    onItemsTriedChange?.({ customerId: customer.id, productIds: taskTryOnProductIds });
  }, [customer?.id, onItemsTriedChange, taskTryOnProductIds.join("|")]);

  const resetSession = () => {
    if (typeof window !== "undefined") window.localStorage.removeItem(storageKey);
    const nextSessionId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setSessionId(nextSessionId);
    setMessages([]);
    messagesRef.current = [];
    setInput("");
    setContextualSuggestions([]);
    setIsLoadingThreadChips(false);
    setIsAwaitingStylistReply(false);
  };

  // Restore (or start) the stylist session for this customer.
  useEffect(() => {
    const switched =
      prevCustomerKeyRef.current !== null && prevCustomerKeyRef.current !== customerKey;
    prevCustomerKeyRef.current = customerKey;

    if (switched) {
      skipNextPersistRef.current = true;
      resetSession();
      return;
    }

    const saved = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { sessionId?: string; messages?: ChatMessage[] };
        if (parsed.sessionId) setSessionId(parsed.sessionId);
        if (Array.isArray(parsed.messages)) {
          setMessages(parsed.messages);
          const hist = parsed.messages.map((m) => ({ role: m.role, content: m.content }));
          if (channel === "associate_console" && hist.some((t) => t.role === "user")) {
            setIsLoadingThreadChips(true);
            fetchThreadSuggestions(
              customer?.id,
              hist,
              taskTryOnProductIds.filter(Boolean).length ? taskTryOnProductIds.filter(Boolean) : undefined,
            )
              .then((data) => setContextualSuggestions(data.suggestions ?? []))
              .catch(() => setContextualSuggestions([]))
              .finally(() => setIsLoadingThreadChips(false));
          }
        }
        setInput("");
        return;
      } catch {
        // If parsing fails, fall back to a fresh session.
      }
    }

    resetSession();
  }, [storageKey, customer?.id, channel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAwaitingStylistReply]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    // Persist state so route changes (e.g. PDP) keep the conversation context.
    if (typeof window === "undefined") return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        sessionId,
        messages,
      })
    );
  }, [storageKey, sessionId, messages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === "digitalStylist.endSession" && e.newValue) {
        window.localStorage.removeItem("digitalStylist.endSession");
        resetSession();
      }
    };
    const onEndSession = () => resetSession();
    window.addEventListener("storage", onStorage);
    window.addEventListener("digitalStylist:end-session", onEndSession as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("digitalStylist:end-session", onEndSession as EventListener);
    };
  }, []);

  const sendMessage = async (value?: string, appointmentContext?: AppointmentContext) => {
    const messageText = (value ?? input).trim();
    if (!messageText && !appointmentContext) return;
    const finalMessage = messageText || "Book appointment";

    const userMessage: ChatMessage = { id: `${Date.now()}-u`, role: "user", content: finalMessage };
    const nextMessages = [...messagesRef.current, userMessage];
    setMessages(nextMessages);
    messagesRef.current = nextMessages;
    setInput("");
    setIsAwaitingStylistReply(true);
    if (channel === "associate_console") {
      setIsLoadingThreadChips(true);
    }

    try {
      const response = await sendStylistChat({
        message: finalMessage,
        channel,
        mode: channel === "associate_console" ? "clienteling" : "customer_led",
        customerId: customer?.id,
        sessionId,
        history: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        ...(appointmentContext ? { appointmentContext } : {}),
      });
      if (channel === "associate_console") {
        setContextualSuggestions(response.contextualSuggestions ?? []);
        setIsLoadingThreadChips(false);
      }
      const recommended =
        response.appointment && Object.keys(response.appointment).length > 0
          ? []
          : catalogProducts.filter((product) => response.recommendedProductIds.includes(product.id));
      const ctx =
        channel === "associate_console" && response.contextualSuggestions?.length
          ? response.contextualSuggestions
          : undefined;
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-a`,
          role: "assistant",
          content: response.reply,
          products: recommended.length > 0 ? recommended : undefined,
          recommendedDisplayMode: response.recommendedDisplayMode,
          completeTheLookUrl: response.appointment ? undefined : response.completeTheLookUrl,
          appointment: response.appointment,
          quickReplies: response.quickReplies?.length ? response.quickReplies : undefined,
          contextualSuggestions: ctx,
        },
      ]);
      if (speakAssistantAfterNextReplyRef.current) {
        speakAssistantAfterNextReplyRef.current = false;
        queueMicrotask(() => speakPlainText(stripForSpeech(response.reply)));
      }
      setIsAwaitingStylistReply(false);
    } catch (e) {
      speakAssistantAfterNextReplyRef.current = false;
      if (channel === "associate_console") {
        setIsLoadingThreadChips(false);
      }
      const detail = e instanceof Error ? e.message.trim() : "";
      const quotaHint =
        detail && /429|quota|RESOURCE_EXHAUSTED|rate limit|billing|Exceeded/i.test(detail)
          ? "\n\nThis usually means the LLM provider rejected the call (quota, billing, or rate limit)—not that orchestration is down. Check API keys and Gemini/OpenAI limits."
          : "";
      const intro =
        channel === "associate_console"
          ? "The assistant could not complete that turn. You can keep helping the client from the rack meanwhile."
          : "I’m having trouble with that request right now.";
      const maxLen = channel === "associate_console" ? 2200 : 900;
      const body =
        detail.length > 0
          ? `${intro}\n\n${detail.slice(0, maxLen)}${detail.length > maxLen ? "…" : ""}${quotaHint}`
          : `${intro}${quotaHint}`;
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-e`,
          role: "assistant",
          content: body,
        },
      ]);
      setIsAwaitingStylistReply(false);
    }
  };

  const toggleSelect = (p: Product) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
  };

  const clearSelection = () => setSelectedProductIds(new Set());

  const addSelectedToCart = (available: Product[]) => {
    const picked = available.filter((p) => selectedProductIds.has(p.id));
    if (picked.length === 0) return;
    let added = 0;
    for (const p of picked) {
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
        fulfillment: "online",
      });
      added += 1;
    }
    toast.success("Added to cart", {
      description: `${added} item(s) added. (Defaults: first size + first color)`,
    });
    clearSelection();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("stylist.pending_appointment_request");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as { brand?: "AnnTaylor" | "Loft"; productName?: string };
      window.localStorage.removeItem("stylist.pending_appointment_request");
      sendMessage(
        `Show stylist appointment options for ${payload.brand ?? "AnnTaylor"} ${payload.productName ? `for ${payload.productName}` : ""}`.trim(),
        { action: "list_available_slots", brand: payload.brand ?? "AnnTaylor" }
      );
    } catch {
      window.localStorage.removeItem("stylist.pending_appointment_request");
    }
    // Run only once on mount for this container instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("stylist.pending_fitting_room_help");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as {
        customerId: string | null;
        guestId?: string | null;
        reservationId: string | null;
        slotLabel: string | null;
        totalCost: number | null;
        productIds: string[];
      };
      window.localStorage.removeItem("stylist.pending_fitting_room_help");

      const names = (payload.productIds ?? [])
        .map((id) => catalogProducts.find((p) => p.id === id)?.name ?? id)
        .slice(0, 10)
        .join("; ");
      const who = customerName ? customerName : "Guest";
      const ctx =
        `Fitting room request accepted\n` +
        `Customer: ${who}\n` +
        `Reservation: ${payload.reservationId ?? "n/a"}\n` +
        `Time: ${payload.slotLabel ?? "n/a"}\n` +
        `Items: ${names || "n/a"}\n` +
        `Total: ${payload.totalCost ?? "n/a"}`;

      // Do NOT auto-send cross-sell/recommendations into chat. Put context into Quick Notes
      // and show curated prompts so the associate chooses next steps.
      setTaskQuickNotes(ctx);
      setTaskTryOnProductIds(payload.productIds ?? []);
      const picked = (payload.productIds ?? [])
        .map((id) => catalogProducts.find((p) => p.id === id))
        .filter(Boolean)
        .slice(0, 6);
      const itemLabel = picked.length ? picked.map((p) => p!.name).join("; ") : names || "these items";
      const categories = [...new Set(picked.map((p) => p!.category).filter(Boolean))].slice(0, 3);
      const catLabel = categories.length ? categories.join(", ") : "the looks";

      setTaskPromptChips([
        `Confirm fit + sizing for: ${itemLabel}`,
        `Pull 1 alternate size/color per item for: ${itemLabel}`,
        `Suggest 2 add-ons that complete ${catLabel} (shoes/bag/jewelry)`,
        `Create a quick try-on plan for: ${itemLabel}`,
        `If one item misses, swap in 2 close alternatives within ${catLabel}`,
      ]);
      setShowQuickNotes(true);
    } catch {
      window.localStorage.removeItem("stylist.pending_fitting_room_help");
    }
    // Run only once on mount for this container instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBookSlot = (slot: AppointmentSlot, brand: "AnnTaylor" | "Loft") => {
    sendMessage(`Book ${slot.name} ${slot.date} ${slot.time_slot}`, {
      action: "book_appointment",
      brand,
      stylist_id: slot.stylist_id,
      slot: { date: slot.date, time_slot: slot.time_slot },
    });
  };

  const handleShowMoreSlots = (brand: "AnnTaylor" | "Loft") => {
    sendMessage(`Show more ${brand} appointment slots`, {
      action: "list_available_slots",
      brand,
    });
  };

  return (
    <div className="h-full bg-transparent flex flex-col transition-all duration-300">
      <header className="ios-surface rounded-2xl px-6 py-4 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Store AI Assistant</h2>
            <p className="text-sm text-muted-foreground">
              {customerName
                ? `Helping you support ${customerName} on the floor`
                : "Select a client to unlock profile-based prompts and quick notes"}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <Button variant="outline" size="sm" className="touch-target" onClick={() => setShowQuickNotes(true)}>
              <FileText className="h-4 w-4 mr-2" />
              Quick Notes
            </Button>
            <Button variant="outline" size="sm" className="touch-target" onClick={resetSession}>
              <RefreshCcw className="h-4 w-4 mr-2" />
              New
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4 relative">
        {/* Quick Notes panel */}
        <div
          className={`absolute z-40 right-4 top-2 w-[360px] max-w-[calc(100%-2rem)] rounded-2xl ios-surface transition-all duration-200 ${
            showQuickNotes ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4 pointer-events-none"
          }`}
          role="dialog"
          aria-label="Quick Notes"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              Quick Notes
            </div>
            <button
              type="button"
              className="h-8 w-8 rounded-md hover:bg-muted/60 flex items-center justify-center"
              onClick={() => setShowQuickNotes(false)}
              title="Close"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="px-4 py-3">
            {taskQuickNotes ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active task context</p>
                  <p className="text-sm whitespace-pre-wrap text-foreground mt-1">{taskQuickNotes}</p>
                </div>
                <div className="h-px bg-border" />
              </div>
            ) : null}

            {isLoadingAssociateNotes ? (
              <p className="text-sm text-muted-foreground">Summarizing her profile for you…</p>
            ) : associateNotes ? (
              <p className="text-sm whitespace-pre-wrap text-foreground">{associateNotes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {customerName ? "No quick notes available yet." : "Guest customer — select a customer for personalized notes."}
              </p>
            )}
          </div>
        </div>

        {taskTryOnProducts.length > 0 ? (
          <div className="ios-card px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Try-on items</p>
                <p className="text-sm text-foreground font-body mt-1">
                  Selected for the fitting room — tap a card to view details.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                {channel === "associate_console" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    title="Remove staged try-on list (does not change the shopping bag)"
                    onClick={() => {
                      setTaskTryOnProductIds([]);
                      toast.success("Try-on list cleared");
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear try-on
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setShowQuickNotes(true)}>
                  <FileText className="h-4 w-4 mr-2" />
                  Quick Notes
                </Button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {taskTryOnProducts.map((p) => (
                <div key={p.id} className="relative">
                  <ProductCard product={p} compact returnView="stylist" />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="absolute top-2 right-2 h-9 w-9 bg-background/95 backdrop-blur"
                    title="Add to cart"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const size = p.sizes?.[0] ?? "";
                      const color = p.colors?.[0] ?? "";
                      if (!size || !color) {
                        toast.error("Missing size/color for this item.");
                        return;
                      }
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
                      toast.success("Added to cart", { description: p.name });
                    }}
                  >
                    <ShoppingCart className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : channel !== "associate_console" && taskTryOnProductIds.length > 0 && taskTryOnProducts.length === 0 ? (
          <div className="ios-card px-5 py-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Try-on list is staged but all items are already in the bag — clear to dismiss.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              title="Remove staged try-on list (does not change the shopping bag)"
              onClick={() => {
                setTaskTryOnProductIds([]);
                toast.success("Try-on list cleared");
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear try-on
            </Button>
          </div>
        ) : null}

        {messages.length === 0 && (
          <div className="w-full max-w-2xl mr-auto space-y-4 text-left">
            <div className="ios-card p-0 overflow-hidden border border-border shadow-sm">
              <AnnTaylorPromoHero className="rounded-none border-0 shadow-none" />
              <div className="px-4 py-3 bg-card border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Quick asks for this assistant (you → AI)
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="h-9 px-3 rounded-full bg-[#1a2b4a] text-white text-[11px] font-semibold font-body touch-target hover:opacity-95 transition-opacity"
                    onClick={() =>
                      sendMessage(
                        "List Ann Taylor stylist appointment options I can offer my client today, with how to position each slot."
                      )
                    }
                  >
                    Stylist slots to offer
                  </button>
                  <button
                    type="button"
                    className="h-9 px-3 rounded-full bg-[#1a2b4a] text-white text-[11px] font-semibold font-body touch-target hover:opacity-95 transition-opacity"
                    onClick={() =>
                      sendMessage(
                        "Give me a tight talking track for the valued-client offer: how I introduce it, what she saves, and how it pairs with a styling session—without sounding pushy."
                      )
                    }
                  >
                    Valued-client offer script
                  </button>
                  <button
                    type="button"
                    className="h-9 px-3 rounded-full bg-[#1a2b4a] text-white text-[11px] font-semibold font-body touch-target hover:opacity-95 transition-opacity"
                    onClick={() =>
                      sendMessage(
                        customerName
                          ? `Pull new arrivals that match ${customerName}'s profile and the notes you see—prioritize pieces I can pull from the floor now.`
                          : "Pull new arrivals I should highlight for an in-store client once I learn her size and palette—give me a short rack order."
                      )
                    }
                  >
                    New arrivals for her
                  </button>
                </div>
              </div>
            </div>

            <div className={`ios-card px-6 py-5 ${channel === "associate_console" ? "text-left" : "text-center"}`}>
              <p className="text-sm leading-relaxed">
                Hello{associateName ? `, ${associateName}` : ""}! I’m your Store AI Assistant. Ask me anything to help you
                serve {customerName ? <strong>{customerName}</strong> : "your client"}—sizing angles, outfit builds, what to
                say on the floor, or next-step prompts you can use with her.
              </p>
            </div>
            {channel === "associate_console" ? (
              <AssociateSuggestionChips
                loading={quickPromptsLoading}
                chips={quickPromptChips}
                onPick={(text) => sendMessage(text)}
              />
            ) : null}
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex w-full min-w-0 ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`rounded-2xl px-4 py-3 text-sm max-w-[min(42rem,90%)] ${
                message.role === "user"
                  ? "bg-black/90 text-white shadow-sm ml-auto text-left"
                  : "ios-card mr-auto text-left"
              }`}
            >
              {message.role === "user" ? (
                <div className="whitespace-pre-wrap">{message.content}</div>
              ) : message.appointment ? (
                <>
                  <StylistRationale content={message.content} />
                  <div className="mt-3">
                    <StylistSlotPicker
                      appointment={message.appointment}
                      onBookSlot={(slot) => handleBookSlot(slot, message.appointment?.brand ?? "AnnTaylor")}
                      onShowMore={() => handleShowMoreSlots(message.appointment?.brand ?? "AnnTaylor")}
                    />
                  </div>
                </>
              ) : message.products && message.products.length > 0 ? (
                <>
                  {message.recommendedDisplayMode === "full_outfit" ? (
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Complete look
                    </p>
                  ) : null}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {message.products.map((p) => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        compact
                        returnView="stylist"
                        selectable={channel === "associate_console"}
                        selected={selectedProductIds.has(p.id)}
                        onToggleSelect={toggleSelect}
                      />
                    ))}
                  </div>
                  {channel === "associate_console" ? (
                    <div className="mt-3 flex items-center justify-end gap-2 border-t border-dashed border-border/70 pt-3">
                      <Button
                        type="button"
                        size="icon"
                        className="h-9 w-9"
                        disabled={selectedProductIds.size === 0}
                        onClick={() => addSelectedToCart(message.products ?? [])}
                        title={`Add ${selectedProductIds.size} selected item(s) to cart`}
                      >
                        <div className="relative">
                          <ShoppingCart className="h-4 w-4" />
                          {selectedProductIds.size > 0 ? (
                            <span className="absolute -top-2 -right-2 h-4 min-w-4 rounded-full bg-background text-foreground border border-border px-1 text-[10px] leading-[14px] font-semibold tabular-nums text-center">
                              {selectedProductIds.size > 9 ? "9+" : selectedProductIds.size}
                            </span>
                          ) : null}
                        </div>
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-9 w-9"
                        disabled={selectedProductIds.size === 0}
                        onClick={clearSelection}
                        title="Clear selection"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                  {channel === "associate_console" && message.contextualSuggestions && message.contextualSuggestions.length > 0 ? (
                    <div className="mt-3 pt-3 border-t border-dashed border-border/70">
                      <AssociateSuggestionChips
                        loading={false}
                        chips={message.contextualSuggestions}
                        onPick={(text) => sendMessage(text)}
                        label="Ideas for you and your client"
                      />
                    </div>
                  ) : null}
                  <details className="mt-3 rounded-lg border border-border bg-muted/10 overflow-hidden open:shadow-sm open:[&_summary_.chevron-ico]:rotate-180">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                      <span>Why these recommendations & styling notes</span>
                      <ChevronDown className="chevron-ico h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
                    </summary>
                    <div className="max-h-[min(70vh,32rem)] overflow-y-auto border-t border-border bg-card px-3 py-3 text-sm text-foreground">
                      <StylistRationale content={message.content} productIds={message.products?.map((p) => p.id)} />
                    </div>
                  </details>
                </>
              ) : (
                <StylistRationale content={message.content} />
              )}
              {message.role === "assistant" &&
              channel === "associate_console" &&
              (!message.products || message.products.length === 0) &&
              message.contextualSuggestions &&
              message.contextualSuggestions.length > 0 ? (
                <div className="mt-3 pt-3 border-t border-dashed border-border/70">
                  <AssociateSuggestionChips
                    loading={false}
                    chips={message.contextualSuggestions}
                    onPick={(text) => sendMessage(text)}
                    label="Suggested next steps"
                  />
                </div>
              ) : null}
              {message.role === "assistant" && message.quickReplies && message.quickReplies.length > 0 ? (
                <div className="mt-3 flex flex-col gap-2">
                  {message.quickReplies.slice(0, MAX_QUICK_PROMPTS).map((qr) => (
                    <button
                      key={qr}
                      type="button"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-medium text-left touch-target hover:border-foreground/40 transition-colors"
                      onClick={() => sendMessage(qr)}
                    >
                      {qr}
                    </button>
                  ))}
                </div>
              ) : null}
              {message.role === "assistant" && message.completeTheLookUrl ? (
                <div className="mt-3 pt-3 border-t border-border">
                  <a
                    href={message.completeTheLookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-md border border-foreground bg-foreground px-3 py-2 text-xs font-semibold text-background hover:opacity-90 transition-opacity"
                  >
                    Complete the look — open outfit app
                  </a>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Opens your connected styling workspace with this session and the recommended styles.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {isAwaitingStylistReply ? (
          <div className="flex w-full min-w-0 justify-start animate-in fade-in-0 duration-300">
            <div className="ios-card max-w-sm mr-auto rounded-2xl px-5 py-4 flex items-center gap-4 border border-border/80">
              <Loader2 className="h-10 w-10 shrink-0 text-muted-foreground animate-spin" aria-hidden />
              <div>
                <p className="text-sm font-medium text-foreground font-display">Working on it</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {channel === "associate_console"
                    ? "Drafting a reply and rack ideas you can use with your client…"
                    : "Finding the best styles and reply…"}
                </p>
              </div>
            </div>
          </div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      <div className="sticky bottom-0 ios-surface rounded-2xl p-4 mt-2">
        <div className="flex w-full justify-start">
          <form
            className="flex w-full min-w-0 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isAwaitingStylistReply || voiceRefining || voiceListening}
              placeholder={
                channel === "associate_console"
                  ? customerName
                    ? `Ask as the associate (about ${customerName}) — e.g. “Suggest two work outfits she can try now…”`
                    : "Ask the assistant to coach your floor conversation or rack pull for this guest…"
                  : customerName
                    ? `Ask your stylist for ${customerName} — occasions, pairings, sizes, or a full look refresh…`
                    : "Ask your Stylist — occasions, pairings, sizes, or a full look refresh…"
              }
              className="h-11 flex-1 min-w-0"
            />
            <VoiceInputButton
              disabled={isAwaitingStylistReply || voiceRefining}
              onListeningChange={setVoiceListening}
              onTranscript={(raw) => {
                void (async () => {
                  setVoiceRefining(true);
                  try {
                    const refined = await refineVoiceTranscriptToIntent(raw, "clienteling");
                    speakAssistantAfterNextReplyRef.current = true;
                    await sendMessage(refined);
                  } finally {
                    setVoiceRefining(false);
                  }
                })();
              }}
            />
            <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={isAwaitingStylistReply || voiceRefining || voiceListening}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
          {(voiceListening || voiceRefining) && (
            <div className="mt-2 flex items-start gap-2 text-xs text-muted-foreground font-body" role="status" aria-live="polite">
              {voiceRefining ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 mt-0.5 animate-spin" aria-hidden />
              ) : (
                <Mic className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-70" aria-hidden />
              )}
              <span>
                {voiceRefining
                  ? "Processing voice — refining what you said, then sending to the assistant."
                  : "Listening — speak naturally; pause briefly when you’re done, or tap the mic to stop."}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
