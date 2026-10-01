import { NextRequest } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../../lib/admin-auth";
import { isSameOrigin } from "../../../../../lib/admin-request";
import { isUuid } from "../../../../../lib/product-validation";
import { supabaseAdminFetch } from "../../../../../lib/supabase/admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const redirect = (status: string) => new Response(null, { status: 303, headers: { location: `/admin?delete=${status}` } });

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (!verifyAdminSessionValue(request.cookies.get(adminCookie.name)?.value)) return redirect("session");
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return redirect("invalid");
  try {
    const rows = await supabaseAdminFetch<Array<{id: string}>>(`products?id=eq.${id}`, {
      method: "DELETE", headers: { Prefer: "return=representation" },
    });
    return redirect(rows.length ? "success" : "invalid");
  } catch { return redirect("error"); }
}
