import { geocode } from "@/lib/server/providers/openmeteo";
import { cached } from "@/lib/server/cache";
import { errorResponse, json, rateLimit, tooMany } from "@/lib/server/guard";

export async function GET(req: Request) {
  if (!rateLimit(req, { scope: "search", capacity: 40 })) return tooMany();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return json({ results: [] });
  try {
    const { value } = await cached(`geo:${q.toLowerCase()}`, 24 * 3600_000, () => geocode(q));
    return json({ results: value }, { sMaxAge: 86400 });
  } catch (e) {
    return errorResponse(e);
  }
}
