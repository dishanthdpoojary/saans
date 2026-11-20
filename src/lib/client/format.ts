/** Open-Meteo hourly times are local wall-clock without offset ("2026-11-09T17:00"). Format them without TZ shifts. */
export function fmtLocalHour(t: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", hour: "numeric" }) {
  const d = new Date((t.length === 16 ? t + ":00" : t) + "Z");
  return d.toLocaleString("en-IN", { ...opts, timeZone: "UTC", hour12: true });
}
export function fmtDay(d: string) {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}
/** Full ISO (with offset) → relative "12 min ago" + absolute. */
export function fmtObserved(iso: string, tz?: string, now?: number | null) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { rel: "unknown", abs: iso };
  // `now` comes from useNow(); without it we only show the absolute time (safe during prerender)
  const mins = now == null ? null : Math.round((now - d.getTime()) / 60000);
  const rel = mins == null ? "" : mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`;
  let abs: string;
  try {
    abs = d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: tz });
  } catch {
    abs = d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  }
  return { rel, abs };
}
export const signed = (n: number | null | undefined, suffix = "%") => (n == null ? "–" : `${n > 0 ? "+" : ""}${n}${suffix}`);

/** Plain-language "where this number came from" for a snapshot. */
export function describeSource(p: { station?: { name: string; distanceKm?: number }; consensus?: { stations: number; nearest: { name: string; km: number } }; source: { name: string } }) {
  if (p.consensus) return `Median of ${p.consensus.stations} stations within 25 km (nearest: ${p.consensus.nearest.name}, ${p.consensus.nearest.km} km)`;
  if (p.station) return `${p.station.name}, ${p.station.distanceKm} km away`;
  return p.source.name;
}
