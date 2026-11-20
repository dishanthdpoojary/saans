"use client";

import { Sparkles } from "lucide-react";
import { useInsights } from "@/lib/client/hooks";
import type { Place } from "@/lib/client/location";
import { AiBadge, ErrorState, Skeleton } from "./ui";

/** AI Insights: a four-line, plain-language summary of the pollution trend for a place. */
export function Insights({ place, compact = false }: { place: Place; compact?: boolean }) {
  const { data, error, mutate } = useInsights(place);
  return (
    <div data-tour="insight">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Sparkles size={15} className="text-sky" />
        <span className="text-[17px]">AI insights</span>
        {data && <AiBadge engine={data.engine} />}
        {!compact && <span className="label">Last 30 days and next 24 hours</span>}
      </div>
      {error ? (
        <ErrorState error={error} compact onRetry={() => mutate()} />
      ) : !data ? (
        <div className="flex flex-col gap-2"><Skeleton className="h-4" /><Skeleton className="h-4" /><Skeleton className="h-4 w-2/3" /></div>
      ) : (
        <dl className="flex flex-col gap-3">
          {data.text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
            const m = line.match(/^([A-Za-z0-9 ]{3,20}):\s*(.*)$/);
            return m ? (
              <div key={line} className="grid gap-1 sm:grid-cols-[120px_1fr]">
                <dt className="label pt-0.5">{m[1]}</dt>
                <dd className="text-[15px] leading-relaxed text-white/85">{m[2]}</dd>
              </div>
            ) : (
              <p key={line} className="text-[15px] leading-relaxed text-white/85">{line}</p>
            );
          })}
        </dl>
      )}
    </div>
  );
}
