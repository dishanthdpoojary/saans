"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, Trash2 } from "lucide-react";
import { useAlerts } from "@/lib/client/alerts";
import { useLocation } from "@/lib/client/location";
import { AqiPill } from "./ui";
import { CATEGORIES } from "@/lib/aqi";

export function AlertsBell() {
  const { rules, addRule, removeRule, permission, requestPermission } = useAlerts();
  const { place } = useLocation();
  const [open, setOpen] = useState(false);
  const [threshold, setThreshold] = useState(150);
  const ref = useRef<HTMLDivElement>(null);
  const firing = rules.some((r) => r.lastAqi != null && r.lastAqi >= r.threshold);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative" data-tour="alerts">
      <button className="btn relative" onClick={() => setOpen((o) => !o)} aria-label="AQI alerts" aria-expanded={open}>
        {firing ? <BellRing size={16} className="text-red-400" /> : <Bell size={16} />}
        <span className="hidden sm:inline">Alerts</span>
        {rules.length > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-diya px-1.5 text-[10px] font-bold text-black">{rules.length}</span>}
      </button>
      {open && (
        <div className="card absolute right-0 top-full z-50 mt-2 w-[22rem] p-4 shadow-2xl">
          <p className="font-display font-semibold">Smart AQI alerts</p>
          <p className="mt-1 text-xs text-mute">Get notified when AQI crosses your limit. Checked every 10 minutes while Saans is open.</p>

          <div className="mt-4 rounded-md border border-line p-3">
            <p className="text-sm">
              Alert me for <span className="font-semibold text-diya-soft">{place.name}</span> when AQI ≥
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input type="range" min={50} max={300} step={10} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="flex-1 accent-amber-500" aria-label="Threshold" />
              <AqiPill aqi={threshold} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {CATEGORIES.slice(1, 5).map((c) => (
                <button key={c.id} className="chip hover:border-white/30" onClick={() => setThreshold(c.min)}>
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color }} /> {c.short} ({c.min})
                </button>
              ))}
            </div>
            <button className="btn btn-primary mt-3 w-full justify-center" onClick={() => addRule({ name: place.name, lat: place.lat, lon: place.lon, threshold })}>
              Save alert
            </button>
          </div>

          {permission !== "granted" && permission !== "unsupported" && (
            <button className="btn mt-3 w-full justify-center" onClick={requestPermission}>
              Enable browser notifications
            </button>
          )}
          {permission === "denied" && <p className="mt-2 text-xs text-amber-300">Notifications are blocked. You&apos;ll still see in-app alerts.</p>}

          {rules.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                  <AqiPill aqi={r.lastAqi ?? null} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{r.name}</p>
                    <p className="text-xs text-mute">Alert at ≥ {r.threshold}{r.lastAqi != null && r.lastAqi >= r.threshold ? " · above limit now" : ""}</p>
                  </div>
                  <button onClick={() => removeRule(r.id)} aria-label={`Remove alert for ${r.name}`} className="text-mute hover:text-red-300">
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
