import { aiEnabled, askGemini, ruleBasedAnswer, type ChatTurn } from "@/lib/server/ai";
import { getCurrent } from "@/lib/server/service";
import { forecastSummary } from "@/lib/server/narrative";
import { badRequest, json, rateLimit, tooMany } from "@/lib/server/guard";

export async function POST(req: Request) {
  if (!rateLimit(req, { scope: "assistant", capacity: 12, refillPerSec: 0.1 })) return tooMany();
  let body: { question?: string; history?: ChatTurn[]; lat?: number; lon?: number; place?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  const question = String(body.question ?? "").trim().slice(0, 500);
  if (!question) return badRequest("Question required");
  const lat = Number(body.lat), lon = Number(body.lon);
  const place = String(body.place ?? "your area").slice(0, 80);
  const history = Array.isArray(body.history)
    ? body.history.filter((t) => t && (t.role === "user" || t.role === "assistant")).map((t) => ({ role: t.role, text: String(t.text).slice(0, 1000) }))
    : [];

  const hasLoc = Number.isFinite(lat) && Number.isFinite(lon);
  const [current, fc] = await Promise.all([
    hasLoc ? getCurrent(lat, lon, place).catch(() => null) : null,
    hasLoc ? forecastSummary(lat, lon).catch(() => "") : "",
  ]);
  const ctx = { place, current, forecastSummary: fc };

  if (aiEnabled()) {
    try {
      return json({ answer: await askGemini(question, history, ctx), engine: "gemini" });
    } catch (e) {
      return json({ answer: ruleBasedAnswer(question, ctx), engine: "rules", notice: `AI unavailable (${(e as Error).message}), answered with built-in rules.` });
    }
  }
  return json({ answer: ruleBasedAnswer(question, ctx), engine: "rules" });
}
