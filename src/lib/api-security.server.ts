import { createHmac, timingSafeEqual } from "node:crypto";
import { getSessionSecret } from "./env.server";

const BOT_UA = /(bot|crawler|spider|scrapy|curl|wget|python-requests|httpx|axios\/|go-http|java\/|php|libwww|okhttp|postman|insomnia|headless)/i;

function secret() {
  return getSessionSecret();
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function fromB64url(s: string) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function issueToken(ip: string, ttlMs = 2 * 60 * 1000) {
  const exp = Date.now() + ttlMs;
  const payload = `${ip}|${exp}`;
  const sig = createHmac("sha256", secret()).update(payload).digest();
  return `${b64url(Buffer.from(payload))}.${b64url(sig)}`;
}

export function verifyToken(token: string | null, ip: string): boolean {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const [p, s] = token.split(".");
  try {
    const payload = fromB64url(p).toString("utf8");
    const [tokenIp, expStr] = payload.split("|");
    if (tokenIp !== ip) return false;
    const exp = Number(expStr);
    if (!exp || Date.now() > exp) return false;
    const expected = createHmac("sha256", secret()).update(payload).digest();
    const given = fromB64url(s);
    if (given.length !== expected.length) return false;
    return timingSafeEqual(given, expected);
  } catch {
    return false;
  }
}

export function checkOrigin(request: Request): boolean {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const src = origin || referer;
  if (!src) return false;
  try {
    const u = new URL(src);
    if (host && u.host === host) return true;
    // Allow Lovable preview/published/editor domains (iframe host can differ from worker host).
    return /(^|\.)lovableproject\.com$/.test(u.hostname) ||
      /(^|\.)lovable\.app$/.test(u.hostname) ||
      /(^|\.)lovable\.dev$/.test(u.hostname);
  } catch {
    return false;
  }
}

export function isBotUA(ua: string | null): boolean {
  if (!ua || ua.length < 8) return true;
  return BOT_UA.test(ua);
}
