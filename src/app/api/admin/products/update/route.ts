import { NextRequest } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../../lib/admin-auth";
import { isSameOrigin } from "../../../../../lib/admin-request";
import { isUuid, MANUAL_SOURCE_FILTER } from "../../../../../lib/product-validation";
import { supabaseAdminFetch } from "../../../../../lib/supabase/admin";
export const runtime = "nodejs";
const redirect = (status: string) => new Response(null, { status: 303, headers: { location: `/admin?manual=${status}` } });

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (!verifyAdminSessionValue(request.cookies.get(adminCookie.name)?.value)) return redirect("session");
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const categoryId = String(form.get("category_id") ?? "").trim();
  if (!isUuid(id) || !title || title.length > 300 || (categoryId && !isUuid(categoryId))) return redirect("invalid");
  try {
    if (categoryId) {
      const categories = await supabaseAdminFetch<Array<{id:string}>>(`categories?id=eq.${categoryId}&active=eq.true&select=id&limit=1`);
      if (!categories.length) return redirect("invalid");
    }
    const rows = await supabaseAdminFetch<Array<{id:string}>>(`products?id=eq.${id}&${MANUAL_SOURCE_FILTER}&active=eq.true`, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ title, category_id: categoryId || null, updated_at: new Date().toISOString() }),
    });
    return redirect(rows.length ? "updated" : "invalid");
  } catch { return redirect("error"); }
}
