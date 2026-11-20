"use client";

import { useState } from "react";
import { Baby, Bike, Footprints, HeartPulse, PersonStanding, Stethoscope, Wind } from "lucide-react";
import { useLocation } from "@/lib/client/location";
import { useCurrent, useForecast } from "@/lib/client/hooks";
import { CATEGORIES, categoryFor } from "@/lib/aqi";
import { fmtLocalHour } from "@/lib/client/format";
import { cleanestWindow } from "@/lib/analytics/stats";
import { Card, KindBadge, PageHeader, Skeleton } from "@/components/ui";

const ACTIVITIES = [
  { id: "run", label: "Running / sports", icon: Bike, hours: 1, limit: { general: 100, sensitive: 50 } },
  { id: "walk", label: "Walk / errands", icon: Footprints, hours: 1, limit: { general: 150, sensitive: 100 } },
  { id: "kids", label: "Kids playing outside", icon: Baby, hours: 2, limit: { general: 100, sensitive: 100 } },
  { id: "elder", label: "Elderly person's walk", icon: PersonStanding, hours: 1, limit: { general: 100, sensitive: 100 } },
] as const;

export default function HealthPage() {
  const { place } = useLocation();
  const cur = useCurrent(place);
  const fc = useForecast(place);
  const [act, setAct] = useState<(typeof ACTIVITIES)[number]["id"]>("run");
  const [sensitive, setSensitive] = useState(false);

  const aqi = cur.data?.primary?.aqi ?? null;
  const cat = categoryFor(aqi);
  const a = ACTIVITIES.find((x) => x.id === act)!;
  const limit = sensitive ? a.limit.sensitive : a.limit.general;
  const upcoming = fc.data?.forecast.slice(0, 24).filter((p) => {
    const h = Number(p.time.slice(11, 13));
    return h >= 6 && h <= 21;
  });
  const win = upcoming ? cleanestWindow(upcoming, a.hours) : null;
  const okNow = aqi != null && aqi <= limit;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Health & safety" subtitle="What the numbers mean for your body, and what to do about them. General guidance based on US EPA AirNow messaging, not medical advice." />

      <Card title="Activity planner" subtitle={`Should you do it now in ${place.name}, or wait?`}>
        <div className="flex flex-wrap gap-2">
          {ACTIVITIES.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setAct(id)} aria-pressed={act === id} className={`btn ${act === id ? "border-diya/60 bg-diya/10 text-diya-soft" : ""}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm text-soft">
            <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} className="accent-amber-500" />
            I have asthma / heart or lung condition / am pregnant
          </label>
        </div>
        {!cur.data || !fc.data ? (
          <Skeleton className="mt-4 h-20" />
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className={`rounded-md border p-4 ${okNow ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5"}`}>
              <p className="text-xs text-mute">Right now · AQI {aqi} <KindBadge kind={cur.data.primary!.kind} className="ml-1" /></p>
              <p className={`mt-1 font-display text-xl font-semibold ${okNow ? "text-emerald-300" : "text-red-300"}`}>{okNow ? "Go ahead" : "Better to wait or move indoors"}</p>
              <p className="mt-1 text-sm text-soft">Suggested limit for this activity{sensitive ? " (sensitive)" : ""}: AQI ≤ {limit}.</p>
            </div>
            <div className="rounded-md border border-line p-4">
              <p className="text-xs text-mute">Best {a.hours}-hour daytime slot in the next 24 h <KindBadge kind="forecast" className="ml-1" /></p>
              {win ? (
                <>
                  <p className="mt-1 font-display text-xl font-semibold" style={{ color: categoryFor(win.avgAqi)?.color }}>
                    {fmtLocalHour(win.start)} · AQI ~{win.avgAqi}
                  </p>
                  <p className="mt-1 text-sm text-soft">{win.avgAqi <= limit ? "Within your limit." : "Still above your limit, consider an indoor alternative today."}</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-mute">No forecast window available.</p>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card title="AQI categories explained" subtitle="Your current level is highlighted">
        <div className="flex flex-col gap-2">
          {CATEGORIES.map((c) => {
            const active = cat?.id === c.id;
            return (
              <div key={c.id} className={`grid gap-3 rounded-md border p-4 md:grid-cols-[180px_1fr_1fr] ${active ? "border-white/40 bg-white/[0.04]" : "border-line"}`}>
                <div>
                  <span className="inline-block rounded-lg px-2 py-1 text-sm font-semibold" style={{ background: c.color, color: c.text }}>
                    {c.min}–{c.max}
                  </span>
                  <p className="mt-1.5 font-display font-semibold">{c.label}</p>
                  {active && <p className="text-xs text-diya-soft">← {place.name} now</p>}
                </div>
                <div className="text-sm">
                  <p className="text-xs text-mute">Meaning & everyone</p>
                  <p className="mt-0.5">{c.meaning}</p>
                  <p className="mt-1 text-soft">{c.general}</p>
                </div>
                <div className="text-sm">
                  <p className="text-xs text-mute">Sensitive groups</p>
                  <p className="mt-0.5">{c.sensitive}</p>
                  <p className="mt-1 text-xs text-mute">Mask: {c.activity.mask} · Windows: {c.activity.windows}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><Wind size={16} className="text-orange-400" /> PM2.5: fine particles</span>}>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-soft">
            <li>Particles under 2.5 µm, about 30× thinner than a human hair. Sources: vehicle exhaust, burning crop residue, firecrackers, industry, cooking fuels.</li>
            <li>Small enough to pass deep into the lungs and into the bloodstream.</li>
            <li>Linked to heart attacks, strokes, asthma attacks, reduced lung growth in children, low birth weight and premature death.</li>
            <li>WHO guideline: annual mean 5 µg/m³, 24-hour mean 15 µg/m³.</li>
          </ul>
        </Card>
        <Card title={<span className="flex items-center gap-2"><Wind size={16} className="text-sky-400" /> PM10: coarse particles</span>}>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-soft">
            <li>Particles under 10 µm: road and construction dust, pollen, sea salt, mould.</li>
            <li>Mostly trapped in the nose, throat and upper airways, causes coughing, wheezing and irritation.</li>
            <li>Worsens asthma and bronchitis; long exposure is linked to reduced lung function.</li>
            <li>WHO guideline: annual mean 15 µg/m³, 24-hour mean 45 µg/m³.</li>
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Card title={<span className="flex items-center gap-2"><HeartPulse size={16} className="text-red-400" /> Who is sensitive?</span>}>
          <p className="text-sm text-soft">Children, adults over 65, pregnant people, outdoor workers, and anyone with asthma, COPD, heart disease or diabetes.</p>
        </Card>
        <Card title="Everyday precautions">
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-soft">
            <li>Check AQI before planning outdoor time.</li>
            <li>Well-fitted N95/FFP2 masks work; cloth masks don&apos;t filter PM2.5.</li>
            <li>Use a HEPA purifier in the bedroom; keep windows shut at peak hours.</li>
            <li>Avoid exercising near busy roads.</li>
          </ul>
        </Card>
        <Card title={<span className="flex items-center gap-2"><Stethoscope size={16} className="text-emerald-400" /> Get help if…</span>}>
          <p className="text-sm text-soft">You have chest pain, shortness of breath, persistent cough, palpitations or unusual fatigue on high-pollution days. Seek medical care, in India call 108 for emergencies.</p>
        </Card>
      </div>
    </div>
  );
}
