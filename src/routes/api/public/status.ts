import { createFileRoute } from "@tanstack/react-router";

// Public endpoint: current visitor's block + warning state for their IP.
export const Route = createFileRoute("/api/public/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getClientIp } = await import("@/lib/ip.server");
        const ip = getClientIp(request);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const [{ data: block }, { data: warnings }] = await Promise.all([
          supabaseAdmin
            .from("blocked_ips")
            .select("ip, reason, created_at")
            .eq("ip", ip)
            .maybeSingle(),
          supabaseAdmin
            .from("active_warnings")
            .select("id, message, created_at")
            .eq("ip", ip)
            .order("created_at", { ascending: false }),
        ]);

        return Response.json({
          ip,
          blocked: block
            ? { reason: block.reason, since: block.created_at }
            : null,
          warnings: warnings ?? [],
        });
      },
    },
  },
});
