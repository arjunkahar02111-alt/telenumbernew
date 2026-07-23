import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";

type StatusResponse = {
  ip: string;
  blocked: { reason: string | null; since: string } | null;
  warnings: { id: string; message: string; created_at: string }[];
};

type HealthResponse = {
  ok: boolean;
  status: "operational" | "degraded" | "down";
  latencyMs: number | null;
  checkedAt: string;
  error?: string;
};

const DISCORD_INVITE = "https://discord.gg/yRvWD8nWpw";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TG Lookup — Telegram Number OSINT" },
      {
        name: "description",
        content:
          "Look up Telegram user IDs and reveal the associated phone number, country, and metadata.",
      },
      { property: "og:title", content: "TG Lookup — Telegram Number OSINT" },
      {
        property: "og:description",
        content: "Reveal phone number and country details from a Telegram user ID.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type LookupResult = {
  msg?: string;
  tg_id?: string;
  number?: string;
  country?: string;
  country_code?: string;
  expiry?: string;
  developer?: string;
  success?: boolean;
  cached?: boolean;
  response_time?: string;
  error?: string;
};


function Index() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ip, setIp] = useState<string>("—");
  const [now, setNow] = useState<string>(() => new Date().toLocaleString());
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const loadStatus = () =>
      fetch("/api/public/status")
        .then((r) => r.json())
        .then((d: StatusResponse) => {
          setStatus(d);
          if (d.ip) setIp(d.ip);
        })
        .catch(() => {});
    const loadHealth = () =>
      fetch("/api/public/health")
        .then((r) => r.json())
        .then((d: HealthResponse) => setHealth(d))
        .catch(() => setHealth({ ok: false, status: "down", latencyMs: null, checkedAt: new Date().toISOString(), error: "Unreachable" }));
    loadStatus();
    loadHealth();
    fetch("https://api.ipify.org?format=json")
      .then((r) => r.json())
      .then((d) => setIp((prev) => (prev === "—" ? d.ip ?? "—" : prev)))
      .catch(() => {});
    const t = setInterval(() => setNow(new Date().toLocaleString()), 1000);
    const poll = setInterval(loadStatus, 15000);
    const healthPoll = setInterval(loadHealth, 30000);
    return () => {
      clearInterval(t);
      clearInterval(poll);
      clearInterval(healthPoll);
    };
  }, []);


  const playTone = (type: "success" | "error" | "warning") => {
    try {
      const Ctx =
        (window.AudioContext as typeof AudioContext) ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      const notes =
        type === "success"
          ? [
              { f: 660, t: 0, d: 0.12 },
              { f: 880, t: 0.12, d: 0.12 },
              { f: 1175, t: 0.24, d: 0.22 },
            ]
          : type === "warning"
          ? [
              { f: 880, t: 0, d: 0.18 },
              { f: 660, t: 0.2, d: 0.18 },
              { f: 880, t: 0.42, d: 0.18 },
              { f: 660, t: 0.62, d: 0.24 },
            ]
          : [
              { f: 300, t: 0, d: 0.18 },
              { f: 180, t: 0.2, d: 0.32 },
            ];
      const start = ctx.currentTime;
      notes.forEach(({ f, t, d }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type =
          type === "success" ? "sine" : type === "warning" ? "triangle" : "sawtooth";
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, start + t);
        gain.gain.exponentialRampToValueAtTime(0.3, start + t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + t + d);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start + t);
        osc.stop(start + t + d + 0.02);
      });
      setTimeout(() => ctx.close(), 1500);
    } catch {
      // ignore
    }
  };

  const topWarning = (status?.warnings ?? []).find((w) => !dismissed[w.id]) ?? null;
  const lastPlayedRef = useRef<string | null>(null);
  useEffect(() => {
    if (topWarning && lastPlayedRef.current !== topWarning.id) {
      lastPlayedRef.current = topWarning.id;
      playTone("warning");
    }
    if (!topWarning) lastPlayedRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topWarning?.id]);



  const tokenRef = useRef<{ token: string; exp: number } | null>(null);
  const getToken = async () => {
    const cached = tokenRef.current;
    if (cached && cached.exp > Date.now() + 5000) return cached.token;
    const r = await fetch("/api/token", { credentials: "same-origin" });
    const body = (await r.json().catch(() => ({}))) as { token?: string; error?: string };
    if (!r.ok || !body.token) throw new Error(body.error || "Token service unavailable");
    const { token } = body;
    tokenRef.current = { token, exp: Date.now() + 110_000 };
    return token;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!/^[0-9]{3,20}$/.test(trimmed)) {
      setError("Enter a valid numeric Telegram user ID");
      setResult(null);
      playTone("error");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/lookup?query=${encodeURIComponent(trimmed)}`, {
        headers: { "x-api-token": token },
        credentials: "same-origin",
      });
      const data = (await res.json()) as LookupResult & { blocked?: boolean };
      if (res.status === 403 && data.blocked) {
        const s = await fetch("/api/public/status").then((r) => r.json());
        setStatus(s);
        playTone("error");
        return;
      }
      if (res.status === 429) {
        setError("Too many requests. Please slow down.");
        playTone("error");
        return;
      }
      if (!res.ok || data.success === false || !data.number) {
        setError(data.error || "No result found for this Telegram ID");
        playTone("error");
      } else {
        setResult(data);
        playTone("success");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Network error. Please try again.";
      setError(message.includes("SESSION_SECRET") ? "Server setup missing: add SESSION_SECRET in Vercel and redeploy." : message);
      playTone("error");
    } finally {
      setLoading(false);
    }
  };

  // Block screen: full takeover when banned.
  if (status?.blocked) {
    return (
      <div className="min-h-screen bg-[#17212b] text-[#e4ecf3] flex items-center justify-center px-5">
        <div className="max-w-lg rounded-2xl border border-red-500/30 bg-red-500/10 p-10 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20 text-3xl">
            ⛔
          </div>
          <h1 className="text-2xl font-bold text-red-300">You have been blocked</h1>
          <p className="mt-3 text-sm text-[#e4ecf3]/80">
            {status.blocked.reason || "Your access to this service has been revoked by an administrator."}
          </p>
          <p className="mt-6 text-[11px] text-[#8ea3b8]">
            IP: <span className="font-mono">{status.ip}</span>
            <br />
            Since: {new Date(status.blocked.since).toLocaleString()}
          </p>
        </div>
      </div>
    );
  }

  // Maintenance takeover when upstream API is down.
  if (health && !health.ok) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#17212b] text-[#e4ecf3] flex items-center justify-center px-5">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="aurora-layer aurora-1" />
          <div className="aurora-layer aurora-2" />
        </div>
        <div className="relative z-10 max-w-lg w-full rounded-3xl border border-amber-400/30 bg-[#232e3c]/80 backdrop-blur-xl p-8 sm:p-10 text-center shadow-[0_20px_60px_-15px_rgba(251,191,36,0.35)] animate-pop-in">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/30 to-orange-500/20 text-3xl animate-glow-pulse">
            🛠️
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 border border-amber-400/30 px-3 py-1 text-[10px] uppercase tracking-widest text-amber-300 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            Under Maintenance
          </div>
          <h1 className="mt-4 text-2xl sm:text-3xl font-bold bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
            We&apos;ll be right back
          </h1>
          <p className="mt-3 text-sm text-[#e4ecf3]/80 leading-relaxed">
            Our lookup service is temporarily unavailable. We&apos;re working on it — please try again shortly.
          </p>
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] px-5 py-3 text-sm font-semibold text-white transition-all smooth-tap shadow-lg shadow-[#5865F2]/30"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M20.317 4.369A19.79 19.79 0 0016.558 3.2a.075.075 0 00-.079.037c-.34.6-.717 1.385-.98 2.005a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.995-2.005.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.045-.32 13.579.099 18.057a.083.083 0 00.031.056 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.105 13.1 13.1 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.371-.291a.074.074 0 01.077-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.009c.12.099.245.198.372.292a.077.077 0 01-.006.127 12.3 12.3 0 01-1.873.891.077.077 0 00-.041.106c.36.699.772 1.364 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.055c.5-5.177-.838-9.674-3.548-13.66a.06.06 0 00-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.956 2.419-2.157 2.419zm7.974 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.946 2.419-2.157 2.419z" />
            </svg>
            Contact us on Discord
          </a>
          <p className="mt-5 text-[11px] text-[#8ea3b8]">
            Status: <span className="text-amber-300 font-mono">{health.status}</span>
            {" · "}
            Last check: {new Date(health.checkedAt).toLocaleTimeString()}
          </p>
        </div>
      </div>
    );
  }


  return (
    <div className="relative min-h-screen overflow-hidden bg-[#17212b] text-[#e4ecf3]">

      {/* Cinematic video-like background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Moving aurora gradient layers */}
        <div className="aurora-layer aurora-1" />
        <div className="aurora-layer aurora-2" />

        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Drifting particles */}
        {Array.from({ length: 14 }).map((_, i) => {
          const left = (i * 7.3) % 100;
          const duration = 12 + ((i * 3) % 14);
          const delay = (i * 1.7) % 12;
          const size = 2 + (i % 4);
          return (
            <span
              key={i}
              className="particle"
              style={{
                left: `${left}%`,
                width: `${size}px`,
                height: `${size}px`,
                animationDuration: `${duration}s`,
                animationDelay: `-${delay}s`,
                opacity: 0.4 + (i % 3) * 0.15,
              }}
            />
          );
        })}

        {/* Sweeping scan line */}
        <div className="scanline" style={{ animationDelay: "0s" }} />
        <div className="scanline" style={{ animationDelay: "-4s", opacity: 0.6 }} />

        {/* Vignette + grain */}
        <div className="grain-overlay" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      </div>


      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-6 sm:px-5 sm:py-10">
        {/* Header */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 animate-rise">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2aabee] to-[#229ed9] shadow-lg shadow-[#2aabee]/30 animate-glow-pulse">
              <PaperPlaneIcon />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base sm:text-lg font-semibold tracking-tight">TG Lookup</h1>
              <p className="truncate text-[11px] sm:text-xs text-[#8ea3b8]">Telegram Number OSINT</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/admin"
              className="smooth-tap rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-[#8ea3b8] transition hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              Admin
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2aabee]/30 bg-[#2aabee]/10 px-3 py-1 text-[11px] font-medium text-[#7ac8f5]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4ade80]" />
              LIVE
            </span>
          </div>
        </header>


        {/* Warning popup (full-screen) */}
        {topWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-5 animate-in fade-in duration-300">
            {/* backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
            {/* pulsing aura */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-500/20 blur-[140px] animate-pulse" />
            </div>

            <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-yellow-400/40 bg-gradient-to-br from-[#2a2416] via-[#231d0f] to-[#1a1508] p-8 shadow-2xl shadow-yellow-500/20 animate-in zoom-in-95 slide-in-from-bottom-4 duration-500">
              {/* top accent */}
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent" />

              <button
                onClick={() =>
                  setDismissed((d) => ({ ...d, [topWarning.id]: true }))
                }
                aria-label="Close"
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-yellow-100/80 transition hover:rotate-90 hover:border-yellow-400/50 hover:bg-yellow-500/20 hover:text-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 6L18 18M6 18L18 6"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="relative mb-5">
                  <div className="absolute inset-0 animate-ping rounded-full bg-yellow-400/30" />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 shadow-lg shadow-yellow-500/50">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 2L1 21h22L12 2zm0 6l7.5 13h-15L12 8zm-1 4v4h2v-4h-2zm0 5v2h2v-2h-2z"
                        fill="#1a1508"
                      />
                    </svg>
                  </div>
                </div>

                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
                  Message from Admin
                </div>

                <h3 className="mt-2 text-2xl font-bold tracking-tight text-yellow-50 sm:text-3xl">
                  Attention Required
                </h3>

                <div className="mt-5 w-full rounded-2xl border border-yellow-400/20 bg-black/30 px-5 py-4 text-left">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-yellow-50/95">
                    {topWarning.message}
                  </p>
                </div>

                <div className="mt-4 text-[11px] text-yellow-200/50">
                  Sent {new Date(topWarning.created_at).toLocaleString()}
                </div>

                <button
                  onClick={() =>
                    setDismissed((d) => ({ ...d, [topWarning.id]: true }))
                  }
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 px-8 py-3 text-sm font-semibold text-[#1a1508] shadow-lg shadow-yellow-500/40 transition hover:shadow-yellow-500/60 hover:brightness-110"
                >
                  I understand
                </button>
              </div>
            </div>
          </div>
        )}




        {/* Hero */}
        <section className="mt-10 sm:mt-14 text-center animate-rise" style={{ animationDelay: "0.1s" }}>
          <div className="mx-auto mb-5 sm:mb-6 inline-flex items-center gap-2 rounded-full border border-white/5 bg-white/[0.03] px-3 py-1 text-[11px] sm:text-xs text-[#8ea3b8]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4ade80]" />
            Powered by arjunnn
          </div>
          <h2 className="text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
            Reveal the number behind
            <br />
            any{" "}
            <span className="bg-gradient-to-r from-[#2aabee] via-[#7ac8f5] to-[#2aabee] bg-clip-text text-transparent animate-gradient-text">
              Telegram ID
            </span>
          </h2>
          <p className="mx-auto mt-3 sm:mt-4 max-w-lg text-[13px] sm:text-base text-[#8ea3b8] px-2">
            Paste a numeric Telegram user ID below to fetch the associated phone
            number, country and network details.
          </p>
        </section>

        {/* Chat-style form */}
        <form onSubmit={onSubmit} className="mx-auto mt-8 sm:mt-10 w-full max-w-xl animate-rise" style={{ animationDelay: "0.2s" }}>
          <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-[#232e3c] p-2 shadow-2xl shadow-black/40 transition-all duration-300 focus-within:border-[#2aabee]/60 focus-within:shadow-[#2aabee]/20 focus-within:scale-[1.01]">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Enter Telegram user ID"
              value={query}
              onChange={(e) => setQuery(e.target.value.replace(/[^0-9]/g, ""))}
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm sm:text-base text-white placeholder:text-[#6b7d91] focus:outline-none"
              maxLength={20}
            />
            <button
              type="submit"
              disabled={loading || !query}
              className="group smooth-tap inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2aabee] to-[#229ed9] text-white shadow-lg shadow-[#2aabee]/30 transition-all duration-300 hover:shadow-[#2aabee]/60 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:scale-100"
              aria-label="Lookup"
            >
              {loading ? <SpinnerIcon /> : <SendIcon />}
            </button>
          </div>
          {error && (
            <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-xs text-red-300 animate-pop-in">
              {error}
            </p>
          )}
          {loading && !error && (
            <div className="mt-4 flex justify-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#2aabee] animate-typing-dot" style={{ animationDelay: "0s" }} />
              <span className="h-2 w-2 rounded-full bg-[#2aabee] animate-typing-dot" style={{ animationDelay: "0.15s" }} />
              <span className="h-2 w-2 rounded-full bg-[#2aabee] animate-typing-dot" style={{ animationDelay: "0.3s" }} />
            </div>
          )}
        </form>


        {/* Result */}
        <section className="mx-auto mt-6 sm:mt-8 w-full max-w-xl flex-1">
          {result && (
            <div className="animate-bubble-in">
              {/* Message bubble from "bot" */}
              <div className="flex items-start gap-2 sm:gap-3">
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2aabee] to-[#229ed9] shadow-lg shadow-[#2aabee]/30">
                  <PaperPlaneIcon small />
                </div>
                <div className="relative min-w-0 max-w-full flex-1 rounded-2xl rounded-tl-md bg-[#232e3c] px-4 py-4 sm:px-5 shadow-lg">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#7ac8f5]">
                      OSINT Bot
                    </span>
                    {result.cached && (
                      <span className="rounded-full bg-[#2aabee]/15 px-2 py-0.5 text-[10px] font-medium text-[#7ac8f5]">
                        cached
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Field
                      label="Phone Number"
                      value={
                        result.number
                          ? `${result.country_code ?? ""} ${result.number}`.trim()
                          : "—"
                      }
                      highlight
                    />
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      <Field label="Country" value={result.country ?? "—"} />
                      <Field label="Country Code" value={result.country_code ?? "—"} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      <Field label="Telegram ID" value={result.tg_id ?? "—"} />
                      <Field label="Response" value={result.response_time ?? "—"} />
                    </div>
                  </div>


                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3 text-[10px] text-[#6b7d91]">
                    <span className="truncate">{now} · IP: {ip}</span>
                    <span className="shrink-0">@arjunnn021</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!result && !error && !loading && (
            <div className="mt-4 text-center text-xs text-[#6b7d91] animate-rise" style={{ animationDelay: "0.3s" }}>
              Results will appear here as a chat message.
            </div>
          )}
        </section>

        <footer className="mt-8 sm:mt-10 pb-4 text-center text-[11px] text-[#6b7d91]">
          Data provided by arjunnn · For educational use only
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-[#17212b]/60 px-3 py-2 transition hover:bg-[#17212b]/90">
      <div className="text-[10px] uppercase tracking-wider text-[#6b7d91]">{label}</div>
      <div
        className={
          highlight
            ? "mt-0.5 font-mono text-base sm:text-lg font-semibold text-[#7ac8f5] break-all"
            : "mt-0.5 font-mono text-xs sm:text-sm text-white break-all"
        }
      >
        {value}
      </div>
    </div>
  );
}


function PaperPlaneIcon({ small = false }: { small?: boolean }) {
  const size = small ? 16 : 20;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M21.5 3.5L2.5 10.5c-.7.3-.7 1.3 0 1.5l4.5 1.5 2 6c.2.7 1.1.8 1.5.2l2.5-3.5 5 4c.5.4 1.3.1 1.4-.5l3-14c.2-.9-.7-1.6-1.4-1.2z"
        fill="white"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className="transition group-hover:translate-x-0.5"
    >
      <path
        d="M3 12L21 4L13 21L11 13L3 12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="currentColor"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="animate-spin" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
