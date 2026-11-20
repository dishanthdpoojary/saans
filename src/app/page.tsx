"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronRight, PlayCircle } from "lucide-react";
import { useLocation } from "@/lib/client/location";
import { useCurrent, useForecast } from "@/lib/client/hooks";
import { categoryFor, POLLUTANTS } from "@/lib/aqi";
import { describeSource, fmtLocalHour, fmtObserved } from "@/lib/client/format";
import { useNow } from "@/lib/client/useNow";
import { ErrorState, KindBadge, Skeleton, Warnings } from "@/components/ui";
import { ShareButton } from "@/components/ShareButton";
import { Insights } from "@/components/Insights";
import { HazePhoto, PHOTOS } from "@/components/HazePhoto";
import { AirMap } from "@/components/AirMap";
import { Footer } from "@/components/AppShell";
import type { CurrentResponse, HourPoint, Snapshot } from "@/lib/types";

export default function Home() {
  const { place } = useLocation();
  const now = useNow();
  const { data, error, mutate } = useCurrent(place);
  const fc = useForecast(place);

  const p = data?.primary ?? null;
  const pm25 = data?.model?.pollutants.find((x) => x.key === "pm2_5")?.value ?? null;

  return (
    <>
      {/* ---------- hero ---------- */}
      <section className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden" data-tour="hero">
        <HazePhoto photo="hero" aqi={p?.aqi ?? null} pm25={pm25} priority />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/35 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-base via-base/60 to-transparent" />

        <div className="relative mx-auto grid w-full max-w-7xl items-end gap-8 px-5 pb-10 pt-36 md:px-10 lg:grid-cols-[1.25fr_1fr] lg:pb-14">
          <div>
            <h1 className="text-[44px] font-normal leading-[1.02] md:text-[68px]">Know the air<br />before you breathe it</h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/75">
              Live readings from ground stations, model estimates where there are none, and a plan for your day that cuts how much pollution you inhale.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Link href="/budget" className="btn btn-primary px-4 py-2.5">Plan my day <ChevronRight size={13} /></Link>
              <button className="btn glow-cta px-4 py-2.5" onClick={() => window.dispatchEvent(new Event("saans:tour"))}><PlayCircle size={14} /> Take the tour</button>
            </div>
          </div>
          <LiveCard place={place.name} data={data} error={error} retry={() => mutate()} next24={fc.data?.forecast.slice(0, 24)} now={now} />
        </div>
      </section>

      {/* ---------- sources grid ---------- */}
      <section className="mx-auto max-w-7xl px-5 md:px-10" data-tour="sources">
        <SourcesGrid data={data} />
      </section>

      {/* ---------- map ---------- */}
      <section id="map" className="mx-auto max-w-7xl scroll-mt-16 px-5 pt-24 md:px-10">
        <SectionHead word="Map." rest="The air around you, station by station." action={<Link href="/map" className="btn">Full screen <ChevronRight size={13} /></Link>} />
        <div className="overflow-hidden rounded-md border border-line">
          <AirMap height="h-[72vh] min-h-[540px]" scrollZoom={false} />
        </div>
        <p className="mt-3 text-sm text-muted">Small markers are individual ground stations. Larger ones are cities: the median of fresh nearby stations, or a model estimate where there are none (hover to see which). The pollution heatmap between them is interpolated and fades out where there is no data. Click anywhere to check that spot.</p>
      </section>

      {/* ---------- now ---------- */}
      <section className="mx-auto max-w-7xl px-5 pt-24 md:px-10" data-tour="snapshot">
        <SectionHead word="Now." rest={`What's in the air in ${place.name}.`} action={<ShareButton place={place} />} />
        {data && <div className="mb-4"><Warnings items={data.warnings} /></div>}
        {data ? <PollutantGrid model={data.model} measured={data.measured} /> : <Skeleton className="h-36" />}

        <div className="grid border border-t-0 border-line lg:grid-cols-[1.4fr_1fr]">
          <div className="border-line p-5 lg:border-r">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="label">Next 24 hours</span>
              <KindBadge kind="forecast" />
              {fc.data?.bestWindow && <span className="chip border-emerald-400/30 text-emerald-200">Best around {fmtLocalHour(fc.data.bestWindow.start, { hour: "numeric" })}</span>}
              {fc.data?.spikes[0] && <span className="chip border-red-400/40 text-red-200">Spike from {fmtLocalHour(fc.data.spikes[0].start)}</span>}
            </div>
            {fc.error ? <ErrorState error={fc.error} compact onRetry={() => fc.mutate()} /> : fc.data ? <HourStrip points={fc.data.forecast.slice(0, 24)} /> : <Skeleton className="h-40" />}
            <Link href="/forecast" className="mt-4 inline-flex items-center gap-1 text-sm text-sky hover:underline">Five-day forecast and our ML prediction <ChevronRight size={14} /></Link>
          </div>
          <div className="border-t border-line p-5 lg:border-t-0">
            <Insights place={place} />
          </div>
        </div>
      </section>

      {/* ---------- plan ---------- */}
      <section className="mx-auto max-w-7xl px-5 pt-24 md:px-10">
        <SectionHead word="Plan." rest="Breathe less of it." />
        <div className="grid overflow-hidden rounded-md border border-line md:grid-cols-2">
          <div className="zoom-on-hover relative min-h-[300px] overflow-hidden">
            <Image src={`${PHOTOS.street.src}?auto=format&fit=crop&w=1400&q=75`} alt={PHOTOS.street.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" unoptimized />
          </div>
          <div className="flex flex-col justify-center gap-4 bg-surface p-8 md:p-10">
            <p className="label">Breath budget</p>
            <p className="text-2xl leading-snug md:text-3xl">A city&apos;s AQI isn&apos;t what you breathe. Your day is.</p>
            <p className="text-[15px] leading-relaxed text-muted">
              Tell Saans when you run, commute and run errands. It estimates the PM2.5 you&apos;ll actually inhale, using hourly forecasts, how hard you breathe during each activity and how much outdoor air gets indoors, then moves your flexible plans to cleaner hours.
            </p>
            <Link href="/budget" className="btn btn-primary self-start px-4 py-2.5">Plan my day <ChevronRight size={13} /></Link>
          </div>
        </div>
      </section>

      {/* ---------- explore ---------- */}
      <section className="mx-auto max-w-7xl px-5 pt-24 md:px-10">
        <SectionHead word="Explore." rest="Everything Saans can tell you." />
        <div className="grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
          {DIRECTORY.map((d) => (
            <Link key={d.href} href={d.href} onMouseMove={spot} className="spotlight group flex min-h-[150px] flex-col justify-between border-b border-r border-line p-5 transition-colors hover:bg-surface">
              <span className="label">{d.tag}</span>
              <span>
                <span className="flex items-center justify-between text-lg group-hover:text-sky">{d.title} <ChevronRight size={16} className="text-faint transition-transform group-hover:translate-x-1 group-hover:text-sky" /></span>
                <span className="mt-1 block text-sm text-muted">{d.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------- closing ---------- */}
      <section className="zoom-on-hover relative mt-28 flex min-h-[440px] items-end overflow-hidden">
        <Image src={`${PHOTOS.road.src}?auto=format&fit=crop&w=2400&q=75`} alt={PHOTOS.road.alt} fill sizes="100vw" className="object-cover" unoptimized />
        <div className="absolute inset-0 bg-gradient-to-t from-base via-black/45 to-black/20" />
        <div className="relative mx-auto flex w-full max-w-7xl flex-wrap items-end justify-between gap-6 px-5 pb-12 md:px-10">
          <p className="max-w-xl text-3xl leading-tight md:text-5xl">There is no clean future if we can&apos;t breathe today.</p>
          <div className="flex gap-2">
            <Link href="/map" className="btn px-4 py-2.5">Open the map</Link>
            <Link href="/budget" className="btn btn-primary px-4 py-2.5">Plan my day <ChevronRight size={13} /></Link>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}

/** Micro-interaction: a soft light that follows the cursor inside grid cells. */
function spot(e: React.MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

const DIRECTORY = [
  { href: "/forecast", tag: "Forecast + ML", title: "Forecast", desc: "Five days of CAMS forecast beside our own model." },
  { href: "/history", tag: "Up to 90 days", title: "History", desc: "Trends, spike days, unusual episodes, date comparisons." },
  { href: "/compare", tag: "Up to 4 places", title: "Compare", desc: "Which place has relatively cleaner air." },
  { href: "/health", tag: "Guidance", title: "Health guide", desc: "When to exercise, commute or stay in." },
  { href: "/assistant", tag: "Text or voice", title: "Ask Saans", desc: "Answers grounded in the live numbers." },
  { href: "/leaderboard", tag: "Right now", title: "Rankings", desc: "Cities from cleanest to most polluted." },
  { href: "/report", tag: "Printable", title: "Impact report", desc: "Your air over a week, month or quarter." },
  { href: "/sources", tag: "Methodology", title: "Data sources", desc: "Where every number comes from." },
];

function SectionHead({ word, rest, action }: { word: string; rest: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <h2 className="text-3xl md:text-[40px]">{word} <span className="text-white/45">{rest}</span></h2>
      {action}
    </div>
  );
}

function verdict(aqi: number | null) {
  return {
    good: "Clean air",
    moderate: "Acceptable air",
    usg: "Risky for sensitive people",
    unhealthy: "Unhealthy air",
    "very-unhealthy": "Very unhealthy air",
    hazardous: "Hazardous air",
  }[categoryFor(aqi)?.id ?? "moderate"];
}

/** The "window" card in the hero: the live reading, its provenance, and the next 24 hours. */
function LiveCard({ place, data, error, retry, next24, now }: { place: string; data?: CurrentResponse; error?: Error; retry: () => void; next24?: HourPoint[]; now: number | null }) {
  const p = data?.primary;
  const cat = categoryFor(p?.aqi);
  const obs = p ? fmtObserved(p.observedAt, data?.location.timezone, now) : null;
  return (
    <div className="glass rounded-md p-5 lg:w-[420px] lg:justify-self-end" data-tour="verdict">
      <div className="flex items-center justify-between">
        <span className="label flex items-center gap-2 text-white/80"><i className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live in {place}</span>
        {p && <KindBadge kind={p.kind} />}
      </div>
      {error ? (
        <div className="mt-4"><ErrorState error={error} compact onRetry={retry} /></div>
      ) : !p ? (
        <Skeleton className="mt-4 h-24" />
      ) : (
        <>
          <div className="mt-4 flex items-end gap-4">
            <span className="tnum text-7xl font-normal leading-none" style={{ color: cat?.color }}>{p.aqi}</span>
            <div className="pb-1.5">
              <p className="text-lg leading-tight">{verdict(p.aqi)}</p>
              <p className="label mt-1">US AQI</p>
            </div>
          </div>
          {next24 && next24.length > 1 && <Sparkline points={next24} />}
          <p className="mt-3 text-sm text-white/75">{cat?.general}</p>
          <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/55">
            {describeSource(p)}
            {obs?.rel ? ` / updated ${obs.rel}` : ""}
          </p>
        </>
      )}
    </div>
  );
}

function Sparkline({ points }: { points: HourPoint[] }) {
  const v = points.map((p) => p.aqi ?? 0);
  const lo = Math.min(...v) - 10;
  const hi = Math.max(...v) + 10;
  const d = v.map((y, i) => `${(i / (v.length - 1)) * 100},${30 - ((y - lo) / (hi - lo)) * 28}`).join(" ");
  return (
    <div className="mt-4">
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-10 w-full" role="img" aria-label="Forecast AQI for the next 24 hours">
        <polyline points={d} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeDasharray="3 2" />
      </svg>
      <div className="label flex justify-between text-[10px]"><span>Now</span><span>Forecast</span><span>+24 h</span></div>
    </div>
  );
}

function SourcesGrid({ data }: { data?: CurrentResponse }) {
  const waqi = data?.measured.find((m) => m.source.id === "waqi");
  const oaq = data?.measured.find((m) => m.source.id === "openaq");
  const cells: { name: string; tag: string; value: string; href: string }[] = [
    { name: "WAQI", tag: "Measured", value: waqi ? `AQI ${waqi.aqi}` : "No station nearby", href: "https://aqicn.org/" },
    { name: "OpenAQ", tag: "Measured", value: oaq ? `AQI ${oaq.aqi}` : "No station nearby", href: "https://openaq.org/" },
    { name: "Copernicus CAMS", tag: "Model", value: data?.model ? `AQI ${data.model.aqi}` : "Loading", href: "https://atmosphere.copernicus.eu/" },
    { name: "Open-Meteo", tag: "Weather", value: data?.weather ? `${data.weather.temperature}°C, wind ${data.weather.windSpeed} km/h` : "Loading", href: "https://open-meteo.com/" },
    { name: "Google Gemini", tag: "AI", value: "Insights and assistant", href: "https://ai.google.dev/" },
  ];
  return (
    <div className="grid grid-cols-2 border-l border-t border-line md:grid-cols-5">
      {cells.map((c) => (
        <a key={c.name} href={c.href} target="_blank" rel="noreferrer" onMouseMove={spot} className="spotlight group relative flex h-28 flex-col justify-center border-b border-r border-line px-5 transition-colors hover:bg-surface">
          <span className="chip absolute right-2 top-2">{c.tag}</span>
          <span className="text-[17px] text-white/85 group-hover:text-white">{c.name}</span>
          <span className="tnum mt-1 text-sm text-muted">{c.value}</span>
        </a>
      ))}
    </div>
  );
}

function PollutantGrid({ model, measured }: { model: Snapshot | null; measured: Snapshot[] }) {
  const station = measured.find((m) => m.pollutants.length);
  const keys = Object.keys(POLLUTANTS) as (keyof typeof POLLUTANTS)[];
  return (
    <div className="grid grid-cols-2 border-l border-t border-line sm:grid-cols-3 lg:grid-cols-6" data-tour="pollutants">
      {keys.map((k) => {
        const m = model?.pollutants.find((x) => x.key === k);
        const s = station?.pollutants.find((x) => x.key === k);
        const sub = s?.subIndex ?? m?.subIndex ?? null;
        const c = categoryFor(sub);
        return (
          <div key={k} className="border-b border-r border-line p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/85" title={POLLUTANTS[k].name}>{POLLUTANTS[k].label}</span>
              <span className="h-2 w-2" style={{ background: c?.color ?? "#3a3f46" }} title={c?.label} />
            </div>
            <p className="tnum mt-3 text-3xl">{m?.value ?? "–"}<span className="ml-1 text-xs text-muted">µg/m³</span></p>
            <p className="label mt-2 text-[10px]">
              {s?.subIndex != null ? <>Station index <span className="text-emerald-300">{s.subIndex}</span></> : m?.subIndex != null ? `Model index ${m.subIndex}` : "Not reported"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function HourStrip({ points }: { points: HourPoint[] }) {
  const vals = points.map((p) => p.aqi ?? 0);
  const top = Math.max(150, Math.max(...vals) * 1.15);
  const floor = Math.max(0, Math.min(...vals) - 60);
  return (
    <div role="img" aria-label="Forecast AQI for each of the next 24 hours">
      <div className="flex h-36 items-end gap-[3px]">
        {points.map((p) => (
          <div key={p.time} className="group relative flex h-full flex-1 items-end">
            <div className="w-full rounded-t-[2px]" style={{ height: `${Math.max(4, (((p.aqi ?? 0) - floor) / (top - floor)) * 100)}%`, background: categoryFor(p.aqi)?.color ?? "#334155", opacity: 0.88 }} />
            <span className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-raised px-2 py-0.5 font-mono text-[11px] group-hover:block">
              {fmtLocalHour(p.time, { hour: "numeric" })} / {p.aqi}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        {points.map((p, i) => <span key={p.time} className="flex-1 font-mono text-[10px] text-faint">{i % 4 === 0 ? fmtLocalHour(p.time, { hour: "numeric" }) : ""}</span>)}
      </div>
    </div>
  );
}
