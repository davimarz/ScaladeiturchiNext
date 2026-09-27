import "server-only";
import { getAmazonConfig } from "./config";

type CachedToken = { value: string; expiresAt: number };
let cached: CachedToken | null = null;

function tokenEndpointForVersion(version: string) {
  if (version.startsWith("3.1")) return "https://api.amazon.com/auth/o2/token";
  if (version.startsWith("3.2")) return "https://api.amazon.co.uk/auth/o2/token";
  if (version.startsWith("3.3")) return "https://api.amazon.co.jp/auth/o2/token";
  throw new Error(`Unsupported Amazon credential version: ${version}`);
}

export async function getAmazonAccessToken() {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.value;

  const config = getAmazonConfig();
  const response = await fetch(tokenEndpointForVersion(config.credentialVersion), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: config.credentialId,
      client_secret: config.credentialSecret,
      scope: "creatorsapi::default",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Amazon OAuth failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Amazon OAuth response has no access token");

  cached = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(60, data.expires_in ?? 3600) * 1000,
  };

  return cached.value;
}
