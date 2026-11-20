import "server-only";
import { UpstreamError } from "./http";

/** Per-IP token bucket protecting our upstream quotas (and the Gemini free tier). */
const buckets = new Map<string, { tokens: number; at: number }>();

export function rateLimit(req: Request, { capacity = 60, refillPerSec = 1, scope = "default" } = {}) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: capacity, at: now };
  b.tokens = Math.min(capacity, b.tokens + ((now - b.at) / 1000) * refillPerSec);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 5000) buckets.clear();
  return true;
}

export function parseCoords(url: URL): { lat: number; lon: number } | null {
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (!url.searchParams.has("lat") || !url.searchParams.has("lon")) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function json(data: unknown, init: { status?: number; sMaxAge?: number } = {}) {
  const { status = 200, sMaxAge } = init;
  const headers: Record<string, string> = {};
  if (sMaxAge && status === 200) headers["Cache-Control"] = `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 4}`;
  else headers["Cache-Control"] = "no-store";
  return Response.json(data, { status, headers });
}

export function errorResponse(e: unknown) {
  if (e instanceof UpstreamError) {
    const status = e.status === 429 ? 429 : 502;
    return json({ error: e.message, source: e.source, retryable: e.retryable }, { status });
  }
  console.error(e);
  return json({ error: "Unexpected server error" }, { status: 500 });
}

export const tooMany = () => json({ error: "Too many requests, please slow down.", retryable: true }, { status: 429 });
export const badRequest = (msg: string) => json({ error: msg }, { status: 400 });
