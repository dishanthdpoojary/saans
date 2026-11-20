import { getForecast } from "@/lib/server/service";
import { errorResponse, json, parseCoords, rateLimit, tooMany, badRequest } from "@/lib/server/guard";

export async function GET(req: Request) {
  if (!rateLimit(req, { scope: "forecast", capacity: 30 })) return tooMany();
  const c = parseCoords(new URL(req.url));
  if (!c) return badRequest("Valid lat and lon are required");
  try {
    return json(await getForecast(c.lat, c.lon), { sMaxAge: 1800 });
  } catch (e) {
    return errorResponse(e);
  }
}
