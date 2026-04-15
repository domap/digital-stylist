export type VoiceIntentSurface = "connect" | "clienteling" | "cart";

/** Calls worker LLM to infer a clear shopper message from raw speech-to-text; falls back to transcript on error. */
export async function refineVoiceTranscriptToIntent(
  transcript: string,
  surface: VoiceIntentSurface = "clienteling",
): Promise<string> {
  const t = transcript.trim();
  if (!t) return t;
  try {
    const res = await fetch("/api/v1/voice/transcript-to-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: t, surface }),
    });
    if (!res.ok) return t;
    const data = (await res.json()) as { message?: string };
    const m = typeof data.message === "string" ? data.message.trim() : "";
    return m || t;
  } catch {
    return t;
  }
}
