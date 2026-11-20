"use client";

import useSWR from "swr";
import { fetcher, qs, swrOpts } from "./fetcher";
import type { Place } from "./location";
import type { Anomaly, CurrentResponse, DayStat, HourPoint, SourceRef } from "@/lib/types";
import type { PeriodSummary } from "@/lib/analytics/stats";
import type { PredictionResult } from "@/lib/analytics/predict";

const REFRESH = 10 * 60_000;

export const useCurrent = (p: Place | null) =>
  useSWR<CurrentResponse>(p ? `/api/current?${qs({ lat: p.lat, lon: p.lon, name: p.name })}` : null, fetcher, { ...swrOpts, refreshInterval: REFRESH });

export interface HistoryResponse {
  points: HourPoint[];
  days: DayStat[];
  anomalies: Anomaly[];
  summary: PeriodSummary;
  timezone: string;
  source: SourceRef;
  stale: boolean;
}
export const useHistory = (p: Place | null, o: { days?: number; start?: string; end?: string } = {}) =>
  useSWR<HistoryResponse>(p ? `/api/history?${qs({ lat: p.lat, lon: p.lon, days: o.days, start: o.start, end: o.end })}` : null, fetcher, swrOpts);

export interface ForecastResponse {
  recent: HourPoint[];
  forecast: HourPoint[];
  daily: { date: string; aqiAvg: number | null; aqiMax: number | null; pm25Avg: number | null }[];
  spikes: { start: string; end: string; peak: number }[];
  bestWindow: { start: string; end: string; avgAqi: number } | null;
  ml: (PredictionResult & { method: string }) | null;
  timezone: string;
  sources: SourceRef[];
  stale: boolean;
}
export const useForecast = (p: Place | null) =>
  useSWR<ForecastResponse>(p ? `/api/forecast?${qs({ lat: p.lat, lon: p.lon })}` : null, fetcher, { ...swrOpts, refreshInterval: 30 * 60_000 });

export interface CitiesResponse {
  cities: { id: string; name: string; country: string; lat: number; lon: number; aqi: number | null; pm2_5: number | null; observedAt?: string; kind: "measured" | "model"; stations: number; modelAqi: number | null; via?: string }[];
  asOf: string;
  stale: boolean;
  measuredCount: number;
  source: SourceRef;
  stationSource: SourceRef;
}
export const useCities = () => useSWR<CitiesResponse>("/api/cities", fetcher, { ...swrOpts, refreshInterval: 15 * 60_000 });

export const useInsights = (p: Place | null) =>
  useSWR<{ text: string; engine: "gemini" | "rules"; facts: string }>(p ? `/api/insights?${qs({ lat: p.lat, lon: p.lon, name: p.name })}` : null, fetcher, swrOpts);
