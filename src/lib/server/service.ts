import "server-only";
import { cached, coordKey } from "./cache";
import { getModelCurrent, getModelCurrentMany, getModelHourly, getWeatherHourly, OPEN_METEO_AQ, OPEN_METEO_WX } from "./providers/openmeteo";
import { consensusFromRows, getWaqiAreaConsensus, getWaqiNearest, getWaqiStationRows, getWaqiStationsInBounds, waqiEnabled, WAQI, type StationRow } from "./providers/waqi";
import { getOpenAqNearest, openaqEnabled, OPENAQ } from "./providers/openaq";
import { cleanestWindow, dailyStats, detectAnomalies, summarize } from "@/lib/analytics/stats";
import { forecastPm25, type SeriesRow } from "@/lib/analytics/predict";
import { CITIES } from "@/lib/cities";
import type { CurrentResponse, HourPoint, MapPoint, Snapshot } from "@/lib/types";

/**
 * Orchestration layer: composes providers, applies caching policy and data-quality rules.
 * Routes stay thin; all business rules live here or in pure analytics modules.
 */

const MIN = 60_000;
const MAX_STATION_KM = 25; // beyond this a station no longer represents "your" air
const MAX_STATION_AGE_MS = 3 * 60 * MIN;

const settledValue = <T>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
const reason = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? String((r.reason as Error)?.message ?? r.reason) : null);

export async function getCurrent(lat: number, lon: number, name?: string): Promise<CurrentResponse> {
  const key = coordKey(lat, lon);
  const [model, waqi, openaq, wx, area] = await Promise.allSettled([
    cached(`model:${key}`, 10 * MIN, () => getModelCurrent(lat, lon)),
    cached(`waqi:${key}`, 10 * MIN, () => getWaqiNearest(lat, lon)),
    cached(`openaq:${key}`, 15 * MIN, () => getOpenAqNearest(lat, lon)),
    cached(`wx:${key}`, 30 * MIN, () => getWeatherHourly(lat, lon, 0, 1)),
    cached(`area:${key}`, 10 * MIN, () => getWaqiAreaConsensus(lat, lon, MAX_STATION_KM)),
  ]);

  const warnings: string[] = [];
  for (const [label, r] of [["Open-Meteo", model], ["WAQI", waqi], ["OpenAQ", openaq], ["Weather", wx]] as const) {
    const why = reason(r);
    if (why) warnings.push(`${label} unavailable: ${why}`);
  }

  const measured: Snapshot[] = [];
  for (const r of [waqi, openaq]) {
    const snap = settledValue(r)?.value;
    if (!snap) continue;
    const age = Date.now() - Date.parse(snap.observedAt);
    if (snap.station?.distanceKm != null && snap.station.distanceKm > MAX_STATION_KM) {
      warnings.push(`Nearest ${snap.source.name} station is ${snap.station.distanceKm} km away, shown for reference only.`);
    }
    if (Number.isFinite(age) && age > MAX_STATION_AGE_MS) {
      warnings.push(`${snap.station?.name ?? snap.source.name} last reported ${Math.round(age / 3.6e6)} h ago.`);
    }
    measured.push(snap);
  }
  if (!waqiEnabled() && !openaqEnabled()) warnings.push("No station API key configured, showing CAMS model estimates only.");

  const modelSnap = settledValue(model)?.value.snapshot ?? null;

  // headline preference: median of ≥2 fresh stations nearby, then the nearest fresh station, then the model
  const cons = settledValue(area)?.value;
  const consensusSnap: Snapshot | null =
    cons && cons.stations >= 2
      ? {
          kind: "measured",
          aqi: cons.aqi,
          dominant: measured.find((m) => m.source.id === "waqi")?.dominant ?? null,
          pollutants: [],
          observedAt: cons.newest,
          source: { ...WAQI, name: "WAQI station network" },
          station: { name: `Median of ${cons.stations} stations within ${MAX_STATION_KM} km`, lat, lon, distanceKm: 0 },
          consensus: { stations: cons.stations, oldestHours: cons.oldestHours, nearest: cons.nearest },
        }
      : null;
  const usable = measured.filter(
    (m) => (m.station?.distanceKm ?? 0) <= MAX_STATION_KM && Date.now() - Date.parse(m.observedAt) <= MAX_STATION_AGE_MS,
  );
  // prefer the closest fresh station; fall back to the model
  usable.sort((a, b) => (a.station?.distanceKm ?? 99) - (b.station?.distanceKm ?? 99));
  const primary = consensusSnap ?? usable[0] ?? modelSnap;
  if (!primary && !measured.length) throw new Error(warnings.join(" · ") || "No data available for this location");

  const stale = [model, waqi, openaq].some((r) => r.status === "fulfilled" && r.value.stale);
  if (stale) warnings.push("Some providers are failing, serving the last good data we have.");

  return {
    location: { lat, lon, name, timezone: settledValue(model)?.value.timezone },
    primary: primary ?? measured[0],
    consensus: consensusSnap,
    measured,
    model: modelSnap,
    weather: settledValue(wx)?.value.current,
    warnings,
    fetchedAt: new Date().toISOString(),
    stale,
  };
}

export async function getHistory(lat: number, lon: number, opts: { days?: number; start?: string; end?: string }) {
  const key = `hist:${coordKey(lat, lon)}:${opts.start ?? ""}:${opts.end ?? ""}:${opts.days ?? ""}`;
  const { value, stale } = await cached(key, 60 * MIN, () =>
    getModelHourly(lat, lon, opts.start && opts.end ? { startDate: opts.start, endDate: opts.end } : { pastDays: opts.days ?? 30, forecastDays: 0 }),
  );
  const points = value.points.filter((p) => p.kind === "model"); // history = past hours only
  const days = dailyStats(points);
  return {
    points,
    days,
    anomalies: detectAnomalies(points, "pm2_5"),
    summary: summarize(days),
    timezone: value.timezone,
    source: OPEN_METEO_AQ,
    stale,
  };
}

/** Weather + AQ history aligned by hour for the ML model. */
async function buildSeries(lat: number, lon: number) {
  const [aq, wx] = await Promise.all([
    getModelHourly(lat, lon, { pastDays: 92, forecastDays: 5 }),
    getWeatherHourly(lat, lon, 92, 5),
  ]);
  const wxByTime = new Map(wx.hours.map((h) => [h.time, h]));
  const rows: SeriesRow[] = [];
  let nowIdx = -1;
  for (const p of aq.points) {
    const w = wxByTime.get(p.time);
    if (!w) continue;
    if (p.kind === "forecast" && nowIdx < 0) nowIdx = rows.length;
    rows.push({ time: p.time, pm25: p.kind === "model" ? p.pm2_5 : null, wind: w.wind, blh: w.blh, humidity: w.humidity, temp: w.temp, precip: w.precip });
  }
  return { aq, rows, nowIdx };
}

export async function getForecast(lat: number, lon: number) {
  const { value, stale } = await cached(`fc:${coordKey(lat, lon)}`, 60 * MIN, async () => {
    const { aq, rows, nowIdx } = await buildSeries(lat, lon);
    const forecast = aq.points.filter((p) => p.kind === "forecast");
    const recent = aq.points.filter((p) => p.kind === "model").slice(-48);
    const ml = nowIdx > 0 ? forecastPm25(rows, nowIdx, 72) : null;
    return { forecast, recent, ml, timezone: aq.timezone };
  });

  const { forecast, recent, ml, timezone } = value;
  const next24 = forecast.slice(0, 24);
  const daily = dailyStats(forecast).map(({ date, aqiAvg, aqiMax, pm25Avg }) => ({ date, aqiAvg, aqiMax, pm25Avg }));
  const currentAqi = recent[recent.length - 1]?.aqi ?? null;
  // a forecast "spike" = a future hour ≥ 1.4× now and ≥ 100, or crossing into Unhealthy
  const spikes = forecast.filter(
    (p) => p.aqi != null && currentAqi != null && ((p.aqi >= currentAqi * 1.4 && p.aqi >= 100) || (p.aqi > 150 && currentAqi <= 150)),
  );
  return {
    recent,
    forecast,
    daily,
    spikes: collapseHours(spikes),
    bestWindow: cleanestWindow(next24.filter((p) => isDaytime(p.time)), 2),
    ml: ml && {
      ...ml,
      method: "Autoregressive ridge regression on 92 days of hourly PM2.5 with weather covariates (wind, mixing height, humidity, temperature, rain, hour of day).",
    },
    timezone,
    sources: [OPEN_METEO_AQ, OPEN_METEO_WX],
    stale,
  };
}

const isDaytime = (t: string) => {
  const h = Number(t.slice(11, 13));
  return h >= 6 && h <= 20;
};

function collapseHours(pts: HourPoint[]) {
  const out: { start: string; end: string; peak: number }[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Date.parse(p.time) - Date.parse(last.end) <= 3_600_000) {
      last.end = p.time;
      last.peak = Math.max(last.peak, p.aqi!);
    } else out.push({ start: p.time, end: p.time, peak: p.aqi! });
  }
  return out;
}

/** Run async work over items with bounded concurrency (protects upstream rate limits). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// A few large boxes cover every city in the catalogue. WAQI rate-limits bursts of small requests
// (it starts returning an HTML error page), so one request per region beats one per city.
const REGIONS: [number, number, number, number][] = [
  [5, 60, 38, 100], // South Asia
  [18, 100, 56, 146], // East Asia
  [-47, 95, 18, 180], // South-East Asia & Oceania
  [-36, 20, 50, 80], // Middle East, Central Asia, East & South Africa
  [-5, -20, 62, 42], // Europe, North & West Africa
  [10, -130, 60, -60], // North America
  [-40, -85, 12, -30], // South America
];

async function waqiStationPool(): Promise<StationRow[]> {
  if (!waqiEnabled()) return [];
  const parts = await mapLimit(REGIONS, 2, (r) => getWaqiStationRows(...r).catch(() => [] as StationRow[]));
  return parts.flat();
}

/**
 * City snapshot used by the map, rankings, hotspots and clean-air finder.
 * Each city's value is the MEDIAN OF FRESH GROUND STATIONS within 25 km when there are any
 * (kind "measured"); only cities with no live stations fall back to the CAMS model (kind "model").
 * Ranking cities on model output alone was misleading (e.g. CAMS over-estimates coastal ozone).
 */
/** A lone station is trusted only if it is within a plausible band of the independent model. */
function plausible(stations: number, aqi: number, modelAqi: number | null) {
  if (stations >= 2) return true;
  if (modelAqi == null || modelAqi === 0) return true;
  const r = aqi / modelAqi;
  return r >= 0.4 && r <= 2.0; // a lone sensor more than 2x off the model is more likely faulty than right
}

export async function getCitiesSnapshot() {
  const { value, stale, storedAt } = await cached("cities:v4", 15 * MIN, async () => {
    const [rows, pool] = await Promise.all([getModelCurrentMany(CITIES), waqiStationPool()]);
    type CityRow = (typeof CITIES)[number] & { aqi: number | null; kind: "measured" | "model"; stations: number; modelAqi: number | null; pm2_5: number | null; observedAt?: string; via?: string };
    const out: CityRow[] = CITIES.map((c, i) => {
      const modelAqi = rows[i]?.aqi ?? null;
      const m = pool.length ? consensusFromRows(pool, c.lat, c.lon, MAX_STATION_KM) : null;
      const ok = m && plausible(m.stations, m.aqi, modelAqi);
      return {
        ...c,
        aqi: ok ? m!.aqi : modelAqi,
        kind: ok ? "measured" : "model",
        stations: ok ? m!.stations : 0,
        modelAqi,
        pm2_5: rows[i]?.pm2_5 ?? null,
        observedAt: ok ? m!.newest : rows[i]?.time,
        via: ok ? "WAQI" : undefined,
      };
    });

    // Precise pass for the cities people will see first (hotspots, podiums): a dedicated WAQI
    // lookup, then OpenAQ as a second measured source for places WAQI does not cover.
    const top = [...out].filter((c) => c.aqi != null).sort((a, b) => b.aqi! - a.aqi!).slice(0, 12);
    await mapLimit(top, 2, async (c) => {
      try {
        const cons = await getWaqiAreaConsensus(c.lat, c.lon, MAX_STATION_KM);
        if (cons && plausible(cons.stations, cons.aqi, c.modelAqi)) {
          Object.assign(c, { aqi: cons.aqi, kind: "measured", stations: cons.stations, observedAt: cons.newest, via: "WAQI" });
          return;
        }
        if (openaqEnabled()) {
          const oa = await getOpenAqNearest(c.lat, c.lon);
          if (oa?.aqi != null && (oa.station?.distanceKm ?? 99) <= MAX_STATION_KM && plausible(1, oa.aqi, c.modelAqi)) {
            Object.assign(c, { aqi: oa.aqi, kind: "measured", stations: 1, observedAt: oa.observedAt, via: "OpenAQ" });
            return;
          }
        }
        // no trustworthy station: keep the model value, clearly labelled as an estimate
        Object.assign(c, { aqi: c.modelAqi, kind: "model", stations: 0, via: undefined });
      } catch {
        /* keep pooled value */
      }
    });
    return out;
  });
  const measuredCount = value.filter((c) => c.kind === "measured").length;
  return { cities: value, stale, asOf: new Date(storedAt).toISOString(), measuredCount, source: OPEN_METEO_AQ, stationSource: WAQI };
}

export async function getMapPoints(bbox: { s: number; w: number; n: number; e: number }) {
  const [cities, stations] = await Promise.allSettled([
    getCitiesSnapshot(),
    waqiEnabled()
      ? cached(`bounds:${[bbox.s, bbox.w, bbox.n, bbox.e].map((v) => v.toFixed(1)).join(",")}`, 10 * MIN, () =>
          getWaqiStationsInBounds(bbox.s, bbox.w, bbox.n, bbox.e),
        )
      : Promise.resolve({ value: [] as MapPoint[], stale: false, storedAt: Date.now() }),
  ]);
  const cityPoints: MapPoint[] =
    cities.status === "fulfilled"
      ? cities.value.cities.map((c) => ({ id: `city-${c.id}`, name: c.name, lat: c.lat, lon: c.lon, aqi: c.aqi, kind: c.kind, stations: c.stations, modelAqi: c.modelAqi, observedAt: c.observedAt, source: c.kind === "measured" ? ("waqi" as const) : ("open-meteo-aq" as const) }))
      : [];
  return {
    cities: cityPoints,
    stations: stations.status === "fulfilled" ? stations.value.value : [],
    stationsEnabled: waqiEnabled(),
    warnings: [reason(cities), reason(stations)].filter(Boolean),
  };
}

export function providerStatus() {
  return [
    { ...OPEN_METEO_AQ, enabled: true, kind: "model + forecast", key: false },
    { ...OPEN_METEO_WX, enabled: true, kind: "weather", key: false },
    { ...WAQI, enabled: waqiEnabled(), kind: "measured (stations)", key: true },
    { ...OPENAQ, enabled: openaqEnabled(), kind: "measured (stations)", key: true },
    { id: "gdelt", name: "GDELT Project", url: "https://www.gdeltproject.org/", enabled: true, kind: "air-quality news headlines", key: false },
    { id: "google-news", name: "Google News RSS", url: "https://news.google.com/", enabled: true, kind: "air-quality news headlines", key: false },
    {
      id: "gemini",
      name: "Google Gemini",
      url: "https://ai.google.dev/",
      enabled: !!process.env.GEMINI_API_KEY,
      kind: "AI assistant & insights",
      key: true,
    },
  ];
}
