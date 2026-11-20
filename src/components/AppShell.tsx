"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronRight, Menu, PlayCircle, X } from "lucide-react";
import { LocationProvider } from "@/lib/client/location";
import { AlertsProvider, useAlerts } from "@/lib/client/alerts";
import { LocationPicker } from "./LocationSearch";
import { AlertsBell } from "./AlertsBell";
import { Tour } from "./Tour";
import { Logo } from "./Logo";
import { NewsTicker } from "./NewsTicker";

const PRIMARY = [
  { href: "/map", label: "Map", n: "01" },
  { href: "/forecast", label: "Forecast", n: "02" },
  { href: "/budget", label: "Breath budget", n: "03" },
];
const SECONDARY = [
  { href: "/history", label: "History" },
  { href: "/compare", label: "Compare" },
  { href: "/assistant", label: "Ask Saans" },
];
const MORE = [
  { href: "/health", label: "Health guide", desc: "What each level means, and an activity planner" },
  { href: "/leaderboard", label: "Rankings", desc: "Cleanest and most polluted cities right now" },
  { href: "/report", label: "Impact report", desc: "A printable analysis of the last 7 to 90 days" },
  { href: "/sources", label: "Data sources", desc: "Where every number comes from" },
];
const ALL = [{ href: "/", label: "Today" }, ...PRIMARY, ...SECONDARY, ...MORE];

const startTour = () => window.dispatchEvent(new Event("saans:tour"));

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LocationProvider>
      <AlertsProvider>
        <Shell>{children}</Shell>
      </AlertsProvider>
    </LocationProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const bare = path === "/" || path === "/map";
  const [menu, setMenu] = useState(false);
  const [more, setMore] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- close menus on navigation
  useEffect(() => { setMenu(false); setMore(false); }, [path]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => !moreRef.current?.contains(e.target as Node) && setMore(false);
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-screen">
      <header
        className={clsx(
          "no-print fixed inset-x-0 top-0 z-[1100] flex h-14 items-center gap-3 px-3 transition-colors md:px-5",
          scrolled || !bare ? "border-b border-line bg-base/85 backdrop-blur-md" : "bg-gradient-to-b from-black/50 to-transparent",
        )}
      >
        <Link href="/" className="flex items-center gap-2 pr-2" aria-label="Saans home">
          <Logo size={24} />
          <span className="font-mono text-[13px] font-semibold tracking-[0.18em]">SAANS</span>
        </Link>

        <nav className="hidden items-center gap-1 xl:flex" aria-label="Main" data-tour="nav">
          {PRIMARY.map((l) => (
            <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? "page" : undefined}
              className={clsx("flex w-40 items-center justify-between border px-2.5 py-1.5 font-mono text-[11.5px] uppercase tracking-wide transition-colors",
                isActive(l.href) ? "border-white/40 bg-white/10 text-white" : "border-white/12 bg-black/25 text-white/80 hover:border-white/30 hover:text-white")}>
              {l.label} <span className="text-white/35">{l.n}</span>
            </Link>
          ))}
        </nav>

        <span className="flex-1" />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="More pages">
          {SECONDARY.map((l) => (
            <Link key={l.href} href={l.href} className={clsx("px-2 py-1.5 font-mono text-[11.5px] uppercase tracking-wide", isActive(l.href) ? "text-white" : "text-white/65 hover:text-white")}>{l.label}</Link>
          ))}
          <div ref={moreRef} className="relative">
            <button onClick={() => setMore((m) => !m)} aria-expanded={more} className={clsx("flex items-center gap-1 px-2 py-1.5 font-mono text-[11.5px] uppercase tracking-wide", MORE.some((m) => isActive(m.href)) ? "text-white" : "text-white/65 hover:text-white")}>
              More <ChevronDown size={13} className={clsx("transition-transform", more && "rotate-180")} />
            </button>
            {more && (
              <div className="glass-dense absolute right-0 top-full mt-2 w-80 rounded-md p-1.5 shadow-2xl">
                {MORE.map((m) => (
                  <Link key={m.href} href={m.href} className="block rounded px-3 py-2.5 hover:bg-white/6">
                    <p className="text-sm text-white">{m.label}</p>
                    <p className="text-xs text-muted">{m.desc}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="flex items-center gap-1.5">
          <LocationPicker />
          <AlertsBell />
          <button className="btn glow-cta hidden md:inline-flex" onClick={startTour} data-tour="tour-btn">Tour</button>
          <Link href="/budget" className="btn btn-primary hidden sm:inline-flex">Plan my day <ChevronRight size={13} /></Link>
          <button className="btn px-2 lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu"><Menu size={16} /></button>
        </div>
      </header>

      <NewsTicker />

      {menu && (
        <div className="fixed inset-0 z-[3000] overflow-auto bg-base px-5 pb-10 pt-4 lg:hidden" role="dialog" aria-label="Menu">
          <div className="flex h-10 items-center justify-between">
            <span className="flex items-center gap-2"><Logo size={24} /><span className="font-mono text-[13px] font-semibold tracking-[0.18em]">SAANS</span></span>
            <button className="btn px-2" onClick={() => setMenu(false)} aria-label="Close menu"><X size={16} /></button>
          </div>
          <nav className="mt-6 border-t border-line" aria-label="Main">
            {ALL.map((l) => (
              <Link key={l.href} href={l.href} className={clsx("flex items-center justify-between border-b border-line py-3.5 text-xl", isActive(l.href) ? "text-white" : "text-white/70")}>
                {l.label} <ChevronRight size={16} className="text-faint" />
              </Link>
            ))}
          </nav>
          <button className="btn btn-primary mt-6 w-full py-3" onClick={() => { setMenu(false); startTour(); }}><PlayCircle size={15} /> Take the product tour</button>
        </div>
      )}

      <main className={clsx(!bare && "mx-auto w-full max-w-7xl px-4 pb-20 pt-32 md:px-8 md:pt-36")}>{children}</main>
      {!bare && <Footer />}
      <button onClick={startTour} className="no-print btn glass-dense glow-cta fixed bottom-4 left-4 z-[1050] shadow-xl" aria-label="Start the product tour">
        <PlayCircle size={14} /> Product tour
      </button>
      <Toasts />
      <Tour />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="no-print border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-10">
        <div>
          <span className="flex items-center gap-2"><Logo size={22} /><span className="font-mono text-[13px] font-semibold tracking-[0.18em]">SAANS</span></span>
          <p className="mt-3 max-w-xs text-sm text-muted">Know the air before you breathe it. Built for the Lets Code Diwali Challenge 2026.</p>
        </div>
        <FooterCol title="Product" links={[["Map", "/map"], ["Forecast", "/forecast"], ["Breath budget", "/budget"], ["Ask Saans", "/assistant"]]} />
        <FooterCol title="Explore" links={[["History", "/history"], ["Compare", "/compare"], ["Rankings", "/leaderboard"], ["Impact report", "/report"]]} />
        <FooterCol title="About" links={[["Health guide", "/health"], ["Data sources", "/sources"]]} />
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-7xl px-5 py-4 text-xs text-faint md:px-10">
          Data: WAQI, OpenAQ, Copernicus CAMS via Open-Meteo. Estimates are always labelled. Photography: Johan Mouchet, Ahmer Kalam and vegonaise on Unsplash.
        </p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="label">{title}</p>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {links.map(([l, h]) => <li key={h}><Link href={h} className="text-white/75 hover:text-white">{l}</Link></li>)}
      </ul>
    </div>
  );
}

function Toasts() {
  const { toasts, dismiss } = useAlerts();
  return (
    <div className="no-print fixed bottom-4 right-4 z-[2000] flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="glass-dense flex gap-3 rounded-md p-4 shadow-2xl" style={{ borderLeft: `3px solid ${t.color}` }}>
          <div className="flex-1 text-sm">
            <p className="font-medium">{t.title}</p>
            <p className="mt-0.5 text-muted">{t.body}</p>
          </div>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-muted hover:text-white"><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}
