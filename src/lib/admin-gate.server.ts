import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { getSessionSecret } from "./env.server";

export type GateSession = { unlocked?: boolean };

export const sessionConfig = () => ({
  password: getSessionSecret(),
  name: "admin-gate",
  maxAge: 60 * 60 * 24 * 7,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    path: "/",
  },
});

export function match(input: string, expected: string) {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function getGateSession() {
  return useSession<GateSession>(sessionConfig());
}

export async function requireAdminSession() {
  const session = await getGateSession();
  if (!session.data.unlocked) {
    throw new Response("Unauthorized", { status: 401 });
  }
}
