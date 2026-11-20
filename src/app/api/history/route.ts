import { getHistory } from "@/lib/server/service";
import { errorResponse, json, parseCoords, rateLimit, tooMany, badRequest } from "@/lib/server/guard";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  if (!rateLimit(req, { scope: "history" })) return tooMany();
  const url = new URL(req.url);
  const c = parseCoords(url);
  if (!c) return badRequest("Valid lat and lon are required");
  const start = url.searchParams.get("start") ?? undefined;
  const end = url.searchParams.get("end") ?? undefined;
  if ((start && !DATE.test(start)) || (end && !DATE.test(end))) return badRequest("Dates must be YYYY-MM-DD");
  if (start && end && start > end) return badRequest("start must be before end");
  const days = Math.min(92, Math.max(1, Number(url.searchParams.get("days") ?? 30) || 30));
  try {
    return json(await getHistory(c.lat, c.lon, { days, start, end }), { sMaxAge: 1800 });
  } catch (e) {
    return errorResponse(e);
  }
}
