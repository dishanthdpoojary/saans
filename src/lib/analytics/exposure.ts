/**
 * Personal exposure ("breath budget") model.
 *
 * Inhaled PM2.5 dose for one hour = ambient PM2.5 (µg/m³) × infiltration factor of where you are
 * × ventilation rate of what you're doing (m³/h). Summed over a 24-slot day.
 *
 * Ventilation rates: adult means from the US EPA Exposure Factors Handbook (ch. 6), rounded.
 * Infiltration factors: typical indoor/outdoor PM2.5 ratios from published field studies; a HEPA
 * purifier is modelled as removing most of the infiltrated particles. These are population
 * averages, shown as estimates in the UI.
 */

export type Intensity = "sleep" | "rest" | "light" | "moderate" | "vigorous";
export type Setting = "outdoor" | "vehicle" | "indoor-open" | "indoor-closed" | "indoor-purifier";

export const VENTILATION: Record<Intensity, number> = { sleep: 0.3, rest: 0.45, light: 0.8, moderate: 1.6, vigorous: 3.0 };
export const INFILTRATION: Record<Setting, number> = { outdoor: 1, vehicle: 0.65, "indoor-open": 0.8, "indoor-closed": 0.5, "indoor-purifier": 0.2 };

export interface Block {
  id: string;
  label: string;
  start: number; // hour of day 0–23
  hours: number;
  intensity: Intensity;
  setting: Setting;
  flexible: boolean;
}

export interface DayPlan {
  home: Setting; // where you are when not in a block
  sleepFrom: number; // e.g. 23
  sleepTo: number; // e.g. 6
  blocks: Block[];
}

export interface Slot {
  hour: number;
  setting: Setting;
  intensity: Intensity;
  blockId: string | null;
}

const inSleep = (h: number, p: DayPlan) => (p.sleepFrom > p.sleepTo ? h >= p.sleepFrom || h < p.sleepTo : h >= p.sleepFrom && h < p.sleepTo);

export function slots(plan: DayPlan): Slot[] {
  const out: Slot[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    setting: plan.home,
    intensity: inSleep(h, plan) ? "sleep" : "rest",
    blockId: null,
  }));
  for (const b of plan.blocks) {
    for (let k = 0; k < b.hours; k++) {
      const h = b.start + k;
      if (h > 23) break;
      out[h] = { hour: h, setting: b.setting, intensity: b.intensity, blockId: b.id };
    }
  }
  return out;
}

/** Dose per hour in µg. `pm25` has 24 values (null → hour skipped and reported as missing). */
export function hourlyDose(plan: DayPlan, pm25: (number | null)[]) {
  return slots(plan).map((s) => {
    const c = pm25[s.hour];
    const volume = VENTILATION[s.intensity];
    return { ...s, volume, dose: c == null ? null : c * INFILTRATION[s.setting] * volume };
  });
}

export interface DoseSummary {
  total: number; // µg inhaled
  volume: number; // m³ breathed
  missingHours: number;
  byBlock: Record<string, number>;
  /** dose ÷ the dose you'd get breathing the same volume at the WHO 24 h guideline (15 µg/m³) */
  whoMultiple: number;
}

export const WHO_24H_PM25 = 15;

export function summarizeDose(plan: DayPlan, pm25: (number | null)[]): DoseSummary {
  const hrs = hourlyDose(plan, pm25);
  const byBlock: Record<string, number> = {};
  let total = 0;
  let volume = 0;
  let missing = 0;
  for (const h of hrs) {
    volume += h.volume;
    if (h.dose == null) {
      missing++;
      continue;
    }
    total += h.dose;
    if (h.blockId) byBlock[h.blockId] = (byBlock[h.blockId] ?? 0) + h.dose;
  }
  return { total, volume, missingHours: missing, byBlock, whoMultiple: total / (WHO_24H_PM25 * volume) };
}

const overlaps = (a: { start: number; hours: number }, b: { start: number; hours: number }) => a.start < b.start + b.hours && b.start < a.start + a.hours;

/**
 * Greedy optimiser: each flexible block is moved to the start hour (within waking hours, not
 * overlapping sleep or other blocks) that minimises the whole-day dose. Moving an outdoor block
 * also returns that hour to "home", which the whole-day total accounts for.
 */
export function optimizePlan(plan: DayPlan, pm25: (number | null)[], window: { from: number; to: number } = { from: 6, to: 22 }): DayPlan {
  let best: DayPlan = { ...plan, blocks: plan.blocks.map((b) => ({ ...b })) };
  // move the most dose-heavy flexible blocks first
  const base = summarizeDose(best, pm25);
  const order = best.blocks.filter((b) => b.flexible).sort((a, b) => (base.byBlock[b.id] ?? 0) - (base.byBlock[a.id] ?? 0));
  for (const fb of order) {
    let bestStart = fb.start;
    let bestTotal = summarizeDose(best, pm25).total;
    for (let s = window.from; s + fb.hours <= window.to; s++) {
      const cand = { start: s, hours: fb.hours };
      if (best.blocks.some((o) => o.id !== fb.id && overlaps(cand, o))) continue;
      if (Array.from({ length: fb.hours }, (_, k) => s + k).some((h) => inSleep(h, best))) continue;
      if (Array.from({ length: fb.hours }, (_, k) => pm25[s + k]).some((v) => v == null)) continue;
      const trial = { ...best, blocks: best.blocks.map((b) => (b.id === fb.id ? { ...b, start: s } : b)) };
      const t = summarizeDose(trial, pm25).total;
      if (t < bestTotal - 1e-9) {
        bestTotal = t;
        bestStart = s;
      }
    }
    best = { ...best, blocks: best.blocks.map((b) => (b.id === fb.id ? { ...b, start: bestStart } : b)) };
  }
  return best;
}
