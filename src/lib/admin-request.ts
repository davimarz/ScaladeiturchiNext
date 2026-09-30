import type { NextRequest } from "next/server";

export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return origin === request.nextUrl.origin && request.headers.get("sec-fetch-site") !== "cross-site";
}
