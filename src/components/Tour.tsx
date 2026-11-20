"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";

/**
 * Guided product tour (spotlight + card). Steps can live on different pages: the tour navigates,
 * waits for the target to render, scrolls it into view and follows it on scroll/resize.
 * Starts automatically on a first visit; replay any time from the "?" button or the menu.
 */

interface Step {
  route: string;
  target: string; // CSS selector, "" for a centred card
  title: string;
  body: string;
}

const STEPS: Step[] = [
  { route: "/", target: "", title: "Welcome to Saans", body: "Saans shows the air you're breathing right now, where it's worse or better, and how to plan your day around it. This tour takes about a minute." },
  { route: "/", target: "[data-tour=verdict]", title: "The live reading", body: "AQI for your place: the median of the fresh ground stations within 25 km when there are any, otherwise a labelled model estimate, plus the next 24 hours. The haze and dust over the photo are set by the live PM2.5." },
  { route: "/", target: "[data-tour=location]", title: "Your place", body: "Search any city or town, or use your current location. Every page follows the place you pick." },
  { route: "/", target: "[data-tour=sources]", title: "Five public sources, cross-checked", body: "Two station networks, the Copernicus model, weather and AI. Each one reports independently, so you can see when they agree." },
  { route: "/", target: "[data-tour=map]", title: "The air around you", body: "Small markers are individual ground stations, larger ones are cities (the median of fresh stations, or a labelled model estimate). The glow between them is the pollution heatmap. Click anywhere to check that exact spot." },
  { route: "/", target: "[data-tour=hotspots]", title: "Hotspots and cleaner air", body: "The most polluted cities right now, and relatively cleaner places within 400 km of you. Pick one to fly there." },
  { route: "/", target: "[data-tour=pollutants]", title: "What's in the air", body: "PM2.5, PM10, NO₂, SO₂, CO and O₃, each labelled with where the number came from." },
  { route: "/budget", target: "[data-tour=budget]", title: "Your breath budget", body: "Tell Saans about your day. It estimates how much PM2.5 you'll actually inhale, then moves your flexible plans to cleaner hours to cut that dose." },
  { route: "/forecast", target: "[data-tour=ml]", title: "Forecast and our own model", body: "Five days of CAMS forecast next to Saans' machine-learning prediction, with an honest back-test against simple baselines." },
  { route: "/assistant", target: "[data-tour=ask]", title: "Ask by text or voice", body: "Try 'Can my kids play outside?'. Answers use only the live numbers Saans fetched, and say where they came from." },
  { route: "/", target: "[data-tour=alerts]", title: "Get alerted", body: "Set an AQI limit for any place. Saans checks every 10 minutes and notifies you when the air crosses it." },
  { route: "/", target: "", title: "You're set", body: "Replay this tour any time from the Product tour button in the corner." },
];

const KEY = "saans.tour.v2";
type Rect = { top: number; left: number; width: number; height: number };

export function Tour() {
  const [i, setI] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(220);
  const [vp, setVp] = useState({ w: 1200, h: 800 });
  const card = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const path = usePathname();

  const close = useCallback(() => {
    localStorage.setItem(KEY, "done");
    setI(null);
    target.current = null;
  }, []);

  // first visit → auto start on the home page; "?" button → start any time
  useEffect(() => {
    const start = () => setI(0);
    window.addEventListener("saans:tour", start);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (path === "/" && !localStorage.getItem(KEY)) t = setTimeout(start, 1800);
    return () => {
      window.removeEventListener("saans:tour", start);
      if (t) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  const step = i == null ? null : STEPS[i];

  // navigate when a step lives on another page
  useEffect(() => {
    if (step && step.route !== path) router.push(step.route);
  }, [step, path, router]);

  // find the target (it may render late), scroll it into view once
  useLayoutEffect(() => {
    target.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset spotlight for the new step
    setRect(null);
    if (!step || !step.target || step.route !== path) return;
    let tries = 0;
    let timer = 0;
    const find = () => {
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (!el || el.getBoundingClientRect().width === 0) {
        if (tries++ < 25) timer = window.setTimeout(find, 160);
        return;
      }
      target.current = el;
      el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior }); // jump once; the page stays still
    };
    find();
    return () => window.clearTimeout(timer);
  }, [step, path]);

  // lock page scrolling while the tour is open so the spotlight and card stay put
  useEffect(() => {
    if (i == null) return;
    const html = document.documentElement;
    const prev = { overflow: html.style.overflow, behavior: html.style.scrollBehavior };
    html.style.overflow = "hidden";
    html.style.scrollBehavior = "auto";
    return () => {
      html.style.overflow = prev.overflow;
      html.style.scrollBehavior = prev.behavior;
    };
  }, [i]);

  // follow the target every frame while open; keyboard controls
  useEffect(() => {
    if (i == null) return;
    let raf = 0;
    const track = () => {
      setVp((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
      const el = target.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const n = { top: Math.max(4, r.top - 8), left: Math.max(4, r.left - 8), width: Math.min(r.width + 16, window.innerWidth - 8), height: Math.min(r.height + 16, window.innerHeight - 8) };
        setRect((o) => (o && Math.abs(o.top - n.top) < 0.5 && Math.abs(o.left - n.left) < 0.5 && o.width === n.width && o.height === n.height ? o : n));
      }
      if (card.current) setCardH(card.current.offsetHeight);
      raf = requestAnimationFrame(track);
    };
    raf = requestAnimationFrame(track);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setI((k) => (k != null && k + 1 < STEPS.length ? k + 1 : k));
      if (e.key === "ArrowLeft") setI((k) => (k != null && k > 0 ? k - 1 : k));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [i, close]);

  if (i == null || !step) return null;

  const W = Math.min(380, vp.w - 24);
  const M = 12;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  let top: number;
  let left: number;
  if (!rect) {
    top = vp.h / 2 - cardH / 2;
    left = vp.w / 2 - W / 2;
  } else {
    const below = vp.h - (rect.top + rect.height);
    if (below >= cardH + 2 * M) top = rect.top + rect.height + M;
    else if (rect.top >= cardH + 2 * M) top = rect.top - cardH - M;
    else top = vp.h - cardH - 20; // target fills the screen: dock the card at the bottom
    left = rect.left;
  }
  top = clamp(top, M, vp.h - cardH - M);
  left = clamp(left, M, vp.w - W - M);
  const last = i + 1 === STEPS.length;

  return (
    <>
      <div className="tour-shade" style={rect ?? { top: vp.h / 2, left: vp.w / 2, width: 0, height: 0 }} />
      <div className="tour-card" ref={card} style={{ top, left, width: W }} role="dialog" aria-modal="true" aria-label={step.title}>
        <button className="absolute right-3 top-3 text-haze hover:text-white" onClick={close} aria-label="Close the tour"><X size={17} /></button>
        <p className="label text-sky">Product tour / {i + 1} of {STEPS.length}</p>
        <h3 className="mt-1.5 text-xl">{step.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-soft">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex gap-1" aria-hidden>
            {STEPS.map((_, k) => <i key={k} className={`h-1 ${k === i ? "w-4 bg-white" : "w-1.5 bg-white/25"}`} />)}
          </div>
          <span className="flex-1" />
          {!last && <button className="px-2 text-sm text-haze hover:text-white" onClick={close}>Skip</button>}
          {i > 0 && <button className="btn px-3 py-1.5" onClick={() => setI(i - 1)}>Back</button>}
          <button className="btn btn-primary px-3.5 py-1.5" onClick={() => (last ? close() : setI(i + 1))} autoFocus>{last ? "Start exploring" : "Next"}</button>
        </div>
      </div>
    </>
  );
}
