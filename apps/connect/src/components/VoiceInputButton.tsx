import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import {
  getSpeechRecognitionConstructor,
  isSpeechRecognitionSupported,
  type SpeechRecognitionLike,
} from "@/lib/voice";

const SILENCE_END_MS = 1000;
const MAX_LISTEN_MS = 90_000;

type VoiceInputButtonProps = {
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onListeningChange?: (listening: boolean) => void;
  className?: string;
  title?: string;
};

export function VoiceInputButton({ disabled, onTranscript, onListeningChange, className, title }: VoiceInputButtonProps) {
  const [listening, setListening] = useState(false);
  const [unsupported] = useState(() => !isSpeechRecognitionSupported());
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const latestInterim = useRef("");
  const latestFinal = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    clearTimers();
    const r = recRef.current;
    recRef.current = null;
    if (r) {
      try {
        r.stop();
      } catch {
        try {
          r.abort();
        } catch {
          /* ignore */
        }
      }
    }
    setListening(false);
    onListeningChange?.(false);
  }, [clearTimers, onListeningChange]);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor || disabled) return;
    latestInterim.current = "";
    latestFinal.current = "";
    const r = new Ctor();
    recRef.current = r;
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.maxAlternatives = 1;

    const scheduleEndAfterSilence = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        if (recRef.current !== r) return;
        try {
          r.stop();
        } catch {
          /* ignore */
        }
      }, SILENCE_END_MS);
    };

    r.onresult = (ev) => {
      let interim = "";
      let finals = "";
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const piece = ev.results[i][0]?.transcript ?? "";
        if (ev.results[i].isFinal) finals += piece;
        else interim += piece;
      }
      if (finals) latestFinal.current = `${latestFinal.current} ${finals}`.trim();
      if (interim) latestInterim.current = interim;
      scheduleEndAfterSilence();
    };

    r.onstart = () => {
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
      maxTimerRef.current = setTimeout(() => {
        maxTimerRef.current = null;
        if (recRef.current !== r) return;
        try {
          r.stop();
        } catch {
          /* ignore */
        }
      }, MAX_LISTEN_MS);
    };

    r.onerror = () => {
      cleanup();
    };

    r.onend = () => {
      clearTimers();
      recRef.current = null;
      const out = (latestFinal.current || latestInterim.current).trim();
      latestFinal.current = "";
      latestInterim.current = "";
      if (out) onTranscript(out);
      setListening(false);
      onListeningChange?.(false);
    };

    try {
      r.start();
      setListening(true);
      onListeningChange?.(true);
    } catch {
      cleanup();
    }
  }, [cleanup, clearTimers, disabled, onListeningChange, onTranscript]);

  const toggle = useCallback(() => {
    if (disabled || unsupported) return;
    if (listening) {
      clearTimers();
      try {
        recRef.current?.stop();
      } catch {
        cleanup();
      }
    } else {
      start();
    }
  }, [clearTimers, cleanup, disabled, listening, start, unsupported]);

  return (
    <button
      type="button"
      disabled={disabled || unsupported}
      title={
        unsupported
          ? (title ?? "Voice input is not supported in this browser (try Chrome or Edge).")
          : listening
            ? (title ?? "Listening… pause ~2s when you’re done to send, or tap to stop now")
            : (title ?? "Speak your message — we detect a natural pause (≈2s) as the end, or tap while listening to stop early")
      }
      aria-pressed={listening}
      aria-label={listening ? "Stop voice input or wait for pause to auto-send" : "Start voice input"}
      onClick={toggle}
      className={
        className ??
        `rounded-xl border px-3 py-2.5 shrink-0 disabled:opacity-40 ${
          listening
            ? "border-[var(--connect-accent)] bg-[var(--connect-accent)]/10 ring-2 ring-[var(--connect-accent)]/40"
            : "border-neutral-300 bg-white hover:border-[var(--connect-accent)]"
        }`
      }
    >
      {listening ? <MicOff className="h-4 w-4 text-red-600" /> : <Mic className="h-4 w-4 text-neutral-800" />}
    </button>
  );
}
