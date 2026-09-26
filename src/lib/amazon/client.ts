import "server-only";
import { getAmazonAccessToken } from "./oauth";
import { getAmazonConfig } from "./config";

const CREATORS_API_BASE = "https://creatorsapi.amazon";

export async function amazonRequest<T>(path: string, payload: unknown): Promise<T> {
  const [token, config] = await Promise.all([getAmazonAccessToken(), Promise.resolve(getAmazonConfig())]);
  const response = await fetch(`${CREATORS_API_BASE}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-marketplace": config.marketplace,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Amazon Creators API failed: ${response.status} ${body.slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}
