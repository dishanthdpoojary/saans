"use client";

import { useState } from "react";
import useSWR from "swr";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Crown, Plus, X } from "lucide-react";
import { useLocation, type Place } from "@/lib/client/location";
import { fetcher, qs, swrOpts } from "@/lib/client/fetcher";
import type { HistoryResponse } from "@/lib/client/hooks";
import { CITIES } from "@/lib/cities";
import { categoryFor, POLLUTANTS, type PollutantKey } from "@/lib/aqi";
import { fmtDay } from "@/lib/client/format";
import { AqiPill, Card, ErrorState, KindBadge, PageHeader, Skeleton } from "@/components/ui";
import { axis, grid, tooltipStyle } from "@/components/chart";
import type { CurrentResponse } from "@/lib/types";

const COLORS = ["#fbbf24", "#38bdf8", "#a78bfa", "#34d399"];
const KEYS: PollutantKey[] = ["pm2_5", "pm10", "no2", "so2", "co", "o3"];

async function loadAll(places: Place[]) {
  return Promise.all(
    places.map(async (p) => {
      const [current, history] = await Promise.all([
        fetcher<CurrentResponse>(`/api/current?${qs({ lat: p.lat, lon: p.lon, name: p.name })}`),
        fetcher<HistoryResponse>(`/api/history?${qs({ lat: p.lat, lon: p.lon, days: 30 })}`),
      ]);
      return { place: p, current, history };
    }),
  );
}

export default function ComparePage() {
  const { place } = useLocation();
  const [places, setPlaces] = useState<Place[]>(() => {
    const others = CITIES.filter((c) => c.name !== place.name && ["London", "New York", "Beijing"].includes(c.name));
    return [place, ...others.map((c) => ({ name: c.name, lat: c.lat, lon: c.lon }))].slice(0, 3);
  });
  const [adding, setAdding] = useState("");
  const { data, error, isLoading, mutate } = useSWR(["compare", ...places.map((p) => `${p.lat},${p.lon}`)], () => loadAll(places), { ...swrOpts, keepPreviousData: true });

  const add = (name: string) => {
    const c = CITIES.find((x) => x.name === name);
    if (c && places.length < 4 && !places.some((p) => p.name === c.name)) setPlaces([...places, { name: c.name, lat: c.lat, lon: c.lon }]);
    setAdding("");
  };

  // 30-day average AQI decides "relatively better air"; current AQI breaks ties
  const ranked = data
    ? [...data].filter((d) => d.history.summary.avgAqi != null).sort((a, b) => a.history.summary.avgAqi! - b.history.summary.avgAqi! || (a.current.primary?.aqi ?? 999) - (b.current.primary?.aqi ?? 999))
    : [];
  const best = ranked[0]?.place.name;
  const base = data?.[0];

  const chart = (() => {
    if (!data) return [];
    const dates = data[0].history.days.map((d) => d.date);
    return dates.map((date) => Object.fromEntries([["date", date], ...data.map((d) => [d.place.name, d.history.days.find((x) => x.date === date)?.aqiAvg ?? null])]));
  })();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Compare locations" subtitle="Side-by-side air quality for up to four places, current readings plus 30-day trends.">
        {places.length < 4 && (
          <div className="flex items-center gap-2">
            <select className="input w-56" value={adding} onChange={(e) => add(e.target.value)} aria-label="Add a city">
              <option value="">+ Add a city…</option>
              {CITIES.filter((c) => !places.some((p) => p.name === c.name)).map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
            {!places.some((p) => p.name === place.name) && (
              <button className="btn" onClick={() => setPlaces([...places, place])}><Plus size={14} /> {place.name}</button>
            )}
          </div>
        )}
      </PageHeader>

      {error && <ErrorState error={error} onRetry={() => mutate()} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {places.map((p, i) => {
          const d = data?.find((x) => x.place.name === p.name);
          const c = d?.current.primary;
          return (
            <div key={p.name} className="card relative p-4" style={{ borderTop: `3px solid ${COLORS[i]}` }}>
              {places.length > 2 && (
                <button className="absolute right-3 top-3 text-mute hover:text-white" onClick={() => setPlaces(places.filter((x) => x.name !== p.name))} aria-label={`Remove ${p.name}`}>
                  <X size={15} />
                </button>
              )}
              <p className="flex items-center gap-1.5 font-display font-semibold">
                {p.name} {best === p.name && <span className="chip border-emerald-500/40 text-emerald-300"><Crown size={11} /> Cleanest</span>}
              </p>
              {!d || isLoading ? (
                <Skeleton className="mt-3 h-16" />
              ) : (
                <>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="font-display text-4xl font-bold tabular-nums" style={{ color: categoryFor(c?.aqi)?.color }}>{c?.aqi ?? "–"}</span>
                    <div className="text-xs">
                      <p style={{ color: categoryFor(c?.aqi)?.color }}>{categoryFor(c?.aqi)?.label}</p>
                      {c && <KindBadge kind={c.kind} className="mt-1" />}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-mute">30-day avg AQI: <b className="text-soft">{d.history.summary.avgAqi}</b></p>
                  {base && i > 0 && c?.aqi != null && base.current.primary?.aqi != null && (
                    <p className={`mt-1 text-xs ${c.aqi > base.current.primary.aqi ? "text-red-300" : "text-emerald-300"}`}>
                      {c.aqi > base.current.primary.aqi ? "+" : ""}{c.aqi - base.current.primary.aqi} AQI vs {base.place.name}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <Card title="Pollutant differences" subtitle={`Current concentrations (µg/m³, CAMS model, same method for every place). Difference shown against ${places[0].name}.`}>
        {!data ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-mute">
                <tr>
                  <th className="py-2">Pollutant</th>
                  {data.map((d, i) => <th key={d.place.name} style={{ color: COLORS[i] }}>{d.place.name}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line/60">
                  <td className="py-2">AQI</td>
                  {data.map((d) => <td key={d.place.name}><AqiPill aqi={d.current.model?.aqi} size="sm" /></td>)}
                </tr>
                {KEYS.map((k) => {
                  const baseVal = data[0].current.model?.pollutants.find((x) => x.key === k)?.value;
                  const vals = data.map((d) => d.current.model?.pollutants.find((x) => x.key === k)?.value ?? null);
                  const min = Math.min(...vals.filter((v): v is number => v != null));
                  return (
                    <tr key={k} className="border-t border-line/60">
                      <td className="py-2">{POLLUTANTS[k].label}</td>
                      {vals.map((v, i) => (
                        <td key={i} className="tabular-nums">
                          <span className={v === min ? "font-semibold text-emerald-300" : ""}>{v ?? "–"}</span>
                          {i > 0 && v != null && baseVal != null && baseVal !== 0 && (
                            <span className={`ml-1.5 text-[11px] ${v > baseVal ? "text-red-300" : "text-emerald-300"}`}>
                              {v > baseVal ? "+" : ""}{Math.round(((v - baseVal) / baseVal) * 100)}%
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-mute">Green = lowest value among compared places.</p>
          </div>
        )}
      </Card>

      <Card title="30-day trend" subtitle="Daily average AQI (CAMS model analysis)" action={<KindBadge kind="model" />}>
        <div className="h-72">
          {!data ? (
            <Skeleton className="h-full" />
          ) : (
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="date" tickFormatter={(d) => fmtDay(String(d))} {...axis} minTickGap={24} />
                <YAxis {...axis} />
                <Tooltip {...tooltipStyle} labelFormatter={(l) => fmtDay(String(l))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {data.map((d, i) => (
                  <Line key={d.place.name} dataKey={d.place.name} stroke={COLORS[i]} strokeWidth={2} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        {ranked.length > 0 && (
          <p className="mt-3 text-sm text-soft">
            Ranking by 30-day average: {ranked.map((r, i) => `${i + 1}. ${r.place.name} (${r.history.summary.avgAqi})`).join(" · ")}. <span className="text-mute">“Better” is relative to these places and the available data.</span>
          </p>
        )}
      </Card>
    </div>
  );
}
