"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CITIES, DEFAULT_CITY } from "@/lib/cities";

export interface Place {
  name: string;
  lat: number;
  lon: number;
  detail?: string;
}

interface LocationState {
  place: Place;
  setPlace: (p: Place) => void;
  recent: Place[];
  detect: () => Promise<void>;
  detecting: boolean;
  detectError: string | null;
}

const Ctx = createContext<LocationState | null>(null);

// First visit: start at a major city that matches the visitor's timezone (no permission prompt).
const TZ_CITY: Record<string, string> = {
  "Asia/Kolkata": "Delhi", "Asia/Calcutta": "Delhi", "Europe/London": "London", "Europe/Paris": "Paris", "Europe/Berlin": "Berlin",
  "Europe/Madrid": "Madrid", "Europe/Rome": "Rome", "Europe/Amsterdam": "Amsterdam", "Europe/Warsaw": "Warsaw", "Europe/Stockholm": "Stockholm",
  "Europe/Athens": "Athens", "Europe/Istanbul": "Istanbul", "Europe/Moscow": "Moscow", "America/New_York": "New York", "America/Toronto": "Toronto",
  "America/Chicago": "Chicago", "America/Los_Angeles": "Los Angeles", "America/Vancouver": "Vancouver", "America/Mexico_City": "Mexico City",
  "America/Bogota": "Bogotá", "America/Lima": "Lima", "America/Santiago": "Santiago", "America/Sao_Paulo": "São Paulo",
  "America/Argentina/Buenos_Aires": "Buenos Aires", "Asia/Shanghai": "Beijing", "Asia/Hong_Kong": "Hong Kong", "Asia/Taipei": "Taipei",
  "Asia/Tokyo": "Tokyo", "Asia/Seoul": "Seoul", "Asia/Singapore": "Singapore", "Asia/Bangkok": "Bangkok", "Asia/Jakarta": "Jakarta",
  "Asia/Manila": "Manila", "Asia/Kuala_Lumpur": "Kuala Lumpur", "Asia/Ho_Chi_Minh": "Ho Chi Minh City", "Asia/Dubai": "Dubai",
  "Asia/Riyadh": "Riyadh", "Asia/Tehran": "Tehran", "Asia/Karachi": "Karachi", "Asia/Dhaka": "Dhaka", "Asia/Kathmandu": "Kathmandu",
  "Asia/Colombo": "Colombo", "Africa/Cairo": "Cairo", "Africa/Lagos": "Lagos", "Africa/Nairobi": "Nairobi", "Africa/Johannesburg": "Johannesburg",
  "Australia/Sydney": "Sydney", "Australia/Melbourne": "Melbourne", "Pacific/Auckland": "Auckland",
};
function defaultPlace(): Place {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const c = CITIES.find((x) => x.name === TZ_CITY[tz]);
    if (c) return { name: c.name, lat: c.lat, lon: c.lon, detail: c.country };
  } catch {
    /* fall through */
  }
  return { name: DEFAULT_CITY.name, lat: DEFAULT_CITY.lat, lon: DEFAULT_CITY.lon, detail: DEFAULT_CITY.country };
}
const KEY = "saans.place";
const RECENT = "saans.recent";

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [place, setPlaceState] = useState<Place>({ name: DEFAULT_CITY.name, lat: DEFAULT_CITY.lat, lon: DEFAULT_CITY.lon, detail: "India" });
  const [recent, setRecent] = useState<Place[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
      setPlaceState(saved ? JSON.parse(saved) : defaultPlace());
      const r = localStorage.getItem(RECENT);
      if (r) setRecent(JSON.parse(r));
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  const setPlace = useCallback((p: Place) => {
    setPlaceState(p);
    localStorage.setItem(KEY, JSON.stringify(p));
    setRecent((prev) => {
      const next = [p, ...prev.filter((x) => x.name !== p.name)].slice(0, 6);
      localStorage.setItem(RECENT, JSON.stringify(next));
      return next;
    });
  }, []);

  const detect = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setDetectError("Location isn't supported by this browser.");
      return;
    }
    setDetecting(true);
    setDetectError(null);
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }),
      );
      const lat = Math.round(pos.coords.latitude * 1000) / 1000;
      const lon = Math.round(pos.coords.longitude * 1000) / 1000;
      setPlace({ name: "My location", lat, lon, detail: `${lat.toFixed(2)}, ${lon.toFixed(2)}` });
    } catch (e) {
      const err = e as GeolocationPositionError;
      setDetectError(err.code === 1 ? "Location permission denied." : "Couldn't detect your location.");
    } finally {
      setDetecting(false);
    }
  }, [setPlace]);

  const value = useMemo(() => ({ place, setPlace, recent, detect, detecting, detectError }), [place, setPlace, recent, detect, detecting, detectError]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocation() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLocation must be used inside LocationProvider");
  return v;
}
