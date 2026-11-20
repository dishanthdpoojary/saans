"use client";

import { useMemo, useState } from "react";
import { Leaf, Skull } from "lucide-react";
import { useCities } from "@/lib/client/hooks";
import { useLocation } from "@/lib/client/location";
import { categoryFor } from "@/lib/aqi";
import { fmtObserved } from "@/lib/client/format";
import { AqiPill, Card, ErrorState, KindBadge, PageHeader, Skeleton } from "@/components/ui";

export default function LeaderboardPage() {
  const { data, error, mutate } = useCities();
  const { setPlace } = useLocation();
  const [scope, setScope] = useState<"IN" | "ALL">("ALL");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const list = (data?.cities ?? []).filter((c) => c.aqi != null && (scope === "ALL" || c.country === "IN"));
    return [...list].sort((a, b) => a.aqi! - b.aqi!).map((c, i) => ({ ...c, rank: i + 1 }));
  }, [data, scope]);
  const filtered = rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Pollution leaderboard" subtitle="Cities ranked from cleanest to most polluted right now. Where live ground stations exist we use the median of fresh readings; elsewhere the CAMS model estimate, labelled as such.">
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-line p-1">
            {(["ALL", "IN"] as const).map((s) => (
              <button key={s} onClick={() => setScope(s)} aria-pressed={scope === s} className={`rounded-lg px-3 py-1 text-sm ${scope === s ? "bg-diya text-black" : "text-mute"}`}>
                {s === "IN" ? "India" : "World"}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>
      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-2">
            <Podium title="Cleanest air" icon={<Leaf size={16} className="text-emerald-400" />} items={rows.slice(0, 3)} />
            <Podium title="Most polluted" icon={<Skull size={16} className="text-red-400" />} items={[...rows].reverse().slice(0, 3)} />
          </div>
          <Card title={`All ${rows.length} cities`} subtitle={`As of ${fmtObserved(data.asOf).abs}. ${data.measuredCount} of ${data.cities.length} cities from live stations (WAQI / OpenAQ), the rest from the CAMS model.`} action={<input className="input w-48" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter cities" />}>
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-panel text-left text-xs text-mute">
                  <tr><th className="w-12 py-2">#</th><th>City</th><th>AQI</th><th>Category</th><th>Source</th><th /></tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-t border-line/60">
                      <td className="py-1.5 text-mute">{c.rank}</td>
                      <td>{c.name} <span className="text-xs text-mute">{c.country}</span></td>
                      <td><AqiPill aqi={c.aqi} size="sm" /></td>
                      <td style={{ color: categoryFor(c.aqi)?.color }}>{categoryFor(c.aqi)?.short}</td>
                      <td><span className="flex items-center gap-2"><KindBadge kind={c.kind} />{c.kind === "measured" && c.stations != null && <span className="text-xs text-muted">{c.stations > 1 ? `${c.stations} stations` : (c.via ?? "1 station")}</span>}</span></td>
                      <td className="text-right">
                        <button className="text-xs text-diya-soft hover:underline" onClick={() => setPlace({ name: c.name, lat: c.lat, lon: c.lon, detail: c.country })}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Podium({ title, icon, items }: { title: string; icon: React.ReactNode; items: { name: string; country: string; aqi: number | null; rank: number; kind: "measured" | "model" }[] }) {
  return (
    <Card title={<span className="flex items-center gap-2">{icon} {title}</span>}>
      <ol className="flex flex-col gap-2">
        {items.map((c, i) => (
          <li key={c.name} className="flex items-center gap-3 rounded-md bg-white/[0.03] px-3 py-2.5">
            <span className="font-display text-lg font-bold text-mute">{i + 1}</span>
            <span className="flex-1 font-medium">{c.name} <span className="text-xs text-mute">{c.country}</span></span>
            <KindBadge kind={c.kind} />
            <AqiPill aqi={c.aqi} />
          </li>
        ))}
      </ol>
    </Card>
  );
}
