import { describe, it } from "node:test";
import { expect } from "./expect";
import { categoryFor, overallAqi, subIndex, toEpaUnit } from "../aqi";
import { cleanestWindow, dailyStats, detectAnomalies, pctChange } from "../analytics/stats";
import { fitRidge, forecastPm25, predictRow, type SeriesRow } from "../analytics/predict";
import type { HourPoint } from "../types";

describe("AQI", () => {
  it("matches EPA reference values for PM2.5 (2024 breakpoints)", () => {
    expect(subIndex("pm2_5", 0)).toBe(0);
    expect(subIndex("pm2_5", 9.0)).toBe(50);
    expect(subIndex("pm2_5", 35.4)).toBe(100);
    expect(subIndex("pm2_5", 55.4)).toBe(150);
    expect(subIndex("pm2_5", 102.4)).toBe(184);
    expect(subIndex("pm2_5", 9999)).toBe(500);
  });
  it("matches EPA reference values for PM10", () => {
    expect(subIndex("pm10", 54)).toBe(50);
    expect(subIndex("pm10", 154)).toBe(100);
  });
  it("converts gas units correctly", () => {
    expect(toEpaUnit("no2", 46.01)).toBeCloseTo(24.45, 2); // ppb
    expect(toEpaUnit("co", 1145.6)).toBeCloseTo(1.0, 2); // ppm
  });
  it("rejects invalid input instead of inventing a number", () => {
    expect(subIndex("pm2_5", null)).toBeNull();
    expect(subIndex("pm2_5", -3)).toBeNull();
    expect(subIndex("pm2_5", NaN)).toBeNull();
  });
  it("overall AQI is the max sub-index with dominant pollutant", () => {
    expect(overallAqi({ pm2_5: 40, pm10: 20 })).toEqual({ aqi: 112, dominant: "pm2_5" });
    expect(overallAqi({})).toBeNull();
  });
  it("categorises boundaries", () => {
    expect(categoryFor(50)?.id).toBe("good");
    expect(categoryFor(51)?.id).toBe("moderate");
    expect(categoryFor(301)?.id).toBe("hazardous");
    expect(categoryFor(null)).toBeNull();
  });
});

const hp = (time: string, aqi: number, pm: number): HourPoint => ({ time, aqi, pm2_5: pm, pm10: pm * 1.5, kind: "model" });

describe("stats", () => {
  it("pctChange", () => {
    expect(pctChange(100, 150)).toBe(50);
    expect(pctChange(200, 100)).toBe(-50);
    expect(pctChange(0, 10)).toBeNull();
  });
  it("daily stats flag a spike day", () => {
    const pts: HourPoint[] = [];
    for (let d = 1; d <= 9; d++)
      for (let h = 0; h < 24; h++) {
        const aqi = d === 9 ? 220 : 60;
        pts.push(hp(`2026-10-0${d}T${String(h).padStart(2, "0")}:00`, aqi, aqi / 3));
      }
    const days = dailyStats(pts);
    expect(days).toHaveLength(9);
    expect(days[8].spike).toBe(true);
    expect(days[5].spike).toBe(false);
    expect(days[8].changePct).toBeCloseTo(266.7, 1);
  });
  it("detects an isolated PM2.5 spike but not noise", () => {
    const pts: HourPoint[] = [];
    for (let i = 0; i < 100; i++) {
      const pm = i === 80 ? 140 : 30 + (i % 3);
      pts.push(hp(new Date(Date.UTC(2026, 9, 1, i)).toISOString().slice(0, 16), pm * 2, pm));
    }
    const a = detectAnomalies(pts, "pm2_5");
    expect(a).toHaveLength(1);
    expect(a[0].direction).toBe("spike");
    expect(a[0].value).toBe(140);
  });
  it("finds the cleanest window", () => {
    const pts = [80, 70, 40, 35, 90].map((a, i) => hp(`2026-10-01T0${i}:00`, a, a / 3));
    expect(cleanestWindow(pts, 2)).toMatchObject({ start: "2026-10-01T02:00", avgAqi: 38 });
  });
});

describe("ridge regression", () => {
  it("recovers a known linear relationship", () => {
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 300; i++) {
      const a = Math.sin(i),
        b = Math.cos(i * 0.7);
      X.push([a, b]);
      y.push(3 + 2 * a - 1.5 * b);
    }
    const m = fitRidge(X, y, 1e-6);
    expect(predictRow(m, [0.5, 0.2])).toBeCloseTo(3 + 1 - 0.3, 3);
  });
  it("beats persistence on a synthetic diurnal series and outputs AQI", () => {
    const rows: SeriesRow[] = [];
    for (let t = 0; t < 1200; t++) {
      const hour = t % 24;
      const wind = 5 + 4 * Math.sin((2 * Math.PI * hour) / 24);
      rows.push({
        time: new Date(Date.UTC(2026, 6, 1, t)).toISOString().slice(0, 16),
        pm25: t < 1150 ? 60 - 4 * wind + 10 * Math.cos((2 * Math.PI * hour) / 24) : null,
        wind,
        blh: 500 + 300 * Math.sin((2 * Math.PI * hour) / 24),
        humidity: 50,
        temp: 25,
        precip: 0,
      });
    }
    const r = forecastPm25(rows, 1150, 48)!;
    expect(r.points.length).toBe(48);
    expect(r.points[0].aqi).toBeGreaterThan(0);
    expect(r.evaluation!.maeModel).toBeLessThan(r.evaluation!.maePersistence);
  });
});

import { optimizePlan, summarizeDose, type DayPlan } from "../analytics/exposure";

describe("breath budget", () => {
  const plan: DayPlan = {
    home: "indoor-closed",
    sleepFrom: 23,
    sleepTo: 6,
    blocks: [
      { id: "run", label: "Run", start: 7, hours: 1, intensity: "vigorous", setting: "outdoor", flexible: true },
      { id: "commute", label: "Commute", start: 9, hours: 1, intensity: "rest", setting: "vehicle", flexible: false },
    ],
  };
  // dirty mornings, clean afternoon
  const pm = Array.from({ length: 24 }, (_, h) => (h >= 14 && h <= 16 ? 20 : 120));

  it("computes dose from concentration × infiltration × ventilation", () => {
    const s = summarizeDose(plan, pm);
    expect(s.byBlock.run).toBeCloseTo(120 * 1 * 3.0, 6);
    expect(s.byBlock.commute).toBeCloseTo(120 * 0.65 * 0.45, 6);
    expect(s.missingHours).toBe(0);
    expect(s.whoMultiple).toBeGreaterThan(1);
  });
  it("moves flexible blocks to cleaner hours and never moves fixed ones", () => {
    const o = optimizePlan(plan, pm);
    expect(o.blocks.find((b) => b.id === "run")!.start).toBe(14);
    expect(o.blocks.find((b) => b.id === "commute")!.start).toBe(9);
    expect(summarizeDose(o, pm).total).toBeLessThan(summarizeDose(plan, pm).total);
  });
  it("does not schedule into sleep or overlapping blocks", () => {
    const night = Array.from({ length: 24 }, (_, h) => (h === 9 || h === 3 ? 1 : 200));
    const o = optimizePlan(plan, night);
    const run = o.blocks.find((b) => b.id === "run")!.start;
    expect(run === 9 || run === 3).toBe(false);
  });
});

import { consensusFromRows } from "../server/providers/waqi";

describe("station consensus", () => {
  const now = Date.UTC(2026, 10, 9, 12);
  const h = (x: number) => now - x * 3600e3;
  const at = (dLat: number, aqi: number, ageH: number, name = "s") => ({ aqi, t: h(ageH), lat: 28.6 + dLat, lon: 77.2, name });

  it("takes the median of fresh stations within the radius", () => {
    const rows = [at(0.01, 100, 1), at(0.02, 300, 1), at(0.03, 150, 2), at(1.0, 400, 1) /* ~110 km away */];
    const c = consensusFromRows(rows, 28.6, 77.2, 25, now)!;
    expect(c.aqi).toBe(150);
    expect(c.stations).toBe(3);
  });
  it("ignores stale stations, falling back to 6 h only when nothing is fresh", () => {
    expect(consensusFromRows([at(0.01, 120, 1), at(0.01, 400, 5)], 28.6, 77.2, 25, now)!.aqi).toBe(120);
    expect(consensusFromRows([at(0.01, 90, 5)], 28.6, 77.2, 25, now)!.aqi).toBe(90);
    expect(consensusFromRows([at(0.01, 90, 30)], 28.6, 77.2, 25, now)).toBeNull();
  });
});
