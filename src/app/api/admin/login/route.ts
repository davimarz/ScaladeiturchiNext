import { NextRequest, NextResponse } from "next/server";
import { adminCookie, adminPasswordMatches, createAdminSessionValue } from "../../../../lib/admin-auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");

  if (!adminPasswordMatches(password)) {
    return NextResponse.redirect(new URL("/admin?error=1", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set(adminCookie.name, createAdminSessionValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: adminCookie.maxAge,
  });
  return response;
}
