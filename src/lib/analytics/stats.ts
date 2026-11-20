import type { Anomaly, DayStat, HourPoint } from "@/lib/types";

/** Pure analytics over hourly series. No I/O — unit tested. */

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function pctChange(from: number | null | undefined, to: number | null | undefined): number | null {
  if (from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return Math.round(((to - from) / from) * 1000) / 10;
}

const r1 = (n: number) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);
const vals = (pts: HourPoint[], k: "aqi" | "pm2_5" | "pm10") =>
  pts.map((p) => p[k]).filter((v): v is number => v != null && Number.isFinite(v));

/**
 * Daily aggregation with day-over-day % change and spike flag.
 * Spike = daily max AQI ≥ 1.5× the median of the previous 7 daily averages AND ≥ 100,
 * or a jump of two or more AQI categories versus the previous day.
 */
export function dailyStats(points: HourPoint[]): DayStat[] {
  const byDay = new Map<string, HourPoint[]>();
  for (const p of points) {
    const d = p.time.slice(0, 10);
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(p);
  }
  const days: DayStat[] = [];
  for (const [date, pts] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const aqi = vals(pts, "aqi");
    days.push({
      date,
      aqiAvg: r1(mean(aqi)),
      aqiMax: aqi.length ? Math.max(...aqi) : null,
      pm25Avg: r1(mean(vals(pts, "pm2_5"))),
      pm10Avg: r1(mean(vals(pts, "pm10"))),
      hours: pts.length,
      spike: false,
      changePct: null,
    });
  }
  days.forEach((d, i) => {
    const prev = days[i - 1];
    d.changePct = prev ? pctChange(prev.aqiAvg, d.aqiAvg) : null;
    const window = days.slice(Math.max(0, i - 7), i).map((x) => x.aqiAvg).filter((v): v is number => v != null);
    const base = median(window);
    const catJump = prev?.aqiAvg != null && d.aqiAvg != null && band(d.aqiAvg) - band(prev.aqiAvg) >= 2;
    d.spike = !!(d.aqiMax != null && window.length >= 3 && d.aqiMax >= 1.5 * base && d.aqiMax >= 100) || catJump;
  });
  return days;
}

const band = (aqi: number) => (aqi <= 50 ? 0 : aqi <= 100 ? 1 : aqi <= 150 ? 2 : aqi <= 200 ? 3 : aqi <= 300 ? 4 : 5);

/**
 * Anomaly detection: robust z-score against a trailing 48-hour rolling median/MAD.
 * Robust statistics are used so that the anomaly itself does not inflate the baseline.
 */
export function detectAnomalies(points: HourPoint[], metric: "pm2_5" | "aqi" = "pm2_5", threshold = 3.5, window = 48): Anomaly[] {
  const out: Anomaly[] = [];
  for (let i = window; i < points.length; i++) {
    const v = points[i][metric];
    if (v == null) continue;
    const hist = points.slice(i - window, i).map((p) => p[metric]).filter((x): x is number => x != null);
    if (hist.length < window / 2) continue;
    const med = median(hist);
    const mad = median(hist.map((x) => Math.abs(x - med))) || 1e-6;
    const score = (0.6745 * (v - med)) / mad;
    // require a material absolute change too, so tiny noise around clean air isn't flagged
    if (Math.abs(score) >= threshold && Math.abs(v - med) >= (metric === "aqi" ? 25 : 10)) {
      out.push({ time: points[i].time, value: v, baseline: r1(med)!, score: r1(score)!, metric, direction: score > 0 ? "spike" : "drop" });
    }
  }
  // collapse consecutive hours into the peak of each episode
  const episodes: Anomaly[] = [];
  for (const a of out) {
    const last = episodes[episodes.length - 1];
    if (last && hoursBetween(last.time, a.time) <= 3 && last.direction === a.direction) {
      if (Math.abs(a.score) > Math.abs(last.score)) episodes[episodes.length - 1] = a;
    } else episodes.push(a);
  }
  return episodes;
}

const hoursBetween = (a: string, b: string) => Math.abs(Date.parse(b + "Z") - Date.parse(a + "Z")) / 3.6e6;

export interface PeriodSummary {
  avgAqi: number | null;
  avgPm25: number | null;
  avgPm10: number | null;
  worstDay: DayStat | null;
  bestDay: DayStat | null;
  daysByCategory: Record<string, number>;
  spikeDays: number;
}

export function summarize(days: DayStat[]): PeriodSummary {
  const withAqi = days.filter((d) => d.aqiAvg != null);
  const cats: Record<string, number> = { Good: 0, Moderate: 0, Sensitive: 0, Unhealthy: 0, "Very unhealthy": 0, Hazardous: 0 };
  const names = Object.keys(cats);
  for (const d of withAqi) cats[names[band(d.aqiAvg!)]]++;
  const sorted = [...withAqi].sort((a, b) => a.aqiAvg! - b.aqiAvg!);
  return {
    avgAqi: r1(mean(withAqi.map((d) => d.aqiAvg!))),
    avgPm25: r1(mean(days.map((d) => d.pm25Avg).filter((v): v is number => v != null))),
    avgPm10: r1(mean(days.map((d) => d.pm10Avg).filter((v): v is number => v != null))),
    worstDay: sorted[sorted.length - 1] ?? null,
    bestDay: sorted[0] ?? null,
    daysByCategory: cats,
    spikeDays: days.filter((d) => d.spike).length,
  };
}

/** Best contiguous window (default 2h) in the upcoming hours with the lowest average AQI. */
export function cleanestWindow(points: HourPoint[], hours = 2): { start: string; end: string; avgAqi: number } | null {
  let best: { start: string; end: string; avgAqi: number } | null = null;
  for (let i = 0; i + hours <= points.length; i++) {
    const w = points.slice(i, i + hours).map((p) => p.aqi);
    if (w.some((v) => v == null)) continue;
    const avg = mean(w as number[]);
    if (!best || avg < best.avgAqi) best = { start: points[i].time, end: points[i + hours - 1].time, avgAqi: Math.round(avg) };
  }
  return best;
}
