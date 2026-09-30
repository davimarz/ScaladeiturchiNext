import "server-only";
import { getServerEnv } from "../env";

function headers(extra?: HeadersInit) {
  const env = getServerEnv();
  const apiKey = env.SUPABASE_SECRET_KEY;

  const baseHeaders: Record<string, string> = {
    apikey: apiKey,
    "content-type": "application/json",
  };

  if (!apiKey.startsWith("sb_secret_")) {
    baseHeaders.authorization = `Bearer ${apiKey}`;
  }

  return {
    ...baseHeaders,
    ...extra,
  };
}

export async function supabaseAdminFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const env = getServerEnv();
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: headers(init.headers),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase REST failed: ${response.status} ${body.slice(0, 300)}`);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text.trim()) return undefined as T;

  return JSON.parse(text) as T;
}
