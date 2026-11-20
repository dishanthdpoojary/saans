import { getCitiesSnapshot } from "@/lib/server/service";
import { errorResponse, json, rateLimit, tooMany } from "@/lib/server/guard";

export async function GET(req: Request) {
  if (!rateLimit(req, { scope: "cities" })) return tooMany();
  try {
    return json(await getCitiesSnapshot(), { sMaxAge: 600 });
  } catch (e) {
    return errorResponse(e);
  }
}
