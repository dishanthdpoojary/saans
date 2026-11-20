import "server-only";
import { fetchJson, UpstreamError } from "../http";
import type { PollutantKey } from "@/lib/aqi";
import type { MapPoint, Snapshot, SourceRef } from "@/lib/types";
import { haversineKm } from "@/lib/geo";

/**
 * World Air Quality Index Project — real ground-station readings.
 * Requires WAQI_TOKEN (free: https://aqicn.org/data-platform/token/).
 * NOTE: WAQI publishes per-pollutant *sub-indices* (iaqi), not raw concentrations, so we
 * store them as `subIndex` and leave `value` null rather than mislabel them as μg/m³.
 */

export const WAQI: SourceRef = {
  id: "waqi",
  name: "World Air Quality Index Project",
  url: "https://aqicn.org/",
  attribution: "World Air Quality Index Project and originating EPA/monitoring agencies",
};

const BASE = "https://api.waqi.info";
const token = () => process.env.WAQI_TOKEN?.trim() || "";
export const waqiEnabled = () => token().length > 0;

const IAQI_MAP: Record<string, PollutantKey> = { pm25: "pm2_5", pm10: "pm10", no2: "no2", so2: "so2", co: "co", o3: "o3" };

interface WaqiFeed {
  status: "ok" | "error";
  data:
    | string
    | {
        aqi: number | "-";
        idx: number;
        dominentpol?: string;
        city: { geo: [number, number]; name: string; url?: string };
        iaqi: Record<string, { v: number }>;
        time: { iso?: string; s: string; tz: string };
        attributions?: { name: string; url: string }[];
      };
}

export async function getWaqiNearest(lat: number, lon: number): Promise<Snapshot | null> {
  if (!waqiEnabled()) return null;
  const raw = await fetchJson<WaqiFeed>(`${BASE}/feed/geo:${lat};${lon}/?token=${token()}`, { source: "WAQI" });
  if (raw.status !== "ok" || typeof raw.data === "string") {
    throw new UpstreamError(`WAQI: ${typeof raw.data === "string" ? raw.data : "error"}`, "WAQI", undefined, false);
  }
  const d = raw.data;
  if (d.aqi === "-" || typeof d.aqi !== "number") return null; // station offline → treat as missing
  const pollutants = Object.entries(IAQI_MAP)
    .filter(([k]) => d.iaqi?.[k])
    .map(([k, key]) => ({ key, value: null, subIndex: Math.round(d.iaqi[k].v) }));
  const [slat, slon] = d.city.geo;
  const attributions = (d.attributions ?? []).map((a) => a.name).filter(Boolean);
  return {
    kind: "measured",
    aqi: d.aqi,
    dominant: d.dominentpol ? (IAQI_MAP[d.dominentpol] ?? null) : null,
    pollutants,
    observedAt: d.time.iso ?? `${d.time.s.replace(" ", "T")}${d.time.tz}`,
    source: { ...WAQI, attribution: attributions.join(" · ") || WAQI.attribution },
    station: {
      name: d.city.name,
      lat: slat,
      lon: slon,
      distanceKm: Math.round(haversineKm(lat, lon, slat, slon) * 10) / 10,
      url: d.city.url,
    },
  };
}

interface WaqiBounds {
  status: string;
  data: { lat: number; lon: number; uid: number; aqi: string; station: { name: string; time: string } }[] | string;
}

export async function getWaqiStationsInBounds(s: number, w: number, n: number, e: number): Promise<MapPoint[]> {
  if (!waqiEnabled()) return [];
  const raw = await fetchJson<WaqiBounds>(`${BASE}/map/bounds/?latlng=${s},${w},${n},${e}&networks=all&token=${token()}`, {
    source: "WAQI",
  });
  if (raw.status !== "ok" || typeof raw.data === "string") return [];
  return raw.data
    .map((p) => ({
      id: `waqi-${p.uid}`,
      name: p.station.name,
      lat: p.lat,
      lon: p.lon,
      aqi: Number.isFinite(Number(p.aqi)) ? Number(p.aqi) : null,
      kind: "measured" as const,
      observedAt: p.station.time,
      source: "waqi" as const,
    }))
    // never show a station that has stopped reporting: older than 6 h is not "live"
    .filter((p) => p.aqi != null && Date.now() - Date.parse(p.observedAt) <= 6 * 3600e3);
}

export interface AreaConsensus {
  aqi: number;
  stations: number; // stations used
  newest: string; // ISO time of the freshest reading used
  oldestHours: number; // age of the oldest reading used
  nearest: { name: string; km: number };
}

export interface StationRow {
  aqi: number;
  t: number;
  lat: number;
  lon: number;
  name: string;
}

/** All stations WAQI reports inside a box (used for regional pools and single-place lookups). */
export async function getWaqiStationRows(s: number, w: number, n: number, e: number): Promise<StationRow[]> {
  if (!waqiEnabled()) return [];
  const raw = await fetchJson<WaqiBounds>(`${BASE}/map/bounds/?latlng=${s},${w},${n},${e}&networks=all&token=${token()}`, {
    source: "WAQI",
    retries: 1,
    timeoutMs: 9000,
  });
  if (raw.status !== "ok" || typeof raw.data === "string") return [];
  return raw.data
    .map((p) => ({ aqi: Number(p.aqi), t: Date.parse(p.station.time), lat: p.lat, lon: p.lon, name: p.station.name }))
    .filter((p) => Number.isFinite(p.aqi) && p.aqi >= 0 && p.aqi <= 999 && Number.isFinite(p.t));
}

/**
 * Consensus of ground stations around a point: the MEDIAN AQI of stations within `radiusKm` that
 * reported in the last 3 hours (falling back to 6 hours if none). A median of several monitors is
 * far more representative of "the air here" than one station, and robust to a single faulty sensor.
 */
export function consensusFromRows(rows: StationRow[], lat: number, lon: number, radiusKm = 25, now = Date.now()): AreaConsensus | null {
  const near = rows.map((p) => ({ ...p, km: haversineKm(lat, lon, p.lat, p.lon) })).filter((p) => p.km <= radiusKm);
  let used = near.filter((p) => now - p.t <= 3 * 3600e3);
  if (!used.length) used = near.filter((p) => now - p.t <= 6 * 3600e3);
  if (!used.length) return null;
  const v = used.map((p) => p.aqi).sort((a, b) => a - b);
  const median = v.length % 2 ? v[v.length >> 1] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2);
  const nearest = [...used].sort((a, b) => a.km - b.km)[0];
  return {
    aqi: median,
    stations: used.length,
    newest: new Date(Math.max(...used.map((p) => p.t))).toISOString(),
    oldestHours: Math.round(((now - Math.min(...used.map((p) => p.t))) / 3600e3) * 10) / 10,
    nearest: { name: nearest.name, km: Math.round(nearest.km * 10) / 10 },
  };
}

export async function getWaqiAreaConsensus(lat: number, lon: number, radiusKm = 25): Promise<AreaConsensus | null> {
  if (!waqiEnabled()) return null;
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const rows = await getWaqiStationRows(lat - dLat, lon - dLon, lat + dLat, lon + dLon);
  return consensusFromRows(rows, lat, lon, radiusKm);
}
