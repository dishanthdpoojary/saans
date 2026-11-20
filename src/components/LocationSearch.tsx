"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, LocateFixed, MapPin, Search } from "lucide-react";
import { useLocation, type Place } from "@/lib/client/location";

interface GeoResult {
  name: string;
  lat: number;
  lon: number;
  country?: string;
  admin1?: string;
}

/** City search (Open-Meteo geocoding, debounced) + browser geolocation. */
export function LocationSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const { setPlace, recent, detect, detecting, detectError } = useLocation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear results when query is too short
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        const d = await r.json();
        setResults(d.results ?? []);
        setActive(0);
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (p: Place) => {
    setPlace(p);
    setQ("");
    setOpen(false);
  };
  const list: Place[] = q.trim().length >= 2
    ? results.map((r) => ({ name: r.name, lat: r.lat, lon: r.lon, detail: [r.admin1, r.country].filter(Boolean).join(", ") }))
    : recent;

  return (
    <div className="flex flex-1 flex-col gap-2">
      <div ref={box} className="relative w-full">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
        <input
          className="input pl-9"
          placeholder="Search a city or town"
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, list.length - 1));
            else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
            else if (e.key === "Enter" && list[active]) choose(list[active]);
            else if (e.key === "Escape") setOpen(false);
          }}
          aria-label="Search location"
          role="combobox"
          aria-expanded={open}
          aria-controls="loc-results"
        />
        {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-mute" />}
        {open && list.length > 0 && (
          <ul id="loc-results" role="listbox" className="mt-2 max-h-72 overflow-auto rounded-md bg-night/60 p-1.5">
            {q.trim().length < 2 && <li className="px-3 py-1.5 text-xs text-haze">Recently viewed</li>}
            {list.map((p, i) => (
              <li key={`${p.name}-${p.lat}-${p.lon}`} role="option" aria-selected={i === active}>
                <button
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm ${i === active ? "bg-white/5" : ""} hover:bg-white/5`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(p)}
                >
                  <MapPin size={14} className="shrink-0 text-diya" />
                  <span className="truncate">{p.name}</span>
                  {p.detail && <span className="truncate text-xs text-mute">{p.detail}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button className="btn justify-center" onClick={detect} disabled={detecting}>
        {detecting ? <Loader2 size={15} className="animate-spin" /> : <LocateFixed size={15} />}
        Use my current location
      </button>
      {detectError && <span className="text-xs text-red-300">{detectError}</span>}
    </div>
  );
}

/** Compact chip for the top bar: shows the current place, opens search + "Near me" in a popover. */
export function LocationPicker() {
  const { place } = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  // close once a new place is chosen
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a context change
  useEffect(() => setOpen(false), [place]);
  return (
    <div ref={ref} className="relative" data-tour="location">
      <button className="btn max-w-[46vw] lg:max-w-none" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Location: ${place.name}. Change location`}>
        <MapPin size={15} className="shrink-0 text-sky" />
        <span className="truncate">{place.name}</span>
      </button>
      {open && (
        <div className="glass fixed inset-x-3 top-16 rounded-md p-3 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-3 sm:w-[26rem]">
          <LocationSearch autoFocus />
        </div>
      )}
    </div>
  );
}
