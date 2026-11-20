import type { PollutantKey } from "./aqi";

/**
 * Provenance is a first-class field on every value we show. The UI never renders a number
 * without its `kind`, which is how we satisfy "clearly distinguish measurements from
 * forecasts and estimates".
 */
export type DataKind =
  | "measured" // ground station reading (WAQI / OpenAQ)
  | "model" // CAMS atmospheric model analysis for the current/past hour (Open-Meteo)
  | "forecast" // CAMS model forecast for a future hour (Open-Meteo)
  | "predicted"; // our own ML model output

export interface SourceRef {
  id: "waqi" | "openaq" | "open-meteo-aq" | "open-meteo-weather" | "gemini" | "gdelt";
  name: string;
  url: string;
  attribution?: string;
}

export interface PollutantValue {
  key: PollutantKey;
  /** Concentration in μg/m³ when known. */
  value: number | null;
  /** EPA sub-index (0-500). WAQI only publishes sub-indices, so value may be null while this is set. */
  subIndex: number | null;
}

export interface Snapshot {
  kind: DataKind;
  aqi: number | null;
  dominant: PollutantKey | null;
  pollutants: PollutantValue[];
  observedAt: string; // ISO time of the reading itself (not of our fetch)
  source: SourceRef;
  station?: { name: string; lat: number; lon: number; distanceKm?: number; url?: string };
  /** set when the value is the median of several nearby stations */
  consensus?: { stations: number; oldestHours: number; nearest: { name: string; km: number } };
}

export interface CurrentResponse {
  location: { lat: number; lon: number; name?: string; timezone?: string };
  /** Best available headline: measured if a station is close enough, otherwise model. */
  primary: Snapshot | null;
  measured: Snapshot[];
  model: Snapshot | null;
  /** median of nearby fresh stations, when available */
  consensus?: Snapshot | null;
  weather?: { temperature: number | null; humidity: number | null; windSpeed: number | null };
  warnings: string[];
  fetchedAt: string;
  stale: boolean;
}

export interface HourPoint {
  time: string; // local ISO hour
  aqi: number | null;
  pm2_5: number | null;
  pm10: number | null;
  no2?: number | null;
  o3?: number | null;
  kind: DataKind;
}

export interface DayStat {
  date: string;
  aqiAvg: number | null;
  aqiMax: number | null;
  pm25Avg: number | null;
  pm10Avg: number | null;
  hours: number;
  spike: boolean;
  changePct: number | null; // vs previous day
}

export interface Anomaly {
  time: string;
  value: number;
  baseline: number;
  score: number; // robust z-score
  metric: "pm2_5" | "aqi";
  direction: "spike" | "drop";
}

export interface MapPoint {
  /** for cities: number of fresh stations behind a measured value */
  stations?: number;
  /** for cities: the CAMS model value, kept for comparison */
  modelAqi?: number | null;
  id: string;
  name: string;
  lat: number;
  lon: number;
  aqi: number | null;
  kind: DataKind;
  observedAt?: string;
  source: SourceRef["id"];
}
