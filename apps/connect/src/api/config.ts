/**
 * In dev, Vite proxies `/api` and `/v1` to orchestration (see vite.config.ts).
 * Set `VITE_API_BASE_URL` only when the UI is built to talk to an absolute API origin.
 */
export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
}

export function catalogMediaUrl(apiBase: string, imageAssetName: string): string {
  const safe = encodeURIComponent(imageAssetName.replace(/^\/+/, ""));
  const path = `/api/v1/catalog/media/${safe}`;
  if (!apiBase) return path;
  return `${apiBase}${path}`;
}
