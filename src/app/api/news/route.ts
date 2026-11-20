import { getAirQualityHeadlines, GDELT } from "@/lib/server/providers/news";
import { cached } from "@/lib/server/cache";
import { errorResponse, json, rateLimit, tooMany } from "@/lib/server/guard";

/** Latest air-quality headlines (GDELT). Cached 30 min: GDELT asks for at most one call per 5 s. */
export async function GET(req: Request) {
  if (!rateLimit(req, { scope: "news", capacity: 30 })) return tooMany();
  try {
    const { value, stale, storedAt } = await cached("news:aq", 30 * 60_000, () => getAirQualityHeadlines(24));
    return json({ headlines: value, stale, fetchedAt: new Date(storedAt).toISOString(), source: GDELT }, { sMaxAge: 900 });
  } catch (e) {
    return errorResponse(e);
  }
}
