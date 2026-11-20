"use client";

import { useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";
import { qs } from "@/lib/client/fetcher";
import type { Place } from "@/lib/client/location";

/** AQI Sharing Card: uses the Web Share API with the generated PNG where supported, else downloads it. */
export function ShareButton({ place }: { place: Place }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const url = `/api/card?${qs({ lat: place.lat, lon: place.lon, name: place.name })}`;

  const share = async () => {
    setBusy(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("card failed");
      const blob = await res.blob();
      const file = new File([blob], `saans-aqi-${place.name.toLowerCase().replace(/\W+/g, "-")}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Air quality in ${place.name}`, text: `Air quality right now in ${place.name}, via Saans` });
      } else {
        setPreview(URL.createObjectURL(blob));
      }
    } catch {
      /* user cancelled share sheet or network error */
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="btn" onClick={share} disabled={busy}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />} Share card
      </button>
      {preview && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 p-4" onClick={() => setPreview(null)}>
          <div className="card max-w-3xl p-4" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- blob URL preview */}
            <img src={preview} alt={`AQI share card for ${place.name}`} className="w-full rounded-md" />
            <div className="mt-3 flex justify-end gap-2">
              <button className="btn" onClick={() => setPreview(null)}>Close</button>
              <a className="btn btn-primary" href={preview} download={`saans-aqi-${place.name}.png`}>
                <Download size={15} /> Download PNG
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
