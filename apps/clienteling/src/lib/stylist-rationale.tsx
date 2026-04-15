import ReactMarkdown from "react-markdown";

/** Strip IDs and internal footers before markdown render (covers cached transcripts). */
export function sanitizeStylistRationale(raw: string, productIds?: string[]): string {
  let s = raw.replace(/\r\n/g, "\n");
  s = s.replace(/\n+_Intent:\s*[\s\S]*$/i, "");
  s = s.replace(/\n+##\s*Intent\b[\s\S]*$/i, "");
  s = s.replace(/\s*\([^)]*\bSKU\b[^)]*\)/gi, "");
  s = s.replace(/\bSKU\s*:\s*[^\n|)\],.]+/gi, "");
  s = s.replace(/\bat-\d{3}\b/gi, "");
  if (productIds?.length) {
    for (const id of productIds) {
      const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      s = s.replace(new RegExp(`\\b${esc}\\b`, "gi"), "");
    }
  }
  s = s.replace(/\*\*\s*\*\*/g, "");
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

type StylistRationaleProps = {
  content: string;
  productIds?: string[];
};

export function StylistRationale({ content, productIds }: StylistRationaleProps) {
  const cleaned = sanitizeStylistRationale(content, productIds);

  return (
    <div className="stylist-rationale-markdown prose prose-sm max-w-none text-foreground prose-p:leading-relaxed prose-p:my-2 prose-strong:font-semibold prose-strong:text-foreground">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h2 className="mt-4 scroll-m-20 border-b border-border pb-1.5 text-base font-semibold tracking-tight text-foreground first:mt-0">
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 scroll-m-20 border-b border-border pb-1.5 text-base font-semibold tracking-tight text-foreground first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 scroll-m-20 text-sm font-semibold text-foreground">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-2 text-sm font-medium text-foreground">{children}</h4>
          ),
          p: ({ children }) => <p className="text-sm leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-4 text-sm">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-4 text-sm">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-muted-foreground/40 pl-3 text-sm italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-border" />,
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
