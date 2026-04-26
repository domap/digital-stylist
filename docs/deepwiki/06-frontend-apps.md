# 06 — Frontend apps

[← HTTP API catalog](05-http-api-catalog.md) · [DeepWiki home](README.md) · [Data →](07-data-postgres-and-chroma.md)

## Workspaces

Root `package.json` defines npm workspaces:

- **`apps/clienteling`** — `@digital-stylist/clienteling`
- **`apps/connect`** — `@digital-stylist/connect`

Scripts: `npm run dev:clienteling`, `npm run dev:connect`, matching `build:*`.

## Vite proxy (local dev)

Both apps proxy to **`http://127.0.0.1:3000`**:

- **`/api`** → orchestration → worker `/api/v1/...`
- **`/v1`** → orchestration → worker `/v1/...` (chat uses `POST /v1/chat`)

**Files:** `apps/clienteling/vite.config.ts`, `apps/connect/vite.config.ts`.

## Clienteling (associate console)

- **Stack:** React 18, React Router, Radix UI primitives, TanStack Query, Tailwind, Sonner, etc.
- **Key API module:** `apps/clienteling/src/lib/stylist-api.ts` — catalog, customers, `sendStylistChat`, associate suggestions, quick notes.
- **Voice:** `VoiceInputButton`, `voice-intent.ts` → `/api/v1/voice/transcript-to-intent`.
- **Observability:** `apps/clienteling/src/lib/observability.ts` — `mergeObservabilityHeaders` on fetches (`X-Request-Id`, `X-Trace-Id`).

## Connect (shopper / Ann)

- **Stack:** leaner dependency set; React Router, React Markdown.
- **Key API module:** `apps/connect/src/api/stylist.ts` — `apiFetch` wraps all worker calls; merges observability headers.
- **Voice:** same pattern as Clienteling; checkout / fitting flows call retail APIs under `/api/v1`.

## Auth expectations

There is **no** shared OAuth service in-repo. Connect may implement **demo OTP** flows; production identity should be layered at the edge (API gateway, BFF) if required.

Next: [07 — Data: Postgres & Chroma](07-data-postgres-and-chroma.md).
