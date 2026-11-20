import { ImageResponse } from "next/og";
import { getCurrent } from "@/lib/server/service";
import { categoryFor, POLLUTANTS } from "@/lib/aqi";
import { badRequest, parseCoords, rateLimit, tooMany } from "@/lib/server/guard";

/** AQI Sharing Card: 1200×630 PNG rendered from live data, with provenance printed on the card. */
export async function GET(req: Request) {
  if (!rateLimit(req, { scope: "card", capacity: 20 })) return tooMany();
  const url = new URL(req.url);
  const c = parseCoords(url);
  if (!c) return badRequest("Valid lat and lon are required");
  const name = (url.searchParams.get("name") ?? "My location").slice(0, 40);

  let data;
  try {
    data = await getCurrent(c.lat, c.lon, name);
  } catch {
    return new Response("Air quality data unavailable", { status: 502 });
  }
  const p = data.primary!;
  const cat = categoryFor(p.aqi);
  const color = cat?.color ?? "#64748b";
  const pm = data.model?.pollutants.filter((x) => x.value != null && (x.key === "pm2_5" || x.key === "pm10" || x.key === "no2" || x.key === "o3")) ?? [];
  const when = new Date(p.observedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: data.location.timezone || "UTC" });
  const provenance = p.kind === "measured" ? `Measured · ${p.station?.name ?? p.source.name}` : "Model estimate · CAMS via Open-Meteo";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0b1020", color: "white", padding: 56, fontFamily: "sans-serif", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", background: `radial-gradient(circle at 85% 20%, ${color}55, transparent 55%)` }} />
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, color: "#fbbf24" }}>
          <div style={{ display: "flex", width: 18, height: 18, borderRadius: 9, background: "#fbbf24" }} />
          <div style={{ display: "flex" }}>Saans · Air Quality</div>
        </div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 64, fontWeight: 700 }}>{name}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 36, marginTop: 18 }}>
          <div style={{ display: "flex", fontSize: 200, fontWeight: 800, color, lineHeight: 1 }}>{p.aqi ?? "–"}</div>
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 24 }}>
            <div style={{ display: "flex", fontSize: 30, color: "#94a3b8" }}>US AQI</div>
            <div style={{ display: "flex", fontSize: 46, fontWeight: 700, color }}>{cat?.label ?? "Unknown"}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 22, marginTop: 20 }}>
          {pm.map((x) => (
            <div key={x.key} style={{ display: "flex", flexDirection: "column", padding: "12px 20px", borderRadius: 16, background: "#ffffff14" }}>
              <div style={{ display: "flex", fontSize: 22, color: "#94a3b8" }}>{POLLUTANTS[x.key].label}</div>
              <div style={{ display: "flex", fontSize: 32, fontWeight: 700 }}>{x.value} µg/m³</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: "auto", justifyContent: "space-between", fontSize: 22, color: "#94a3b8" }}>
          <div style={{ display: "flex" }}>{provenance}</div>
          <div style={{ display: "flex" }}>{when}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, s-maxage=600" } },
  );
}
