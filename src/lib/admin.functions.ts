import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const adminListLogs = createServerFn({ method: "POST" })
  .inputValidator((d: { limit?: number; search?: string }) =>
    z
      .object({
        limit: z.number().min(1).max(500).optional(),
        search: z.string().max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdminSession } = await import("@/lib/admin-gate.server");
    await requireAdminSession();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("search_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.search) q = q.or(`ip.ilike.%${data.search}%,tg_id.ilike.%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminListBlocks = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdminSession } = await import("@/lib/admin-gate.server");
  await requireAdminSession();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("blocked_ips")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const adminBlockIp = createServerFn({ method: "POST" })
  .inputValidator((d: { ip: string; reason?: string }) =>
    z.object({ ip: z.string().min(3).max(64), reason: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdminSession } = await import("@/lib/admin-gate.server");
    await requireAdminSession();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("blocked_ips")
      .upsert({ ip: data.ip, reason: data.reason ?? null }, { onConflict: "ip" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUnblockIp = createServerFn({ method: "POST" })
  .inputValidator((d: { ip: string }) => z.object({ ip: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdminSession } = await import("@/lib/admin-gate.server");
    await requireAdminSession();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("blocked_ips").delete().eq("ip", data.ip);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListWarnings = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdminSession } = await import("@/lib/admin-gate.server");
  await requireAdminSession();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("active_warnings")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const adminSendWarning = createServerFn({ method: "POST" })
  .inputValidator((d: { ip: string; message: string }) =>
    z.object({ ip: z.string().min(3).max(64), message: z.string().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireAdminSession } = await import("@/lib/admin-gate.server");
    await requireAdminSession();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("active_warnings")
      .insert({ ip: data.ip, message: data.message });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminClearWarning = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { requireAdminSession } = await import("@/lib/admin-gate.server");
    await requireAdminSession();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("active_warnings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminStats = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdminSession } = await import("@/lib/admin-gate.server");
  await requireAdminSession();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [logs, uniques, blocks, warnings] = await Promise.all([
    supabaseAdmin.from("search_logs").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("search_logs").select("ip"),
    supabaseAdmin.from("blocked_ips").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("active_warnings").select("*", { count: "exact", head: true }),
  ]);

  const firstError = logs.error ?? uniques.error ?? blocks.error ?? warnings.error;
  if (firstError) throw new Error(firstError.message);

  const uniqueIps = new Set((uniques.data ?? []).map((r) => r.ip)).size;
  return {
    totalSearches: logs.count ?? 0,
    uniqueVisitors: uniqueIps,
    blockedCount: blocks.count ?? 0,
    warningsCount: warnings.count ?? 0,
  };
});
