import "server-only";
import { categoryFor } from "@/lib/aqi";
import { getForecast, getHistory } from "./service";

/** Compact, factual text summaries of computed analytics — fed to the AI and used as the no-AI fallback. */

const fmtTime = (t: string) => {
  const d = new Date(t);
  return d.toLocaleString("en-IN", { weekday: "short", hour: "numeric", hour12: true, timeZone: "UTC" });
};
// Open-Meteo local times have no offset; formatting them as UTC keeps the wall-clock hour intact.
const asUtc = (t: string) => (t.length === 16 ? t + ":00Z" : t);

export async function forecastSummary(lat: number, lon: number) {
  const f = await getForecast(lat, lon);
  const next24 = f.forecast.slice(0, 24).filter((p) => p.aqi != null);
  if (!next24.length) return "";
  const peak = next24.reduce((a, b) => (b.aqi! > a.aqi! ? b : a));
  const low = next24.reduce((a, b) => (b.aqi! < a.aqi! ? b : a));
  const parts = [
    `CAMS forecast next 24h: peak AQI ${peak.aqi} (${categoryFor(peak.aqi)?.label}) around ${fmtTime(asUtc(peak.time))}, lowest ${low.aqi} around ${fmtTime(asUtc(low.time))}.`,
  ];
  if (f.bestWindow) parts.push(`Cleanest daytime 2h window: from ${fmtTime(asUtc(f.bestWindow.start))} (avg AQI ${f.bestWindow.avgAqi}).`);
  if (f.spikes.length) parts.push(`Forecast spike: up to ${f.spikes[0].peak} starting ${fmtTime(asUtc(f.spikes[0].start))}.`);
  return parts.join(" ");
}

export async function historySummary(lat: number, lon: number, days = 30) {
  const h = await getHistory(lat, lon, { days });
  const s = h.summary;
  const d = h.days.filter((x) => x.aqiAvg != null);
  const lastWeek = d.slice(-7);
  const prevWeek = d.slice(-14, -7);
  const avg = (xs: typeof d) => xs.reduce((a, b) => a + b.aqiAvg!, 0) / (xs.length || 1);
  const wow = prevWeek.length ? Math.round(((avg(lastWeek) - avg(prevWeek)) / avg(prevWeek)) * 1000) / 10 : null;
  return {
    text: [
      `Last ${days} days (CAMS model): average AQI ${s.avgAqi}, average PM2.5 ${s.avgPm25} µg/m³, PM10 ${s.avgPm10} µg/m³.`,
      s.worstDay ? `Worst day ${s.worstDay.date} (avg AQI ${s.worstDay.aqiAvg}); best day ${s.bestDay?.date} (avg ${s.bestDay?.aqiAvg}).` : "",
      wow != null ? `Last 7 days vs previous 7: ${wow > 0 ? "+" : ""}${wow}% AQI.` : "",
      `${s.spikeDays} spike day(s) and ${h.anomalies.length} unusual PM2.5 episode(s) detected.`,
      `Days by category: ${Object.entries(s.daysByCategory).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ")}.`,
    ]
      .filter(Boolean)
      .join(" "),
    weekOverWeek: wow,
    summary: s,
  };
}
