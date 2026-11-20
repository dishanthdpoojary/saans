"use client";

import { AirMap } from "@/components/AirMap";

export default function MapPage() {
  return (
    <div>
      <h1 className="sr-only">Air quality map</h1>
      <AirMap height="h-[100svh]" fullscreen />
    </div>
  );
}
