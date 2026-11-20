"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { ExternalLink, Newspaper } from "lucide-react";
import { fetcher, swrOpts } from "@/lib/client/fetcher";
import { useNow } from "@/lib/client/useNow";

interface Headline {
  title: string;
  url: string;
  domain: string;
  seenAt: string;
  via: string;
}

const ago = (iso: string, now: number | null) => {
  if (now == null) return "";
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

/**
 * Live air-quality headlines as a marquee. Hover or focus pauses it and opens a preview card;
 * click opens the article. Sources: GDELT + Google News, merged server-side (/api/news).
 */
export function NewsTicker() {
  const { data } = useSWR<{ headlines: Headline[] }>("/api/news", fetcher, { ...swrOpts, refreshInterval: 15 * 60_000 });
  const now = useNow();
  const [hover, setHover] = useState<{ h: Headline; x: number; y: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const items = data?.headlines ?? [];
  if (!items.length) return null;

  const show = (h: Headline, el: HTMLElement) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const r = el.getBoundingClientRect();
    setHover({ h, x: Math.min(Math.max(12, r.left), window.innerWidth - 372), y: r.bottom + 8 });
  };
  const hide = () => {
    hideTimer.current = setTimeout(() => setHover(null), 180);
  };
  const duration = Math.max(60, items.length * 7); // seconds for one full loop

  const row = (copy: number) =>
    items.map((h) => (
      <a
        key={`${copy}-${h.url}`}
        href={h.url}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={copy === 0 ? 0 : -1}
        aria-hidden={copy === 1 ? true : undefined}
        onMouseEnter={(e) => show(h, e.currentTarget)}
        onMouseLeave={hide}
        onFocus={(e) => show(h, e.currentTarget)}
        onBlur={hide}
        className="ticker-item group flex shrink-0 items-center gap-2 px-5 text-[13px] text-white/80 hover:text-white focus-visible:text-white"
      >
        <span className="h-1 w-1 shrink-0 rounded-full bg-sky/70" />
        <span className="whitespace-nowrap group-hover:underline group-hover:underline-offset-4">{h.title}</span>
        <span className="label whitespace-nowrap text-[10px]">{h.domain}{now ? ` / ${ago(h.seenAt, now)}` : ""}</span>
      </a>
    ));

  return (
    <>
      <div className="no-print ticker glass-dense fixed inset-x-0 top-14 z-[1090] flex h-9 items-center border-x-0 border-t-0" role="region" aria-label="Latest air quality news">
        <span className="label z-10 flex h-full shrink-0 items-center gap-2 border-r border-line bg-base px-3 text-white/85">
          <Newspaper size={13} className="text-sky" /> <span className="hidden sm:inline">Air quality news</span>
        </span>
        <div className="ticker-viewport relative h-full flex-1 overflow-hidden">
          <div className="ticker-track flex h-full w-max items-center" style={{ animationDuration: `${duration}s` }}>
            {row(0)}
            {row(1)}
          </div>
        </div>
      </div>
      {hover && (
        <div
          className="glass-dense fixed z-[1200] w-[360px] rounded-md p-4 shadow-2xl"
          style={{ left: hover.x, top: hover.y }}
          onMouseEnter={() => hideTimer.current && clearTimeout(hideTimer.current)}
          onMouseLeave={hide}
          role="tooltip"
        >
          <p className="label">{hover.h.domain}{now ? ` / ${ago(hover.h.seenAt, now)}` : ""}</p>
          <p className="mt-1.5 text-[15px] leading-snug text-white">{hover.h.title}</p>
          <a href={hover.h.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-3">
            Open article <ExternalLink size={12} />
          </a>
          <p className="mt-2 text-[11px] text-faint">via {hover.h.via}. Opens the publisher&apos;s site in a new tab.</p>
        </div>
      )}
    </>
  );
}
