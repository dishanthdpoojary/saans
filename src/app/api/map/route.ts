import { getMapPoints } from "@/lib/server/service";
import { errorResponse, json, rateLimit, tooMany, badRequest } from "@/lib/server/guard";

export async function GET(req: Request) {
  if (!rateLimit(req, { scope: "map" })) return tooMany();
  const p = new URL(req.url).searchParams;
  const [s, w, n, e] = ["s", "w", "n", "e"].map((k) => Number(p.get(k)));
  if (![s, w, n, e].every(Number.isFinite) || s >= n) return badRequest("Bounding box s,w,n,e required");
  try {
    return json(await getMapPoints({ s, w, n, e }), { sMaxAge: 300 });
  } catch (err) {
    return errorResponse(err);
  }
}
