import "server-only";
import { getAmazonConfig } from "./config";

type CachedToken = { value: string; expiresAt: number };
let cached: CachedToken | null = null;

export async function getAmazonAccessToken() {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.value;

  const config = getAmazonConfig();
  const response = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.credentialId,
      client_secret: config.credentialSecret,
    }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`Amazon OAuth failed: ${response.status}`);
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Amazon OAuth response has no access token");

  cached = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(60, data.expires_in ?? 3600) * 1000,
  };
  return cached.value;
}
