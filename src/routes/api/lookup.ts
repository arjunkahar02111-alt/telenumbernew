import { createFileRoute } from "@tanstack/react-router";

const SECURE_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store, no-cache, must-revalidate",
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

type DatabaseError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function deny(status: number, message: string) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: SECURE_HEADERS,
  });
}

function logDatabaseIssue(action: string, error: DatabaseError) {
  console.warn(`[lookup] Database failed while trying to ${action}; continuing lookup`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

export const Route = createFileRoute("/api/lookup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ getClientIp }, { checkOrigin, isBotUA, verifyToken }] = await Promise.all([
          import("@/lib/ip.server"),
          import("@/lib/api-security.server"),
        ]);
        const userAgent = request.headers.get("user-agent") || "";

        // Layer 1: same-origin only + block bot UAs
        if (!checkOrigin(request)) return deny(403, "Forbidden");
        if (isBotUA(userAgent)) return deny(403, "Forbidden");

        // Layer 2: signed short-lived token bound to caller IP
        const ip = getClientIp(request);
        const token =
          request.headers.get("x-api-token") ||
          new URL(request.url).searchParams.get("t");
        if (!verifyToken(token, ip)) return deny(403, "Invalid or expired session");

        const url = new URL(request.url);
        const query = url.searchParams.get("query")?.trim();
        if (!query) return deny(400, "Missing query");
        if (!/^[0-9]{3,20}$/.test(query)) return deny(400, "Query must be a numeric Telegram ID");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Block check
        const { data: blocked, error: blockError } = await supabaseAdmin
          .from("blocked_ips")
          .select("ip, reason")
          .eq("ip", ip)
          .maybeSingle();

        if (blockError) logDatabaseIssue("check blocked IPs", blockError);

        if (!blockError && blocked) {
          return new Response(
            JSON.stringify({
              success: false,
              blocked: true,
              error: blocked.reason || "You are blocked from using this service.",
            }),
            { status: 403, headers: SECURE_HEADERS },
          );
        }

        // Layer 3: rate limit — max 10 requests / minute per IP
        const since = new Date(Date.now() - 60_000).toISOString();
        const { count: recentCount, error: rateLimitError } = await supabaseAdmin
          .from("search_logs")
          .select("*", { count: "exact", head: true })
          .eq("ip", ip)
          .gte("created_at", since);

        if (rateLimitError) logDatabaseIssue("check rate limits", rateLimitError);

        if (!rateLimitError && (recentCount ?? 0) >= 10) {
          return new Response(
            JSON.stringify({ success: false, error: "Rate limit exceeded. Slow down." }),
            { status: 429, headers: SECURE_HEADERS },
          );
        }

        const upstream = `https://rootx-osint.in/?type=tg_num&key=axn_star&query=${encodeURIComponent(query)}`;
        let payload: Record<string, unknown> = {};
        let status = 200;
        try {
          const res = await fetch(upstream, { headers: { Accept: "application/json" } });
          status = res.status;
          const text = await res.text();
          try {
            payload = JSON.parse(text);
          } catch {
            payload = { success: false, error: text };
          }
        } catch (err) {
          payload = { success: false, error: err instanceof Error ? err.message : "Upstream error" };
          status = 502;
        }

        // Normalize upstream fields — API may return short keys (n/c/cc) or full keys.
        const raw = payload as Record<string, unknown>;
        const phone = (raw.number as string) ?? (raw.n as string) ?? null;
        const country = (raw.country as string) ?? (raw.c as string) ?? null;
        const countryCode = (raw.country_code as string) ?? (raw.cc as string) ?? null;
        const found = Boolean(raw.success !== false && phone);

        // Strip upstream leakage (keys, req counts, developer handle, expiry) and return a clean payload.
        const clean = found
          ? {
              success: true,
              number: phone,
              country,
              country_code: countryCode,
              tg_id: query,
            }
          : {
              success: false,
              error: (raw.error as string) || "No result found for this Telegram ID",
            };

        const { error: logError } = await supabaseAdmin.from("search_logs").insert({
          ip,
          tg_id: query,
          found,
          phone,
          country,
          country_code: countryCode,
          user_agent: userAgent,
        });

        if (logError) logDatabaseIssue("save the search log", logError);

        // Fire-and-forget Discord webhook
        const webhook = process.env.DISCORD_WEBHOOK_URL;
        if (webhook) {
          const embed = {
            title: found ? "✅ Telegram Lookup — Found" : "❌ Telegram Lookup — Not Found",
            color: found ? 0x2ecc71 : 0xe74c3c,
            timestamp: new Date().toISOString(),
            fields: [
              { name: "TG ID", value: `\`${query}\``, inline: true },
              { name: "IP", value: `\`${ip}\``, inline: true },
              { name: "Found", value: found ? "Yes" : "No", inline: true },
              { name: "Phone", value: phone ? `\`${countryCode ?? ""} ${phone}\`` : "—", inline: true },
              { name: "Country", value: country ?? "—", inline: true },
              { name: "User Agent", value: (userAgent || "—").slice(0, 300) },
            ],
          };
          fetch(webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ embeds: [embed] }),
          }).catch(() => {});
        }

        return new Response(JSON.stringify(clean), { status, headers: SECURE_HEADERS });

      },
    },
  },
});
