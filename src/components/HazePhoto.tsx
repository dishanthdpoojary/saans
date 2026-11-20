"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

export const PHOTOS = {
  hero: { src: "https://images.unsplash.com/photo-1714892208466-4d696c0ba2cb", credit: "Johan Mouchet", alt: "A hazy city seen from a hill" },
  road: { src: "https://images.unsplash.com/photo-1768324678501-82940ccabb91", credit: "vegonaise", alt: "A misty city skyline at sunrise" },
  street: { src: "https://images.unsplash.com/photo-1686179225818-c07909cd2911", credit: "Ahmer Kalam", alt: "The New York skyline in wildfire smoke with the sun low in the sky" },
};

/**
 * A photograph with a pollution layer driven by live data: a warm haze whose opacity follows AQI,
 * and drifting dust whose density follows PM2.5. Clean air leaves the photo almost untouched.
 */
export function HazePhoto({ photo, aqi, pm25, priority, className }: { photo: keyof typeof PHOTOS; aqi: number | null; pm25: number | null; priority?: boolean; className?: string }) {
  const p = PHOTOS[photo];
  const t = aqi == null ? 0 : Math.max(0, Math.min(1, (aqi - 50) / 200));
  return (
    <div className={`absolute inset-0 overflow-hidden ${className ?? ""}`} aria-hidden>
      <Image src={`${p.src}?auto=format&fit=crop&w=2400&q=80`} alt={p.alt} fill priority={priority} sizes="100vw" className="ken-burns object-cover" unoptimized />
      <div className="absolute inset-0 transition-opacity duration-1000" style={{ background: "linear-gradient(180deg, rgba(150,124,92,0.55), rgba(120,104,84,0.35))", opacity: t * 0.85, mixBlendMode: "multiply" }} />
      <div className="absolute inset-0 transition-opacity duration-1000" style={{ background: "rgba(196,178,150,0.5)", opacity: t * 0.35 }} />
      <Dust pm25={pm25} />
    </div>
  );
}

function Dust({ pm25 }: { pm25: number | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    let s = 17;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    const n = Math.round(Math.min(420, 30 + (pm25 ?? 10) * 2.2));
    const ps = Array.from({ length: n }, () => ({ x: rnd(), y: rnd(), r: 0.5 + rnd() * 1.4, vx: 0.00008 + rnd() * 0.00025, vy: (rnd() - 0.5) * 0.00008, a: 0.15 + rnd() * 0.35 }));
    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        if (!reduce) {
          p.x = (p.x + p.vx) % 1;
          p.y = (p.y + p.vy + 1) % 1;
        }
        ctx.fillStyle = `rgba(235,225,205,${p.a})`;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [pm25]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}
