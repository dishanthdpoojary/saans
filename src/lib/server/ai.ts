import "server-only";
import { fetchJson } from "./http";
import { categoryFor, POLLUTANTS } from "@/lib/aqi";
import type { CurrentResponse } from "@/lib/types";

/**
 * Gemini integration with strict grounding: the model only sees numbers we fetched, and is told
 * to never invent readings. When no key is configured or the quota is exhausted, a deterministic
 * rule-based engine answers instead, so the feature never hard-fails.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const model = () => process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
export const aiEnabled = () => !!process.env.GEMINI_API_KEY?.trim();

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AiContext {
  place: string;
  current: CurrentResponse | null;
  forecastSummary?: string;
  historySummary?: string;
}

function contextBlock(ctx: AiContext): string {
  const c = ctx.current;
  const p = c?.primary;
  const lines = [`Location: ${ctx.place}`];
  if (p) {
    lines.push(
      `Headline AQI (US EPA): ${p.aqi}, ${categoryFor(p.aqi)?.label} [${p.kind === "measured" ? `MEASURED at station ${p.station?.name}, ${p.station?.distanceKm} km away` : "CAMS MODEL ESTIMATE"}], observed ${p.observedAt}.`,
    );
  }
  if (c?.model) {
    lines.push(
      "Model concentrations (μg/m³): " +
        c.model.pollutants.filter((x) => x.value != null).map((x) => `${POLLUTANTS[x.key].label} ${x.value}`).join(", "),
    );
  }
  if (c?.weather) lines.push(`Weather: ${c.weather.temperature}°C, humidity ${c.weather.humidity}%, wind ${c.weather.windSpeed} km/h.`);
  if (ctx.forecastSummary) lines.push(`Forecast: ${ctx.forecastSummary}`);
  if (ctx.historySummary) lines.push(`History: ${ctx.historySummary}`);
  return lines.join("\n");
}

const SYSTEM = `You are Saans, an air-quality assistant inside a public-health web app.
Rules:
- Use ONLY the numbers in the DATA block. Never invent readings, stations or forecasts. If something is not in DATA, say you don't have it.
- Always say whether a number is a station measurement, a model estimate or a forecast.
- Give practical, specific advice (timing, masks, purifiers, sensitive groups). Not a doctor: suggest professional care for symptoms.
- Be concise: at most 120 words unless asked for more. Plain language; short bullet points are fine.`;

export async function askGemini(question: string, history: ChatTurn[], ctx: AiContext): Promise<string> {
  const key = process.env.GEMINI_API_KEY!.trim();
  const contents = [
    ...history.slice(-6).map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] })),
    { role: "user", parts: [{ text: `DATA:\n${contextBlock(ctx)}\n\nQUESTION: ${question}` }] },
  ];
  const res = await fetchJson<{ candidates?: { content?: { parts?: { text?: string }[] } }[] }>(
    `${ENDPOINT}/${model()}:generateContent`,
    {
      source: "Gemini",
      method: "POST",
      retries: 1,
      timeoutMs: 15000,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
      }),
    },
  );
  const text = res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("Empty AI response");
  return text;
}

/** Deterministic fallback — intent matching over the same grounded data. */
export function ruleBasedAnswer(question: string, ctx: AiContext): string {
  const q = question.toLowerCase();
  const p = ctx.current?.primary;
  const cat = categoryFor(p?.aqi);
  const label = p ? `${p.aqi} (${cat?.label})` : "unavailable";
  const prov = p?.kind === "measured" ? `measured at ${p.station?.name}` : "CAMS model estimate";

  if (/pm ?2\.?5|pm ?10|particulate/.test(q))
    return "PM2.5 are particles under 2.5 µm, small enough to reach deep into the lungs and bloodstream, linked to heart and lung disease. PM10 (under 10 µm) mostly irritates the nose, throat and upper airways. PM2.5 is usually the bigger health concern, and N95/FFP2 masks filter both.";
  if (/what is aqi|aqi mean|explain aqi|categor/.test(q))
    return "AQI turns pollutant concentrations into a 0–500 scale: 0–50 Good, 51–100 Moderate, 101–150 Unhealthy for Sensitive Groups, 151–200 Unhealthy, 201–300 Very Unhealthy, 301+ Hazardous. The overall AQI is the worst pollutant's sub-index.";
  if (!p || !cat) return "I couldn't load air-quality data for this location right now. Please try again in a minute.";
  if (/run|jog|exercise|walk|cycle|outside|outdoor|play|gym/.test(q))
    return `AQI in ${ctx.place} is ${label}, ${prov}. Outdoor exercise: ${cat.activity.outdoorExercise}. Sensitive groups: ${cat.sensitive} ${ctx.forecastSummary ? `Forecast: ${ctx.forecastSummary}` : ""}`.trim();
  if (/mask|n95/.test(q)) return `With AQI ${label}: mask, ${cat.activity.mask}.`;
  if (/window|ventilat|purifier/.test(q)) return `With AQI ${label}: windows, ${cat.activity.windows}.`;
  if (/child|kid|baby|elder|old|asthma|pregnan|heart|sensitive/.test(q)) return `For sensitive groups at AQI ${label}: ${cat.sensitive}`;
  if (/forecast|tomorrow|later|will/.test(q)) return ctx.forecastSummary ? `Forecast for ${ctx.place}: ${ctx.forecastSummary}` : "Forecast data isn't loaded yet.";
  return `Air quality in ${ctx.place} is ${label} (${prov}). ${cat.meaning} ${cat.general}`;
}
