import "server-only";
import { getServerEnv } from "../env";

function headers(extra?: HeadersInit) {
  const env = getServerEnv();
  return {
    apikey: env.SUPABASE_SECRET_KEY,
    authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
    "content-type": "application/json",
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
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase REST failed: ${response.status} ${body.slice(0, 300)}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
