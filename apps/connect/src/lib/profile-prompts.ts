import type { ApiCustomer } from "@/api/types";

/** Max suggestion chips shown in the chat drawer (guest or signed-in). */
export const CONNECT_PROMPT_LIMIT = 3;

/**
 * Guest starters — only the **first** is a full “complete look” ask; the others stay varied.
 */
export const DEFAULT_CONNECT_PROMPT_SUGGESTIONS = [
  "I'm attending a summer wedding—help me build one complete look head to toe (dress or top + pants, plus shoes and a bag).",
  "What colors and fabrics would work best for a warm-weather outdoor event?",
  "I'm between sizes—how should I think about fit for tailored pants vs dresses?",
];

function dedupePrompts(prompts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of prompts) {
    const key = p.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p.trim());
  }
  return out;
}

function completeLookPhrasing(s: string): boolean {
  return /complete look|head to toe|head-to-toe/i.test(s);
}

/** Merges pools and pads to 3, allowing at most one “complete look” phrase. */
function fillToThree(primary: string[], secondary: string[]): string[] {
  const pad = DEFAULT_CONNECT_PROMPT_SUGGESTIONS.slice(1);
  const merged = dedupePrompts([...primary, ...secondary, ...pad, ...DEFAULT_CONNECT_PROMPT_SUGGESTIONS]);
  const result: string[] = [];
  for (const p of merged) {
    if (result.length >= CONNECT_PROMPT_LIMIT) break;
    if (completeLookPhrasing(p) && result.some(completeLookPhrasing)) continue;
    result.push(p);
  }
  return result;
}

/**
 * Builds chat starter prompts from Connect customer profile.
 * At most **one** prompt uses explicit “complete look / head to toe” wording.
 */
export function buildProfilePromptSuggestions(customer: ApiCustomer | null): string[] {
  if (!customer) return [...DEFAULT_CONNECT_PROMPT_SUGGESTIONS];

  const events = customer.upcomingEvents ?? [];
  const withDates = events.filter((e) => e.name?.trim());

  const completeLook =
    withDates.length > 0
      ? (() => {
          const e = withDates[0];
          const name = e.name!.trim();
          const date = e.date?.trim();
          return date
            ? `Help me plan one complete look (head to toe) for my ${name} on ${date}.`
            : `Help me plan one complete look (head to toe) for my ${name}.`;
        })()
      : null;

  const extras: string[] = [];
  for (const e of withDates.slice(1)) {
    const name = e.name!.trim();
    const date = e.date?.trim();
    extras.push(date ? `What should I wear to ${name} on ${date}?` : `What should I wear to ${name}?`);
  }

  const styles = (customer.stylePreferences ?? []).map((s) => s.trim()).filter(Boolean);
  if (styles.length >= 2) {
    extras.push(`Suggest outfits in my usual style (${styles.slice(0, 3).join(", ")}) for the next few weeks.`);
  } else if (styles.length === 1) {
    extras.push(`Show me new arrivals that match my ${styles[0]} aesthetic.`);
  }

  const colors = (customer.colorPreferences ?? []).map((c) => c.trim()).filter(Boolean);
  if (colors.length >= 2) {
    extras.push(`I love ${colors.slice(0, 3).join(", ")}—how can I mix those without clashing?`);
  } else if (colors.length === 1) {
    extras.push(`How can I wear ${colors[0]} in fresh ways this season?`);
  }

  if (customer.preferredSize?.trim() && customer.preferredFit?.trim()) {
    extras.push(
      `I'm usually a size ${customer.preferredSize} in ${customer.preferredFit} fit—what silhouettes should I try?`
    );
  }

  if (customer.tier?.trim()) {
    extras.push(`I'm a ${customer.tier} member—what’s worth investing in vs. a one-time event piece?`);
  }

  if (customer.notes?.trim()) {
    extras.push(`Based on my profile, what gaps should I fill in my closet this month?`);
  }

  const noCompleteDefaults = DEFAULT_CONNECT_PROMPT_SUGGESTIONS.slice(1);
  const pool = dedupePrompts([...extras, ...noCompleteDefaults]);

  if (completeLook) {
    return fillToThree([completeLook], pool);
  }

  return fillToThree([], dedupePrompts([...extras, ...DEFAULT_CONNECT_PROMPT_SUGGESTIONS]));
}
