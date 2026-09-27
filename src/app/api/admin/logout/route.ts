import { NextRequest, NextResponse } from "next/server";
import { adminCookie } from "../../../../lib/admin-auth";

export async function POST(request: NextRequest) {
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
