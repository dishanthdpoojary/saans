import { getCurrent } from "@/lib/server/service";
import { errorResponse, json, parseCoords, rateLimit, tooMany, badRequest } from "@/lib/server/guard";

export async function GET(req: Request) {
  if (!rateLimit(req, { scope: "current" })) return tooMany();
  const url = new URL(req.url);
  const c = parseCoords(url);
  if (!c) return badRequest("Valid lat and lon are required");
  try {
    return json(await getCurrent(c.lat, c.lon, url.searchParams.get("name") ?? undefined), { sMaxAge: 300 });
  } catch (e) {
    return errorResponse(e);
  }
}
