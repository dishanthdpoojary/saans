import "server-only";
import { fetchJson } from "../http";
import { overallAqi, subIndex, type PollutantKey } from "@/lib/aqi";
import type { HourPoint, Snapshot, SourceRef } from "@/lib/types";

/**
 * Open-Meteo Air Quality API — CAMS (Copernicus Atmosphere Monitoring Service) model data.
 * No key required. These are MODEL values (analysis for past/current hours, forecast for future),
 * never station measurements — the UI labels them accordingly.
 */

export const OPEN_METEO_AQ: SourceRef = {
  id: "open-meteo-aq",
  name: "Open-Meteo Air Quality (CAMS model)",
  url: "https://open-meteo.com/en/docs/air-quality-api",
  attribution: "Copernicus Atmosphere Monitoring Service via Open-Meteo (CC BY 4.0)",
};
export const OPEN_METEO_WX: SourceRef = {
  id: "open-meteo-weather",
  name: "Open-Meteo Weather",
  url: "https://open-meteo.com/en/docs",
  attribution: "Weather data by Open-Meteo.com (CC BY 4.0)",
};

const AQ = "https://air-quality-api.open-meteo.com/v1/air-quality";
const WX = "https://api.open-meteo.com/v1/forecast";

// Open-Meteo variable name → our pollutant key
const VARS: [string, PollutantKey][] = [
  ["pm2_5", "pm2_5"],
  ["pm10", "pm10"],
  ["nitrogen_dioxide", "no2"],
  ["sulphur_dioxide", "so2"],
  ["carbon_monoxide", "co"],
  ["ozone", "o3"],
];
// Open-Meteo's own per-pollutant US AQI uses the EPA averaging periods (24h PM, 8h O3/CO),
// so its sub-indices are consistent with its headline `us_aqi`. We prefer them over an
// instantaneous recomputation to avoid showing two different numbers for the same thing.

interface AqCurrentRaw {
  timezone: string;
  utc_offset_seconds: number;
  current: Record<string, number | string | null> & { time: string };
}

export async function getModelCurrent(lat: number, lon: number): Promise<{ snapshot: Snapshot; timezone: string }> {
  const vars = ["us_aqi", ...VARS.flatMap(([v]) => [v, `us_aqi_${v}`])].join(",");
  const raw = await fetchJson<AqCurrentRaw>(
    `${AQ}?latitude=${lat}&longitude=${lon}&current=${vars}&timezone=auto`,
    { source: "Open-Meteo" },
  );
  const c = raw.current;
  const pollutants = VARS.map(([v, key]) => {
    const value = num(c[v]);
    return { key, value, subIndex: capAqi(num(c[`us_aqi_${v}`]) ?? subIndex(key, value)) };
  });
  const computed = overallAqi(Object.fromEntries(pollutants.map((p) => [p.key, p.value])));
  const dominant = pollutants.reduce<(typeof pollutants)[number] | null>((a, b) => ((b.subIndex ?? -1) > (a?.subIndex ?? -1) ? b : a), null);
  return {
    timezone: raw.timezone,
    snapshot: {
      kind: "model",
      aqi: capAqi(num(c.us_aqi) ?? computed?.aqi ?? null),
      dominant: dominant?.subIndex != null ? dominant.key : (computed?.dominant ?? null),
      pollutants,
      observedAt: withOffset(c.time, raw.utc_offset_seconds),
      source: OPEN_METEO_AQ,
    },
  };
}

interface AqHourlyRaw {
  timezone: string;
  utc_offset_seconds: number;
  current?: { time: string };
  hourly: Record<string, (number | null)[]> & { time: string[] };
}

/**
 * Hourly series for up to 92 past days and 5 forecast days.
 * Hours after the current model hour are tagged `forecast`; earlier ones `model`.
 */
export async function getModelHourly(
  lat: number,
  lon: number,
  opts: { pastDays?: number; forecastDays?: number; startDate?: string; endDate?: string } = {},
): Promise<{ points: HourPoint[]; timezone: string; nowHour: string }> {
  const vars = "us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone";
  const range =
    opts.startDate && opts.endDate
      ? `start_date=${opts.startDate}&end_date=${opts.endDate}`
      : `past_days=${clamp(opts.pastDays ?? 7, 0, 92)}&forecast_days=${clamp(opts.forecastDays ?? 1, 0, 7)}`;
  const raw = await fetchJson<AqHourlyRaw>(
    `${AQ}?latitude=${lat}&longitude=${lon}&hourly=${vars}&current=us_aqi&${range}&timezone=auto`,
    { source: "Open-Meteo" },
  );
  const nowHour = raw.current?.time ?? new Date().toISOString().slice(0, 13) + ":00";
  const h = raw.hourly;
  const points: HourPoint[] = h.time.map((time, i) => ({
    time,
    aqi: capAqi(num(h.us_aqi?.[i])),
    pm2_5: num(h.pm2_5?.[i]),
    pm10: num(h.pm10?.[i]),
    no2: num(h.nitrogen_dioxide?.[i]),
    o3: num(h.ozone?.[i]),
    kind: time > nowHour ? "forecast" : "model",
  }));
  return { points, timezone: raw.timezone, nowHour };
}

export interface WeatherHour {
  time: string;
  temp: number | null;
  humidity: number | null;
  wind: number | null;
  blh: number | null; // boundary layer height (m), key driver of pollutant dispersion
  precip: number | null;
}

export async function getWeatherHourly(lat: number, lon: number, pastDays = 92, forecastDays = 5) {
  const raw = await fetchJson<AqHourlyRaw>(
    `${WX}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,boundary_layer_height,precipitation&current=temperature_2m,relative_humidity_2m,wind_speed_10m&past_days=${pastDays}&forecast_days=${forecastDays}&timezone=auto`,
    { source: "Open-Meteo Weather" },
  );
  const h = raw.hourly;
  const hours: WeatherHour[] = h.time.map((time, i) => ({
    time,
    temp: num(h.temperature_2m?.[i]),
    humidity: num(h.relative_humidity_2m?.[i]),
    wind: num(h.wind_speed_10m?.[i]),
    blh: num(h.boundary_layer_height?.[i]),
    precip: num(h.precipitation?.[i]),
  }));
  const cur = (raw as unknown as { current?: Record<string, number> }).current;
  return {
    hours,
    current: cur
      ? { temperature: num(cur.temperature_2m), humidity: num(cur.relative_humidity_2m), windSpeed: num(cur.wind_speed_10m) }
      : undefined,
  };
}

/** Batched current AQI for many coordinates in one request (Open-Meteo supports comma lists). */
export async function getModelCurrentMany(coords: { lat: number; lon: number }[]) {
  const out: { aqi: number | null; pm2_5: number | null; time: string }[] = [];
  const CHUNK = 50;
  for (let i = 0; i < coords.length; i += CHUNK) {
    const part = coords.slice(i, i + CHUNK);
    const lats = part.map((c) => c.lat).join(",");
    const lons = part.map((c) => c.lon).join(",");
    const raw = await fetchJson<AqCurrentRaw | AqCurrentRaw[]>(
      `${AQ}?latitude=${lats}&longitude=${lons}&current=us_aqi,pm2_5&timezone=GMT`,
      { source: "Open-Meteo" },
    );
    const arr = Array.isArray(raw) ? raw : [raw];
    for (const r of arr) out.push({ aqi: capAqi(num(r.current.us_aqi)), pm2_5: num(r.current.pm2_5), time: r.current.time + "Z" });
  }
  return out;
}

export interface GeoResult {
  name: string;
  lat: number;
  lon: number;
  country?: string;
  admin1?: string;
}

export async function geocode(q: string): Promise<GeoResult[]> {
  const raw = await fetchJson<{ results?: { name: string; latitude: number; longitude: number; country?: string; admin1?: string }[] }>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`,
    { source: "Open-Meteo Geocoding" },
  );
  return (raw.results ?? []).map((r) => ({ name: r.name, lat: r.latitude, lon: r.longitude, country: r.country, admin1: r.admin1 }));
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
/** The US AQI scale ends at 500; CAMS dust events can produce larger raw values (e.g. 2160). */
export const capAqi = (v: number | null) => (v == null ? null : Math.min(500, Math.max(0, Math.round(v))));
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
/** "2026-11-09T17:30" + offset seconds → full ISO with offset, so the client can show true local time. */
function withOffset(local: string, offsetSec: number) {
  const sign = offsetSec >= 0 ? "+" : "-";
  const a = Math.abs(offsetSec);
  const hh = String(Math.floor(a / 3600)).padStart(2, "0");
  const mm = String(Math.floor((a % 3600) / 60)).padStart(2, "0");
  return `${local}:00${sign}${hh}:${mm}`;
}
