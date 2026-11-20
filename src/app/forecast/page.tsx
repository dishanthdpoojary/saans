"use client";

import { useMemo } from "react";
import { CartesianGrid, ComposedChart, Area, Bar, BarChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, Cell } from "recharts";
import { AlertTriangle, Brain, Sun } from "lucide-react";
import { useLocation } from "@/lib/client/location";
import { useForecast } from "@/lib/client/hooks";
import { aqiColor, categoryFor } from "@/lib/aqi";
import { fmtDay, fmtLocalHour } from "@/lib/client/format";
import { AqiPill, Card, ErrorState, KindBadge, PageHeader, Skeleton, Stat } from "@/components/ui";
import { axis, grid, tooltipStyle } from "@/components/chart";

export default function ForecastPage() {
  const { place } = useLocation();
  const { data, error, mutate } = useForecast(place);

  const aqiSeries = useMemo(() => {
    if (!data) return [];
    return [
      ...data.recent.map((p) => ({ time: p.time, observed: p.aqi, forecast: null as number | null })),
      ...data.forecast.map((p) => ({ time: p.time, observed: null as number | null, forecast: p.aqi })),
    ];
  }, [data]);

  const pmSeries = useMemo(() => {
    if (!data) return [];
    const ml = new Map((data.ml?.points ?? []).map((p) => [p.time, p.pm25]));
    return [
      ...data.recent.map((p) => ({ time: p.time, actual: p.pm2_5, cams: null as number | null, ml: null as number | null })),
      ...data.forecast.slice(0, 72).map((p) => ({ time: p.time, actual: null as number | null, cams: p.pm2_5, ml: ml.get(p.time) ?? null })),
    ];
  }, [data]);

  const nowTime = data?.recent[data.recent.length - 1]?.time;
  const ev = data?.ml?.evaluation;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="AQI forecast" subtitle={`What the next five days look like for ${place.name}. Forecasts are model output, never mixed up with readings.`}>
        <div className="flex flex-wrap gap-2">
          <KindBadge kind="model" />
          <KindBadge kind="forecast" />
          <KindBadge kind="predicted" />
        </div>
      </PageHeader>

      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      {!data ? (
        <Skeleton className="h-80" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {data.daily.map((d) => (
              <div key={d.date} className="card p-4">
                <p className="text-xs text-mute">{new Date(d.date + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" })}</p>
                <p className="text-sm text-soft">{fmtDay(d.date)}</p>
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <p className="text-[11px] text-mute">Average</p>
                    <AqiPill aqi={d.aqiAvg != null ? Math.round(d.aqiAvg) : null} />
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-mute">Peak</p>
                    <p className="font-display text-lg font-semibold" style={{ color: aqiColor(d.aqiMax) }}>{d.aqiMax ?? "–"}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs" style={{ color: aqiColor(d.aqiAvg) }}>{categoryFor(d.aqiAvg)?.label}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            {data.bestWindow && (
              <span className="chip border-emerald-500/30 px-3 py-1 text-emerald-300">
                <Sun size={14} /> Cleanest daytime window (next 24 h): {fmtLocalHour(data.bestWindow.start)} – {fmtLocalHour(data.bestWindow.end, { hour: "numeric" })}, AQI ~{data.bestWindow.avgAqi}
              </span>
            )}
            {data.spikes.map((s) => (
              <span key={s.start} className="chip border-red-500/30 px-3 py-1 text-red-300">
                <AlertTriangle size={14} /> Potential spike: {fmtLocalHour(s.start)} – {fmtLocalHour(s.end, { hour: "numeric" })}, peak {s.peak}
              </span>
            ))}
            {data.spikes.length === 0 && <span className="chip px-3 py-1 text-mute">No sharp spikes expected in the forecast window</span>}
          </div>

          <Card title="Hourly AQI: past 48 h and forecast" subtitle="Solid = model analysis of past hours · Dashed = CAMS forecast. Red bands = potential spikes.">
            <div className="h-72">
              <ResponsiveContainer>
                <ComposedChart data={aqiSeries} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid {...grid} />
                  <XAxis dataKey="time" {...axis} tickFormatter={(t) => fmtLocalHour(String(t), { weekday: "short", hour: "numeric" })} minTickGap={50} />
                  <YAxis {...axis} />
                  <Tooltip {...tooltipStyle} labelFormatter={(l) => fmtLocalHour(String(l), { weekday: "short", day: "numeric", hour: "numeric" })} />
                  {data.spikes.map((s) => (
                    <ReferenceArea key={s.start} x1={s.start} x2={s.end} fill="#ef4444" fillOpacity={0.12} />
                  ))}
                  {nowTime && <ReferenceLine x={nowTime} stroke="#fbbf24" strokeDasharray="4 4" label={{ value: "Now", fill: "#fbbf24", fontSize: 11, position: "insideTopRight" }} />}
                  <Area dataKey="observed" name="Model (past)" stroke="#38bdf8" fill="#38bdf822" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                  <Line dataKey="forecast" name="CAMS forecast" stroke="#a78bfa" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card
            data-tour="ml"
            title={<span className="flex items-center gap-2"><Brain size={17} className="text-diya" /> Saans ML prediction vs CAMS forecast (PM2.5)</span>}
            subtitle={data.ml?.method ?? "ML model unavailable for this location (not enough history)."}
            action={<KindBadge kind="predicted" />}
          >
            {data.ml ? (
              <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
                <div className="h-72">
                  <ResponsiveContainer>
                    <ComposedChart data={pmSeries} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                      <CartesianGrid {...grid} />
                      <XAxis dataKey="time" {...axis} tickFormatter={(t) => fmtLocalHour(String(t), { weekday: "short", hour: "numeric" })} minTickGap={50} />
                      <YAxis {...axis} unit="" />
                      <Tooltip {...tooltipStyle} labelFormatter={(l) => fmtLocalHour(String(l), { weekday: "short", day: "numeric", hour: "numeric" })} formatter={(v) => [`${v} µg/m³`]} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {nowTime && <ReferenceLine x={nowTime} stroke="#fbbf24" strokeDasharray="4 4" />}
                      <Line dataKey="actual" name="Past (model analysis)" stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line dataKey="cams" name="CAMS forecast" stroke="#a78bfa" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
                      <Line dataKey="ml" name="Saans ML" stroke="#f59e0b" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-3">
                  {ev && (
                    <>
                      <p className="text-xs text-mute">Back-test on the last 72 hours (model never saw them), 24-hour horizon, mean absolute error in µg/m³, lower is better:</p>
                      <div className="grid grid-cols-3 gap-2">
                        <Stat label="Saans ML" value={ev.maeModel} color="#f59e0b" />
                        <Stat label="Persistence" value={ev.maePersistence} hint="“same as now”" />
                        <Stat label="Yesterday" value={ev.maeYesterday} hint="“same as 24h ago”" />
                      </div>
                      <p className={`text-sm ${ev.skillVsPersistence > 0 ? "text-emerald-300" : "text-amber-300"}`}>
                        {ev.skillVsPersistence > 0
                          ? `${Math.round(ev.skillVsPersistence * 100)}% lower error than a persistence forecast.`
                          : "Does not beat persistence here. Treat the ML line as experimental for this location."}
                      </p>
                    </>
                  )}
                  <p className="mt-1 text-xs text-mute">What drives the prediction (standardised weights):</p>
                  <div className="h-44">
                    <ResponsiveContainer>
                      <BarChart data={data.ml.importance.slice(0, 7)} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="feature" {...axis} width={120} />
                        <Tooltip {...tooltipStyle} />
                        <Bar dataKey="weight" isAnimationActive={false} radius={4}>
                          {data.ml.importance.slice(0, 7).map((f) => <Cell key={f.feature} fill={f.weight >= 0 ? "#f97316" : "#38bdf8"} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[11px] text-mute">Orange raises PM2.5, blue lowers it (e.g. stronger wind and a higher mixing layer disperse pollution).</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-mute">Not enough history to train the model for this location.</p>
            )}
          </Card>
          <p className="text-xs text-mute">Sources: {data.sources.map((s) => s.attribution).join(" · ")}. ML model trained on-demand per location, cached for one hour.</p>
        </>
      )}
    </div>
  );
}
