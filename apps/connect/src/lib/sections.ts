/** Extract markdown section body after a ## heading (customer stylist replies). */
export function extractMarkdownSection(markdown: string, headingPattern: RegExp): string | null {
  const lines = markdown.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (headingPattern.test(lines[i].trim())) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return null;
  const body: string[] = [];
  for (let j = start; j < lines.length; j += 1) {
    if (/^##\s+/.test(lines[j])) break;
    body.push(lines[j]);
  }
  const t = body.join("\n").trim();
  return t.length ? t : null;
}

/** Strip internal IDs / SKU noise before rendering shopper-facing explainability. */
export function sanitizeConnectMarkdown(s: string): string {
  return (s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\bat-\d{3}\b/gi, "")
    .replace(/\bSKU\s*:\s*[^\n|)\],.]+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Markdown for ## Why this for you, ## Style tip, ## Additional tips (collapsed UI in CONNECT). */
export function extractExplainabilityMarkdown(markdown: string): string {
  const blocks = extractReasoningBlocks(markdown ?? "");
  const keep = blocks.filter((b) => /^(why this for you|style tip|additional tips)\b/i.test(b.title.trim()));
  if (!keep.length) return "";
  return keep.map((p) => `## ${p.title}\n${p.body}`).join("\n\n");
}

export function extractReasoningBlocks(markdown: string): { title: string; body: string }[] {
  const out: { title: string; body: string }[] = [];
  const re = /^##\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  const headings: { title: string; index: number }[] = [];
  while ((m = re.exec(markdown)) !== null) {
    headings.push({ title: m[1].trim(), index: m.index });
  }
  for (let i = 0; i < headings.length; i += 1) {
    const h = headings[i];
    const next = headings[i + 1];
    const slice = markdown.slice(h.index, next?.index ?? markdown.length);
    const body = slice.replace(/^##\s+.+\n?/m, "").trim();
    if (body) out.push({ title: h.title, body });
  }
  return out;
}
