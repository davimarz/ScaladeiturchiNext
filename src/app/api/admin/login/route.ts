import { NextRequest, NextResponse } from "next/server";
import { adminCookie, adminPasswordMatches, createAdminSessionValue } from "../../../../lib/admin-auth";
import { consumeLoginAttempt } from "../../../../lib/admin-login-limit";
import { isSameOrigin } from "../../../../lib/admin-request";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  try {
    if (!await consumeLoginAttempt(request)) {
      return NextResponse.redirect(new URL("/admin?error=rate-limit", request.url), 303);
    }
    const form = await request.formData();
    const password = String(form.get("password") ?? "");
    if (password.length > 1024 || !adminPasswordMatches(password)) {
      return NextResponse.redirect(new URL("/admin?error=1", request.url), 303);
    }
    const response = NextResponse.redirect(new URL("/admin", request.url), 303);
    response.cookies.set(adminCookie.name, createAdminSessionValue(), {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "strict", path: "/", maxAge: adminCookie.maxAge,
    });
    return response;
  } catch {
    // Fail closed if the shared limiter is unavailable.
    return NextResponse.redirect(new URL("/admin?error=unavailable", request.url), 303);
  }
}
