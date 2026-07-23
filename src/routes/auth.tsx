import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { unlockAdmin } from "@/lib/admin-gate.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Admin Access — TG Lookup" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const unlock = useServerFn(unlockAdmin);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { ok } = await unlock({ data: { password } });
      if (ok) {
        navigate({ to: "/admin" });
      } else {
        setError("Incorrect password");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Try again.";
      setError(message.includes("SESSION_SECRET") ? "Server setup missing: add SESSION_SECRET in Vercel and redeploy." : message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#17212b] text-[#e4ecf3] flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 inline-block text-xs text-[#7ac8f5] hover:underline">
          ← back to site
        </Link>
        <div className="rounded-2xl border border-white/5 bg-[#232e3c] p-8 shadow-2xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#2aabee] to-[#229ed9] shadow-lg shadow-[#2aabee]/30 text-xl">
            🔒
          </div>
          <h1 className="text-center text-xl font-semibold">Admin Access</h1>
          <p className="mt-1 text-center text-xs text-[#8ea3b8]">
            Enter the secret password to open the control panel.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <input
              type="password"
              required
              autoFocus
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/5 bg-[#17212b] px-3 py-3 text-sm outline-none focus:border-[#2aabee]/50"
            />
            {error && (
              <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-xs text-red-300">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full rounded-lg bg-gradient-to-br from-[#2aabee] to-[#229ed9] px-4 py-2.5 text-sm font-medium shadow-lg shadow-[#2aabee]/30 disabled:opacity-50"
            >
              {loading ? "Unlocking…" : "Unlock"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
