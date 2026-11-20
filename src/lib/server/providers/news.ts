import "server-only";
import { fetchJson } from "../http";
import type { SourceRef } from "@/lib/types";

/**
 * Air-quality headlines from the GDELT Project DOC 2.0 API: a free, keyless, public index of
 * worldwide online news, updated every 15 minutes. We query English-language coverage of air
 * quality from the last 3 days, then keep only headlines that are actually about the air.
 */

export const GDELT: SourceRef = {
  id: "gdelt",
  name: "GDELT Project news index",
  url: "https://www.gdeltproject.org/",
  attribution: "Headlines via the GDELT Project; articles belong to their publishers",
};

export const GOOGLE_NEWS: SourceRef = {
  id: "gdelt",
  name: "Google News",
  url: "https://news.google.com/",
  attribution: "Headlines via Google News RSS; articles belong to their publishers",
};

export interface Headline {
  title: string;
  url: string;
  domain: string; // publisher
  seenAt: string; // ISO
  country?: string;
  via: "GDELT" | "Google News";
}

const QUERY = '("air quality" OR "air pollution" OR AQI OR smog OR "PM2.5" OR "air quality index") sourcelang:english';
const MUST = /\b(air|aqi|pollut|smog|pm ?2\.?5|pm10|haze|smoke|emission|ozone|breath|lung|stubble)/i;
const NOISE = /\b(deal|deals|sale|discount|coupon|% off|buy now|best .* purifiers?|horoscope)\b/i;

interface GdeltResponse {
  articles?: { url: string; title: string; seendate: string; domain: string; sourcecountry?: string; language?: string }[];
}

/** GDELT tokenises titles ("readings , and" / "3 , 331"); put the punctuation back. */
function cleanTitle(t: string) {
  return t
    .replace(/\s+([,.;:!?%)])/g, "$1")
    .replace(/(\d),\s(\d{3})\b/g, "$1,$2")
    .replace(/\(\s+/g, "(")
    .replace(/\s+'\s*s\b/g, "'s")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[|–-]\s*[^|–-]{2,40}$/, (m) => (m.length < 45 ? "" : m)) // trailing " | Site Name"
    .trim();
}

function parseSeen(s: string) {
  // 20261109T063000Z → ISO
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : new Date().toISOString();
}

async function fromGdelt(): Promise<Headline[]> {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(QUERY)}&mode=artlist&format=json&maxrecords=75&sort=datedesc&timespan=3d`;
  // no instant retry: GDELT allows ~1 request / 5 s, and the cache absorbs failures
  const raw = await fetchJson<GdeltResponse>(url, { source: "GDELT", timeoutMs: 12000, retries: 0 });
  return (raw.articles ?? [])
    .filter((a) => a.url?.startsWith("http") && a.title)
    .map((a) => ({ title: cleanTitle(a.title), url: a.url, domain: a.domain.replace(/^www\./, ""), seenAt: parseSeen(a.seendate), country: a.sourcecountry, via: "GDELT" as const }));
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

async function fromGoogleNews(): Promise<Headline[]> {
  const q = encodeURIComponent('"air quality" OR AQI OR "air pollution" OR smog when:3d');
  const ctrl = AbortSignal.timeout(12000);
  const res = await fetch(`https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`, { signal: ctrl, cache: "no-store" });
  if (!res.ok) throw new Error(`Google News responded ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const it = m[1];
    const pick = (tag: string) => decode((it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [])[1] ?? "");
    const publisher = pick("source");
    let title = pick("title");
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3));
    const d = Date.parse(pick("pubDate"));
    return { title, url: pick("link"), domain: publisher || "news", seenAt: Number.isFinite(d) ? new Date(d).toISOString() : new Date().toISOString(), via: "Google News" as const };
  });
}

/** Both feeds independently; either one alone keeps the ticker alive. Deduped, newest first. */
export async function getAirQualityHeadlines(limit = 24): Promise<Headline[]> {
  const [g, n] = await Promise.allSettled([fromGdelt(), fromGoogleNews()]);
  const all = [...(n.status === "fulfilled" ? n.value : []), ...(g.status === "fulfilled" ? g.value : [])];
  if (!all.length) throw new Error("No news source reachable");
  const seen = new Set<string>();
  const out: Headline[] = [];
  for (const h of all.sort((a, b) => Date.parse(b.seenAt) - Date.parse(a.seenAt))) {
    const key = h.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50);
    if (!h.url.startsWith("http") || h.title.length < 25 || !MUST.test(h.title) || NOISE.test(h.title) || seen.has(key)) continue;
    seen.add(key);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}
