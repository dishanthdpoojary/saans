/**
 * Saans ML forecaster — autoregressive ridge regression on PM2.5 with weather covariates.
 *
 * Why this model: trains in milliseconds on ~2,200 hourly rows inside a serverless function,
 * is fully explainable (we expose feature weights), and is honestly evaluated against
 * naive baselines on a held-out window before we show it.
 *
 * Target: log1p(PM2.5) at hour t.
 * Features: lags (1, 2, 3, 24 h), trailing 24 h mean, wind speed, boundary-layer height (log),
 * humidity, temperature, precipitation, hour-of-day (sin/cos).
 * Multi-step forecasts are produced recursively using the weather FORECAST for future hours.
 */

import { subIndex } from "@/lib/aqi";
import { mean } from "./stats";

export interface SeriesRow {
  time: string;
  pm25: number | null;
  wind: number | null;
  blh: number | null;
  humidity: number | null;
  temp: number | null;
  precip: number | null;
}

export const FEATURE_NAMES = [
  "PM2.5 1h ago",
  "PM2.5 2h ago",
  "PM2.5 3h ago",
  "PM2.5 24h ago",
  "PM2.5 24h average",
  "Wind speed",
  "Mixing height (log)",
  "Humidity",
  "Temperature",
  "Rain",
  "Hour (sin)",
  "Hour (cos)",
];

function features(y: number[], t: number, w: SeriesRow): number[] | null {
  if (t < 24) return null;
  const lags = [y[t - 1], y[t - 2], y[t - 3], y[t - 24]];
  if (lags.some((v) => !Number.isFinite(v))) return null;
  if ([w.wind, w.blh, w.humidity, w.temp, w.precip].some((v) => v == null)) return null;
  const hour = Number(w.time.slice(11, 13));
  return [
    ...lags,
    mean(y.slice(t - 24, t)),
    w.wind!,
    Math.log1p(Math.max(0, w.blh!)),
    w.humidity!,
    w.temp!,
    Math.min(w.precip!, 10),
    Math.sin((2 * Math.PI * hour) / 24),
    Math.cos((2 * Math.PI * hour) / 24),
  ];
}

export interface RidgeModel {
  weights: number[]; // on standardized features
  bias: number;
  mu: number[];
  sigma: number[];
}

export function fitRidge(X: number[][], y: number[], lambda = 1): RidgeModel {
  const n = X.length;
  const p = X[0].length;
  const mu = Array.from({ length: p }, (_, j) => mean(X.map((r) => r[j])));
  const rawSigma = Array.from({ length: p }, (_, j) => Math.sqrt(mean(X.map((r) => (r[j] - mu[j]) ** 2))));
  // near-constant features carry no information; neutralise them so float noise can't be amplified
  const constant = rawSigma.map((s, j) => s < 1e-6 * Math.max(1, Math.abs(mu[j])));
  const sigma = rawSigma.map((s, j) => (constant[j] ? 1 : s));
  const Z = X.map((r) => r.map((v, j) => (constant[j] ? 0 : (v - mu[j]) / sigma[j])));
  const yBar = mean(y);
  // (ZᵀZ + λI) w = Zᵀ(y - ȳ)
  const A = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => (i === j ? lambda : 0)));
  const b = new Array(p).fill(0);
  for (let k = 0; k < n; k++) {
    const z = Z[k];
    const yc = y[k] - yBar;
    for (let i = 0; i < p; i++) {
      b[i] += z[i] * yc;
      for (let j = i; j < p; j++) A[i][j] += z[i] * z[j];
    }
  }
  for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) A[i][j] = A[j][i];
  const weights = solve(A, b).map((w, j) => (constant[j] ? 0 : w));
  return { weights, bias: yBar, mu, sigma };
}

export function predictRow(m: RidgeModel, x: number[]) {
  return m.bias + x.reduce((s, v, j) => s + m.weights[j] * ((v - m.mu[j]) / m.sigma[j]), 0);
}

/** Gaussian elimination with partial pivoting (p ≈ 12, so this is trivially fast). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / (r[i] || 1e-12));
}

function train(rows: SeriesRow[], end: number) {
  const y = rows.map((r) => (r.pm25 == null ? NaN : Math.log1p(r.pm25)));
  const X: number[][] = [];
  const Y: number[] = [];
  for (let t = 24; t < end; t++) {
    if (!Number.isFinite(y[t])) continue;
    const f = features(y, t, rows[t]);
    if (f) {
      X.push(f);
      Y.push(y[t]);
    }
  }
  if (X.length < 200) return null;
  // penalty scales with n (standardized ZᵀZ has diagonal ≈ n) so collinear lags stay well-conditioned
  const model = fitRidge(X, Y, X.length * 0.01);
  return { ...model, yMin: Math.min(...Y), yMax: Math.max(...Y) };
}

/** Recursive multi-step forecast from index `start` for `horizon` hours. */
function rollForward(model: RidgeModel & { yMin: number; yMax: number }, rows: SeriesRow[], start: number, horizon: number): number[] {
  const y = rows.map((r) => (r.pm25 == null ? NaN : Math.log1p(r.pm25)));
  const out: number[] = [];
  for (let t = start; t < Math.min(rows.length, start + horizon); t++) {
    const f = features(y, t, rows[t]);
    if (!f) break;
    // clamp to a plausible band around the training range so recursion can never run away
    const lo = Math.max(0, model.yMin - 0.7);
    const hi = model.yMax + 0.7; // ≈ 2× the highest observed concentration
    y[t] = Math.min(hi, Math.max(lo, predictRow(model, f))); // feed prediction back in
    out.push(Math.max(0, Math.expm1(y[t])));
  }
  return out;
}

export interface Evaluation {
  horizonHours: number;
  maeModel: number;
  maePersistence: number;
  maeYesterday: number;
  skillVsPersistence: number; // 1 - MAE_model / MAE_persistence
  trainRows: number;
}

export interface PredictionResult {
  points: { time: string; pm25: number; aqi: number | null }[];
  evaluation: Evaluation | null;
  importance: { feature: string; weight: number }[];
}

/**
 * @param rows   aligned hourly rows; pm25 is null for future hours
 * @param nowIdx index of the first future hour
 */
export function forecastPm25(rows: SeriesRow[], nowIdx: number, horizon = 48): PredictionResult | null {
  const HOLDOUT = 72;
  const EVAL_H = 24;
  // 1) honest back-test: train on data before the hold-out window, forecast 24h from several origins
  let evaluation: Evaluation | null = null;
  const trainEnd = nowIdx - HOLDOUT;
  const evalModel = trainEnd > 400 ? train(rows, trainEnd) : null;
  if (evalModel) {
    const errs: number[] = [];
    const errP: number[] = [];
    const errY: number[] = [];
    for (let origin = trainEnd; origin + EVAL_H <= nowIdx; origin += 12) {
      const pred = rollForward(evalModel, rows.slice(0, origin).concat(rows.slice(origin, origin + EVAL_H).map((r) => ({ ...r, pm25: null }))), origin, EVAL_H);
      const last = rows[origin - 1].pm25;
      for (let h = 0; h < pred.length; h++) {
        const actual = rows[origin + h].pm25;
        const yday = rows[origin + h - 24]?.pm25;
        if (actual == null || last == null || yday == null) continue;
        errs.push(Math.abs(pred[h] - actual));
        errP.push(Math.abs(last - actual));
        errY.push(Math.abs(yday - actual));
      }
    }
    if (errs.length) {
      const m = mean(errs);
      const p = mean(errP);
      evaluation = {
        horizonHours: EVAL_H,
        maeModel: round(m),
        maePersistence: round(p),
        maeYesterday: round(mean(errY)),
        skillVsPersistence: round(1 - m / p, 3),
        trainRows: trainEnd,
      };
    }
  }

  // 2) production model on all available history
  const model = train(rows, nowIdx);
  if (!model) return null;
  const preds = rollForward(model, rows, nowIdx, horizon);

  // AQI from PM2.5 uses the 24 h rolling mean, matching how daily PM AQI is defined
  const series = rows.slice(0, nowIdx).map((r) => r.pm25);
  const points = preds.map((pm25, i) => {
    series.push(pm25);
    const win = series.slice(-24).filter((v): v is number => v != null);
    return { time: rows[nowIdx + i].time, pm25: round(pm25), aqi: subIndex("pm2_5", mean(win)) };
  });

  const importance = model.weights
    .map((w, j) => ({ feature: FEATURE_NAMES[j], weight: round(w, 3) }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  return { points, evaluation, importance };
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
