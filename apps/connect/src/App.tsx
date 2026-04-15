import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  checkInventory,
  classifyCheckoutIntent,
  fetchCatalog,
  fetchCustomers,
  refineVoiceTranscriptToIntent,
  reserveFittingRoom,
  sendAnnChat,
  startOtp,
  verifyOtp,
} from "@/api/stylist";
import { catalogMediaUrl, getApiBaseUrl } from "@/api/config";
import type { ApiCustomer, ApiProduct, ChatTurn, RecommendedDisplayMode } from "@/api/types";
import { ConnectExplainability } from "@/components/ConnectExplainability";
import { buildProfilePromptSuggestions } from "@/lib/profile-prompts";
import {
  RECOMMENDATION_FOLLOW_UP_CAP,
  cardsFollowUpCopy,
  dayPlanFollowUps,
} from "@/lib/recommendation-follow-ups";
import { extractMarkdownSection, extractReasoningBlocks } from "@/lib/sections";
import { speakPlainText, stripForSpeech } from "@/lib/voice";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { Bot, CalendarClock, Loader2, Mail, Mic, Send, ShoppingCart, Trash2, X } from "lucide-react";
import { Link, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";

const WELCOME_TEXT = `Hi — I'm **Ann**, your Digital Stylist. Add your email if we've shopped together before, or choose a prompt below to get started.`;

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  recommendedIds?: string[];
  recommendedDisplayMode?: RecommendedDisplayMode;
  quickReplies?: string[];
};

type CheckoutSummaryState = {
  productIds: string[];
  createdAt: string;
};

type DayGroup = {
  /** Full heading, e.g. "Day 1 — Wedding" */
  label: string;
  /** "Day 1" */
  dayTitle: string;
  /** Occasion / intent after the dash, e.g. "Wedding" */
  intent?: string;
  productNames: string[];
  block: string;
};

/** Strip accidental markdown from extracted list lines so catalog lookup works. */
function sanitizeExtractedProductName(raw: string): string {
  return (raw ?? "")
    .replace(/^\*+\s*/g, "")
    .replace(/\s*\*+$/g, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

const MAX_PICKS_PER_DAY = 4;
/** Multi-day: spread API `recommendedIds` across Day sections — enough slots for dress or top + bottom + accessories per day. */
const MULTI_DAY_IDS_PER_DAY_CAP = 8;

/** Apparel categories shown under “Outfit”; bags, jewelry, shoes → “Add-ons”. */
const CONNECT_APPAREL_DISPLAY = new Set([
  "Dresses",
  "Suiting",
  "Jumpsuits",
  "Tops",
  "Pants",
  "Skirts",
  "Knitwear",
  "Jackets",
  "Swimwear",
]);

function clientLooksLikeMultiDayItinerary(userMessage: string): boolean {
  const t = (userMessage ?? "").toLowerCase();
  if (/\b\d[\s-]*day\s+(trip|getaway|vacation|itinerary|pack|packing|visit)\b/.test(t)) return true;
  if (/\bplan\s+outfits?\s+for\b/.test(t) && /\b(day\s*\d|\d[\s-]*day)\b/.test(t)) return true;
  if (/\bday\s*\d+\b.*\bday\s*\d+\b/.test(t.replace(/\s+/g, " "))) return true;
  if (/\b(each|every|per)\s+day\b/.test(t) && /\b(outfit|look|wear|pack)\b/.test(t)) return true;
  if (
    /\b(?:for|over)\s+(?:a\s+)?\d{1,2}\s+days?\b/.test(t) &&
    /\b(outfit|outfits|look|looks|wear|pack|packing|trip|vacation|travel|clothes|what (to|should i) wear)\b/.test(t)
  ) {
    return true;
  }
  return false;
}

function clientEstimateMultiDayOutfitCount(userMessage: string): number {
  const t = (userMessage ?? "").toLowerCase();
  if (!clientLooksLikeMultiDayItinerary(userMessage)) return 1;
  const digitDay = t.match(/\b(\d{1,2})[\s-]*day\s+(trip|getaway|vacation|itinerary|pack|packing|visit)\b/);
  if (digitDay) return Math.min(7, Math.max(2, parseInt(digitDay[1] ?? "3", 10)));
  const nums = [...t.matchAll(/\bday\s*(\d+)\b/g)].map((m) => parseInt(m[1] ?? "0", 10)).filter((n) => n > 0);
  if (nums.length >= 2) return Math.min(7, Math.max(2, Math.max(...nums)));
  const forDays = t.match(/\b(?:for|over)\s+(?:a\s+)?(\d{1,2})\s+days?\b/);
  if (forDays) return Math.min(7, Math.max(2, parseInt(forDays[1] ?? "3", 10)));
  return 3;
}

function priorUserContentForAssistant(messages: UiMessage[], assistantIndex: number): string | undefined {
  for (let i = assistantIndex - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return messages[i]!.content;
  }
  return undefined;
}

/** Walk backward through user turns so a follow-up (“more casual”) still inherits an earlier “3-day trip” plan. */
function recentMultiDayPlanningUserContent(messages: UiMessage[], assistantIndex: number): string | undefined {
  for (let i = assistantIndex - 1; i >= 0; i--) {
    if (messages[i]?.role !== "user") continue;
    const c = messages[i]!.content;
    if (clientLooksLikeMultiDayItinerary(c)) return c;
  }
  return priorUserContentForAssistant(messages, assistantIndex);
}

function buildSyntheticDayGroups(
  multiDayAnchorText: string | undefined,
  recommendedIds: string[] | undefined,
  recommendedDisplayMode: RecommendedDisplayMode | undefined
): DayGroup[] {
  if (!multiDayAnchorText?.trim()) return [];
  if (recommendedDisplayMode === "full_outfit") return [];
  if (!clientLooksLikeMultiDayItinerary(multiDayAnchorText)) return [];
  const ids = (recommendedIds ?? []).filter(Boolean);
  const n = clientEstimateMultiDayOutfitCount(multiDayAnchorText);
  if (ids.length === 0) return [];
  return Array.from({ length: n }, (_, i) => ({
    label: `Day ${i + 1}`,
    dayTitle: `Day ${i + 1}`,
    intent: undefined,
    productNames: [],
    block: "",
  }));
}

function itineraryAnchorText(hint: string | undefined, assistantMarkdown: string): string {
  const h = hint?.trim() ?? "";
  if (h && clientLooksLikeMultiDayItinerary(h)) return h;
  if (clientLooksLikeMultiDayItinerary(assistantMarkdown)) return assistantMarkdown;
  return "";
}

function emptyDayGroup(dayIndex1Based: number): DayGroup {
  const t = `Day ${dayIndex1Based}`;
  return { label: t, dayTitle: t, intent: undefined, productNames: [], block: "" };
}

/**
 * Merge markdown ## Day sections, synthetic multi-day layout, and trip length so Day 2+ appear when the model only headings Day 1.
 */
function resolveConnectDayLayout(
  assistantMarkdown: string,
  itineraryHint: string | undefined,
  recommendedIds: string[] | undefined,
  recommendedDisplayMode: RecommendedDisplayMode | undefined
): { groups: DayGroup[]; syntheticDayLayout: boolean } {
  const fromMd = extractDayGroups(assistantMarkdown);
  const anchor = itineraryAnchorText(itineraryHint, assistantMarkdown);
  const tripLike = anchor.length > 0;
  const nWanted = tripLike ? clientEstimateMultiDayOutfitCount(anchor) : 1;

  if (!tripLike) {
    if (fromMd.length > 0) return { groups: fromMd, syntheticDayLayout: false };
    const syn = buildSyntheticDayGroups(itineraryHint, recommendedIds, recommendedDisplayMode);
    return { groups: syn, syntheticDayLayout: syn.length > 0 };
  }

  if (fromMd.length === 0) {
    const syn = buildSyntheticDayGroups(anchor, recommendedIds, recommendedDisplayMode);
    return { groups: syn, syntheticDayLayout: syn.length > 0 };
  }

  if (fromMd.length >= 2) {
    if (fromMd.length < nWanted) {
      const padded = [...fromMd];
      for (let i = fromMd.length; i < nWanted; i++) padded.push(emptyDayGroup(i + 1));
      return { groups: padded, syntheticDayLayout: true };
    }
    return { groups: fromMd, syntheticDayLayout: false };
  }

  // Single Day heading from the model but the shopper asked for a multi-day trip
  if (nWanted > 1) {
    const padded = [...fromMd];
    for (let i = 1; i < nWanted; i++) padded.push(emptyDayGroup(i + 1));
    return { groups: padded, syntheticDayLayout: true };
  }

  return { groups: fromMd, syntheticDayLayout: false };
}
const INTENT_RESULTS_PAGE_SIZE = 4;

/** Assign ranked IDs across days round-robin so each day gets at most `maxPerDay` items. */
function chunkIdsForDays(ids: string[], dayCount: number, maxPerDay = MAX_PICKS_PER_DAY): string[][] {
  if (dayCount <= 0) return [];
  const clean = ids.filter(Boolean);
  const out: string[][] = Array.from({ length: dayCount }, () => []);
  if (clean.length === 0) return out;
  let day = 0;
  for (const id of clean) {
    let placed = false;
    for (let t = 0; t < dayCount; t += 1) {
      const i = (day + t) % dayCount;
      if (out[i].length < maxPerDay) {
        out[i].push(id);
        day = (i + 1) % dayCount;
        placed = true;
        break;
      }
    }
    if (!placed) break;
  }
  // If we have enough IDs overall, avoid empty days by redistributing from fuller buckets.
  if (clean.length >= dayCount) {
    for (let iter = 0; iter < dayCount * 3; iter += 1) {
      const emptyIdx = out.findIndex((a) => a.length === 0);
      if (emptyIdx < 0) break;
      const donorIdx = out.reduce((best, arr, idx) => (arr.length > out[best]!.length ? idx : best), 0);
      if (donorIdx === emptyIdx || out[donorIdx]!.length <= 1) break;
      const moved = out[donorIdx]!.pop();
      if (moved) out[emptyIdx]!.push(moved);
    }
  }
  return out;
}

/**
 * Sections that appear after multi-day copy inside ## Suggestion (customer stylist template).
 * Do NOT use a generic `\n##\s` terminator — it matches stray H2s inside Suggestion and collapses Day 2/3.
 */
const POST_SUGGESTION_SECTION_START =
  /^##\s*(?:Style\s*tip|Additional\s*tips|Suggested\s*Prompt(?:\s*(?:\.\.\.|…))?)/im;

function namesFromDayBlock(block: string): string[] {
  const boldNames = Array.from(block.matchAll(/\*\*([^*\r\n]{2,120})\*\*/g))
    .map((x) => sanitizeExtractedProductName(x[1] ?? ""))
    .filter(Boolean);
  const bulletNames = Array.from(
    block.matchAll(/^\s*[-*•]\s*([^—–\-\r\n]{2,160})\s*(?:[—–-]|$)/gim)
  )
    .map((x) => sanitizeExtractedProductName(x[1] ?? ""))
    .filter(Boolean);
  return Array.from(new Set([...boldNames, ...bulletNames]));
}

function cleanIntentFragment(s: string): string {
  return (s ?? "")
    .replace(/\*+/g, "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/\s*#{1,6}\s*$/, "")
    .trim();
}

/**
 * Recognize a single trimmed line as a "Day N — intent" heading (Markdown varies by model).
 */
function parseDayHeaderLine(trimmed: string): { dayTitle: string; intent?: string } | null {
  const t = trimmed
    .replace(/\s+$/g, "")
    .replace(/^[-*•]+\s+/, "")
    .replace(/^\d+\.\s+/, "");
  let m = t.match(/^#{1,6}\s*(Day\s*\d+)(?:\s*[—–:-]\s*(.+))?$/i);
  if (m) {
    const intent = m[2] != null && String(m[2]).trim() ? cleanIntentFragment(String(m[2])) : undefined;
    return { dayTitle: m[1]!.trim(), intent };
  }
  m = t.match(/^\*{2}(Day\s*\d+)\*{2}\s*[—–:-]\s*(.+)$/i);
  if (m) return { dayTitle: m[1]!.trim(), intent: cleanIntentFragment(m[2] ?? "") };
  m = t.match(/^\*{2}(Day\s*\d+)\s*[—–:-]\s*([^*]+)\*{2}\s*$/i);
  if (m) return { dayTitle: m[1]!.trim(), intent: cleanIntentFragment(m[2] ?? "") };
  m = t.match(/^\*{2}(Day\s*\d+)\*{2}\s*$/i);
  if (m) return { dayTitle: m[1]!.trim() };
  m = t.match(/^(Day\s*\d+)\s*[—–:.]\s+(.+)$/i);
  if (m) return { dayTitle: m[1]!.trim(), intent: cleanIntentFragment(m[2] ?? "") };
  return null;
}

function findPostSuggestionLineIndex(linesArr: string[], searchFromLine: number): number {
  for (let j = searchFromLine; j < linesArr.length; j += 1) {
    if (POST_SUGGESTION_SECTION_START.test(linesArr[j]!.trim())) return j;
  }
  return linesArr.length;
}

function extractDayGroups(markdown: string): DayGroup[] {
  const text = markdown ?? "";
  const linesArr = text.split(/\r?\n/);
  const headerLineIndexes: number[] = [];

  for (let li = 0; li < linesArr.length; li += 1) {
    const parsed = parseDayHeaderLine(linesArr[li]!.trim());
    if (parsed) headerLineIndexes.push(li);
  }

  if (headerLineIndexes.length === 0) return [];

  const groups: DayGroup[] = [];
  for (let i = 0; i < headerLineIndexes.length; i += 1) {
    const headerLineIdx = headerLineIndexes[i]!;
    const parsed = parseDayHeaderLine(linesArr[headerLineIdx]!.trim())!;
    const contentStartLine = headerLineIdx + 1;
    const endExclusive =
      i + 1 < headerLineIndexes.length
        ? headerLineIndexes[i + 1]!
        : findPostSuggestionLineIndex(linesArr, headerLineIdx);
    const block = linesArr.slice(contentStartLine, endExclusive).join("\n").trim();
    const intent = parsed.intent?.trim() || undefined;
    const label = intent ? `${parsed.dayTitle} — ${intent}` : parsed.dayTitle;
    const productNames = namesFromDayBlock(block);
    groups.push({ label, dayTitle: parsed.dayTitle, intent, productNames, block });
  }
  return groups;
}

function connectUsesDayPlanUi(
  content: string,
  itineraryHint: string | undefined,
  recommendedIds: string[] | undefined,
  recommendedDisplayMode: RecommendedDisplayMode | undefined
): boolean {
  return resolveConnectDayLayout(content, itineraryHint, recommendedIds, recommendedDisplayMode).groups.length > 0;
}

function DayGroupedPicks({
  content,
  priorUserText,
  recommendedIds,
  recommendedDisplayMode,
  products,
  apiBase,
  onTryOnSelected,
  onAddSelected,
  onPrompt,
  showFollowUpSection,
}: {
  content: string;
  /** User text for trip length (prefers an earlier “N-day” message over a short follow-up). */
  priorUserText?: string;
  recommendedIds?: string[];
  recommendedDisplayMode?: RecommendedDisplayMode;
  products: ApiProduct[];
  apiBase: string;
  onTryOnSelected: (productIds: string[]) => void;
  onAddSelected: (productIds: string[]) => void;
  onPrompt: (text: string) => void;
  showFollowUpSection: boolean;
}) {
  const { groups, syntheticDayLayout } = useMemo(
    () => resolveConnectDayLayout(content, priorUserText, recommendedIds, recommendedDisplayMode),
    [content, priorUserText, recommendedIds, recommendedDisplayMode]
  );
  const explicitMaxPerDay =
    recommendedDisplayMode === "full_outfit"
      ? 12
      : groups.length > 1
        ? MULTI_DAY_IDS_PER_DAY_CAP
        : MAX_PICKS_PER_DAY;
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const dedupeProductsById = useCallback((arr: ApiProduct[]) => {
    const seen = new Set<string>();
    return arr.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, []);

  const byName = useMemo(() => {
    const m = new Map<string, ApiProduct>();
    for (const p of products) m.set(p.name.trim().toLowerCase(), p);
    return m;
  }, [products]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const norm = (s: string) =>
    (s ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const resolveName = useCallback(
    (raw: string): ApiProduct | undefined => {
      const name = sanitizeExtractedProductName(raw);
      const direct = byName.get(name.trim().toLowerCase());
      if (direct) return direct;
      const n = norm(name);
      if (n.length >= 4) {
        for (const p of products) {
          const pn = norm(p.name);
          if (pn.includes(n) || n.includes(pn)) return p;
        }
      }
      return undefined;
    },
    [byName, products]
  );

  const displayedGroups = groups;
  const isMultiDayPlan = displayedGroups.length > 1;
  const idsPerDayChunk = useMemo(() => {
    const n = displayedGroups.length;
    const total = (recommendedIds ?? []).filter(Boolean).length;
    if (n <= 0) return MAX_PICKS_PER_DAY;
    const spread = Math.ceil(total / n);
    return Math.min(MULTI_DAY_IDS_PER_DAY_CAP, Math.max(MAX_PICKS_PER_DAY, spread));
  }, [recommendedIds, displayedGroups.length]);

  const idChunks = useMemo(
    () =>
      chunkIdsForDays(
        recommendedIds ?? [],
        displayedGroups.length,
        isMultiDayPlan ? idsPerDayChunk : MAX_PICKS_PER_DAY
      ),
    [recommendedIds, displayedGroups.length, isMultiDayPlan, idsPerDayChunk]
  );

  const picksForGroup = useCallback(
    (g: DayGroup, groupIndex: number): ApiProduct[] => {
      const perDayCap = isMultiDayPlan ? Math.max(explicitMaxPerDay, idsPerDayChunk) : explicitMaxPerDay;
      const fromNames = dedupeProductsById(g.productNames.map(resolveName).filter(Boolean) as ApiProduct[]);
      if (fromNames.length > 0) {
        return fromNames.slice(0, Math.min(fromNames.length, perDayCap));
      }
      const blockMatches = dedupeProductsById(
        products.filter((p) => norm(g.block).includes(norm(p.name))) as ApiProduct[]
      );
      if (blockMatches.length > 0) {
        return blockMatches.slice(0, Math.min(blockMatches.length, perDayCap));
      }
      const chunkIds = idChunks[groupIndex] ?? [];
      if (chunkIds.length > 0) {
        const mapped = dedupeProductsById(chunkIds.map((id) => byId.get(id)).filter(Boolean) as ApiProduct[]);
        return mapped.slice(0, perDayCap);
      }
      return [];
    },
    [byId, dedupeProductsById, explicitMaxPerDay, idChunks, isMultiDayPlan, idsPerDayChunk, products, resolveName]
  );

  const allPickedIds = useMemo(() => {
    const ids: string[] = [];
    displayedGroups.forEach((g, i) => {
      for (const p of picksForGroup(g, i)) ids.push(p.id);
    });
    return Array.from(new Set(ids));
  }, [displayedGroups, picksForGroup]);

  const renderProductStrip = useCallback(
    (list: ApiProduct[]) => (
      <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
        {list.map((p) => (
          <div key={p.id} className="shrink-0 w-24">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className={`h-5 w-5 rounded border flex items-center justify-center ${
                  selected.has(p.id)
                    ? "bg-[var(--connect-accent)] text-white border-[var(--connect-accent)]"
                    : "bg-white border-neutral-300 text-transparent"
                }`}
                title={selected.has(p.id) ? "Deselect" : "Select"}
                onClick={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.id)) next.delete(p.id);
                    else next.add(p.id);
                    return next;
                  });
                }}
              >
                ✓
              </button>
            </div>
            <Link
              to={`/product/${encodeURIComponent(p.id)}`}
              className="block rounded-xl border border-neutral-200 bg-white hover:border-[var(--connect-accent)] transition-colors"
            >
              <div className="aspect-[3/4] rounded-t-xl overflow-hidden bg-neutral-200">
                <img src={catalogMediaUrl(apiBase, p.imageAssetName)} alt={p.name} className="w-full h-full object-cover" />
              </div>
              <div className="p-2">
                <p className="text-[10px] font-semibold leading-snug line-clamp-2">{p.name}</p>
              </div>
            </Link>
          </div>
        ))}
      </div>
    ),
    [apiBase, selected]
  );

  if (groups.length === 0) return null;

  const anyPicks = displayedGroups.some((g, i) => picksForGroup(g, i).length > 0);
  if (!anyPicks) {
    return (
      <div className="connect-prose mt-3 border-t border-neutral-200/80 pt-3">
        <ReactMarkdown>{content}</ReactMarkdown>
        <ConnectExplainability content={content} />
      </div>
    );
  }

  const selectedAll = allPickedIds.filter((id) => selected.has(id));

  return (
    <div className="mt-3 space-y-4 border-t border-neutral-200/80 pt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Your plan by day</p>
          {isMultiDayPlan ? (
            <p className="text-[10px] text-neutral-500 mt-0.5">
              {syntheticDayLayout
                ? "Grouped by day from your trip — main pieces first, bags and shoes as add-ons."
                : "Each block matches the day + occasion in Ann's message."}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="h-9 w-9 rounded-xl bg-[var(--connect-accent)] text-white inline-flex items-center justify-center disabled:opacity-50"
            disabled={selectedAll.length === 0}
            title="Try On selected"
            onClick={() => onTryOnSelected(selectedAll)}
          >
            <CalendarClock className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="h-9 w-9 rounded-xl border border-neutral-300 bg-white text-neutral-900 inline-flex items-center justify-center disabled:opacity-50"
            disabled={selectedAll.length === 0}
            title="Add selected"
            onClick={() => onAddSelected(selectedAll)}
          >
            <ShoppingCart className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="h-9 w-9 rounded-xl border border-neutral-300 bg-white text-neutral-900 inline-flex items-center justify-center disabled:opacity-50"
            disabled={selectedAll.length === 0}
            title="Clear selection"
            onClick={() => {
              setSelected((prev) => {
                const next = new Set(prev);
                for (const id of allPickedIds) next.delete(id);
                return next;
              });
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {displayedGroups.map((g, groupIndex) => {
        const picked = picksForGroup(g, groupIndex);
        const outfitPicks = picked.filter((p) => CONNECT_APPAREL_DISPLAY.has(p.category));
        const addonPicks = picked.filter((p) => !CONNECT_APPAREL_DISPLAY.has(p.category));
        const showOutfitAddonSplit = outfitPicks.length > 0 && addonPicks.length > 0;
        return (
          <section
            key={`${g.label}-${groupIndex}`}
            className="rounded-2xl border border-neutral-200/90 bg-gradient-to-b from-white to-neutral-50/90 px-3 py-3 shadow-sm ring-1 ring-black/[0.03]"
            aria-labelledby={`connect-day-${groupIndex}`}
          >
            <div id={`connect-day-${groupIndex}`} className="flex flex-col gap-0.5 border-b border-neutral-200/70 pb-2 mb-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--connect-accent)]">
                {g.dayTitle}
              </p>
              {g.intent ? (
                <p className="text-xs font-semibold text-neutral-900 leading-snug">{g.intent}</p>
              ) : (
                <p className="text-xs font-semibold text-neutral-800 leading-snug">Outfit picks</p>
              )}
            </div>
            {picked.length === 0 ? (
              <p className="text-[11px] text-neutral-500 leading-snug">
                No catalog cards mapped to this day yet — try another day above or send a quick refine.
              </p>
            ) : null}
            {showOutfitAddonSplit ? (
              <div className="space-y-3">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Outfit</p>
                  {renderProductStrip(outfitPicks)}
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Add-ons</p>
                  {renderProductStrip(addonPicks)}
                </div>
              </div>
            ) : picked.length > 0 ? (
              renderProductStrip(picked)
            ) : null}
          </section>
        );
      })}

      <ConnectExplainability content={content} />

      {showFollowUpSection ? (
        <div className="pt-2 border-t border-neutral-200/80">
          <p className="text-xs font-semibold text-neutral-800">{dayPlanFollowUps.title}</p>
          <p className="text-[11px] text-neutral-600 mt-0.5 leading-snug">{dayPlanFollowUps.subtitle}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {dayPlanFollowUps.prompts.map((t) => (
              <button
                key={t}
                type="button"
                className="text-left text-xs rounded-xl border border-neutral-300 bg-white px-3 py-2 hover:border-[var(--connect-accent)]"
                onClick={() => onPrompt(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RecommendedCards({
  messageId,
  replyMarkdown,
  recommendedIds,
  recommendedDisplayMode,
  products,
  apiBase,
  onTryOnSelected,
  onAddSelected,
  onPrompt,
  showFollowUpSection,
}: {
  messageId: string;
  replyMarkdown: string;
  recommendedIds: string[] | undefined;
  recommendedDisplayMode?: RecommendedDisplayMode;
  products: ApiProduct[];
  apiBase: string;
  onTryOnSelected: (productIds: string[]) => void;
  onAddSelected: (productIds: string[]) => void;
  onPrompt: (text: string) => void;
  showFollowUpSection: boolean;
}) {
  const ids = (recommendedIds ?? []).filter(Boolean);
  const recKey = ids.join(",");
  if (ids.length === 0) return null;

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const pickedAll = ids.map((id) => byId.get(id)).filter(Boolean) as ApiProduct[];
  if (pickedAll.length === 0) return null;

  const pageSize = recommendedDisplayMode === "full_outfit" ? pickedAll.length : INTENT_RESULTS_PAGE_SIZE;
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(pickedAll.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * pageSize;
  const picked = pickedAll.slice(start, start + pageSize);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [messageId, recKey, recommendedDisplayMode]);

  const pickedIds = pickedAll.map((p) => p.id);
  const selectedAll = pickedIds.filter((id) => selected.has(id));
  const followUpCopy = cardsFollowUpCopy(recommendedDisplayMode);

  return (
    <div className="mt-3 space-y-3 border-t border-neutral-200/80 pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
          {recommendedDisplayMode === "full_outfit" ? "Complete look" : "Recommended picks"}
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="h-9 w-9 rounded-xl bg-[var(--connect-accent)] text-white inline-flex items-center justify-center disabled:opacity-50"
            disabled={selectedAll.length === 0}
            title="Try On selected"
            onClick={() => onTryOnSelected(selectedAll)}
          >
            <CalendarClock className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="h-9 w-9 rounded-xl border border-neutral-300 bg-white text-neutral-900 inline-flex items-center justify-center disabled:opacity-50"
            disabled={selectedAll.length === 0}
            title="Add selected"
            onClick={() => onAddSelected(selectedAll)}
          >
            <ShoppingCart className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="h-9 w-9 rounded-xl border border-neutral-300 bg-white text-neutral-900 inline-flex items-center justify-center disabled:opacity-50"
            disabled={selectedAll.length === 0}
            title="Clear selection"
            onClick={() => setSelected(new Set())}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {picked.map((p) => (
          <div key={p.id} className="shrink-0 w-28">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className={`h-5 w-5 rounded border flex items-center justify-center ${
                  selected.has(p.id)
                    ? "bg-[var(--connect-accent)] text-white border-[var(--connect-accent)]"
                    : "bg-white border-neutral-300 text-transparent"
                }`}
                title={selected.has(p.id) ? "Deselect" : "Select"}
                onClick={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.id)) next.delete(p.id);
                    else next.add(p.id);
                    return next;
                  });
                }}
              >
                ✓
              </button>
            </div>
            <Link
              to={`/product/${encodeURIComponent(p.id)}`}
              className="block rounded-xl border border-neutral-200 bg-white hover:border-[var(--connect-accent)] transition-colors"
            >
              <div className="aspect-[3/4] rounded-t-xl overflow-hidden bg-neutral-200">
                <img src={catalogMediaUrl(apiBase, p.imageAssetName)} alt={p.name} className="w-full h-full object-cover" />
              </div>
              <div className="p-2">
                <p className="text-[10px] font-semibold leading-snug line-clamp-2">{p.name}</p>
              </div>
            </Link>
          </div>
        ))}
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[10px] text-neutral-600">
            Showing {start + 1}–{Math.min(start + picked.length, pickedAll.length)} of {pickedAll.length}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={safePage <= 0}
              className="text-xs font-semibold rounded-lg border border-neutral-300 px-2 py-1 disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              className="text-xs font-semibold rounded-lg border border-neutral-300 px-2 py-1 disabled:opacity-40"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      <ConnectExplainability content={replyMarkdown} />

      {showFollowUpSection ? (
        <div className="pt-2 border-t border-neutral-200/80">
          <p className="text-xs font-semibold text-neutral-800">{followUpCopy.title}</p>
          <p className="text-[11px] text-neutral-600 mt-0.5 leading-snug">{followUpCopy.subtitle}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {followUpCopy.prompts.map((t) => (
              <button
                key={t}
                type="button"
                className="text-left text-xs rounded-xl border border-neutral-300 bg-white px-3 py-2 hover:border-[var(--connect-accent)]"
                onClick={() => onPrompt(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function App() {
  const apiBase = getApiBaseUrl();
  const navigate = useNavigate();
  /** New UUID each time the chat drawer opens; cleared from UI when it closes. */
  const stylistSessionIdRef = useRef(crypto.randomUUID());
  /** Counts uses of recommendation follow-up chips + quick replies; capped to avoid endless refine loops. */
  const recommendationFollowUpRoundsRef = useRef(0);
  const [recommendationFollowUpRoundsUsed, setRecommendationFollowUpRoundsUsed] = useState(0);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [linkedName, setLinkedName] = useState<string | null>(null);
  const [linkedCustomerProfile, setLinkedCustomerProfile] = useState<ApiCustomer | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [otpStep, setOtpStep] = useState<"idle" | "sent" | "verified">("idle");
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string>("");
  const listEndRef = useRef<HTMLDivElement>(null);
  const lastPicksRef = useRef<HTMLDivElement>(null);
  const [checkoutSummary, setCheckoutSummary] = useState<CheckoutSummaryState | null>(null);
  const [checkoutClassifierBusy, setCheckoutClassifierBusy] = useState(false);
  const [cartProductIds, setCartProductIds] = useState<string[]>([]);
  const [voiceRefining, setVoiceRefining] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  /** True after voice send until checkout classifier + Ann’s reply finish (handleSend does not await the turn). */
  const [voiceAssistantPendingFromMic, setVoiceAssistantPendingFromMic] = useState(false);

  useEffect(() => {
    if (!voiceAssistantPendingFromMic) return;
    if (!sending && !checkoutClassifierBusy) setVoiceAssistantPendingFromMic(false);
  }, [sending, checkoutClassifierBusy, voiceAssistantPendingFromMic]);

  const voicePipelineBusy = voiceListening || voiceRefining || voiceAssistantPendingFromMic;

  const promptSuggestions = useMemo(
    () => buildProfilePromptSuggestions(linkedCustomerProfile),
    [linkedCustomerProfile]
  );

  const lastAssistantWithPicksId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.role === "assistant" && (m.recommendedIds?.length ?? 0) > 0) return m.id;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    fetchCatalog()
      .then(setProducts)
      .catch(() =>
        setCatalogError("Could not load the catalog. Start orchestration (port 3000) + worker, or check the Vite proxy."),
      );
  }, []);

  useEffect(() => {
    // Keep the newest assistant turn + summary actions visible.
    if (chatOpen) listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatOpen, sending, checkoutSummary]);

  const runAssistantTurn = useCallback(
    async (
      userText: string,
      historyBeforeThisUser: ChatTurn[],
      context?: { source?: string; productId?: string },
      speakAssistantReply = false,
    ) => {
      const trimmed = userText.trim();
      if (!trimmed) return;

      setSending(true);
      try {
        const res = await sendAnnChat({
          message: trimmed,
          history: historyBeforeThisUser,
          customerId,
          sessionId: stylistSessionIdRef.current,
          context,
        });
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: res.reply,
            recommendedIds: res.recommendedProductIds,
            recommendedDisplayMode: res.recommendedDisplayMode,
            quickReplies: res.quickReplies,
          },
        ]);
        if (speakAssistantReply) {
          queueMicrotask(() => speakPlainText(stripForSpeech(res.reply)));
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message.trim() : "";
        const quotaHint =
          detail && /429|quota|RESOURCE_EXHAUSTED|rate limit|billing/i.test(detail)
            ? "\n\nTip: This often means the LLM API hit a quota or billing limit, not that the gateway is down."
            : "";
        const msg = detail
          ? `Something went wrong with that message.\n\n${detail.slice(0, 1600)}${detail.length > 1600 ? "…" : ""}${quotaHint}`
          : "I couldn't reach the stylist service. Start orchestration on port 3000 and the Python worker (e.g. `digital-stylist-worker`).";
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: msg,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [customerId]
  );

  const CHECKOUT_SUMMARY_ASSISTANT_COPY =
    "Perfect — here’s a quick summary with your total. Pick a fitting-room time if you’d like an associate to have everything ready for you to try on.";

  const handleSend = useCallback(
    (overrideText?: unknown, opts?: { speakReply?: boolean }) => {
      const text = typeof overrideText === "string" ? overrideText : input;
      const trimmed = text.trim();
      if (!trimmed || sending || checkoutClassifierBusy) return;
      const speakReply = opts?.speakReply === true;
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      const lastRecommendationIds = (lastAssistant?.recommendedIds ?? []).filter(Boolean);

      const historyBefore: ChatTurn[] = messages.map((m) => ({ role: m.role, content: m.content }));
      setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", content: trimmed }]);
      setInput("");

      // LLM-backed decision: only show summary when we detect acceptance/ready-to-proceed.
      if (lastRecommendationIds.length > 0) {
        const lastAssistantReply = lastAssistant?.content ?? "";
        setCheckoutClassifierBusy(true);
        void classifyCheckoutIntent({ message: trimmed, history: historyBefore, lastAssistantReply })
          .then((decision) => {
            if (decision.decision === "SHOW_SUMMARY") {
              setCheckoutSummary({ productIds: lastRecommendationIds.slice(0, 6), createdAt: new Date().toISOString() });
              setMessages((prev) => [
                ...prev,
                {
                  id: `a-${Date.now()}`,
                  role: "assistant",
                  content: CHECKOUT_SUMMARY_ASSISTANT_COPY,
                },
              ]);
              if (speakReply) {
                queueMicrotask(() => speakPlainText(stripForSpeech(CHECKOUT_SUMMARY_ASSISTANT_COPY)));
              }
              return;
            }
            setCheckoutSummary(null);
            void runAssistantTurn(trimmed, historyBefore, undefined, speakReply);
          })
          .catch(() => {
            // If classifier is unavailable, behave conservatively: refine.
            setCheckoutSummary(null);
            void runAssistantTurn(trimmed, historyBefore, undefined, speakReply);
          })
          .finally(() => setCheckoutClassifierBusy(false));
        return;
      }

      void runAssistantTurn(trimmed, historyBefore, undefined, speakReply);
    },
    [input, sending, checkoutClassifierBusy, messages, runAssistantTurn]
  );

  const openChat = useCallback(() => {
    stylistSessionIdRef.current = crypto.randomUUID();
    setChatOpen(true);
  }, []);

  const endChatSession = useCallback(() => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("connect.sessionId");
    }
    recommendationFollowUpRoundsRef.current = 0;
    setRecommendationFollowUpRoundsUsed(0);
    setChatOpen(false);
    setMessages([]);
    setCheckoutSummary(null);
    setInput("");
    setSending(false);
    setCheckoutClassifierBusy(false);
    setVoiceListening(false);
    setVoiceRefining(false);
    setVoiceAssistantPendingFromMic(false);
  }, []);

  const showRecommendationFollowUps = recommendationFollowUpRoundsUsed < RECOMMENDATION_FOLLOW_UP_CAP;

  const sendRecommendationFollowUp = useCallback(
    (userText: string) => {
      const trimmed = userText.trim();
      if (!trimmed || sending) return;
      if (recommendationFollowUpRoundsRef.current >= RECOMMENDATION_FOLLOW_UP_CAP) return;
      recommendationFollowUpRoundsRef.current += 1;
      setRecommendationFollowUpRoundsUsed(recommendationFollowUpRoundsRef.current);
      setMessages((prev) => {
        const hist: ChatTurn[] = prev.map((x) => ({ role: x.role, content: x.content }));
        queueMicrotask(() => void runAssistantTurn(trimmed, hist));
        return [...prev, { id: `u-${Date.now()}`, role: "user", content: trimmed }];
      });
    },
    [sending, runAssistantTurn]
  );

  const onPromptSuggestion = useCallback(
    (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || sending) return;
      const base = messages;
      const hist: ChatTurn[] = base.map((m) => ({ role: m.role, content: m.content }));
      setMessages([...base, { id: `u-${Date.now()}`, role: "user", content: trimmed }]);
      void runAssistantTurn(trimmed, hist);
    },
    [messages, sending, runAssistantTurn]
  );

  const linkEmail = useCallback(async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    setEmailBusy(true);
    setOtpError("");
    try {
      const started = await startOtp({ email });
      setOtpStep("sent");
      setOtpCode("");
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: "assistant",
          content: started.code
            ? `Demo OTP code: **${started.code}** (in this demo, OTPs are not actually emailed). Enter it to continue.`
            : "I sent a 6-digit verification code to your email/SMS. Enter it to continue.",
        },
      ]);
    } catch {
      setOtpStep("idle");
      setOtpError("Could not send a code for that email. Try **sarah.mitchell@email.com** or **jennifer.park@email.com**.");
    } finally {
      setEmailBusy(false);
    }
  }, [emailInput]);

  const submitOtp = useCallback(async () => {
    const email = emailInput.trim().toLowerCase();
    const code = otpCode.trim();
    if (!email || !/^[0-9]{6}$/.test(code)) {
      setOtpError("Enter the 6-digit code.");
      return;
    }
    setEmailBusy(true);
    setOtpError("");
    try {
      const verified = await verifyOtp({ email, code });
      setCustomerId(verified.customerId);
      setLinkedName(verified.name);
      setOtpStep("verified");
      void fetchCustomers()
        .then((list) => {
          const c = list.find((x) => x.id === verified.customerId);
          setLinkedCustomerProfile(c ?? null);
        })
        .catch(() => setLinkedCustomerProfile(null));
      const note: UiMessage = {
        id: `sys-${Date.now()}`,
        role: "assistant",
        content: `Welcome back, ${verified.name.split(/\\s+/)[0]} — you’re verified. I’ll use your saved style profile for picks going forward. Tell me what you’re shopping for, or tap a suggestion below.`,
      };
      setMessages((prev) => [...prev, note]);
    } catch {
      setOtpError("That code didn’t work. Try again or request a new code.");
    } finally {
      setEmailBusy(false);
    }
  }, [emailInput, otpCode]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-neutral-200/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[var(--connect-ink)] tracking-[0.2em]">
            ANN TAYLOR
          </h1>
          <div className="flex items-center gap-2">
            <Link
              to="/cart"
              className="relative inline-flex items-center justify-center rounded-full border border-neutral-200 bg-white p-2.5 text-neutral-800 hover:border-[var(--connect-accent)] transition-colors"
              aria-label={`Cart, ${cartProductIds.length} items`}
            >
              <ShoppingCart className="h-5 w-5" aria-hidden />
              {cartProductIds.length > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[1.125rem] rounded-full bg-[var(--connect-accent)] px-1 text-center text-[10px] font-bold leading-5 text-white">
                  {cartProductIds.length > 99 ? "99+" : cartProductIds.length}
                </span>
              ) : null}
            </Link>
            <button
              type="button"
              onClick={openChat}
              className="inline-flex items-center gap-2.5 rounded-full bg-[var(--connect-accent)] text-white px-5 py-2.5 text-sm font-semibold shadow-md hover:opacity-95 transition-opacity"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <Bot className="h-4 w-4" aria-hidden />
              </span>
              Ask Ann
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-4 py-6 w-full">
        <Routes>
          <Route
            path="/"
            element={
              <CatalogPage
                apiBase={apiBase}
                products={products}
                catalogError={catalogError}
              />
            }
          />
          <Route
            path="/cart"
            element={
              <CartPage
                apiBase={apiBase}
                products={products}
                cartProductIds={cartProductIds}
                onRemoveFromCart={(id) => setCartProductIds((prev) => prev.filter((x) => x !== id))}
                onClearCart={() => setCartProductIds([])}
              />
            }
          />
          <Route
            path="/product/:id"
            element={
              <ProductDetailPage
                apiBase={apiBase}
                products={products}
                onBookAppointment={() => {
                  openChat();
                  onPromptSuggestion("Book an appointment with a stylist.");
                }}
                onAskAnnAboutItem={(product) => {
                  openChat();
                  setMessages((prev) => {
                    const base = prev;
                    const prompt = `I’m viewing **${product.name}**. Please share the product details, styling tips on how to wear it, and recommend a few pieces that pair well with it.`;
                    const hist: ChatTurn[] = base.map((m) => ({ role: m.role, content: m.content }));
                    queueMicrotask(() =>
                      void runAssistantTurn(prompt, hist, { source: "connect_pdp", productId: product.id })
                    );
                    return [...base, { id: `u-${Date.now()}`, role: "user", content: prompt }];
                  });
                }}
                onTryOn={(product, selection) => {
                  openChat();
                  setMessages((prev) => {
                    const base = prev;
                    const prompt = `I’d like to **try on** **${product.name}** in **${selection.color}**, size **${selection.size}**. Can you help me pick the best time and what to pair it with?`;
                    const hist: ChatTurn[] = base.map((m) => ({ role: m.role, content: m.content }));
                    queueMicrotask(() =>
                      void runAssistantTurn(prompt, hist, { source: "connect_pdp", productId: product.id })
                    );
                    return [...base, { id: `u-${Date.now()}`, role: "user", content: prompt }];
                  });
                }}
              />
            }
          />
        </Routes>
      </main>

      <div
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity ${chatOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        aria-hidden={!chatOpen}
        onClick={() => endChatSession()}
      />
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col transition-transform duration-300 ${
          chatOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--connect-accent)] text-white">
              <Bot className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--connect-accent)]">Digital Stylist</p>
              <p className="font-display font-semibold truncate">Ann</p>
            </div>
          </div>
          <button type="button" className="p-2 rounded-lg hover:bg-neutral-100" onClick={() => endChatSession()} aria-label="Close chat">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-neutral-100 space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Sign in with email (optional)</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@email.com"
                className="w-full rounded-lg border border-neutral-300 pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={emailBusy}
              onClick={() => void linkEmail()}
              className="rounded-lg bg-neutral-900 text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {emailBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find me"}
            </button>
          </div>
          {linkedName ? <p className="text-xs text-green-700">Profile linked: {linkedName}</p> : null}
          {otpStep === "sent" && !linkedName ? (
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\\D/g, "").slice(0, 6))}
                placeholder="6-digit code"
                className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={emailBusy || otpCode.length !== 6}
                onClick={() => void submitOtp()}
                className="rounded-lg bg-[var(--connect-accent)] text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Verify
              </button>
            </div>
          ) : null}
          {otpError ? <p className="text-xs text-red-700">{otpError}</p> : null}
        </div>

        <div className="border-b border-neutral-100 px-4 py-3 bg-neutral-50/80 space-y-3">
          <div className="connect-prose text-sm text-neutral-800 leading-snug [&_p]:m-0">
            <ReactMarkdown>{WELCOME_TEXT}</ReactMarkdown>
          </div>
          <p className="text-xs font-semibold text-neutral-800">You can ask me things like :</p>
          {linkedCustomerProfile ? (
            <p className="text-[11px] text-neutral-600 mt-1 leading-snug">
              These ideas use your profile—upcoming occasions
              {linkedCustomerProfile.preferredSize?.trim() && linkedCustomerProfile.preferredFit?.trim()
                ? `, typical fit (size ${linkedCustomerProfile.preferredSize}, ${linkedCustomerProfile.preferredFit})`
                : ""}
              , style, and colors.
            </p>
          ) : null}
          <div className="flex flex-col gap-2 mt-2 max-h-40 overflow-y-auto">
            {promptSuggestions.map((p) => (
              <button
                key={p}
                type="button"
                disabled={sending}
                className="text-left text-xs rounded-lg border border-neutral-200 bg-white px-3 py-2 leading-snug hover:border-[var(--connect-accent)] disabled:opacity-50"
                onClick={() => onPromptSuggestion(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {messages.map((m, mi) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[95%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-[var(--connect-accent)] text-white" : "bg-neutral-100 text-neutral-900"
                }`}
              >
                {m.role === "user" ? <p className="whitespace-pre-wrap">{m.content}</p> : null}
                {m.role === "assistant" &&
                extractDayGroups(m.content).length === 0 &&
                ((m.recommendedIds ?? []).filter(Boolean).length === 0) ? (
                  <div className="connect-prose">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : null}
                {m.role === "assistant" ? (
                  <DayGroupedPicks
                    content={m.content}
                    priorUserText={recentMultiDayPlanningUserContent(messages, mi)}
                    recommendedIds={m.recommendedIds}
                    recommendedDisplayMode={m.recommendedDisplayMode}
                    products={products}
                    apiBase={apiBase}
                    onTryOnSelected={(productIds) => {
                      const picked = productIds.filter(Boolean).slice(0, 6);
                      if (picked.length === 0) return;
                      setCheckoutSummary({ productIds: picked, createdAt: new Date().toISOString() });
                      setMessages((prev) => [
                        ...prev,
                        {
                          id: `a-${Date.now()}`,
                          role: "assistant",
                          content:
                            "Perfect — I’ll set these aside for a try-on. Pick a fitting-room time below and I’ll reserve it if everything is in stock.",
                        },
                      ]);
                    }}
                    onAddSelected={(productIds) => {
                      const picked = productIds.filter(Boolean).slice(0, 12);
                      if (picked.length === 0) return;
                      setCheckoutSummary((prev) => {
                        const existing = prev?.productIds ?? [];
                        const merged = [...new Set([...existing, ...picked])].slice(0, 12);
                        return { productIds: merged, createdAt: prev?.createdAt ?? new Date().toISOString() };
                      });
                      setMessages((prev) => [
                        ...prev,
                        {
                          id: `a-${Date.now()}`,
                          role: "assistant",
                          content: "Added — want to Try On these, or should I refine to 1–2 best options per day?",
                        },
                      ]);
                    }}
                    onPrompt={sendRecommendationFollowUp}
                    showFollowUpSection={showRecommendationFollowUps}
                  />
                ) : null}
                {m.role === "assistant" &&
                !connectUsesDayPlanUi(
                  m.content,
                  recentMultiDayPlanningUserContent(messages, mi),
                  m.recommendedIds,
                  m.recommendedDisplayMode
                ) ? (
                  <RecommendedCards
                    messageId={m.id}
                    replyMarkdown={m.content}
                    recommendedIds={m.recommendedIds}
                    recommendedDisplayMode={m.recommendedDisplayMode}
                    products={products}
                    apiBase={apiBase}
                    onTryOnSelected={(productIds) => {
                      const picked = productIds.filter(Boolean).slice(0, 6);
                      if (picked.length === 0) return;
                      setCheckoutSummary({ productIds: picked, createdAt: new Date().toISOString() });
                      setMessages((prev) => [
                        ...prev,
                        {
                          id: `a-${Date.now()}`,
                          role: "assistant",
                          content:
                            "Perfect — I’ll set these aside for a try-on. Pick a fitting-room time below and I’ll reserve it if everything is in stock.",
                        },
                      ]);
                    }}
                    onAddSelected={(productIds) => {
                      const picked = productIds.filter(Boolean).slice(0, 12);
                      if (picked.length === 0) return;
                      setCheckoutSummary((prev) => {
                        const existing = prev?.productIds ?? [];
                        const merged = [...new Set([...existing, ...picked])].slice(0, 12);
                        return { productIds: merged, createdAt: prev?.createdAt ?? new Date().toISOString() };
                      });
                    }}
                    onPrompt={sendRecommendationFollowUp}
                    showFollowUpSection={showRecommendationFollowUps}
                  />
                ) : null}
                {m.role === "assistant" ? <div ref={m.id === lastAssistantWithPicksId ? lastPicksRef : undefined} /> : null}
                {m.role === "assistant" && m.quickReplies?.length && showRecommendationFollowUps ? (
                  <div className="mt-2 rounded-xl border border-neutral-200/80 bg-white/90 px-2.5 py-2">
                    <p className="text-xs font-semibold text-neutral-800">Keep the conversation going</p>
                    <p className="text-[10px] text-neutral-600 mt-0.5 leading-snug">
                      Short replies tied to Ann’s last message — same limit as the buttons above.
                    </p>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {m.quickReplies.slice(0, 3).map((q) => (
                        <button
                          key={q}
                          type="button"
                          className="text-left text-xs rounded-lg border border-neutral-300 bg-white px-2 py-1.5 hover:border-[var(--connect-accent)]"
                          onClick={() => sendRecommendationFollowUp(q)}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {checkoutSummary ? (
            <div className="flex justify-start">
              <div className="max-w-[95%] w-full">
                <CheckoutSummaryCard
                  apiBase={apiBase}
                  products={products}
                  summary={checkoutSummary}
                  onClear={() => {
                    setCheckoutSummary(null);
                    // After collapsing summary, bring the last picks back into view.
                    queueMicrotask(() => {
                      lastPicksRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    });
                  }}
                  customerId={customerId}
                  onShipToHome={(ids) => {
                    setCartProductIds((prev) => [...new Set([...prev, ...ids])]);
                    endChatSession();
                    navigate("/cart", { state: { shipToHome: true } });
                  }}
                />
              </div>
            </div>
          ) : null}
          {sending ? (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-500 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Ann is thinking…
              </div>
            </div>
          ) : null}
          <div ref={listEndRef} />
        </div>

        <div className="border-t border-neutral-200 p-3 space-y-2">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder="Ask Ann…"
              disabled={sending || checkoutClassifierBusy || voicePipelineBusy}
              className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            />
            <VoiceInputButton
              disabled={sending || checkoutClassifierBusy || voiceRefining || voiceAssistantPendingFromMic}
              onListeningChange={setVoiceListening}
              onTranscript={(raw) => {
                void (async () => {
                  setVoiceAssistantPendingFromMic(true);
                  setVoiceRefining(true);
                  try {
                    const refined = await refineVoiceTranscriptToIntent(raw, "connect");
                    setVoiceRefining(false);
                    handleSend(refined, { speakReply: true });
                  } catch {
                    setVoiceRefining(false);
                    setVoiceAssistantPendingFromMic(false);
                  }
                })();
              }}
            />
            <button
              type="button"
              disabled={sending || voicePipelineBusy || !input.trim()}
              onClick={() => handleSend()}
              className="rounded-xl bg-[var(--connect-accent)] text-white p-2.5 disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          {(voiceListening || voiceRefining || voiceAssistantPendingFromMic) && (
            <div className="flex items-start gap-2 text-xs text-neutral-600" role="status" aria-live="polite">
              {voiceRefining || (voiceAssistantPendingFromMic && !voiceListening) ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 mt-0.5 animate-spin" aria-hidden />
              ) : (
                <Mic className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-70" aria-hidden />
              )}
              <span>
                {voiceListening
                  ? "Listening — pause when you’re done, or tap the mic to stop."
                  : voiceRefining
                    ? "Processing voice — turning speech into a clear message…"
                    : "Asking Ann — waiting for a reply…"}
              </span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function CheckoutSummaryCard({
  apiBase,
  products,
  summary,
  onClear,
  customerId,
  onShipToHome,
}: {
  apiBase: string;
  products: ApiProduct[];
  summary: CheckoutSummaryState;
  onClear: () => void;
  customerId?: string;
  onShipToHome: (productIds: string[]) => void;
}) {
  const picked = summary.productIds
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean) as ApiProduct[];
  const total = picked.reduce((s, p) => s + (p.price ?? 0), 0);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Final summary</p>
          <p className="text-sm font-semibold text-neutral-900 mt-1">{picked.length} items · Total {formatMoney(total)}</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-semibold text-neutral-700 hover:text-neutral-900 underline underline-offset-4"
        >
          Change picks
        </button>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {picked.map((p) => (
          <div key={p.id} className="shrink-0 w-24">
            <div className="aspect-[3/4] rounded-lg overflow-hidden bg-neutral-200">
              <img src={catalogMediaUrl(apiBase, p.imageAssetName)} alt="" className="w-full h-full object-cover" />
            </div>
            <p className="text-[10px] font-medium line-clamp-2 mt-1">{p.name}</p>
            <p className="text-[10px] text-neutral-600">{formatMoney(p.price)}</p>
          </div>
        ))}
      </div>

      <FittingRoomActions
        apiBase={apiBase}
        products={picked}
        total={total}
        customerId={customerId}
        onShipToHome={onShipToHome}
      />
    </div>
  );
}

const MOCK_FITTING_SLOTS = ["Today · 2:30 PM", "Today · 3:15 PM", "Today · 4:00 PM", "Tomorrow · 11:00 AM", "Tomorrow · 1:30 PM"];

function FittingRoomActions({
  apiBase,
  products,
  total,
  customerId,
  onShipToHome,
}: {
  apiBase: string;
  products: ApiProduct[];
  total: number;
  customerId?: string;
  onShipToHome: (productIds: string[]) => void;
}) {
  const productIds = products.map((p) => p.id);
  const [busy, setBusy] = useState(false);
  const [inventory, setInventory] = useState<
    null | {
      canStageInStore: boolean;
      unavailableProductIds: string[];
      availability: { productId: string; inStock: boolean }[];
    }
  >(null);
  const [confirmed, setConfirmed] = useState<null | { mode: "fitting_room" | "ship_to_home"; label: string }>(null);
  const [slotLabel, setSlotLabel] = useState(MOCK_FITTING_SLOTS[0]);
  const [reservation, setReservation] = useState<null | { reservationId: string; note: string }>(null);

  const check = async () => {
    setBusy(true);
    setConfirmed(null);
    try {
      const res = await checkInventory({ storeId: "store-001", productIds });
      setInventory({
        canStageInStore: res.canStageInStore,
        unavailableProductIds: res.unavailableProductIds,
        availability: res.availability,
      });
    } catch {
      // If inventory check fails, treat as out-of-stock to avoid over-promising.
      setInventory({
        canStageInStore: false,
        unavailableProductIds: productIds,
        availability: productIds.map((productId) => ({ productId, inStock: false })),
      });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIds.join("|")]);

  const hasInventory = inventory !== null;
  const inventoryMatchesCart = useMemo(() => {
    if (!inventory || productIds.length === 0) return false;
    if (inventory.availability.length !== productIds.length) return false;
    return productIds.every((id) => inventory.availability.some((a) => a.productId === id));
  }, [inventory, productIds.join("|")]);

  const canStage = (inventory?.canStageInStore ?? false) && inventoryMatchesCart;

  function rowStoreStatus(productId: string): "checking" | "in_store" | "not_here" | "unknown" {
    if (!inventoryMatchesCart) return busy ? "checking" : "unknown";
    return inventory!.availability.find((a) => a.productId === productId)?.inStock ? "in_store" : "not_here";
  }

  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Next step</p>
      <p className="text-xs text-neutral-800">
        We can reserve a fitting room when every item is in stock at this store. Below you can see each piece — use{" "}
        <span className="font-semibold">Ship To Home</span> if something isn’t available here.
      </p>
      {products.length > 0 ? (
        <div className="rounded-lg border border-neutral-200/80 bg-white/90 px-2 py-2 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 px-1">At this store</p>
          <ul className="max-h-40 overflow-y-auto space-y-1.5 pr-0.5">
            {products.map((p) => {
              const status = rowStoreStatus(p.id);
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border border-neutral-100 bg-neutral-50/80 px-2 py-1.5"
                >
                  <div className="h-11 w-9 shrink-0 overflow-hidden rounded-md bg-neutral-200">
                    <img
                      src={catalogMediaUrl(apiBase, p.imageAssetName)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-neutral-900 line-clamp-2 leading-snug">{p.name}</p>
                    <p className="text-[10px] text-neutral-500">{formatMoney(p.price)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {status === "checking" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-200/80 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                        Checking
                      </span>
                    ) : status === "in_store" ? (
                      <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-900">
                        In store
                      </span>
                    ) : status === "not_here" ? (
                      <span className="inline-block max-w-[7.5rem] rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold leading-tight text-amber-950 ring-1 ring-amber-200/80">
                        Not here
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
                        —
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Choose a time</p>
        <select
          className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
          value={slotLabel}
          onChange={(e) => setSlotLabel(e.target.value)}
          disabled={busy}
        >
          {MOCK_FITTING_SLOTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          disabled={busy || !hasInventory || !canStage}
          onClick={() => {
            setBusy(true);
            setReservation(null);
            void reserveFittingRoom({
              storeId: "store-001",
              slotLabel,
              customerId,
              productIds,
              source: "connect",
            })
              .then((r) => {
                const notify = r.notificationChannels.length ? ` We sent ${r.notificationChannels.join(" + ")}.` : "";
                const note = `Reserved for ${slotLabel}. An associate is ready with your items. Reference ${r.reservationId}.${notify}`;
                setReservation({ reservationId: r.reservationId, note });
                setConfirmed({ mode: "fitting_room", label: note });
              })
              .catch(() => {
                setConfirmed({
                  mode: "ship_to_home",
                  label: "Some items aren’t available in store right now — choose Ship To Home to continue.",
                });
              })
              .finally(() => setBusy(false));
          }}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold shadow-md transition-opacity ${
            canStage
              ? "bg-[var(--connect-accent)] text-white hover:opacity-95"
              : "bg-neutral-200 text-neutral-600 cursor-not-allowed"
          }`}
        >
          {busy ? "Reserving…" : "Reserve"}
        </button>
        <button
          type="button"
          disabled={busy || !hasInventory}
          onClick={() => {
            onShipToHome(productIds);
          }}
          className="rounded-xl border border-neutral-300 bg-white text-neutral-900 px-4 py-2.5 text-sm font-semibold hover:border-[var(--connect-accent)] transition-colors"
        >
          Ship To Home
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void check()}
          className="rounded-xl border border-neutral-300 bg-white text-neutral-900 px-3 py-2.5 text-sm font-semibold hover:border-neutral-400 transition-colors"
        >
          Recheck
        </button>
      </div>
      {!busy && hasInventory && !canStage ? (
        <p className="text-[11px] text-neutral-700">
          Fitting room staging needs every item marked <span className="font-semibold text-emerald-900">In store</span>. Items marked{" "}
          <span className="font-semibold text-amber-950">Not here</span> can ship to you — choose{" "}
          <span className="font-semibold">Ship To Home</span> or change your picks.
        </p>
      ) : null}
      {confirmed ? (
        <div className="rounded-lg bg-white border border-neutral-200 px-3 py-2 text-xs text-neutral-800">
          {confirmed.label}
        </div>
      ) : null}
    </div>
  );
}

function CartPage({
  apiBase,
  products,
  cartProductIds,
  onRemoveFromCart,
  onClearCart,
}: {
  apiBase: string;
  products: ApiProduct[];
  cartProductIds: string[];
  onRemoveFromCart: (productId: string) => void;
  onClearCart: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const fromShipToHome = Boolean((location.state as { shipToHome?: boolean } | null)?.shipToHome);

  const lines = cartProductIds
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean) as ApiProduct[];
  const total = lines.reduce((s, p) => s + (p.price ?? 0), 0);

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => navigate("/")} className="text-sm font-medium underline underline-offset-4">
        ← Continue shopping
      </button>

      <div>
        <h2 className="font-display text-2xl font-semibold text-[var(--connect-ink)]">Your cart</h2>
        {fromShipToHome ? (
          <p className="mt-2 text-sm text-neutral-700">
            We added your try-on picks for ship to home. Review below and check out when you’re ready.
          </p>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <p className="text-sm text-neutral-600">Your cart is empty.</p>
      ) : (
        <>
          <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white overflow-hidden">
            {lines.map((p) => (
              <li key={p.id} className="flex gap-3 p-4">
                <Link
                  to={`/product/${encodeURIComponent(p.id)}`}
                  className="h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100"
                >
                  <img src={catalogMediaUrl(apiBase, p.imageAssetName)} alt="" className="h-full w-full object-cover" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/product/${encodeURIComponent(p.id)}`}
                    className="font-semibold text-neutral-900 hover:underline line-clamp-2 text-sm sm:text-base"
                  >
                    {p.name}
                  </Link>
                  <p className="text-sm text-neutral-600 mt-1">{formatMoney(p.price)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveFromCart(p.id)}
                  className="shrink-0 self-start text-xs font-semibold text-neutral-500 hover:text-neutral-900 underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
            <p className="text-lg font-semibold">Subtotal {formatMoney(total)}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onClearCart}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold hover:border-neutral-400"
              >
                Clear cart
              </button>
              <button
                type="button"
                className="rounded-xl bg-[var(--connect-accent)] px-4 py-2.5 text-sm font-semibold text-white opacity-80 cursor-not-allowed"
                disabled
                title="Demo — checkout not wired"
              >
                Checkout
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CatalogPage({
  apiBase,
  products,
  catalogError,
}: {
  apiBase: string;
  products: ApiProduct[];
  catalogError: string | null;
}) {
  if (catalogError) {
    return <p className="text-red-600 text-sm">{catalogError}</p>;
  }
  if (products.length === 0) {
    return (
      <p className="text-neutral-500 text-sm flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading styles…
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
      {products.map((p) => (
        <Link
          key={p.id}
          to={`/product/${encodeURIComponent(p.id)}`}
          className="rounded-xl border border-neutral-200 overflow-hidden bg-white hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-[var(--connect-accent)]"
        >
          <div className="aspect-[4/5] bg-neutral-100">
            <img
              src={catalogMediaUrl(apiBase, p.imageAssetName)}
              alt={p.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          <div className="p-2 sm:p-3">
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">{p.brand ?? "AnnTaylor"}</p>
            <p className="text-sm font-semibold leading-snug line-clamp-2">{p.name}</p>
            <p className="text-sm mt-1">${p.price}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ProductDetailPage({
  apiBase,
  products,
  onBookAppointment,
  onAskAnnAboutItem,
  onTryOn,
}: {
  apiBase: string;
  products: ApiProduct[];
  onBookAppointment: () => void;
  onAskAnnAboutItem: (product: ApiProduct) => void;
  onTryOn: (product: ApiProduct, selection: { color: string; size: string }) => void;
}) {
  const navigate = useNavigate();
  const params = useParams();
  const id = params.id ? decodeURIComponent(params.id) : "";
  const product = products.find((p) => p.id === id);
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<string>("");

  if (products.length === 0) {
    return (
      <p className="text-neutral-500 text-sm flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading product…
      </p>
    );
  }

  if (!product) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-sm font-medium underline underline-offset-4"
        >
          Back to catalog
        </button>
        <p className="text-sm text-neutral-700">We couldn’t find that product.</p>
      </div>
    );
  }

  const brand = product.brand ?? "AnnTaylor";
  const isLoft = brand === "Loft";
  const colors = product.colors ?? [];
  const sizes = product.sizes ?? [];

  // Initialize selection when product changes (or first load).
  useEffect(() => {
    setSelectedColor(colors[0] ?? "");
    setSelectedSize(sizes[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => navigate("/")}
        className="text-sm font-medium underline underline-offset-4"
      >
        Back to catalog
      </button>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl overflow-hidden border border-neutral-200 bg-white">
          <div className="aspect-[4/5] bg-neutral-100">
            <img
              src={catalogMediaUrl(apiBase, product.imageAssetName)}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">{brand}</p>
            <h2 className="font-display text-2xl font-semibold leading-tight">{product.name}</h2>
            <p className="text-lg mt-2 font-semibold">${product.price}</p>
            <p className="text-sm text-neutral-700 mt-3 leading-relaxed">{product.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-neutral-200 bg-white p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Category</p>
              <p className="mt-1 text-neutral-800">{product.category}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Fit</p>
              <p className="mt-1 text-neutral-800">{product.fit}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3 col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Color</p>
              <select
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm"
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
              >
                {colors.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3 col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Size</p>
              <select
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm"
                value={selectedSize}
                onChange={(e) => setSelectedSize(e.target.value)}
              >
                {sizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Want help styling this?</p>
            <p className="text-sm text-neutral-800 mt-1">
              {isLoft
                ? "Book a 1:1 appointment and we’ll build a look around this piece."
                : "Try it on in store and we’ll help you complete the look around this piece."}
            </p>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              {/*
                Keep CTA styling consistent across actions.
                Primary = filled accent, Secondary = outlined.
              */}
              {(() => {
                const ctaBase =
                  "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold shadow-md transition-colors disabled:opacity-50";
                const ctaPrimary = `${ctaBase} bg-[var(--connect-accent)] text-white hover:opacity-95 transition-opacity`;
                const ctaSecondary = `${ctaBase} border border-neutral-300 bg-white text-neutral-900 hover:border-[var(--connect-accent)] shadow-none`;

                return (
                  <>
                    {isLoft ? (
                      <button type="button" onClick={onBookAppointment} className={ctaPrimary}>
                        Book an appointment
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onTryOn(product, { color: selectedColor, size: selectedSize })}
                        className={ctaPrimary}
                      >
                        Try On
                      </button>
                    )}
                    <button type="button" onClick={() => onAskAnnAboutItem(product)} className={ctaSecondary}>
                      Ask Ann about this item
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssistantMeta({
  content,
  recommendedIds,
  products,
  apiBase,
  onTryOnSelected,
}: {
  content: string;
  recommendedIds?: string[];
  products: ApiProduct[];
  apiBase: string;
  onTryOnSelected: (productIds: string[]) => void;
}) {
  const hasPicks = (recommendedIds?.length ?? 0) > 0;
  if (!hasPicks) return null;

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setSelected(new Set());
  }, [recommendedIds?.join("|")]);

  const reasonBlocks = extractReasoningBlocks(content);
  const styleTip =
    extractMarkdownSection(content, /^##\s*Style tip\b/i) ??
    extractMarkdownSection(content, /^##\s*Additional tips\b/i);

  const reasoningBlocks = reasonBlocks.filter(
    (b) => !/^greeting$/i.test(b.title) && !/^call to action$/i.test(b.title) && !/^style tip$/i.test(b.title)
  );

  return (
    <div className="mt-3 space-y-3 border-t border-neutral-200/80 pt-3">
      {reasoningBlocks.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Reasoning</p>
          <ul className="space-y-2 text-xs">
            {reasoningBlocks.slice(0, 5).map((b) => (
              <li key={b.title} className="rounded-lg bg-white/80 border border-neutral-200/60 p-2">
                <span className="font-semibold text-neutral-800">{b.title}</span>
                <p className="text-neutral-700 mt-0.5 whitespace-pre-wrap line-clamp-6">{b.body}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {styleTip ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Style tip</p>
          <p className="text-xs text-neutral-800 mt-1 whitespace-pre-wrap">{styleTip}</p>
        </div>
      ) : null}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Semantic search — picks for you</p>
        <p className="text-[11px] text-neutral-500 mt-0.5 mb-1">Ranked for your message and profile context.</p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="h-9 w-9 rounded-xl bg-[var(--connect-accent)] text-white inline-flex items-center justify-center disabled:opacity-50"
            disabled={selected.size === 0}
            title="Try On selected"
            onClick={() => onTryOnSelected([...selected])}
          >
            <CalendarClock className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="h-9 w-9 rounded-xl border border-neutral-300 bg-white text-neutral-900 inline-flex items-center justify-center disabled:opacity-50"
            disabled={selected.size === 0}
            title="Clear selection"
            onClick={() => setSelected(new Set())}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto mt-1 pb-1">
          {recommendedIds!.map((id) => {
            const p = products.find((x) => x.id === id);
            if (!p) return null;
            const isSelected = selected.has(id);
            return (
              <div key={id} className="shrink-0 w-24">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className={`h-5 w-5 rounded border flex items-center justify-center ${
                      isSelected ? "bg-[var(--connect-accent)] text-white border-[var(--connect-accent)]" : "bg-white border-neutral-300 text-transparent"
                    }`}
                    title={isSelected ? "Deselect" : "Select"}
                    onClick={() => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                    }}
                  >
                    ✓
                  </button>
                </div>
                <Link to={`/product/${encodeURIComponent(p.id)}`} className="block">
                  <div className="mt-1 aspect-[3/4] rounded-lg overflow-hidden bg-neutral-200 border border-neutral-200 hover:border-[var(--connect-accent)] transition-colors">
                    <img src={catalogMediaUrl(apiBase, p.imageAssetName)} alt={p.name} className="w-full h-full object-cover" />
                  </div>
                  <p className="text-[10px] font-medium line-clamp-2 mt-1">{p.name}</p>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
