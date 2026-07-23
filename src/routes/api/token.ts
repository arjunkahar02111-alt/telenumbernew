import { createFileRoute } from "@tanstack/react-router";

const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store, no-cache, must-revalidate",
  "x-robots-tag": "noindex, nofollow",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export const Route = createFileRoute("/api/token")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const [{ getClientIp }, { issueToken, checkOrigin }] = await Promise.all([
            import("@/lib/ip.server"),
            import("@/lib/api-security.server"),
          ]);

          if (!checkOrigin(request)) {
            return json(403, { success: false, error: "Forbidden" });
          }
          const ip = getClientIp(request);
          const token = issueToken(ip);
          return json(200, { token });
        } catch (error) {
          if (error instanceof Error && error.name === "AppConfigError") {
            return json(503, {
              success: false,
              error: error.message,
              missingEnv: "SESSION_SECRET",
            });
          }
          console.error(error);
          return json(500, { success: false, error: "Token service unavailable" });
        }
      },
    },
  },
});
