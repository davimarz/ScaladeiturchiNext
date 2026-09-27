import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "sdt_admin";
const TTL_SECONDS = 60 * 60 * 8;

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value) throw new Error("Missing ADMIN_SESSION_SECRET");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createAdminSessionValue() {
  const expires = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = String(expires);
  return `${payload}.${signature(payload)}`;
}

export function verifyAdminSessionValue(value?: string) {
  if (!value) return false;
  const [expiresRaw, sig] = value.split(".");
  if (!expiresRaw || !sig) return false;
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const expected = signature(expiresRaw);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function adminPasswordMatches(value: string) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error("Missing ADMIN_PASSWORD");
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const adminCookie = {
  name: COOKIE_NAME,
  maxAge: TTL_SECONDS,
};
