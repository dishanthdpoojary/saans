import { aiEnabled, askGemini } from "@/lib/server/ai";
import { cached, coordKey } from "@/lib/server/cache";
import { forecastSummary, historySummary } from "@/lib/server/narrative";
import { errorResponse, json, parseCoords, rateLimit, tooMany, badRequest } from "@/lib/server/guard";

/** AI Insights: plain-language summary of computed trends. Cached 1h per location to respect the AI free tier. */
export async function GET(req: Request) {
  if (!rateLimit(req, { scope: "insights", capacity: 20 })) return tooMany();
  const url = new URL(req.url);
  const c = parseCoords(url);
  if (!c) return badRequest("Valid lat and lon are required");
  const place = (url.searchParams.get("name") ?? "this location").slice(0, 80);
  try {
    const { value } = await cached(`insight:v2:${coordKey(c.lat, c.lon)}`, 60 * 60_000, async () => {
      const [hist, fc] = await Promise.all([historySummary(c.lat, c.lon, 30), forecastSummary(c.lat, c.lon).catch(() => "")]);
      const facts = `${hist.text} ${fc}`.trim();
      if (aiEnabled()) {
        try {
          const text = await askGemini(
            "Summarise the pollution trend as exactly four lines, each starting with its label: 'Trend:', 'Notable:', 'Next 24 hours:', 'Tip:'. Max 25 words per line. Plain words a non-expert understands. Use only numbers from DATA. No markdown, no bullets.",
            [],
            { place, current: null, historySummary: hist.text, forecastSummary: fc },
          );
          return { text: text.replace(/\*\*/g, ""), engine: "gemini" as const, facts };
        } catch {
          /* fall through to deterministic summary */
        }
      }
      // deterministic fallback with the same four-line structure
      const s = hist.summary;
      const lines = [
        `Trend: average AQI over 30 days was ${s.avgAqi}${hist.weekOverWeek != null ? `, and the last week was ${hist.weekOverWeek > 0 ? "worse" : "better"} by ${Math.abs(hist.weekOverWeek)}%` : ""}.`,
        s.worstDay ? `Notable: worst day ${s.worstDay.date} (AQI ${s.worstDay.aqiAvg}), cleanest ${s.bestDay?.date} (AQI ${s.bestDay?.aqiAvg}).` : "",
        fc ? `Next 24 hours: ${fc.replace(/^CAMS forecast next 24h: /, "")}` : "",
        `Tip: ${s.avgAqi != null && s.avgAqi > 100 ? "plan outdoor time for the cleanest hours and keep windows closed at peaks." : "air has been mostly acceptable; sensitive people should still check before long outdoor exercise."}`,
      ].filter(Boolean);
      return { text: lines.join("\n"), engine: "rules" as const, facts };
    });
    return json(value, { sMaxAge: 1800 });
  } catch (e) {
    return errorResponse(e);
  }
}
