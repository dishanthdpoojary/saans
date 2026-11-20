export class ApiError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) {
    super(message);
  }
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body.retryable ?? res.status >= 500);
  return body as T;
}

export const qs = (o: Record<string, string | number | undefined | null>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)])).toString();

export const swrOpts = {
  revalidateOnFocus: false,
  // exponential-ish retry for transient upstream failures, never for 4xx
  onErrorRetry: (err: ApiError, _key: string, _cfg: unknown, revalidate: (o: { retryCount: number }) => void, { retryCount }: { retryCount: number }) => {
    if (!err.retryable || retryCount >= 3) return;
    setTimeout(() => revalidate({ retryCount }), 2000 * 2 ** retryCount);
  },
};
