import { createServerFn } from "@tanstack/react-start";

export const unlockAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => {
    if (typeof data?.password !== "string") throw new Error("Invalid input");
    return { password: data.password };
  })
  .handler(async ({ data }) => {
    const { getGateSession, match } = await import("./admin-gate.server");
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) throw new Error("ADMIN_PASSWORD is not set");
    if (!match(data.password.trim(), expected.trim())) return { ok: false as const };
    const session = await getGateSession();
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

export const checkAdminSession = createServerFn({ method: "GET" }).handler(async () => {
  const { getGateSession } = await import("./admin-gate.server");
  const session = await getGateSession();
  return { unlocked: Boolean(session.data.unlocked) };
});

export const lockAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const { getGateSession } = await import("./admin-gate.server");
  const session = await getGateSession();
  await session.clear();
  return { ok: true as const };
});
