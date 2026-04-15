import ReactMarkdown from "react-markdown";
import { extractExplainabilityMarkdown, sanitizeConnectMarkdown } from "@/lib/sections";

export function ConnectExplainability({ content }: { content: string }) {
  const raw = extractExplainabilityMarkdown(content);
  const md = sanitizeConnectMarkdown(raw);
  if (!md) return null;

  return (
    <details className="mt-3 rounded-xl border border-neutral-200/90 bg-white text-xs group">
      <summary className="cursor-pointer select-none list-none px-3 py-2 font-semibold text-neutral-800 flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span>Why Ann picked these</span>
        <span className="text-[10px] font-normal text-neutral-500 shrink-0 group-open:hidden">Show reasons</span>
        <span className="text-[10px] font-normal text-neutral-500 shrink-0 hidden group-open:inline">Hide</span>
      </summary>
      <div className="connect-prose px-3 pb-3 pt-1 border-t border-neutral-100 max-h-56 overflow-y-auto prose-headings:text-[11px] prose-headings:font-semibold prose-headings:mt-2 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-li:my-0">
        <ReactMarkdown>{md}</ReactMarkdown>
      </div>
    </details>
  );
}
