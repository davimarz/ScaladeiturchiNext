import type { NextRequest } from "next/server";

export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    // Next.js may normalize request.nextUrl to an internal host. Use the HTTP Host
    // sent to this deployment, not a client-supplied forwarded host.
    const expected = new URL(request.nextUrl);
    expected.host = request.headers.get("host") || expected.host;
    return origin === expected.origin;
  } catch { return false; }
}
