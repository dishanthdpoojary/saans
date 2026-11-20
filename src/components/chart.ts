/** Shared Recharts styling so every chart reads as one system. */
export const axis = { stroke: "#8b97b0", fontSize: 11, tickLine: false, axisLine: false } as const;
export const grid = { stroke: "#1f2940", strokeDasharray: "3 3", vertical: false } as const;
export const tooltipStyle = {
  contentStyle: { background: "#0e1424", border: "1px solid #1f2940", borderRadius: 12, fontSize: 12 },
  labelStyle: { color: "#c9d2e3" },
  cursor: { fill: "rgba(255,255,255,0.04)" },
} as const;
