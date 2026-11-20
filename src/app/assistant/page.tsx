"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Mic, MicOff, Send, User, Volume2, VolumeX } from "lucide-react";
import { useLocation } from "@/lib/client/location";
import { AiBadge, Card, PageHeader } from "@/components/ui";

interface Msg {
  role: "user" | "assistant";
  text: string;
  engine?: "gemini" | "rules";
}

const SUGGESTIONS = [
  "Is it safe to go for a run this evening?",
  "Should my kids play outside today?",
  "What's the difference between PM2.5 and PM10?",
  "When is the best time to open the windows?",
  "Will the air get better tomorrow?",
  "What mask should I wear?",
];

// Minimal typing for the Web Speech API (not in TS DOM lib)
type SR = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void };

export default function AssistantPage() {
  const { place } = useLocation();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const rec = useRef<SR | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    setVoiceOk(!!(W.SpeechRecognition || W.webkitSpeechRecognition));
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs, busy]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const history = msgs.map(({ role, text }) => ({ role, text }));
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history, lat: place.lat, lon: place.lon, place: place.name }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Assistant unavailable");
      setMsgs((m) => [...m, { role: "assistant", text: d.answer, engine: d.engine }]);
      if (d.notice) setNotice(d.notice);
      if (speak && "speechSynthesis" in window) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(d.answer.replace(/[*_#`]/g, ""));
        u.lang = "en-IN";
        speechSynthesis.speak(u);
      }
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: `Sorry, ${(e as Error).message}. Please try again.`, engine: "rules" }]);
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "en-IN";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript ?? "";
      setSpeak(true);
      ask(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Ask Saans" subtitle={`An AI assistant grounded in live data for ${place.name}. It only uses numbers Saans actually fetched, and says whether they're measured or estimated.`}>
        <button className="btn" onClick={() => setSpeak((s) => !s)} aria-pressed={speak} title="Read answers aloud">
          {speak ? <Volume2 size={15} /> : <VolumeX size={15} />} Voice replies {speak ? "on" : "off"}
        </button>
      </PageHeader>

      <Card className="flex min-h-[60vh] flex-col" data-tour="ask">
        <div className="flex flex-1 flex-col gap-4 overflow-auto pb-4" aria-live="polite">
          {msgs.length === 0 && (
            <div className="m-auto max-w-lg text-center">
              <Bot size={36} className="mx-auto text-diya" />
              <p className="mt-3 font-display text-lg">Ask about the air in {place.name}</p>
              <p className="mt-1 text-sm text-mute">Type, tap a suggestion{voiceOk ? ", or press the mic and just ask" : ""}.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chip px-3 py-1.5 text-soft hover:border-diya/50" onClick={() => ask(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <span className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.role === "user" ? "bg-sky-500/20 text-sky-300" : "bg-diya/15 text-diya"}`}>
                {m.role === "user" ? <User size={16} /> : <Bot size={16} />}
              </span>
              <div className={`max-w-[80%] rounded-md px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "bg-sky-500/10" : "bg-white/[0.04]"}`}>
                <RichText text={m.text} />
                {m.engine && <div className="mt-2"><AiBadge engine={m.engine} /></div>}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-mute"><Loader2 size={15} className="animate-spin" /> Checking the latest data…</div>
          )}
          <div ref={end} />
        </div>
        {notice && <p className="mb-2 text-xs text-amber-300">{notice}</p>}
        <form className="flex gap-2 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
          {voiceOk && (
            <button type="button" className={`btn ${listening ? "border-red-500/60 bg-red-500/10 text-red-300" : ""}`} onClick={toggleMic} aria-label={listening ? "Stop listening" : "Ask by voice"}>
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}
          <input className="input" placeholder={listening ? "Listening…" : "Ask anything about air quality…"} value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} aria-label="Your question" />
          <button className="btn btn-primary" disabled={busy || !input.trim()} aria-label="Send"><Send size={16} /></button>
        </form>
      </Card>
    </div>
  );
}

/** Minimal, safe rendering of the assistant's markdown: paragraphs, bullet lists and **bold**. */
function RichText({ text }: { text: string }) {
  const inline = (t: string) =>
    t.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-medium text-white">{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
    );
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length} className="my-1 flex list-disc flex-col gap-1 pl-5">{list.map((li, i) => <li key={i}>{inline(li)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[*\-•]\s+(.*)$/);
    if (bullet) list.push(bullet[1]);
    else {
      flush();
      if (line) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="flex flex-col gap-2">{blocks}</div>;
}
