import { NextRequest } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../../lib/admin-auth";
import { supabaseAdminFetch } from "../../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirect303(path: string) {
  return new Response(null, {
    status: 303,
    headers: { location: path },
  });
}

export async function POST(request: NextRequest) {
  const session = request.cookies.get(adminCookie.name)?.value;
  if (!verifyAdminSessionValue(session)) {
    return redirect303("/admin?error=session");
  }

  const form = await request.formData();
  const id = String(form.get("id") ?? "").trim();

  if (!id) {
    return redirect303("/admin?delete=invalid");
  }

  try {
    await supabaseAdminFetch(
      `products?id=eq.${encodeURIComponent(id)}&source=eq.manual-amazon-link`,
      {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      },
    );
    return redirect303("/admin?delete=success");
  } catch {
    return redirect303("/admin?delete=error");
  }
}
