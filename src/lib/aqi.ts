/**
 * US EPA Air Quality Index — breakpoints, categories and conversions.
 * Source: EPA "Technical Assistance Document for the Reporting of Daily Air Quality" (2024 PM2.5 revision).
 * Pure functions only: no I/O, fully unit-tested.
 */

export type PollutantKey = "pm2_5" | "pm10" | "no2" | "so2" | "co" | "o3";

export const POLLUTANTS: Record<
  PollutantKey,
  { label: string; unit: string; name: string; molecularWeight?: number }
> = {
  pm2_5: { label: "PM2.5", unit: "μg/m³", name: "Fine particulate matter" },
  pm10: { label: "PM10", unit: "μg/m³", name: "Coarse particulate matter" },
  no2: { label: "NO₂", unit: "μg/m³", name: "Nitrogen dioxide", molecularWeight: 46.01 },
  so2: { label: "SO₂", unit: "μg/m³", name: "Sulphur dioxide", molecularWeight: 64.07 },
  co: { label: "CO", unit: "μg/m³", name: "Carbon monoxide", molecularWeight: 28.01 },
  o3: { label: "O₃", unit: "μg/m³", name: "Ozone", molecularWeight: 48.0 },
};

type Bp = [cLow: number, cHigh: number, iLow: number, iHigh: number];

// Concentration units per EPA: PM in μg/m³, O3/CO in ppm, NO2/SO2 in ppb.
const BREAKPOINTS: Record<PollutantKey, Bp[]> = {
  pm2_5: [
    [0, 9.0, 0, 50],
    [9.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 125.4, 151, 200],
    [125.5, 225.4, 201, 300],
    [225.5, 325.4, 301, 500],
  ],
  pm10: [
    [0, 54, 0, 50],
    [55, 154, 51, 100],
    [155, 254, 101, 150],
    [255, 354, 151, 200],
    [355, 424, 201, 300],
    [425, 604, 301, 500],
  ],
  o3: [
    [0, 0.054, 0, 50],
    [0.055, 0.07, 51, 100],
    [0.071, 0.085, 101, 150],
    [0.086, 0.105, 151, 200],
    [0.106, 0.2, 201, 300],
  ],
  no2: [
    [0, 53, 0, 50],
    [54, 100, 51, 100],
    [101, 360, 101, 150],
    [361, 649, 151, 200],
    [650, 1249, 201, 300],
    [1250, 2049, 301, 500],
  ],
  so2: [
    [0, 35, 0, 50],
    [36, 75, 51, 100],
    [76, 185, 101, 150],
    [186, 304, 151, 200],
    [305, 604, 201, 300],
    [605, 1004, 301, 500],
  ],
  co: [
    [0, 4.4, 0, 50],
    [4.5, 9.4, 51, 100],
    [9.5, 12.4, 101, 150],
    [12.5, 15.4, 151, 200],
    [15.5, 30.4, 201, 300],
    [30.5, 50.4, 301, 500],
  ],
};

/** μg/m³ → EPA native unit (ppb for NO2/SO2, ppm for CO/O3) at 25 °C, 1 atm. */
export function toEpaUnit(key: PollutantKey, ugm3: number): number {
  const mw = POLLUTANTS[key].molecularWeight;
  if (!mw) return ugm3;
  const ppb = (ugm3 * 24.45) / mw;
  return key === "co" || key === "o3" ? ppb / 1000 : ppb;
}

/** Sub-index for one pollutant concentration in μg/m³. Returns null when not computable. */
export function subIndex(key: PollutantKey, ugm3: number | null | undefined): number | null {
  if (ugm3 == null || !Number.isFinite(ugm3) || ugm3 < 0) return null;
  const raw = toEpaUnit(key, ugm3);
  // EPA truncation: PM2.5/CO to 1 decimal, O3 to 3, others to integer.
  const decimals = key === "pm2_5" || key === "co" ? 1 : key === "o3" ? 3 : 0;
  const f = 10 ** decimals;
  const c = Math.floor(raw * f) / f;
  const table = BREAKPOINTS[key];
  for (const [cl, ch, il, ih] of table) {
    if (c >= cl && c <= ch) return Math.round(((ih - il) / (ch - cl)) * (c - cl) + il);
  }
  const last = table[table.length - 1];
  return c > last[1] ? 500 : null;
}

/** Overall AQI = max sub-index; also returns the dominant pollutant. */
export function overallAqi(
  conc: Partial<Record<PollutantKey, number | null>>,
): { aqi: number; dominant: PollutantKey } | null {
  let best: { aqi: number; dominant: PollutantKey } | null = null;
  for (const k of Object.keys(conc) as PollutantKey[]) {
    const s = subIndex(k, conc[k]);
    if (s != null && (!best || s > best.aqi)) best = { aqi: s, dominant: k };
  }
  return best;
}

export interface AqiCategory {
  id: "good" | "moderate" | "usg" | "unhealthy" | "very-unhealthy" | "hazardous";
  label: string;
  short: string;
  min: number;
  max: number;
  color: string;
  text: string; // readable foreground on `color`
  meaning: string;
  general: string;
  sensitive: string;
  activity: { outdoorExercise: string; commute: string; windows: string; mask: string };
}

export const CATEGORIES: AqiCategory[] = [
  {
    id: "good", label: "Good", short: "Good", min: 0, max: 50, color: "#22c55e", text: "#052e16",
    meaning: "Air quality is satisfactory and poses little or no risk.",
    general: "Ideal for outdoor activities.",
    sensitive: "No precautions needed.",
    activity: { outdoorExercise: "Go for it, great conditions", commute: "Walk or cycle freely", windows: "Open windows to ventilate", mask: "Not needed" },
  },
  {
    id: "moderate", label: "Moderate", short: "Moderate", min: 51, max: 100, color: "#eab308", text: "#1a1400",
    meaning: "Acceptable, but unusually sensitive people may notice effects.",
    general: "Outdoor activity is fine for most people.",
    sensitive: "Unusually sensitive people should consider shortening long or intense outdoor exertion.",
    activity: { outdoorExercise: "Fine; sensitive people take it easier", commute: "Normal", windows: "OK to open", mask: "Not needed" },
  },
  {
    id: "usg", label: "Unhealthy for Sensitive Groups", short: "Sensitive", min: 101, max: 150, color: "#f97316", text: "#1f0a00",
    meaning: "Children, older adults and people with heart or lung disease may be affected.",
    general: "Most people are unlikely to be affected; reduce prolonged heavy exertion.",
    sensitive: "Reduce prolonged or heavy outdoor exertion; keep reliever inhalers handy.",
    activity: { outdoorExercise: "Shorter, lighter sessions", commute: "Prefer closed vehicles on busy roads", windows: "Keep closed at peak hours", mask: "N95 for sensitive groups" },
  },
  {
    id: "unhealthy", label: "Unhealthy", short: "Unhealthy", min: 151, max: 200, color: "#ef4444", text: "#ffffff",
    meaning: "Everyone may begin to experience health effects.",
    general: "Avoid prolonged or heavy exertion outdoors; move workouts indoors.",
    sensitive: "Avoid outdoor exertion entirely; follow your asthma/heart action plan.",
    activity: { outdoorExercise: "Move indoors", commute: "Limit time outside, mask up", windows: "Keep closed; run a purifier", mask: "N95/FFP2 recommended" },
  },
  {
    id: "very-unhealthy", label: "Very Unhealthy", short: "Very unhealthy", min: 201, max: 300, color: "#a855f7", text: "#ffffff",
    meaning: "Health alert: the risk of health effects is increased for everyone.",
    general: "Avoid outdoor activity; stay indoors with filtered air where possible.",
    sensitive: "Stay indoors; seek medical advice if symptoms appear.",
    activity: { outdoorExercise: "Avoid", commute: "Essential trips only, N95", windows: "Sealed; purifier on high", mask: "N95/FFP2 essential" },
  },
  {
    id: "hazardous", label: "Hazardous", short: "Hazardous", min: 301, max: 500, color: "#9f1239", text: "#ffffff",
    meaning: "Health warning of emergency conditions: everyone is likely to be affected.",
    general: "Remain indoors and keep activity levels low.",
    sensitive: "Remain indoors; follow medical advice; consider relocating temporarily.",
    activity: { outdoorExercise: "Do not exercise outdoors", commute: "Avoid travel", windows: "Sealed; purifier on high", mask: "N95/FFP2 essential" },
  },
];

export function categoryFor(aqi: number | null | undefined): AqiCategory | null {
  if (aqi == null || !Number.isFinite(aqi)) return null;
  return CATEGORIES.find((c) => aqi <= c.max) ?? CATEGORIES[CATEGORIES.length - 1];
}

export function aqiColor(aqi: number | null | undefined): string {
  return categoryFor(aqi)?.color ?? "#64748b";
}

/**
 * Berkeley Earth rule of thumb: breathing 22 μg/m³ of PM2.5 for a day ≈ smoking one cigarette.
 * Used for the impact report — clearly labelled as an approximation in the UI.
 */
export function cigarettesEquivalent(avgPm25: number, days = 1): number {
  return (avgPm25 / 22) * days;
}
