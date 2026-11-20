import "server-only";

/**
 * Resilient upstream fetch: timeout, bounded retries with exponential backoff + jitter,
 * Retry-After support for 429s, and typed errors so routes can degrade gracefully.
 */

export class UpstreamError extends Error {
  readonly source: string;
  readonly status?: number;
  readonly retryable: boolean;
  constructor(message: string, source: string, status?: number, retryable = false) {
    super(message);
    this.name = "UpstreamError";
    this.source = source;
    this.status = status;
    this.retryable = retryable;
  }
}

interface FetchOpts {
  source: string;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson<T>(url: string, opts: FetchOpts): Promise<T> {
  const { source, timeoutMs = 9000, retries = 2, headers, method = "GET", body } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, body, headers, signal: ctrl.signal, cache: "no-store" });
      if (res.ok) return (await res.json()) as T;

      const retryable = res.status === 429 || res.status >= 500;
      const err = new UpstreamError(
        res.status === 429 ? `${source} rate limit reached` : `${source} responded ${res.status}`,
        source,
        res.status,
        retryable,
      );
      if (!retryable || attempt === retries) throw err;
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 5) * 1000 : backoff(attempt));
      lastErr = err;
    } catch (e) {
      if (e instanceof UpstreamError && !e.retryable) throw e;
      lastErr =
        e instanceof UpstreamError
          ? e
          : new UpstreamError(
              (e as Error)?.name === "AbortError" ? `${source} timed out` : `${source} unreachable`,
              source,
              undefined,
              true,
            );
      if (attempt === retries) throw lastErr;
      await sleep(backoff(attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function backoff(attempt: number) {
  return 300 * 2 ** attempt + Math.random() * 200;
}
