import { createFileRoute } from "@tanstack/react-router";

// Public health check for the upstream OSINT API. Cached briefly to avoid abuse.
let cache: { at: number; payload: HealthPayload } | null = null;
const CACHE_MS = 15_000;

type HealthPayload = {
  ok: boolean;
  status: "operational" | "degraded" | "down";
  latencyMs: number | null;
  checkedAt: string;
  error?: string;
};

const HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        if (cache && Date.now() - cache.at < CACHE_MS) {
          return new Response(JSON.stringify(cache.payload), { headers: HEADERS });
        }

        const started = Date.now();
        let payload: HealthPayload;
        try {
          const ctrl = new AbortController();
          const timeout = setTimeout(() => ctrl.abort(), 6000);
          // Ping with a harmless probe id — we only care that the upstream responds.
          const res = await fetch(
            "https://rootx-osint.in/?type=tg_num&key=axn_star&query=1",
            { signal: ctrl.signal, headers: { "user-agent": "healthcheck/1.0" } },
          );
          clearTimeout(timeout);
          const latencyMs = Date.now() - started;
          const text = await res.text();
          const ok = res.ok && text.length > 0 && !/expired|invalid key|unauthorized/i.test(text);
          payload = {
            ok,
            status: ok ? (latencyMs > 3000 ? "degraded" : "operational") : "down",
            latencyMs,
            checkedAt: new Date().toISOString(),
            error: ok ? undefined : `Upstream returned ${res.status}`,
          };
        } catch (e) {
          payload = {
            ok: false,
            status: "down",
            latencyMs: null,
            checkedAt: new Date().toISOString(),
            error: e instanceof Error ? e.message : "Unreachable",
          };
        }

        cache = { at: Date.now(), payload };
        return new Response(JSON.stringify(payload), { headers: HEADERS });
      },
    },
  },
});
