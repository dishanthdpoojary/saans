"use client";

import { useEffect, useState } from "react";

/**
 * The current time, read only on the client after mount and refreshed every `intervalMs`.
 * Returns null during prerender so no component ever reads the clock while rendering
 * (Next.js Cache Components rejects that, and it would also cause hydration mismatches).
 */
export function useNow(intervalMs = 60_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
