"use client";

import useSWR from "swr";
import { CheckCircle2, CircleDashed, ExternalLink } from "lucide-react";
import { fetcher } from "@/lib/client/fetcher";
import { Card, KindBadge, PageHeader, Skeleton } from "@/components/ui";

interface Provider {
  id: string;
  name: string;
  url: string;
  attribution?: string;
  enabled: boolean;
  kind: string;
  key: boolean;
}

export default function SourcesPage() {
  const { data } = useSWR<{ providers: Provider[] }>("/api/status", fetcher);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Data sources & methodology" subtitle="Where every number comes from, how fresh it is, and how we keep measurements, estimates and predictions apart." />

      <Card title="Live provider status">
        {!data ? (
          <Skeleton className="h-40" />
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {data.providers.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                {p.enabled ? <CheckCircle2 size={18} className="text-emerald-400" /> : <CircleDashed size={18} className="text-mute" />}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-mute">{p.kind}{p.attribution ? ` · ${p.attribution}` : ""}</p>
                </div>
                <span className={`chip ${p.enabled ? "text-emerald-300" : "text-mute"}`}>{p.enabled ? "Active" : p.key ? "Needs API key" : "Off"}</span>
                <a href={p.url} target="_blank" rel="noreferrer" className="text-mute hover:text-white" aria-label={`${p.name} website`}><ExternalLink size={15} /></a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="How to read the labels">
        <div className="grid gap-3 md:grid-cols-2">
          <Label kind="measured" text="A real reading from a ground monitoring station (WAQI or OpenAQ). We show the station name, its distance from you and when it last reported. Stations further than 25 km or older than 3 hours are not used as your headline." />
          <Label kind="model" text="CAMS (Copernicus) atmospheric model analysis for the current or a past hour. Available everywhere on Earth, but it is an estimate, it can miss very local sources." />
          <Label kind="forecast" text="CAMS model forecast for future hours (up to 5 days). Always drawn dashed and on the far side of the “Now” line." />
          <Label kind="predicted" text="Output of Saans’ own ridge-regression model, trained per location on 92 days of hourly PM2.5 and weather, and back-tested against naive baselines before display." />
        </div>
      </Card>

      <Card title="Reliability engineering">
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-soft">
          <li>Every upstream call has a timeout, bounded retries with exponential backoff, and honours <code>Retry-After</code> on HTTP 429.</li>
          <li>Responses are cached per ~1 km grid cell (10 min for current data, 1 h for history and forecasts), with in-flight de-duplication so a burst of users makes one upstream call.</li>
          <li>If a provider fails, the last good value is served and clearly flagged as stale, never replaced with invented numbers.</li>
          <li>Providers fail independently: one source going down degrades the page, it doesn&apos;t break it.</li>
          <li>API keys live only in server environment variables; the browser never sees them. Our own endpoints are rate-limited per client.</li>
          <li>AQI follows the US EPA scale (2024 PM2.5 breakpoints). WAQI publishes per-pollutant sub-indices rather than concentrations, so we show those as indices, not µg/m³.</li>
        </ul>
      </Card>
    </div>
  );
}

function Label({ kind, text }: { kind: "measured" | "model" | "forecast" | "predicted"; text: string }) {
  return (
    <div className="rounded-md border border-line p-4">
      <KindBadge kind={kind} />
      <p className="mt-2 text-sm text-soft">{text}</p>
    </div>
  );
}
