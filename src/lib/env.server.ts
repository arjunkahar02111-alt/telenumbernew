export class AppConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[], message?: string) {
    super(
      message ??
        `Missing server environment variable(s): ${missing.join(", ")}. Add them in your hosting provider settings and redeploy.`,
    );
    this.name = "AppConfigError";
    this.missing = missing;
  }
}

export function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new AppConfigError([name]);
  return value;
}

export function getSessionSecret() {
  const value =
    process.env.SESSION_SECRET ||
    process.env.APP_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_DB_URL;

  if (!value) {
    throw new AppConfigError(
      ["SESSION_SECRET"],
      "Missing SESSION_SECRET. Add a long random SESSION_SECRET in Vercel Environment Variables and redeploy.",
    );
  }

  return value;
}

export function isAppConfigError(error: unknown): error is AppConfigError {
  return error instanceof Error && error.name === "AppConfigError";
}