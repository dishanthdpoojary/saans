"use client";

import { useMemo, useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Zap } from "lucide-react";
import { useLocation } from "@/lib/client/location";
import { useHistory } from "@/lib/client/hooks";
import { aqiColor, categoryFor } from "@/lib/aqi";
import { fmtDay, fmtLocalHour, signed } from "@/lib/client/format";
import { pctChange } from "@/lib/analytics/stats";
import { AqiPill, Card, ErrorState, KindBadge, PageHeader, Skeleton, Stat } from "@/components/ui";
import { axis, grid, tooltipStyle } from "@/components/chart";
import { Insights } from "@/components/Insights";
import type { HourPoint } from "@/lib/types";

const RANGES = [7, 30, 90] as const;

export default function HistoryPage() {
  const { place } = useLocation();
  const [days, setDays] = useState<number>(30);
  const { data, error, isLoading, mutate } = useHistory(place, { days });

  const half = useMemo(() => {
    if (!data) return null;
    const d = data.days.filter((x) => x.aqiAvg != null);
    const n = Math.floor(d.length / 2);
    const avg = (xs: typeof d) => xs.reduce((a, b) => a + b.aqiAvg!, 0) / (xs.length || 1);
    return { change: pctChange(avg(d.slice(0, n)), avg(d.slice(n))), first: d[0], last: d[d.length - 1] };
  }, [data]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Historical pollution tracker" subtitle={`How the air in ${place.name} has changed. Hourly CAMS model analysis, the same model used worldwide for air-quality reanalysis.`}>
        <div className="flex items-center gap-2">
          <KindBadge kind="model" />
          <div className="flex rounded-md border border-line p-1" role="group" aria-label="Range">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setDays(r)} aria-pressed={days === r} className={`rounded-lg px-3 py-1 text-sm ${days === r ? "bg-diya text-black" : "text-mute hover:text-white"}`}>
                {r === 90 ? "90 days" : `${r} days`}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      {isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Average AQI" value={data.summary.avgAqi ?? "–"} color={aqiColor(data.summary.avgAqi)} hint={categoryFor(data.summary.avgAqi)?.label} />
            <Stat label="Avg PM2.5" value={`${data.summary.avgPm25 ?? "–"}`} hint="µg/m³" />
            <Stat label="Avg PM10" value={`${data.summary.avgPm10 ?? "–"}`} hint="µg/m³" />
            <Stat
              label="Trend (2nd half vs 1st)"
              value={<span className="flex items-center gap-1">{half?.change != null && (half.change > 0 ? <ArrowUpRight size={18} className="text-red-400" /> : <ArrowDownRight size={18} className="text-emerald-400" />)}{signed(half?.change)}</span>}
              hint={half?.change != null ? (half.change > 0 ? "Air got worse" : "Air improved") : undefined}
            />
            <Stat label="Spike days / anomalies" value={`${data.summary.spikeDays} / ${data.anomalies.length}`} hint="flagged automatically" />
          </div>

          <Card><Insights place={place} /></Card>

          <Card title="Daily AQI" subtitle="Daily average, coloured by category. ⚡ marks spike days (≥1.5× the prior week's median, or a 2-category jump).">
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={data.days} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid {...grid} />
                  <XAxis dataKey="date" tickFormatter={fmtDay} {...axis} minTickGap={20} />
                  <YAxis {...axis} />
                  <Tooltip {...tooltipStyle} labelFormatter={(l) => fmtDay(String(l))} formatter={(v, n) => [v, n === "aqiAvg" ? "Avg AQI" : String(n)]} />
                  <Bar dataKey="aqiAvg" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    {data.days.map((d) => (
                      <Cell key={d.date} fill={aqiColor(d.aqiAvg)} stroke={d.spike ? "#fff" : undefined} strokeWidth={d.spike ? 2 : 0} />
                    ))}
                  </Bar>
                  {data.days.filter((d) => d.spike).map((d) => (
                    <ReferenceDot key={d.date} x={d.date} y={d.aqiAvg ?? 0} r={0} label={{ value: "⚡", position: "top", fill: "#fbbf24" }} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="PM2.5 vs PM10" subtitle="Daily averages (µg/m³). PM2.5 penetrates deeper into lungs; PM10 is mostly dust.">
              <div className="h-60">
                <ResponsiveContainer>
                  <LineChart data={data.days} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid {...grid} />
                    <XAxis dataKey="date" tickFormatter={fmtDay} {...axis} minTickGap={24} />
                    <YAxis {...axis} />
                    <Tooltip {...tooltipStyle} labelFormatter={(l) => fmtDay(String(l))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line dataKey="pm25Avg" name="PM2.5" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line dataKey="pm10Avg" name="PM10" stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <AnomalyChart points={data.points} anomalies={data.anomalies} />
          </div>

          <DateCompare key={data.points[0]?.time} points={data.points} />

          <Card title="Day-by-day" subtitle="Percentage change versus the previous day">
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-panel text-left text-xs text-mute">
                  <tr>
                    <th className="py-2">Date</th>
                    <th>Avg AQI</th>
                    <th>Peak</th>
                    <th>PM2.5</th>
                    <th>PM10</th>
                    <th>Change</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...data.days].reverse().map((d) => (
                    <tr key={d.date} className="border-t border-line/60">
                      <td className="py-1.5">{fmtDay(d.date)}</td>
                      <td><AqiPill aqi={d.aqiAvg != null ? Math.round(d.aqiAvg) : null} size="sm" /></td>
                      <td className="tabular-nums">{d.aqiMax}</td>
                      <td className="tabular-nums">{d.pm25Avg}</td>
                      <td className="tabular-nums">{d.pm10Avg}</td>
                      <td className={`tabular-nums ${d.changePct == null ? "" : d.changePct > 0 ? "text-red-300" : "text-emerald-300"}`}>{signed(d.changePct)}</td>
                      <td>{d.spike && <span className="chip border-amber-500/40 text-amber-300"><Zap size={11} /> spike</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function AnomalyChart({ points, anomalies }: { points: HourPoint[]; anomalies: { time: string; value: number; baseline: number; score: number }[] }) {
  const map = new Map(anomalies.map((a) => [a.time, a]));
  const series = points.map((p) => ({ time: p.time, pm25: p.pm2_5, anomaly: map.has(p.time) ? p.pm2_5 : null }));
  return (
    <Card title="Anomaly detection" subtitle="Hourly PM2.5 with unusual spikes flagged (robust z-score > 3.5 vs trailing 48 h median)">
      <div className="h-60">
        <ResponsiveContainer>
          <ComposedChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid {...grid} />
            <XAxis dataKey="time" tickFormatter={(t) => fmtDay(String(t).slice(0, 10))} {...axis} minTickGap={40} />
            <YAxis {...axis} />
            <Tooltip {...tooltipStyle} labelFormatter={(l) => fmtLocalHour(String(l), { day: "numeric", month: "short", hour: "numeric" })} />
            <Area dataKey="pm25" name="PM2.5" stroke="#f97316" fill="#f9731622" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line dataKey="anomaly" name="Anomaly" stroke="none" dot={{ r: 5, fill: "#ef4444", stroke: "#fff", strokeWidth: 1.5 }} activeDot={false} isAnimationActive={false} legendType="none" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 flex max-h-28 flex-col gap-1 overflow-auto text-xs text-mute">
        {anomalies.length === 0 && <li>No unusual episodes in this period.</li>}
        {anomalies.slice(-6).reverse().map((a) => (
          <li key={a.time} className="flex gap-2">
            <Zap size={12} className="mt-0.5 text-red-400" />
            {fmtLocalHour(a.time, { day: "numeric", month: "short", hour: "numeric" })}: PM2.5 {a.value} µg/m³ vs typical {a.baseline} (score {a.score})
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DateCompare({ points }: { points: HourPoint[] }) {
  const dates = useMemo(() => [...new Set(points.map((p) => p.time.slice(0, 10)))], [points]);
  const [a, setA] = useState(dates[0]);
  const [b, setB] = useState(dates[dates.length - 1]);
  const dayA = points.filter((p) => p.time.startsWith(a ?? ""));
  const dayB = points.filter((p) => p.time.startsWith(b ?? ""));
  const avg = (xs: HourPoint[], k: "aqi" | "pm2_5" | "pm10") => {
    const v = xs.map((x) => x[k]).filter((x): x is number => x != null);
    return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null;
  };
  const overlay = Array.from({ length: 24 }, (_, h) => ({
    hour: `${h}:00`,
    a: dayA.find((p) => Number(p.time.slice(11, 13)) === h)?.aqi ?? null,
    b: dayB.find((p) => Number(p.time.slice(11, 13)) === h)?.aqi ?? null,
  }));
  const rows = (["aqi", "pm2_5", "pm10"] as const).map((k) => ({ k, label: k === "aqi" ? "AQI" : k === "pm2_5" ? "PM2.5" : "PM10", va: avg(dayA, k), vb: avg(dayB, k) }));

  return (
    <Card title="Compare two dates" subtitle="Pick any two days in the selected range">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
          <select className="input w-auto" value={a} onChange={(e) => setA(e.target.value)}>{dates.map((d) => <option key={d}>{d}</option>)}</select>
        </label>
        <span className="text-mute">vs</span>
        <label className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <select className="input w-auto" value={b} onChange={(e) => setB(e.target.value)}>{dates.map((d) => <option key={d}>{d}</option>)}</select>
        </label>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <table className="text-sm">
          <thead className="text-left text-xs text-mute"><tr><th className="py-1">Daily average</th><th>{a}</th><th>{b}</th><th>Change</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const ch = pctChange(r.va, r.vb);
              return (
                <tr key={r.k} className="border-t border-line/60">
                  <td className="py-2">{r.label}</td>
                  <td className="tabular-nums">{r.va ?? "–"}</td>
                  <td className="tabular-nums">{r.vb ?? "–"}</td>
                  <td className={`tabular-nums font-semibold ${ch == null ? "" : ch > 0 ? "text-red-300" : "text-emerald-300"}`}>{signed(ch)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="h-48">
          <ResponsiveContainer>
            <LineChart data={overlay} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="hour" {...axis} interval={3} />
              <YAxis {...axis} />
              <Tooltip {...tooltipStyle} />
              <Line dataKey="a" name={a} stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="b" name={b} stroke="#fbbf24" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
