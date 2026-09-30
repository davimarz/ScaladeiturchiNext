import { isSameOrigin } from "../../../../lib/admin-request";
import { NextRequest, NextResponse } from "next/server";
import { adminCookie } from "../../../../lib/admin-auth";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set(adminCookie.name, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
