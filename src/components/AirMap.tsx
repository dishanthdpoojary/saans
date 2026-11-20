"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { Flame, Leaf, LocateFixed, MapPin, Minus, Navigation, Plus, X } from "lucide-react";
import { useLocation } from "@/lib/client/location";
import { useCurrent } from "@/lib/client/hooks";
import { fetcher, qs, swrOpts } from "@/lib/client/fetcher";
import { categoryFor, CATEGORIES, POLLUTANTS } from "@/lib/aqi";
import { haversineKm } from "@/lib/geo";
import { describeSource, fmtObserved } from "@/lib/client/format";
import { useNow } from "@/lib/client/useNow";
import { AqiPill, ErrorState, KindBadge, Skeleton } from "./ui";
import type { MapLayers } from "./MapView";
import type { MapPoint } from "@/lib/types";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> });

interface MapResponse {
  cities: MapPoint[];
  stations: MapPoint[];
  stationsEnabled: boolean;
  warnings: string[];
}

/** The interactive air map — used full-bleed on the home page and on /map. */
export function AirMap({ height = "h-[78vh]", scrollZoom = true, fullscreen = false }: { height?: string; scrollZoom?: boolean; fullscreen?: boolean }) {
  const { place, setPlace, detect } = useLocation();
  const now = useNow();
  const [bounds, setBounds] = useState<{ s: number; w: number; n: number; e: number } | null>(null);
  const [layers, setLayers] = useState<MapLayers>({ field: true, cities: true, stations: true });
  const [sel, setSel] = useState<{ lat: number; lon: number; name: string } | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; zoom?: number; key: number } | null>(null);
  const [tab, setTab] = useState<"hotspots" | "cleaner">("hotspots");
  const flySeq = useRef(0); // makes repeated flights to the same spot still trigger

  // follow the globally selected place
  useEffect(() => {
    setFlyTo({ lat: place.lat, lon: place.lon, zoom: 6, key: ++flySeq.current });
  }, [place.lat, place.lon]);

  const key = bounds ? `/api/map?${qs({ s: bounds.s.toFixed(1), w: bounds.w.toFixed(1), n: bounds.n.toFixed(1), e: bounds.e.toFixed(1) })}` : null;
  const { data, error, mutate } = useSWR<MapResponse>(key, fetcher, { ...swrOpts, keepPreviousData: true });
  const detail = useCurrent(sel ? { name: sel.name, lat: sel.lat, lon: sel.lon } : null);

  const cities = useMemo(() => data?.cities ?? [], [data]);
  const stations = useMemo(() => data?.stations ?? [], [data]);
  const hotspots = useMemo(() => cities.filter((c) => c.aqi != null).sort((a, b) => b.aqi! - a.aqi!).slice(0, 6), [cities]);
  const hotspotIds = useMemo(() => new Set(hotspots.filter((h) => h.aqi! > 150).slice(0, 4).map((h) => h.id)), [hotspots]);
  const cleaner = useMemo(
    () =>
      [...cities, ...stations]
        .filter((p) => p.aqi != null)
        .map((p) => ({ ...p, km: Math.round(haversineKm(place.lat, place.lon, p.lat, p.lon)) }))
        .filter((p) => p.km <= 400)
        .sort((a, b) => a.aqi! - b.aqi! || a.km - b.km)
        .slice(0, 6),
    [cities, stations, place],
  );

  const onPick = useCallback((lat: number, lon: number, name?: string) => setSel({ lat, lon, name: name ?? "Selected spot" }), []);
  const go = (p: { lat: number; lon: number; name: string }) => {
    setFlyTo({ lat: p.lat, lon: p.lon, zoom: 10, key: ++flySeq.current });
    onPick(p.lat, p.lon, p.name);
  };
  const d = detail.data?.primary;

  return (
    <div className={clsx("relative w-full overflow-hidden", height)} data-tour="map">
      <MapView
        center={[place.lat, place.lon]}
        zoom={6}
        cities={cities}
        stations={stations}
        layers={layers}
        hotspotIds={hotspotIds}
        selected={sel}
        flyTo={flyTo}
        scrollZoom={scrollZoom}
        onBounds={setBounds}
        onPick={onPick}
      />

      {/* layer switches */}
      <div className={clsx("glass-dense absolute left-3 z-[500] flex flex-col gap-1 rounded-md p-1.5 text-sm md:left-5", fullscreen ? "top-[6.5rem] md:top-28" : "top-3 md:top-5")} role="group" aria-label="Map layers" data-tour="layers">
        {(
          [
            ["field", "Pollution heatmap", "Interpolated between readings"],
            ["stations", `Stations${stations.length ? ` · ${stations.length}` : ""}`, "Measured by ground monitors"],
            ["cities", "Cities", "Station median, or model estimate"],
          ] as const
        ).map(([k, label, hint]) => (
          <button key={k} onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))} aria-pressed={layers[k]} title={hint}
            className={clsx("flex items-center gap-2 rounded px-3 py-1.5 text-left", layers[k] ? "bg-white/12 text-white" : "text-haze")}>
            <span className={clsx("h-2.5 w-2.5 rounded-[2px] border", layers[k] ? "border-sky bg-sky" : "border-haze")} /> {label}
          </button>
        ))}
      </div>

      {/* zoom + locate */}
      <div className="absolute bottom-24 left-3 z-[500] flex flex-col gap-1.5 md:bottom-6 md:left-5">
        <button className="btn px-2.5" onClick={() => detect()} aria-label="Show air near me"><LocateFixed size={16} /></button>
        <MapZoom />
      </div>

      {/* legend */}
      <div className="glass pointer-events-none absolute bottom-6 left-1/2 z-[500] hidden -translate-x-1/2 items-center gap-1 rounded-full p-1.5 text-[11px] md:flex">
        {CATEGORIES.map((c) => (
          <span key={c.id} className="rounded-[3px] px-2 py-0.5 font-semibold" style={{ background: c.color, color: c.text }}>{c.short}</span>
        ))}
      </div>

      {/* right column: detail + hotspots */}
      <div className={clsx("absolute inset-x-3 bottom-3 z-[600] flex max-h-[42%] flex-col gap-3 md:inset-x-auto md:bottom-auto md:right-5 md:w-[340px]", fullscreen ? "md:top-28 md:max-h-[calc(100%-8.5rem)]" : "md:top-5 md:max-h-[calc(100%-2.5rem)]")}>
        {sel && (
          <section className="glass-dense overflow-auto rounded-md p-4" aria-label="Selected location">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-medium leading-tight">{sel.name}</p>
                <p className="text-xs text-haze">{sel.lat}, {sel.lon}</p>
              </div>
              <button onClick={() => setSel(null)} aria-label="Close details" className="text-haze hover:text-white"><X size={17} /></button>
            </div>
            {detail.error ? (
              <div className="mt-3"><ErrorState error={detail.error} compact onRetry={() => detail.mutate()} /></div>
            ) : !d ? (
              <Skeleton className="mt-3 h-24" />
            ) : (
              <div className="mt-3 flex flex-col gap-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-4xl font-normal tabular-nums" style={{ color: categoryFor(d.aqi)?.color }}>{d.aqi}</span>
                  <div className="min-w-0">
                    <p style={{ color: categoryFor(d.aqi)?.color }}>{categoryFor(d.aqi)?.label}</p>
                    <KindBadge kind={d.kind} className="mt-1" />
                  </div>
                </div>
                <p className="text-xs text-haze">
                  {d.kind === "measured" ? `${describeSource(d)}. ` : ""}Updated {fmtObserved(d.observedAt, detail.data?.location.timezone, now).rel || fmtObserved(d.observedAt, detail.data?.location.timezone).abs}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {detail.data?.model?.pollutants.filter((x) => x.value != null).map((x) => (
                    <div key={x.key} className="rounded-md bg-white/5 px-2.5 py-1.5">
                      <p className="text-[11px] text-haze">{POLLUTANTS[x.key].label}</p>
                      <p className="tabular-nums">{x.value}</p>
                    </div>
                  ))}
                </div>
                <button className="btn btn-primary justify-center" onClick={() => setPlace({ name: sel.name, lat: sel.lat, lon: sel.lon, detail: `${sel.lat}, ${sel.lon}` })}>
                  <MapPin size={15} /> Make this my place
                </button>
              </div>
            )}
          </section>
        )}

        <section className={clsx("glass-dense flex-col overflow-hidden rounded-md p-2", sel ? "hidden md:flex" : "flex")} data-tour="hotspots">
          <div className="flex gap-1 rounded bg-black/30 p-1 text-sm" role="tablist">
            <button role="tab" aria-selected={tab === "hotspots"} onClick={() => setTab("hotspots")} className={clsx("flex flex-1 items-center justify-center gap-1.5 rounded py-1.5", tab === "hotspots" ? "bg-white/12 text-white" : "text-haze")}>
              <Flame size={14} /> Hotspots
            </button>
            <button role="tab" aria-selected={tab === "cleaner"} onClick={() => setTab("cleaner")} className={clsx("flex flex-1 items-center justify-center gap-1.5 rounded py-1.5", tab === "cleaner" ? "bg-white/12 text-white" : "text-haze")}>
              <Leaf size={14} /> Cleaner air nearby
            </button>
          </div>
          {error ? (
            <div className="p-2"><ErrorState error={error} compact onRetry={() => mutate()} /></div>
          ) : !data ? (
            <Skeleton className="m-2 h-40" />
          ) : (
            <ol className="mt-1 overflow-auto">
              {(tab === "hotspots" ? hotspots.map((h) => ({ ...h, km: null as number | null })) : cleaner).map((h) => (
                <li key={h.id}>
                  <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-white/8" onClick={() => go(h)}>
                    {tab === "cleaner" && <Navigation size={13} className="shrink-0 text-emerald-300" />}
                    <span className="flex-1 truncate">{h.name}</span>
                    {h.kind === "model" && <span className="label text-[9px]">est.</span>}
                    {h.km != null && <span className="text-xs text-haze">{h.km} km</span>}
                    <AqiPill aqi={h.aqi} size="sm" />
                  </button>
                </li>
              ))}
              {tab === "cleaner" && cleaner.length === 0 && <li className="px-3 py-2 text-sm text-haze">No readings within 400 km of {place.name}.</li>}
              <li className="px-3 pb-1 pt-2 text-[11px] leading-snug text-haze">
                {tab === "hotspots" ? "Highest AQI among tracked cities right now: live station median where available, otherwise model estimate." : `Relatively cleaner places within 400 km of ${place.name}, from stations and model data.`}
              </li>
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function MapZoom() {
  // zoom buttons dispatch to the Leaflet map through its container
  const zoom = (dir: 1 | -1) => {
    const el = document.querySelector<HTMLElement>("[data-tour=map] .leaflet-container");
    el?.dispatchEvent(new CustomEvent("saans:zoom", { detail: dir }));
  };
  return (
    <div className="glass-dense flex flex-col overflow-hidden rounded">
      <button className="px-2.5 py-2 hover:bg-white/10" onClick={() => zoom(1)} aria-label="Zoom in"><Plus size={16} /></button>
      <button className="px-2.5 py-2 hover:bg-white/10" onClick={() => zoom(-1)} aria-label="Zoom out"><Minus size={16} /></button>
    </div>
  );
}
