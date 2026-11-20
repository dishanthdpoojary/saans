"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { LeafletContext, createLeafletContext, type LeafletContextInterface } from "@react-leaflet/core";
import { aqiColor, categoryFor } from "@/lib/aqi";
import type { MapPoint } from "@/lib/types";

export interface MapLayers {
  field: boolean;
  cities: boolean;
  stations: boolean;
}

interface Props {
  center: [number, number];
  zoom?: number;
  cities: MapPoint[];
  stations: MapPoint[];
  layers: MapLayers;
  hotspotIds: Set<string>;
  selected: { lat: number; lon: number } | null;
  flyTo: { lat: number; lon: number; zoom?: number; key: number } | null;
  scrollZoom?: boolean;
  onBounds: (b: { s: number; w: number; n: number; e: number }) => void;
  onPick: (lat: number, lon: number, name?: string) => void;
}

function Events({ onBounds, onPick }: Pick<Props, "onBounds" | "onPick">) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const map = useMapEvents({
    moveend: () => emit(),
    click: (e) => onPick(Math.round(e.latlng.lat * 1000) / 1000, Math.round(e.latlng.lng * 1000) / 1000),
  });
  function emit() {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => {
      const b = map.getBounds();
      onBounds({ s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() });
    }, 300);
  }
  useEffect(() => {
    emit();
    const r = setTimeout(() => map.invalidateSize(), 250);
    const el = map.getContainer();
    const onZoom = (e: Event) => ((e as CustomEvent<number>).detail > 0 ? map.zoomIn() : map.zoomOut());
    el.addEventListener("saans:zoom", onZoom);
    return () => {
      clearTimeout(r);
      if (t.current) clearTimeout(t.current); // never touch a map that has been removed
      el.removeEventListener("saans:zoom", onZoom);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial bounds only
  }, []);
  return null;
}

function Fly({ to }: { to: Props["flyTo"] }) {
  const map = useMap();
  useEffect(() => {
    if (to) map.flyTo([to.lat, to.lon], to.zoom ?? Math.max(map.getZoom(), 6), { duration: 0.9 });
  }, [to, map]);
  return null;
}

/**
 * "Air field": inverse-distance-weighted interpolation of every reading in view, painted on a canvas
 * and softened with a blur. Fades out where there is no data nearby so it never implies coverage
 * that doesn't exist. Labelled in the UI as an interpolated estimate.
 */
function AirField({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const pane = map.getPane("airfield") ?? map.createPane("airfield");
    pane.style.zIndex = "350";
    pane.style.pointerEvents = "none";
    const canvas = L.DomUtil.create("canvas", "", pane) as HTMLCanvasElement;
    canvas.style.filter = "blur(14px)";
    canvas.style.opacity = "0.5";
    canvasRef.current = canvas;
    return () => {
      canvas.remove();
      canvasRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const size = map.getSize();
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);
      canvas.width = size.x;
      canvas.height = size.y;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, size.x, size.y);
      const pts = points.filter((p) => p.aqi != null).map((p) => ({ ...map.latLngToContainerPoint([p.lat, p.lon]), aqi: p.aqi! }));
      if (pts.length < 2) return;
      // influence radius in pixels: ~70 km at the current zoom
      const c = map.getCenter();
      const pxPerKm = map.latLngToContainerPoint([c.lat, c.lng + 1]).x - map.latLngToContainerPoint([c.lat, c.lng]).x;
      const R = Math.max(55, (pxPerKm / 111) * 70); // never smaller than ~55 px, so the heatmap reads at world zoom
      const cell = 10;
      for (let y = 0; y < size.y; y += cell) {
        for (let x = 0; x < size.x; x += cell) {
          let num = 0;
          let den = 0;
          let dmin = Infinity;
          for (const p of pts) {
            const d2 = (p.x - x) ** 2 + (p.y - y) ** 2 + 1;
            const d = Math.sqrt(d2);
            if (d < dmin) dmin = d;
            if (d > R * 3) continue;
            const w = 1 / d2;
            num += w * p.aqi;
            den += w;
          }
          if (!den) continue;
          const alpha = Math.max(0, 1 - dmin / (R * 1.3));
          if (alpha < 0.03) continue;
          ctx.globalAlpha = alpha * 0.85;
          ctx.fillStyle = aqiColor(num / den);
          ctx.fillRect(x, y, cell, cell);
        }
      }
    };
    draw();
    map.on("moveend zoomend resize", draw);
    return () => {
      map.off("moveend zoomend resize", draw);
    };
  }, [map, points]);
  return null;
}

const iconCache = new Map<string, L.DivIcon>();
function aqiIcon(aqi: number | null, kind: "city" | "station", flags: { hot?: boolean; sel?: boolean }, label?: string) {
  const key = `${aqi}|${kind}|${flags.hot}|${flags.sel}|${label ?? ""}`;
  let icon = iconCache.get(key);
  if (!icon) {
    const c = categoryFor(aqi);
    const text = label ? `${label} ${aqi ?? "–"}` : `${aqi ?? "–"}`;
    icon = L.divIcon({
      className: `aqi-marker ${kind}${flags.hot ? " hot" : ""}${flags.sel ? " sel" : ""}`,
      html: `<span style="background:${c?.color ?? "#475569"};color:${c?.text ?? "#fff"}">${text}</span>`,
      iconSize: [0, 0],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

/**
 * Our own map container, built for React 19 + Next 16:
 * - Next keeps the previous page alive in a hidden <Activity>. Hiding runs effect cleanups and
 *   showing re-runs them, children first. If the cleanup removed the map, the layers would
 *   re-attach to a dead map ("reading 'appendChild'"); react-leaflet's MapContainer also re-used
 *   the old DOM node ("Map container is being reused").
 * - So the map lives in a ref for the component's whole life, is re-used when the page is shown
 *   again, and is only removed once its element has really left the DOM.
 */
function SafeMap({ center, zoom, scrollZoom, children }: { center: [number, number]; zoom: number; scrollZoom: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [ctx, setCtx] = useState<LeafletContextInterface | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let map = mapRef.current;
    if (!map) {
      delete (el as unknown as { _leaflet_id?: number })._leaflet_id;
      map = L.map(el, { center, zoom, minZoom: 2, maxZoom: 14, worldCopyJump: true, zoomControl: false, scrollWheelZoom: scrollZoom });
      mapRef.current = map;
      setCtx(createLeafletContext(map));
    } else {
      map.invalidateSize();
    }
    const live = map;
    return () => {
      // hidden (Activity) → keep the map; unmounted → the node is detached, so free it
      setTimeout(() => {
        if (!el.isConnected && mapRef.current === live) {
          live.off();
          live.remove();
          mapRef.current = null;
        }
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create once; later moves go through flyTo
  }, []);
  return (
    <div ref={ref} className="isolate h-full w-full">
      {ctx && <LeafletContext value={ctx}>{children}</LeafletContext>}
    </div>
  );
}

export default function MapView({ center, zoom = 5, cities, stations, layers, hotspotIds, selected, flyTo, scrollZoom = true, onBounds, onPick }: Props) {
  const fieldPoints = useMemo(() => (stations.length > 15 ? [...stations, ...cities] : cities), [cities, stations]);
  const isSel = (p: MapPoint) => !!selected && Math.abs(selected.lat - p.lat) < 1e-3 && Math.abs(selected.lon - p.lon) < 1e-3;

  return (
    <SafeMap center={center} zoom={zoom} scrollZoom={scrollZoom}>
      <TileLayer
        attribution='Basemap &copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; OpenStreetMap contributors'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        maxZoom={16}
      />
      <Events onBounds={onBounds} onPick={onPick} />
      <Fly to={flyTo} />
      {layers.field && <AirField points={fieldPoints} />}
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}" maxZoom={16} zIndex={400} />

      {layers.stations &&
        stations.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lon]} icon={aqiIcon(p.aqi, "station", { sel: isSel(p) })} eventHandlers={{ click: () => onPick(p.lat, p.lon, p.name) }}>
            <Tooltip direction="top" offset={[0, -12]}>
              <b>{p.name}</b><br />AQI {p.aqi} / measured station
            </Tooltip>
          </Marker>
        ))}

      {layers.cities &&
        cities.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lon]} zIndexOffset={500}
            icon={aqiIcon(p.aqi, "city", { hot: hotspotIds.has(p.id), sel: isSel(p) }, hotspotIds.has(p.id) || isSel(p) ? p.name : undefined)}
            eventHandlers={{ click: () => onPick(p.lat, p.lon, p.name) }}>
            <Tooltip direction="top" offset={[0, -14]}><b>{p.name}</b><br />AQI {p.aqi} / {p.kind === "measured" ? `measured, ${p.stations && p.stations > 1 ? `median of ${p.stations} stations` : "1 station"}` : "model estimate"}</Tooltip>
          </Marker>
        ))}
    </SafeMap>
  );
}
