import "server-only";
import { fetchJson } from "../http";
import { overallAqi, subIndex, type PollutantKey } from "@/lib/aqi";
import type { Snapshot, SourceRef } from "@/lib/types";
import { haversineKm } from "@/lib/geo";

/**
 * OpenAQ v3 — open, harmonised ground-station measurements with raw concentrations.
 * Requires OPENAQ_API_KEY (free: https://explore.openaq.org/register).
 */

export const OPENAQ: SourceRef = {
  id: "openaq",
  name: "OpenAQ",
  url: "https://openaq.org/",
  attribution: "OpenAQ and originating government monitoring networks",
};

const BASE = "https://api.openaq.org/v3";
const key = () => process.env.OPENAQ_API_KEY?.trim() || "";
export const openaqEnabled = () => key().length > 0;

const PARAM_MAP: Record<string, PollutantKey> = { pm25: "pm2_5", pm10: "pm10", no2: "no2", so2: "so2", co: "co", o3: "o3" };
const MAX_AGE_MS = 3 * 60 * 60 * 1000; // older than 3h is not "current"

interface Loc {
  id: number;
  name: string;
  coordinates: { latitude: number; longitude: number };
  sensors: { id: number; parameter: { name: string; units: string } }[];
}
interface Latest {
  value: number;
  datetime: { utc: string };
  sensorsId: number;
}

export async function getOpenAqNearest(lat: number, lon: number): Promise<Snapshot | null> {
  if (!openaqEnabled()) return null;
  const headers = { "X-API-Key": key() };
  const locs = await fetchJson<{ results: Loc[] }>(
    `${BASE}/locations?coordinates=${lat},${lon}&radius=25000&limit=10`,
    { source: "OpenAQ", headers },
  );
  const candidates = (locs.results ?? [])
    .filter((l) => l.sensors?.some((s) => s.parameter.name === "pm25" || s.parameter.name === "pm10"))
    .sort(
      (a, b) =>
        haversineKm(lat, lon, a.coordinates.latitude, a.coordinates.longitude) -
        haversineKm(lat, lon, b.coordinates.latitude, b.coordinates.longitude),
    );

  for (const loc of candidates.slice(0, 3)) {
    const latest = await fetchJson<{ results: Latest[] }>(`${BASE}/locations/${loc.id}/latest`, { source: "OpenAQ", headers });
    const bySensor = new Map(loc.sensors.map((s) => [s.id, s.parameter]));
    const conc: Partial<Record<PollutantKey, number>> = {};
    let newest = 0;
    for (const r of latest.results ?? []) {
      const p = bySensor.get(r.sensorsId);
      const k = p && PARAM_MAP[p.name];
      const t = Date.parse(r.datetime?.utc);
      if (!k || !Number.isFinite(r.value) || r.value < 0 || !Number.isFinite(t) || Date.now() - t > MAX_AGE_MS) continue;
      conc[k] = toUgm3(k, r.value, p!.units);
      newest = Math.max(newest, t);
    }
    if (!Object.keys(conc).length) continue; // stale or empty station → try next
    const overall = overallAqi(conc);
    return {
      kind: "measured",
      aqi: overall?.aqi ?? null,
      dominant: overall?.dominant ?? null,
      pollutants: (Object.keys(conc) as PollutantKey[]).map((k) => ({ key: k, value: round(conc[k]!), subIndex: subIndex(k, conc[k]) })),
      observedAt: new Date(newest).toISOString(),
      source: OPENAQ,
      station: {
        name: loc.name,
        lat: loc.coordinates.latitude,
        lon: loc.coordinates.longitude,
        distanceKm: Math.round(haversineKm(lat, lon, loc.coordinates.latitude, loc.coordinates.longitude) * 10) / 10,
        url: `https://explore.openaq.org/locations/${loc.id}`,
      },
    };
  }
  return null;
}

const MW: Partial<Record<PollutantKey, number>> = { no2: 46.01, so2: 64.07, co: 28.01, o3: 48 };
function toUgm3(k: PollutantKey, v: number, units: string) {
  const u = units.toLowerCase();
  const mw = MW[k];
  if (!mw) return v;
  if (u === "ppm") return (v * 1000 * mw) / 24.45;
  if (u === "ppb") return (v * mw) / 24.45;
  if (u.includes("mg")) return v * 1000;
  return v;
}
const round = (n: number) => Math.round(n * 10) / 10;
