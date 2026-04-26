/**
 * Public orchestration API (Express). Forwards chat requests to the Python worker.
 *
 * Production: set NODE_ENV=production, STYLIST_CORS_ORIGINS, STYLIST_WORKER_URL,
 * optional STYLIST_WORKER_TIMEOUT_MS (default 200000).
 */

import { randomUUID } from "node:crypto";

import { logEvent } from "./observability.mjs";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const PORT = Number(process.env.PORT ?? 3000);
const WORKER_URL = (process.env.STYLIST_WORKER_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const isProd = (process.env.NODE_ENV ?? "development") === "production";
const workerTimeoutMs = Number(process.env.STYLIST_WORKER_TIMEOUT_MS ?? 200_000);

const corsOrigins = process.env.STYLIST_CORS_ORIGINS?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.disable("x-powered-by");

if (process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

app.use(helmet({ contentSecurityPolicy: isProd ? undefined : false }));
app.use(express.json({ limit: "512kb" }));

if (corsOrigins?.length) {
  app.use(cors({ origin: corsOrigins, credentials: true }));
} else {
  app.use(cors());
}

app.use((_req, res, next) => {
  res.setHeader("Access-Control-Expose-Headers", "X-Request-Id, X-Trace-Id");
  next();
});

/**
 * Proxy retail/catalog routes to the Python worker (same paths as the worker serves under /api/v1).
 * Lets storefront apps use a single origin (this gateway + Vite dev proxy to PORT).
 */
app.use(async (req, res, next) => {
  if (!req.originalUrl.startsWith("/api/")) {
    return next();
  }
  const rid = req.headers["x-request-id"] ?? randomUUID();
  const trace = (req.headers["x-trace-id"] ?? "").toString().trim() || undefined;
  const targetUrl = `${WORKER_URL}${req.originalUrl}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), workerTimeoutMs);
  const t0 = Date.now();
  try {
    const outHeaders = new Headers();
    outHeaders.set("X-Request-Id", rid);
    if (trace) {
      outHeaders.set("X-Trace-Id", trace);
    }
    if (req.headers.accept) {
      outHeaders.set("Accept", req.headers.accept);
    }
    const method = (req.method ?? "GET").toUpperCase();
    let body;
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      outHeaders.set("Content-Type", "application/json");
      body = JSON.stringify(req.body ?? {});
    }
    const r = await fetch(targetUrl, {
      method: req.method,
      headers: outHeaders,
      body,
      signal: ac.signal,
    });
    res.setHeader("X-Request-Id", rid);
    if (trace) {
      res.setHeader("X-Trace-Id", trace);
    }
    const ct = r.headers.get("content-type");
    if (ct) {
      res.setHeader("Content-Type", ct);
    }
    res.status(r.status);
    res.send(Buffer.from(await r.arrayBuffer()));
    logEvent("proxy_worker_complete", {
      request_id: rid,
      trace_id: trace,
      method: req.method,
      path: req.originalUrl?.split("?")[0] ?? req.path,
      status_code: r.status,
      duration_ms: Date.now() - t0,
    });
  } catch (err) {
    const aborted = err?.name === "AbortError";
    logEvent("proxy_worker_error", {
      request_id: rid,
      trace_id: trace,
      method: req.method,
      path: req.originalUrl?.split("?")[0] ?? req.path,
      duration_ms: Date.now() - t0,
      error_type: aborted ? "worker_timeout" : "worker_unreachable",
      detail: String(err),
    });
    res.status(aborted ? 504 : 502).json({
      error: aborted ? "worker_timeout" : "worker_unreachable",
      detail: String(err),
    });
  } finally {
    clearTimeout(timer);
  }
});

const chatLimiter = rateLimit({
  windowMs: 60_000,
  max: isProd ? 60 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many requests" },
});

async function fetchWorker(path, init) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), workerTimeoutMs);
  try {
    return await fetch(`${WORKER_URL}${path}`, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

app.get("/", (_req, res) => {
  const body = {
    service: "digital-stylist-orchestration",
    endpoints: ["GET /health", "GET /ready", "POST /v1/chat", "GET|POST /api/* → worker"],
  };
  if (!isProd) {
    body.worker = WORKER_URL;
  }
  res.json(body);
});

app.get("/health", async (_req, res) => {
  try {
    const r = await fetchWorker("/health");
    const worker = r.ok ? await r.json() : { status: "error", body: await r.text() };
    res.status(r.ok ? 200 : 502).json({
      orchestration: "ok",
      worker,
    });
  } catch (err) {
    res.status(503).json({
      orchestration: "ok",
      worker: { status: "unreachable", detail: String(err) },
    });
  }
});

app.get("/ready", async (_req, res) => {
  try {
    const r = await fetchWorker("/ready");
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json({ orchestration: "ok", worker: data });
  } catch (err) {
    res.status(503).json({ orchestration: "ok", ready: false, detail: String(err) });
  }
});

/**
 * Body: { message, thread_id?, context_metadata?, merge_session_defaults? }
 */
app.post("/v1/chat", chatLimiter, async (req, res) => {
  const rid = req.headers["x-request-id"] ?? randomUUID();
  const trace = (req.headers["x-trace-id"] ?? "").toString().trim() || undefined;
  const t0 = Date.now();
  try {
    const fwd = {
      "Content-Type": "application/json",
      "X-Request-Id": rid,
    };
    if (trace) {
      fwd["X-Trace-Id"] = trace;
    }
    const r = await fetchWorker("/v1/invoke", {
      method: "POST",
      headers: fwd,
      body: JSON.stringify(req.body ?? {}),
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    res.setHeader("X-Request-Id", rid);
    if (trace) {
      res.setHeader("X-Trace-Id", trace);
    }
    res.status(r.status).json(data);
    logEvent("chat_proxy_complete", {
      request_id: rid,
      trace_id: trace,
      status_code: r.status,
      duration_ms: Date.now() - t0,
    });
  } catch (err) {
    const aborted = err?.name === "AbortError";
    logEvent("chat_proxy_error", {
      request_id: rid,
      trace_id: trace,
      duration_ms: Date.now() - t0,
      error_type: aborted ? "worker_timeout" : "worker_unreachable",
      detail: String(err),
    });
    res.status(aborted ? 504 : 502).json({
      error: aborted ? "worker_timeout" : "worker_unreachable",
      detail: String(err),
    });
  }
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Digital Stylist orchestration listening on 0.0.0.0:${PORT} (worker ${isProd ? "<redacted>" : WORKER_URL})`,
  );
});

function shutdown(signal) {
  console.log(`${signal} received, closing`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
