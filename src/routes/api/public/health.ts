import { createFileRoute } from "@tanstack/react-router";

// Public health check for both the upstream OSINT API and backend database.
let cache: { at: number; payload: HealthPayload } | null = null;
const CACHE_MS = 15_000;

type HealthPart = {
  ok: boolean;
  latencyMs: number | null;
  error?: string;
};

type HealthPayload = {
  ok: boolean;
  status: "operational" | "degraded" | "down";
  latencyMs: number | null;
  checkedAt: string;
  error?: string;
  upstream: HealthPart;
  database: HealthPart;
};

const HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

async function checkUpstream(): Promise<HealthPart> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch("https://rootx-osint.in/?type=tg_num&key=axn_star&query=1", {
      signal: ctrl.signal,
      headers: { "user-agent": "healthcheck/1.0" },
    });
    const latencyMs = Date.now() - started;
    const text = await res.text();
    const ok = res.ok && text.length > 0 && !/expired|invalid key|unauthorized/i.test(text);
    return { ok, latencyMs, error: ok ? undefined : `Upstream returned ${res.status}` };
  } catch (e) {
    return {
      ok: false,
      latencyMs: null,
      error: e instanceof Error ? e.message : "Upstream unreachable",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkDatabase(): Promise<HealthPart> {
  const started = Date.now();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("search_logs")
      .select("id", { count: "exact", head: true })
      .limit(1);
    const latencyMs = Date.now() - started;
    if (error) {
      return {
        ok: false,
        latencyMs,
        error: error.code ? `Database ${error.code}` : "Database unavailable",
      };
    }
    return { ok: true, latencyMs };
  } catch (e) {
    return {
      ok: false,
      latencyMs: null,
      error: e instanceof Error ? e.message : "Database unavailable",
    };
  }
}

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        if (cache && Date.now() - cache.at < CACHE_MS) {
          return new Response(JSON.stringify(cache.payload), { headers: HEADERS });
        }

        const [upstream, database] = await Promise.all([checkUpstream(), checkDatabase()]);
        const ok = upstream.ok && database.ok;
        const latencyMs = Math.max(upstream.latencyMs ?? 0, database.latencyMs ?? 0) || null;
        const status = !ok ? "down" : latencyMs && latencyMs > 3000 ? "degraded" : "operational";
        const error = ok
          ? undefined
          : [
              upstream.ok ? null : upstream.error ?? "Upstream unavailable",
              database.ok ? null : database.error ?? "Database unavailable",
            ]
              .filter(Boolean)
              .join(" · ");
        const payload: HealthPayload = {
          ok,
          status,
          latencyMs,
          checkedAt: new Date().toISOString(),
          error,
          upstream,
          database,
        };

        cache = { at: Date.now(), payload };
        return new Response(JSON.stringify(payload), { headers: HEADERS });
      },
    },
  },
});
