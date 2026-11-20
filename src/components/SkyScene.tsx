"use client";

import { useEffect, useMemo, useRef } from "react";

/**
 * The Saans hero: an illustrated Indian skyline at dusk whose sky is driven by live data.
 * `pm25` sets the particle density of the drifting "air river"; `aqi` blends the sky from a clear
 * blue dusk toward smog. Deterministic geometry (seeded) so server and client render identically.
 */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mix(c1: string, c2: string, t: number) {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [a, b] = [p(c1), p(c2)];
  return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(",")})`;
}

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export function SkyScene({ aqi, pm25, className }: { aqi: number | null; pm25: number | null; className?: string }) {
  const t = aqi == null ? 0.25 : Math.max(0, Math.min(1, (aqi - 40) / 220)); // 0 clean → 1 heavy smog
  // clean: clear blue dusk · polluted: a dusty, ominous smog sunset
  const sky = {
    top: mix("#0a2250", "#231f2b", t),
    mid: mix("#3c78b6", "#6e5d4f", t),
    low: mix("#b3d6f7", "#d0a77c", t),
    glow: mix("#e4ddff", "#f0b779", t),
  };

  // far skyline (generic towers) — seeded so SSR and client match
  const far = useMemo(() => {
    const r = seeded(7);
    const out: { x: number; w: number; h: number }[] = [];
    for (let x = -20; x < 1620; ) {
      const w = 26 + r() * 46;
      out.push({ x, w, h: 50 + r() * 150 });
      x += w + 2;
    }
    return out;
  }, []);
  const mid = useMemo(() => {
    const r = seeded(42);
    const out: { x: number; w: number; h: number; lit: { x: number; y: number }[] }[] = [];
    for (let x = -10; x < 1620; ) {
      const w = 34 + r() * 60;
      const h = 70 + r() * 190;
      const lit: { x: number; y: number }[] = [];
      for (let k = 0; k < Math.floor(h / 22); k++) if (r() > 0.55) lit.push({ x: x + 6 + Math.floor(r() * ((w - 14) / 9)) * 9, y: 790 - h + 10 + k * 20 });
      out.push({ x, w, h, lit });
      x += w + 6 + r() * 30;
    }
    return out;
  }, []);

  return (
    <div className={`absolute inset-0 overflow-hidden ${className ?? ""}`} aria-hidden>
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 top-0 h-[50%] w-full sm:h-[62%] md:h-[70%]">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={sky.top} />
            <stop offset="0.55" stopColor={sky.mid} />
            <stop offset="0.86" stopColor={sky.low} />
          </linearGradient>
          <radialGradient id="glow" cx="0.55" cy="0.7" r="0.65">
            <stop offset="0" stopColor={sky.glow} stopOpacity="0.75" />
            <stop offset="1" stopColor={sky.glow} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="smog" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8d8475" stopOpacity="0" />
            <stop offset="0.6" stopColor="#8d8475" stopOpacity={0.3 * t} />
            <stop offset="1" stopColor="#6f675b" stopOpacity={0.45 * t} />
          </linearGradient>
          <filter id="blur8"><feGaussianBlur stdDeviation="8" /></filter>
          <filter id="blur20"><feGaussianBlur stdDeviation="20" /></filter>
        </defs>

        <rect width="1600" height="900" fill="url(#sky)" />
        <rect width="1600" height="900" fill="url(#glow)" />

        {/* far skyline */}
        <g fill={mix("#4c7fb8", "#8a7765", t)} opacity="0.5">
          {far.map((b, i) => <rect key={i} x={b.x} y={800 - b.h} width={b.w} height={b.h} />)}
        </g>

        {/* mid skyline with lit windows */}
        <g>
          {mid.map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={790 - b.h} width={b.w} height={b.h} fill={mix("#18365f", "#3b322c", t)} />
              {b.lit.map((w, k) => <rect key={k} x={w.x} y={w.y} width="4" height="6" fill="#ffe6a8" opacity={0.55 - t * 0.25} />)}
            </g>
          ))}
        </g>

        {/* smoke plumes from the towers, rising and turning into sky (the poster's idea) */}
        <g filter="url(#blur20)" opacity={0.18 + 0.32 * t}>
          <path d="M1390 690 C1360 600 1420 540 1380 450 C1350 380 1420 320 1480 250 L1560 250 C1520 330 1480 400 1500 470 C1520 560 1450 610 1470 690 Z" fill={mix("#7aa6d6", "#9c9385", t)} />
          <path d="M1500 700 C1480 620 1540 560 1520 480 C1500 410 1560 360 1600 300 L1600 700 Z" fill={mix("#7aa6d6", "#9c9385", t)} />
        </g>
        <rect width="1600" height="900" fill="url(#smog)" />

        {/* near silhouette: landmarks on the horizon */}
        <g fill="#040b17">
          {/* ground */}
          <path d="M0 790 L1600 790 L1600 900 L0 900 Z" />
          <Landmarks />
          {/* cooling towers + chimneys, as in the poster */}
          <path d="M1360 790 Q1372 740 1366 690 L1414 690 Q1408 740 1420 790 Z" />
          <path d="M1440 790 Q1454 735 1446 680 L1502 680 Q1494 735 1508 790 Z" />
          <rect x="1530" y="640" width="10" height="150" />
          <rect x="1556" y="660" width="8" height="130" />
          {/* foreground hill and a lone figure, looking at the sky */}
          <path d="M520 900 C620 830 760 812 860 820 C980 830 1080 860 1160 900 Z" fill="#030812" />
          <g fill="#030812">
            <circle cx="842" cy="752" r="7" />
            <path d="M834 762 Q842 758 850 762 L854 812 L830 812 Z" />
          </g>
        </g>
      </svg>
      <AirRiver pm25={pm25} t={t} />
      <div className="absolute inset-x-0 bottom-0 h-[50%] bg-[#040b17] sm:h-[38%] md:h-[30%]" />
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-night to-transparent" />
    </div>
  );
}

/** Canvas layer: glowing particles drifting along a winding stream. Count scales with PM2.5. */
function AirRiver({ pm25, t }: { pm25: number | null; t: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
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

    const count = Math.round(Math.min(900, 140 + (pm25 ?? 20) * 4.5));
    const rnd = seeded(99);
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
    const ps = Array.from({ length: count }, () => ({
      x: rnd(),
      off: gauss(),
      speed: 0.00012 + rnd() * 0.00035,
      size: 0.6 + rnd() * 1.8,
      tw: rnd() * Math.PI * 2,
    }));
    // clean air sparkles cool white-blue; dirty air glows dusty amber-grey
    const clean = [200, 230, 255];
    const dirty = [214, 186, 140];
    const col = clean.map((c, i) => Math.round(lerp(c, dirty[i], t)));

    let raf = 0;
    let time = 0;
    const draw = () => {
      time += 1;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const p of ps) {
        if (!reduce) p.x = (p.x + p.speed) % 1;
        const x = p.x * (w + 80) - 40;
        const base = h * 0.2 + Math.sin(p.x * 6.2 + 0.8) * h * 0.07 + Math.sin(p.x * 13 + 2) * h * 0.025;
        const y = base + p.off * h * (0.05 + 0.05 * t);
        const a = 0.35 + 0.45 * Math.abs(Math.sin(p.tw + time * 0.03));
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a * (0.75 + 0.25 * (1 - t))})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [pm25, t]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}

/** India Gate, Qutub Minar, Charminar, Gateway of India and the Lotus Temple, standing on y = 790. */
export function Landmarks() {
  return (
    <>
          {/* India Gate */}
      <path fillRule="evenodd" d="M250 790 V672 H244 V660 H356 V672 H350 V790 Z M282 790 V712 Q300 688 318 712 V790 Z" />
      <rect x="268" y="646" width="64" height="14" />
      <path d="M290 646 Q300 630 310 646 Z" />
      {/* Qutub Minar */}
      <path d="M494 790 L506 520 L522 520 L534 790 Z" />
      <rect x="499" y="700" width="30" height="5" />
      <rect x="502" y="620" width="24" height="5" />
      <rect x="505" y="560" width="18" height="4" />
      <path d="M508 520 L514 498 L520 520 Z" />
      {/* Charminar */}
      <path fillRule="evenodd" d="M690 790 V700 H800 V790 Z M722 790 V744 Q745 716 768 744 V790 Z" />
      {[690, 794].map((x) => (
        <g key={x}>
          <rect x={x - 4} y="612" width="14" height="178" />
          <path d={`M${x - 6} 612 Q${x + 3} 588 ${x + 12} 612 Z`} />
        </g>
      ))}
      <rect x="700" y="690" width="90" height="10" />
      {/* Gateway of India */}
      <path fillRule="evenodd" d="M960 790 V690 H1100 V790 Z M1012 790 V730 Q1030 700 1048 730 V790 Z" />
      {[966, 1094].map((x) => (
        <g key={x}>
          <rect x={x - 12} y="660" width="24" height="130" />
          <path d={`M${x - 14} 660 Q${x} 632 ${x + 14} 660 Z`} />
        </g>
      ))}
      <path d="M1010 690 Q1030 664 1050 690 Z" />
      {/* Lotus Temple */}
      <path d="M1170 790 Q1180 740 1215 722 Q1206 760 1214 790 Z" />
      <path d="M1196 790 Q1210 724 1240 700 Q1270 724 1284 790 Z" />
      <path d="M1310 790 Q1300 740 1265 722 Q1274 760 1266 790 Z" />
    </>
  );
}
