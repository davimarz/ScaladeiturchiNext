import "server-only";
import { getServerEnv } from "../env";

const BUCKET = "product-images";

function storageHeaders(contentType: string) {
  const env = getServerEnv();
  const apiKey = env.SUPABASE_SECRET_KEY;

  const headers: Record<string, string> = {
    apikey: apiKey,
    "content-type": contentType,
    "x-upsert": "true",
  };

  if (!apiKey.startsWith("sb_secret_")) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

export async function uploadProductImage(file: File, key: string) {
  const env = getServerEnv();
  const ext =
    file.type === "image/png" ? "png" :
    file.type === "image/webp" ? "webp" :
    "jpg";

  const objectPath = `${key}.${ext}`;
  const bytes = await file.arrayBuffer();

  const response = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(objectPath)}`,
    {
      method: "POST",
      headers: storageHeaders(file.type || "image/jpeg"),
      body: bytes,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase Storage upload failed: ${response.status} ${body.slice(0, 300)}`);
  }

  return `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(objectPath)}`;
}
