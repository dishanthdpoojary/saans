"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CurrentResponse } from "@/lib/types";
import { categoryFor } from "@/lib/aqi";
import { qs } from "./fetcher";

/**
 * Smart AQI Alerts. Rules live in localStorage (no account needed). While the app is open we
 * re-check every 10 minutes and fire a browser notification + in-app toast when a rule's AQI
 * threshold is crossed upward. Each rule re-arms only after AQI drops back below the threshold,
 * so users are not spammed.
 */

export interface AlertRule {
  id: string;
  name: string;
  lat: number;
  lon: number;
  threshold: number;
  armed: boolean;
  lastAqi?: number | null;
  lastChecked?: string;
}

export interface Toast {
  id: string;
  title: string;
  body: string;
  color: string;
}

interface AlertsState {
  rules: AlertRule[];
  addRule: (r: Omit<AlertRule, "id" | "armed">) => void;
  removeRule: (id: string) => void;
  toasts: Toast[];
  dismiss: (id: string) => void;
  permission: NotificationPermission | "unsupported";
  requestPermission: () => Promise<void>;
  checkNow: () => Promise<void>;
}

const Ctx = createContext<AlertsState | null>(null);
const KEY = "saans.alerts";
const INTERVAL = 10 * 60_000;

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [permission, setPermission] = useState<AlertsState["permission"]>("default");
  const rulesRef = useRef(rules);

  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
      if (saved) setRules(JSON.parse(saved));
    } catch {
      /* ignore */
    }
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  const persist = (next: AlertRule[]) => {
    setRules(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...t, id }].slice(-4));
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 12000);
  }, []);

  const checkNow = useCallback(async () => {
    const current = rulesRef.current;
    if (!current.length) return;
    const updated = await Promise.all(
      current.map(async (r) => {
        try {
          const res = await fetch(`/api/current?${qs({ lat: r.lat, lon: r.lon, name: r.name })}`);
          if (!res.ok) return r;
          const d: CurrentResponse = await res.json();
          const aqi = d.primary?.aqi ?? null;
          const next = { ...r, lastAqi: aqi, lastChecked: new Date().toISOString() };
          if (aqi != null && aqi >= r.threshold && r.armed) {
            const cat = categoryFor(aqi);
            const title = `AQI ${aqi} in ${r.name}`;
            const body = `Crossed your limit of ${r.threshold}, ${cat?.label}. ${cat?.general ?? ""}`;
            pushToast({ title, body, color: cat?.color ?? "#f97316" });
            if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(title, { body, tag: r.id });
            next.armed = false;
          } else if (aqi != null && aqi < r.threshold) next.armed = true;
          return next;
        } catch {
          return r;
        }
      }),
    );
    setRules(updated);
    localStorage.setItem(KEY, JSON.stringify(updated));
  }, [pushToast]);

  useEffect(() => {
    const first = setTimeout(checkNow, 3000);
    const t = setInterval(checkNow, INTERVAL);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [checkNow]);

  const value = useMemo<AlertsState>(
    () => ({
      rules,
      toasts,
      permission,
      checkNow,
      dismiss: (id) => setToasts((prev) => prev.filter((x) => x.id !== id)),
      addRule: (r) => {
        persist([...rulesRef.current.filter((x) => !(x.lat === r.lat && x.lon === r.lon)), { ...r, id: crypto.randomUUID(), armed: true }]);
        setTimeout(checkNow, 100);
      },
      removeRule: (id) => persist(rulesRef.current.filter((x) => x.id !== id)),
      requestPermission: async () => {
        if (typeof Notification === "undefined") return;
        setPermission(await Notification.requestPermission());
      },
    }),
    [rules, toasts, permission, checkNow],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAlerts() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAlerts must be used inside AlertsProvider");
  return v;
}
