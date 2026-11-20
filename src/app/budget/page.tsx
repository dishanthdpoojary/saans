"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Plus, Trash2, Wand2 } from "lucide-react";
import { useLocation } from "@/lib/client/location";
import { useCurrent, useForecast } from "@/lib/client/hooks";
import { categoryFor, subIndex } from "@/lib/aqi";
import { optimizePlan, summarizeDose, slots, type Block, type DayPlan, type Intensity, type Setting } from "@/lib/analytics/exposure";
import { Card, ErrorState, KindBadge, PageHeader, Skeleton } from "@/components/ui";

const PRESETS: { label: string; intensity: Intensity; setting: Setting; hours: number; flexible: boolean }[] = [
  { label: "Run or workout", intensity: "vigorous", setting: "outdoor", hours: 1, flexible: true },
  { label: "Walk", intensity: "moderate", setting: "outdoor", hours: 1, flexible: true },
  { label: "Errands", intensity: "light", setting: "outdoor", hours: 1, flexible: true },
  { label: "Kids playing outside", intensity: "moderate", setting: "outdoor", hours: 2, flexible: true },
  { label: "Commute by bus or car", intensity: "rest", setting: "vehicle", hours: 1, flexible: false },
  { label: "Commute on foot or bike", intensity: "moderate", setting: "outdoor", hours: 1, flexible: false },
  { label: "Outdoor work", intensity: "light", setting: "outdoor", hours: 4, flexible: false },
];

const HOME: { v: Setting; label: string }[] = [
  { v: "indoor-open", label: "Windows open" },
  { v: "indoor-closed", label: "Windows closed" },
  { v: "indoor-purifier", label: "Air purifier running" },
];

let uid = 0;
const mk = (p: (typeof PRESETS)[number], start: number): Block => ({ id: `b${++uid}`, label: p.label, start, hours: p.hours, intensity: p.intensity, setting: p.setting, flexible: p.flexible });

const fmtH = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? "am" : "pm"}`;
const ug = (n: number) => Math.round(n).toLocaleString("en-IN");

export default function BudgetPage() {
  const { place } = useLocation();
  const fc = useForecast(place);
  const cur = useCurrent(place);
  const [day, setDay] = useState<0 | 1>(0);
  const [picked, setPicked] = useState(false);
  const [plan, setPlan] = useState<DayPlan>(() => ({
    home: "indoor-closed",
    sleepFrom: 23,
    sleepTo: 6,
    blocks: [mk(PRESETS[0], 7), mk(PRESETS[4], 9), mk(PRESETS[2], 17), mk(PRESETS[4], 18)],
  }));

  // station calibration: scale the model by the nearest OpenAQ PM2.5 reading, within sane bounds
  const calib = useMemo(() => {
    const st = cur.data?.measured.find((m) => m.source.id === "openaq");
    const meas = st?.pollutants.find((p) => p.key === "pm2_5")?.value;
    const model = cur.data?.model?.pollutants.find((p) => p.key === "pm2_5")?.value;
    if (!meas || !model) return { factor: 1, station: null as string | null };
    return { factor: Math.min(2, Math.max(0.5, meas / model)), station: st?.station?.name ?? "OpenAQ station" };
  }, [cur.data]);

  const series = useMemo(() => {
    if (!fc.data) return null;
    const all = [...fc.data.recent, ...fc.data.forecast];
    const today = fc.data.recent[fc.data.recent.length - 1]?.time.slice(0, 10);
    if (!today) return null;
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + day);
    const date = d.toISOString().slice(0, 10);
    const byTime = new Map(all.map((p) => [p.time, p]));
    const hours = Array.from({ length: 24 }, (_, h) => byTime.get(`${date}T${String(h).padStart(2, "0")}:00`));
    return {
      date,
      pm25: hours.map((p) => (p?.pm2_5 == null ? null : Math.round(p.pm2_5 * calib.factor * 10) / 10)),
      kind: hours.map((p) => p?.kind ?? null),
    };
  }, [fc.data, day, calib.factor]);

  // today: only suggest hours that are still ahead
  const nowHour = fc.data ? Number(fc.data.recent[fc.data.recent.length - 1]?.time.slice(11, 13) ?? 0) : 0;
  const from = day === 0 ? Math.max(6, nowHour + 1) : 6;
  useEffect(() => {
    // in the evening there is little of today left to plan — start with tomorrow
    // eslint-disable-next-line react-hooks/set-state-in-effect -- default derived from loaded data
    if (fc.data && !picked && nowHour >= 18) setDay(1);
  }, [fc.data, picked, nowHour]);
  const smart = useMemo(() => (series ? optimizePlan(plan, series.pm25, { from, to: 22 }) : null), [plan, series, from]);
  const now = series ? summarizeDose(plan, series.pm25) : null;
  const better = smart && series ? summarizeDose(smart, series.pm25) : null;
  const saving = now && better && now.total > 0 ? Math.round((1 - better.total / now.total) * 100) : 0;
  const moved = smart ? smart.blocks.filter((b) => plan.blocks.find((o) => o.id === b.id)?.start !== b.start) : [];

  const update = (id: string, patch: Partial<Block>) => setPlan((p) => ({ ...p, blocks: p.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Breath budget" subtitle={`How much PM2.5 you will actually breathe in ${place.name}, based on your day, and how to breathe less of it.`}>
        <div className="flex rounded-full border border-line p-1" role="group" aria-label="Day">
          {(["Today", "Tomorrow"] as const).map((l, k) => (
            <button key={l} onClick={() => { setPicked(true); setDay(k as 0 | 1); }} aria-pressed={day === k} className={`rounded-full px-4 py-1.5 text-sm ${day === k ? "bg-white text-night" : "text-haze"}`}>{l}</button>
          ))}
        </div>
      </PageHeader>

      {fc.error && <ErrorState error={fc.error} onRetry={() => fc.mutate()} />}

      <section data-tour="budget" className="flex flex-col gap-6">
        {!now || !better || !series ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <p className="text-haze">Your day as planned</p>
              <p className="mt-1 text-5xl font-normal tabular-nums">{ug(now.total)}<span className="ml-1.5 text-lg text-haze">µg</span></p>
              <p className="mt-1 text-sm text-haze">of PM2.5 inhaled, from {now.volume.toFixed(1)} m³ of air</p>
            </div>
            <div>
              <p className="text-haze">Compared with clean air</p>
              <p className="mt-1 text-5xl font-normal tabular-nums" style={{ color: now.whoMultiple > 1 ? categoryFor(Math.min(300, 50 + now.whoMultiple * 25))?.color : "#22c55e" }}>
                {now.whoMultiple.toFixed(1)}×
              </p>
              <p className="mt-1 text-sm text-haze">the dose of a day at the WHO guideline (15 µg/m³)</p>
            </div>
            <div>
              <p className="text-haze">With the smarter plan</p>
              <p className="mt-1 text-5xl font-normal tabular-nums text-emerald-300">{saving > 0 ? `−${saving}%` : "0%"}</p>
              <p className="mt-1 text-sm text-haze">{saving > 0 ? `${ug(better.total)} µg, ${ug(now.total - better.total)} µg less, same activities` : "Your flexible plans are already at the cleanest times."}</p>
            </div>
          </div>
        )}

        <Card title="Your day, hour by hour" subtitle={`PM2.5 for ${series?.date ?? "…"}${calib.factor !== 1 ? `, calibrated to ${calib.station} (×${calib.factor.toFixed(2)})` : ""}. Past hours are model analysis, future hours the forecast.`}
          action={<div className="hidden gap-1 sm:flex"><KindBadge kind="model" /><KindBadge kind="forecast" /></div>}>
          {!series || !smart ? <Skeleton className="h-36" /> : (
            <div className="overflow-x-auto">
              <div className="min-w-[680px]">
                <Row label="Air">
                  {series.pm25.map((v, h) => (
                    <div key={h} className="h-7 rounded-md" title={`${fmtH(h)}: ${v ?? "no data"} µg/m³`} style={{ background: categoryFor(subIndex("pm2_5", v))?.color ?? "#1e293b", opacity: series.kind[h] === "forecast" ? 0.85 : 0.55 }} />
                  ))}
                </Row>
                <PlanRow label="Planned" plan={plan} />
                <PlanRow label="Smarter" plan={smart} highlight={new Set(moved.map((b) => b.id))} />
                <Row label="">
                  {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center text-[10px] text-haze">{h % 3 === 0 ? fmtH(h) : ""}</span>)}
                </Row>
              </div>
            </div>
          )}
          {series && (
            <p className="mt-3 flex flex-wrap gap-4 text-xs text-haze">
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-4 rounded bg-orange-300/80" /> Outdoors</span>
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-4 rounded bg-sky/60" /> In a vehicle</span>
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-4 rounded bg-white/12" /> At home</span>
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-4 rounded ring-2 ring-emerald-300" /> Moved to a cleaner time</span>
              {day === 0 && from > 6 && <span>Suggestions only use hours from {fmtH(from)} onwards.</span>}
            </p>
          )}
          {day === 0 && from >= 21 && moved.length === 0 && <p className="mt-3 text-sm text-haze">Today is nearly over. Switch to Tomorrow to plan ahead.</p>}
          {moved.length > 0 && smart && now && better && (
            <div className="mt-5 flex flex-col gap-2">
              {moved.map((b) => {
                const before = plan.blocks.find((o) => o.id === b.id)!;
                const d0 = now.byBlock[b.id] ?? 0;
                const d1 = better.byBlock[b.id] ?? 0;
                return (
                  <p key={b.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Wand2 size={15} className="text-sky" /> Move <b className="font-medium">{b.label.toLowerCase()}</b> from {fmtH(before.start)} <ArrowRight size={13} /> {fmtH(b.start)}
                    <span className="text-emerald-300">{d0 > 0 ? `${Math.round((1 - d1 / d0) * 100)}% less for this activity` : ""}</span>
                  </p>
                );
              })}
              <button className="btn btn-primary mt-2 self-start" onClick={() => setPlan(smart)}>Use the smarter plan</button>
            </div>
          )}
        </Card>
      </section>

      <Card title="Plan your day" subtitle="Add what you'll do. Flexible plans can be moved to cleaner hours; fixed ones stay put.">
        <div className="flex flex-col gap-2">
          {plan.blocks.map((b) => (
            <div key={b.id} className="grid grid-cols-2 items-center gap-2 rounded-md border border-line p-3 text-sm md:grid-cols-[1.4fr_0.8fr_0.8fr_1fr_auto]">
              <span className="col-span-2 md:col-span-1">{b.label}</span>
              <label className="flex items-center gap-2 text-haze">Starts
                <select className="input py-1" value={b.start} onChange={(e) => update(b.id, { start: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{fmtH(h)}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-haze">For
                <select className="input py-1" value={b.hours} onChange={(e) => update(b.id, { hours: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 6, 8].map((h) => <option key={h} value={h}>{h} h</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-haze">
                <input type="checkbox" checked={b.flexible} onChange={(e) => update(b.id, { flexible: e.target.checked })} className="accent-sky-300" /> Flexible
              </label>
              <button className="justify-self-end text-haze hover:text-red-300" onClick={() => setPlan((p) => ({ ...p, blocks: p.blocks.filter((x) => x.id !== b.id) }))} aria-label={`Remove ${b.label}`}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.label} className="chip px-3 py-1.5 hover:border-sky/60" onClick={() => setPlan((pl) => ({ ...pl, blocks: [...pl.blocks, mk(p, 12)] }))}>
              <Plus size={13} /> {p.label}
            </button>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-haze">At home I usually have</span>
          {HOME.map((h) => (
            <button key={h.v} onClick={() => setPlan((p) => ({ ...p, home: h.v }))} aria-pressed={plan.home === h.v} className={`chip px-3 py-1.5 ${plan.home === h.v ? "border-sky bg-sky/15 text-white" : ""}`}>{h.label}</button>
          ))}
        </div>
      </Card>

      <p className="max-w-3xl text-xs leading-relaxed text-haze">
        How this works: inhaled dose = outdoor PM2.5 × the share that reaches you (outdoors 100%, vehicle 65%, indoors with windows open 80%, closed 50%, with a purifier 20%) × how much air you breathe for the activity (0.3 m³/h asleep to 3 m³/h running, from the US EPA Exposure Factors Handbook). These are population averages, so treat the result as an estimate. Sleep is assumed from 11 pm to 6 am.
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 grid grid-cols-[72px_repeat(24,minmax(0,1fr))] items-center gap-[3px]">
      <span className="text-xs text-haze">{label}</span>
      {children}
    </div>
  );
}

function PlanRow({ label, plan, highlight }: { label: string; plan: DayPlan; highlight?: Set<string> }) {
  const s = slots(plan);
  return (
    <Row label={label}>
      {s.map((x) => {
        const b = plan.blocks.find((bb) => bb.id === x.blockId);
        const outdoor = x.setting === "outdoor";
        return (
          <div key={x.hour} title={b ? `${fmtH(x.hour)}: ${b.label}` : `${fmtH(x.hour)}: ${x.intensity === "sleep" ? "asleep" : "at home"}`}
            className={`h-7 rounded-md ${b ? (outdoor ? "bg-orange-300/80" : "bg-sky/60") : x.intensity === "sleep" ? "bg-white/5" : "bg-white/12"} ${b && highlight?.has(b.id) ? "ring-2 ring-emerald-300" : ""}`} />
        );
      })}
    </Row>
  );
}
