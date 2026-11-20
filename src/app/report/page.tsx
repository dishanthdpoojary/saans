"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Cigarette, Printer, Sparkles } from "lucide-react";
import { useLocation } from "@/lib/client/location";
import { useHistory, useInsights } from "@/lib/client/hooks";
import { aqiColor, categoryFor, CATEGORIES, cigarettesEquivalent } from "@/lib/aqi";
import { fmtDay, fmtLocalHour } from "@/lib/client/format";
import { AiBadge, Card, ErrorState, KindBadge, Skeleton, Stat } from "@/components/ui";
import { axis, tooltipStyle } from "@/components/chart";

/** Pollution Impact Report — automated historical analysis, printable to PDF. */
export default function ReportPage() {
  const { place } = useLocation();
  const [days, setDays] = useState(30);
  const { data, error, mutate } = useHistory(place, { days });
  const ai = useInsights(place);
  const [generated, setGenerated] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- current time must be read on the client, not at prerender
    setGenerated(new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }));
  }, [data]);

  const s = data?.summary;
  const catData = s ? CATEGORIES.map((c) => ({ name: c.short, days: s.daysByCategory[c.short] ?? 0, color: c.color })) : [];
  const unhealthyDays = s ? (s.daysByCategory["Unhealthy"] ?? 0) + (s.daysByCategory["Very unhealthy"] ?? 0) + (s.daysByCategory["Hazardous"] ?? 0) : 0;
  const cigs = s?.avgPm25 != null ? cigarettesEquivalent(s.avgPm25, data!.days.length) : null;
  const whoX = s?.avgPm25 != null ? Math.round((s.avgPm25 / 15) * 10) / 10 : null;
  const range = data?.days.length ? `${fmtDay(data.days[0].date)} – ${fmtDay(data.days[data.days.length - 1].date)}` : "";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-diya">Pollution impact report</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{place.name}</h1>
          <p className="mt-1 text-sm text-mute">{range} · generated {generated} · <KindBadge kind="model" /></p>
        </div>
        <div className="no-print flex gap-2">
          <select className="input w-32" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Report period">
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          <button className="btn btn-primary" onClick={() => window.print()}><Printer size={15} /> Save as PDF</button>
        </div>
      </div>

      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      {!data || !s ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Average AQI" value={s.avgAqi} color={aqiColor(s.avgAqi)} hint={categoryFor(s.avgAqi)?.label} />
            <Stat label="Unhealthy-or-worse days" value={`${unhealthyDays} / ${data.days.length}`} hint="daily average > 150" />
            <Stat label="Average PM2.5" value={`${s.avgPm25} µg/m³`} hint={whoX ? `${whoX}× the WHO 24-h guideline` : undefined} />
            <Stat label="Pollution episodes" value={`${s.spikeDays} spikes · ${data.anomalies.length} anomalies`} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <Card title="Days in each category">
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={catData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                    <XAxis dataKey="name" {...axis} />
                    <YAxis {...axis} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="days" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                      {catData.map((c) => <Cell key={c.name} fill={c.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title={<span className="flex items-center gap-2"><Cigarette size={16} className="text-mute" /> What it means for your lungs</span>}>
              {cigs != null && (
                <p className="font-display text-4xl font-bold text-diya-soft">≈ {Math.round(cigs)} <span className="text-base font-normal text-soft">cigarettes</span></p>
              )}
              <p className="mt-2 text-sm text-soft">
                Breathing {place.name}&apos;s air for these {data.days.length} days is roughly equivalent to smoking {cigs != null ? Math.round(cigs) : "–"} cigarettes ({cigs != null ? (cigs / data.days.length).toFixed(1) : "–"} a day).
              </p>
              <p className="mt-2 text-[11px] text-mute">Rule of thumb from Berkeley Earth: 22 µg/m³ of PM2.5 over 24 h ≈ 1 cigarette. An approximation for perspective, not a medical measure.</p>
            </Card>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Key findings">
              <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-soft">
                {s.worstDay && <li>Worst day: <b>{fmtDay(s.worstDay.date)}</b> with an average AQI of {s.worstDay.aqiAvg} (peak {s.worstDay.aqiMax}).</li>}
                {s.bestDay && <li>Cleanest day: <b>{fmtDay(s.bestDay.date)}</b> with an average AQI of {s.bestDay.aqiAvg}.</li>}
                <li>{s.daysByCategory["Good"] ?? 0} day(s) were Good and {s.daysByCategory["Moderate"] ?? 0} Moderate.</li>
                <li>Average PM10 was {s.avgPm10} µg/m³ ({s.avgPm10 != null ? Math.round((s.avgPm10 / 45) * 10) / 10 : "–"}× the WHO 24-h guideline of 45).</li>
                {data.anomalies.slice(-3).map((a) => (
                  <li key={a.time}>Unusual PM2.5 {a.direction} on {fmtLocalHour(a.time, { day: "numeric", month: "short", hour: "numeric" })}: {a.value} µg/m³ vs a typical {a.baseline}.</li>
                ))}
              </ul>
            </Card>
            <Card title={<span className="flex items-center gap-2"><Sparkles size={16} className="text-diya" /> Narrative summary</span>} action={ai.data && <AiBadge engine={ai.data.engine} />}>
              {ai.data ? <p className="whitespace-pre-line text-sm leading-relaxed text-soft">{ai.data.text}</p> : <Skeleton className="h-24" />}
              <p className="mt-3 text-[11px] text-mute">Summary covers the last 30 days and the coming forecast.</p>
            </Card>
          </div>
          <p className="text-[11px] text-mute">Data: {data.source.attribution}. Values are CAMS model analysis (estimates), aggregated by Saans. US EPA AQI scale.</p>
        </>
      )}
    </div>
  );
}
