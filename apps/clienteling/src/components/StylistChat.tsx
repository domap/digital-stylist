import { useEffect, useRef, useState } from "react";
import type { Product } from "@/data/products";
import { CustomerProfile } from "@/data/customers";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Mic, Send, Sparkles, Bot, User } from "lucide-react";
import { sendStylistChat } from "@/lib/stylist-api";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { speakPlainText, stripForSpeech } from "@/lib/voice";
import { refineVoiceTranscriptToIntent } from "@/lib/voice-intent";
import { getRuntimeChannel } from "@/lib/runtime-channel";
import type { RecommendedDisplayMode } from "@/types/stylist";

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  products?: Product[];
  recommendedDisplayMode?: RecommendedDisplayMode;
  timestamp: Date;
}

interface StylistChatProps {
  customer: CustomerProfile | null;
  products: Product[];
}

const quickSuggestions = [
  "Office outfits",
  "Date night looks",
  "Birthday party",
  "Family gathering",
  "Destination wedding",
  "Travel & tours",
  "Weekend brunch",
  "Power suiting",
];

export function StylistChat({ customer, products: catalogProducts }: StylistChatProps) {
  const channel = getRuntimeChannel();
  const interactionMode = channel === "associate_console" ? "associate_led" : "customer_led";
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: customer
        ? `Welcome! ${interactionMode === "associate_led" ? "Associate-led mode is active." : "Customer-led mode is active."} I see ${customer.name} is here today. What occasion or look are we styling for?`
        : "Welcome! I'm your Store AI Assistant. Select a customer for profile-aware guidance or start with an occasion.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const speakAssistantAfterNextReplyRef = useRef(false);
  const [voiceRefining, setVoiceRefining] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (customer) {
      setMessages([
        {
          id: "welcome-" + customer.id,
          role: "assistant",
          content: `I have ${customer.name}'s profile loaded — she's a ${customer.tier} member who loves ${customer.stylePreferences.join(", ")} styles in ${customer.colorPreferences.slice(0, 3).join(", ")}. Size ${customer.preferredSize}, ${customer.preferredFit} fit.${customer.upcomingEvents.length ? ` She has a ${customer.upcomingEvents[0].name} on ${customer.upcomingEvents[0].date}.` : ""} What are we looking for today?`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [customer, channel, interactionMode]);

  const handleSend = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const historyForApi = [...messages.map((m) => ({ role: m.role, content: m.content })), { role: "user" as const, content: messageText }];
      const response = await sendStylistChat({
        message: messageText,
        channel,
        customerId: customer?.id,
        history: historyForApi,
      });
      const recommended = catalogProducts.filter((product) => response.recommendedProductIds.includes(product.id));
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.reply,
        products: recommended,
        recommendedDisplayMode: response.recommendedDisplayMode,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      if (speakAssistantAfterNextReplyRef.current) {
        speakAssistantAfterNextReplyRef.current = false;
        queueMicrotask(() => speakPlainText(stripForSpeech(response.reply)));
      }
    } catch (err) {
      speakAssistantAfterNextReplyRef.current = false;
      const detail = err instanceof Error ? err.message.trim() : "";
      const hint =
        detail && /429|quota|RESOURCE_EXHAUSTED|rate limit|billing/i.test(detail)
          ? "\n\n(LLM quota or billing is a common cause—check your API keys.)"
          : "";
      const msg = detail
        ? `The stylist API returned an error.\n\n${detail.slice(0, 1400)}${detail.length > 1400 ? "…" : ""}${hint}`
        : "I could not reach the stylist API. Make sure orchestration (port 3000) and the Python worker are running.";
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: msg,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSuggestProduct = (product: Product) => {
    const msg: ChatMessage = {
      id: Date.now().toString(),
      role: "assistant",
      content: customer
        ? `I think ${customer.name} would absolutely love the ${product.name}. It's $${product.price} and fits her ${customer.stylePreferences[0]?.toLowerCase()} style perfectly. Available in size ${customer.preferredSize}.`
        : `The ${product.name} is a wonderful choice at $${product.price}. ${product.description}`,
      products: [product],
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, msg]);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center gap-2.5 p-4 border-b border-border">
        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-secondary-foreground" />
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground">Store AI Assistant</h3>
          <p className="text-xs text-muted-foreground">AI-powered style recommendations</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 chat-scroll">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""} animate-fade-in-up`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
              msg.role === "assistant" ? "bg-secondary/10" : "bg-primary"
            }`}>
              {msg.role === "assistant" ? (
                <Bot className="h-3.5 w-3.5 text-secondary" />
              ) : (
                <User className="h-3.5 w-3.5 text-primary-foreground" />
              )}
            </div>
            <div className={`max-w-[85%] space-y-2 ${msg.role === "user" ? "items-end" : ""}`}>
              <div className={`rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted text-foreground rounded-bl-md"
              }`}>
                {msg.content}
              </div>
              {msg.products && msg.products.length > 0 && (
                <div className="space-y-2 mt-2">
                  {msg.recommendedDisplayMode === "full_outfit" ? (
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                      Complete look
                    </p>
                  ) : null}
                  {msg.products.map((p) => (
                    <ProductCard key={p.id} product={p} compact onSuggest={handleSuggestProduct} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-2.5 animate-fade-in-up">
            <div className="w-7 h-7 rounded-full bg-secondary/10 flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-secondary" />
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full typing-dot"></span>
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full typing-dot"></span>
              <span className="w-2 h-2 bg-muted-foreground/50 rounded-full typing-dot"></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick suggestions */}
      <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto">
        {quickSuggestions.map((s) => (
          <button
            key={s}
            onClick={() => handleSend(s)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground hover:border-secondary/50 transition-colors font-body"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isTyping || voiceRefining || voiceListening}
            placeholder="Ask about styles, occasions, outfits..."
            className="flex-1 font-body text-sm"
          />
          <VoiceInputButton
            disabled={isTyping || voiceRefining}
            onListeningChange={setVoiceListening}
            onTranscript={(raw) => {
              void (async () => {
                setVoiceRefining(true);
                try {
                  const refined = await refineVoiceTranscriptToIntent(raw, "clienteling");
                  speakAssistantAfterNextReplyRef.current = true;
                  await handleSend(refined);
                } finally {
                  setVoiceRefining(false);
                }
              })();
            }}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || voiceRefining || voiceListening}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
        {(voiceListening || voiceRefining) && (
          <div className="mt-2 flex items-start gap-2 text-xs text-muted-foreground font-body px-0" role="status" aria-live="polite">
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
    </div>
  );
}
