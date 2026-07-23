import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { checkAdminSession, lockAdmin } from "@/lib/admin-gate.functions";
import {
  adminListLogs,
  adminListBlocks,
  adminListWarnings,
  adminBlockIp,
  adminUnblockIp,
  adminSendWarning,
  adminClearWarning,
  adminStats,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin Panel — TG Lookup" }] }),
  component: AdminPage,
});

type Log = {
  id: string;
  ip: string;
  tg_id: string;
  found: boolean;
  phone: string | null;
  country: string | null;
  country_code: string | null;
  user_agent: string | null;
  created_at: string;
};
type Block = { ip: string; reason: string | null; created_at: string };
type Warning = { id: string; ip: string; message: string; created_at: string };
type Stats = {
  totalSearches: number;
  uniqueVisitors: number;
  blockedCount: number;
  warningsCount: number;
};

function AdminPage() {
  const navigate = useNavigate();
  const check = useServerFn(checkAdminSession);
  const lock = useServerFn(lockAdmin);
  const listLogs = useServerFn(adminListLogs);
  const listBlocks = useServerFn(adminListBlocks);
  const listWarnings = useServerFn(adminListWarnings);
  const blockIp = useServerFn(adminBlockIp);
  const unblockIp = useServerFn(adminUnblockIp);
  const sendWarning = useServerFn(adminSendWarning);
  const clearWarning = useServerFn(adminClearWarning);
  const getStats = useServerFn(adminStats);

  const [ready, setReady] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<{ ok: boolean; status: string; latencyMs: number | null; checkedAt: string; error?: string } | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [tab, setTab] = useState<"logs" | "blocks" | "warnings">("logs");
  const searchRef = useRef(search);
  const refreshingRef = useRef(false);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setError(null);
    try {
      const currentSearch = searchRef.current.trim();
      const [l, b, w, s] = await Promise.all([
        listLogs({ data: { search: currentSearch || undefined } }),
        listBlocks(),
        listWarnings(),
        getStats(),
      ]);
      setLogs(l as Log[]);
      setBlocks(b as Block[]);
      setWarnings(w as Warning[]);
      setStats(s as Stats);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [getStats, listBlocks, listLogs, listWarnings]);

  const checkHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const r = await fetch("/api/public/health", { cache: "no-store" });
      const d = await r.json();
      setHealth(d);
    } catch {
      setHealth({ ok: false, status: "down", latencyMs: null, checkedAt: new Date().toISOString(), error: "Unreachable" });
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { unlocked } = await check();
      if (!unlocked) {
        navigate({ to: "/auth" });
        return;
      }
      setReady(true);
      await Promise.all([refresh(), checkHealth()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check, checkHealth, navigate, refresh]);

  useEffect(() => {
    if (!ready) return;
    const interval = window.setInterval(() => {
      void refresh();
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [ready, refresh]);


  const signOut = async () => {
    await lock();
    navigate({ to: "/auth" });
  };

  if (!ready) {
    return <div className="min-h-screen bg-[#17212b] text-[#e4ecf3] p-10">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-[#17212b] text-[#e4ecf3]">
      <header className="border-b border-white/5 bg-[#232e3c]/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Admin Control Panel</h1>
            <p className="text-xs text-[#8ea3b8]">Monitor and control the TG Lookup site</p>
          </div>
          <div className="flex gap-2">
            {lastUpdated && (
              <span className="hidden items-center text-[11px] text-[#8ea3b8] sm:flex">
                Updated {lastUpdated} · auto 10s
              </span>
            )}
            <button
              onClick={refresh}
              disabled={refreshing}
              className="rounded-lg bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button
              onClick={signOut}
              className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/30"
            >
              Lock
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {error && (
          <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        {stats && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Searches" value={stats.totalSearches} color="#2aabee" />
            <StatCard label="Unique Visitors" value={stats.uniqueVisitors} color="#4ade80" />
            <StatCard label="Blocked IPs" value={stats.blockedCount} color="#f87171" />
            <StatCard label="Active Warnings" value={stats.warningsCount} color="#fbbf24" />
          </div>
        )}

        <div className="mt-6 rounded-xl border border-white/5 bg-[#232e3c]/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`h-3 w-3 rounded-full ${
                  !health ? "bg-gray-500" :
                  health.status === "operational" ? "bg-green-400 shadow-[0_0_12px_#4ade80] animate-pulse" :
                  health.status === "degraded" ? "bg-yellow-400 shadow-[0_0_12px_#facc15] animate-pulse" :
                  "bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse"
                }`}
              />
              <div>
                <div className="text-sm font-semibold">
                  API Health · {health ? (
                    <span className={
                      health.status === "operational" ? "text-green-400" :
                      health.status === "degraded" ? "text-yellow-400" : "text-red-400"
                    }>{health.status.toUpperCase()}</span>
                  ) : <span className="text-[#8ea3b8]">checking…</span>}
                </div>
                <div className="text-[11px] text-[#8ea3b8]">
                  {health ? (
                    <>
                      Latency: <span className="font-mono">{health.latencyMs ?? "—"}ms</span>
                      {" · "}
                      Checked: {new Date(health.checkedAt).toLocaleTimeString()}
                      {health.error ? <> · <span className="text-red-300">{health.error}</span></> : null}
                    </>
                  ) : "Contacting upstream API…"}
                </div>
              </div>
            </div>
            <button
              onClick={checkHealth}
              disabled={healthLoading}
              className="rounded-lg bg-[#2aabee] px-3 py-1.5 text-xs font-medium hover:bg-[#2aabee]/90 disabled:opacity-50"
            >
              {healthLoading ? "Checking…" : "Recheck"}
            </button>
          </div>
        </div>



        <div className="mt-8 flex gap-1 border-b border-white/5">
          {(["logs", "blocks", "warnings"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize ${
                tab === t
                  ? "border-b-2 border-[#2aabee] text-white"
                  : "text-[#8ea3b8] hover:text-white"
              }`}
            >
              {t === "logs" ? "Search Logs" : t === "blocks" ? "Blocked IPs" : "Warnings"}
            </button>
          ))}
        </div>

        {tab === "logs" && (
          <div className="mt-6">
            <div className="mb-3 flex gap-2">
              <input
                placeholder="Filter by IP or TG ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 rounded-lg border border-white/5 bg-[#232e3c] px-3 py-2 text-sm outline-none focus:border-[#2aabee]/50"
              />
              <button
                onClick={refresh}
                className="rounded-lg bg-[#2aabee] px-4 py-2 text-sm font-medium"
              >
                Search
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-white/5">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#232e3c] text-[#8ea3b8]">
                  <tr>
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">IP</th>
                    <th className="px-3 py-2">TG ID</th>
                    <th className="px-3 py-2">Found</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Country</th>
                    <th className="px-3 py-2">User Agent</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-t border-white/5">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Date(l.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-mono">{l.ip}</td>
                      <td className="px-3 py-2 font-mono">{l.tg_id}</td>
                      <td className="px-3 py-2">
                        {l.found ? (
                          <span className="text-green-400">✓</span>
                        ) : (
                          <span className="text-red-400">✗</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {l.phone ? `${l.country_code ?? ""} ${l.phone}` : "—"}
                      </td>
                      <td className="px-3 py-2">{l.country ?? "—"}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate text-[#8ea3b8]">
                        {l.user_agent}
                      </td>
                      <td className="px-3 py-2">
                        <IpActions
                          ip={l.ip}
                          onBlock={async (reason) => {
                            await blockIp({ data: { ip: l.ip, reason } });
                            await refresh();
                          }}
                          onWarn={async (message) => {
                            await sendWarning({ data: { ip: l.ip, message } });
                            await refresh();
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-[#8ea3b8]">
                        {search.trim() ? "No logs match this filter." : "No searches yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "blocks" && (
          <div className="mt-6">
            <BlockForm
              onBlock={async (ip, reason) => {
                await blockIp({ data: { ip, reason } });
                await refresh();
              }}
            />
            <div className="mt-4 overflow-x-auto rounded-lg border border-white/5">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#232e3c] text-[#8ea3b8]">
                  <tr>
                    <th className="px-3 py-2">IP</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">Blocked at</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.map((b) => (
                    <tr key={b.ip} className="border-t border-white/5">
                      <td className="px-3 py-2 font-mono">{b.ip}</td>
                      <td className="px-3 py-2">{b.reason ?? "—"}</td>
                      <td className="px-3 py-2">{new Date(b.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={async () => {
                            await unblockIp({ data: { ip: b.ip } });
                            await refresh();
                          }}
                          className="rounded bg-green-500/20 px-2 py-1 text-green-300 hover:bg-green-500/30"
                        >
                          Unblock
                        </button>
                      </td>
                    </tr>
                  ))}
                  {blocks.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-[#8ea3b8]">
                        No blocked IPs.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "warnings" && (
          <div className="mt-6">
            <WarnForm
              onWarn={async (ip, message) => {
                await sendWarning({ data: { ip, message } });
                await refresh();
              }}
            />
            <div className="mt-4 overflow-x-auto rounded-lg border border-white/5">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#232e3c] text-[#8ea3b8]">
                  <tr>
                    <th className="px-3 py-2">IP</th>
                    <th className="px-3 py-2">Message</th>
                    <th className="px-3 py-2">Sent at</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {warnings.map((w) => (
                    <tr key={w.id} className="border-t border-white/5">
                      <td className="px-3 py-2 font-mono">{w.ip}</td>
                      <td className="px-3 py-2">{w.message}</td>
                      <td className="px-3 py-2">{new Date(w.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={async () => {
                            await clearWarning({ data: { id: w.id } });
                            await refresh();
                          }}
                          className="rounded bg-white/10 px-2 py-1 hover:bg-white/20"
                        >
                          Clear
                        </button>
                      </td>
                    </tr>
                  ))}
                  {warnings.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-[#8ea3b8]">
                        No warnings sent.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-[#232e3c] p-5">
      <div className="text-xs text-[#8ea3b8]">{label}</div>
      <div className="mt-1 text-3xl font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function IpActions({
  ip,
  onBlock,
  onWarn,
}: {
  ip: string;
  onBlock: (reason: string) => Promise<void>;
  onWarn: (msg: string) => Promise<void>;
}) {
  return (
    <div className="flex gap-1">
      <button
        onClick={async () => {
          const reason = prompt(`Reason for blocking ${ip}?`) ?? "";
          if (reason !== null) await onBlock(reason);
        }}
        className="rounded bg-red-500/20 px-2 py-1 text-red-300 hover:bg-red-500/30"
      >
        Block
      </button>
      <button
        onClick={async () => {
          const msg = prompt(`Warning message for ${ip}:`);
          if (msg) await onWarn(msg);
        }}
        className="rounded bg-yellow-500/20 px-2 py-1 text-yellow-300 hover:bg-yellow-500/30"
      >
        Warn
      </button>
    </div>
  );
}

function BlockForm({ onBlock }: { onBlock: (ip: string, reason: string) => Promise<void> }) {
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ip) return;
        await onBlock(ip, reason);
        setIp("");
        setReason("");
      }}
      className="flex flex-wrap gap-2"
    >
      <input
        placeholder="IP address"
        value={ip}
        onChange={(e) => setIp(e.target.value)}
        className="flex-1 min-w-[160px] rounded-lg border border-white/5 bg-[#232e3c] px-3 py-2 text-sm outline-none focus:border-[#2aabee]/50"
      />
      <input
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="flex-[2] min-w-[200px] rounded-lg border border-white/5 bg-[#232e3c] px-3 py-2 text-sm outline-none focus:border-[#2aabee]/50"
      />
      <button className="rounded-lg bg-red-500/80 px-4 py-2 text-sm font-medium hover:bg-red-500">
        Block IP
      </button>
    </form>
  );
}

function WarnForm({ onWarn }: { onWarn: (ip: string, msg: string) => Promise<void> }) {
  const [ip, setIp] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ip || !msg) return;
        await onWarn(ip, msg);
        setIp("");
        setMsg("");
      }}
      className="flex flex-wrap gap-2"
    >
      <input
        placeholder="IP address"
        value={ip}
        onChange={(e) => setIp(e.target.value)}
        className="flex-1 min-w-[160px] rounded-lg border border-white/5 bg-[#232e3c] px-3 py-2 text-sm outline-none focus:border-[#2aabee]/50"
      />
      <input
        placeholder="Warning message shown to visitor"
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        className="flex-[2] min-w-[200px] rounded-lg border border-white/5 bg-[#232e3c] px-3 py-2 text-sm outline-none focus:border-[#2aabee]/50"
      />
      <button className="rounded-lg bg-yellow-500/80 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-500">
        Send Warning
      </button>
    </form>
  );
}
