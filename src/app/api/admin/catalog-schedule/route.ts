import { NextRequest } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../lib/admin-auth";
import { isSameOrigin } from "../../../../lib/admin-request";
import { supabaseAdminFetch } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirect(status: string) {
  return new Response(null, {
    status: 303,
    headers: { location: "/admin?auto_schedule=" + encodeURIComponent(status) },
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (!verifyAdminSessionValue(request.cookies.get(adminCookie.name)?.value)) return redirect("session");

  const form = await request.formData();
  const enabled = form.get("enabled") === "on";
  const time = String(form.get("time") ?? "").trim();

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return redirect("invalid");

  try {
    await supabaseAdminFetch("site_settings?on_conflict=key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([
        { key: "catalog_auto_update_enabled", value: enabled },
        { key: "catalog_auto_update_time", value: time },
        { key: "catalog_auto_update_timezone", value: "Europe/Rome" },
        { key: "catalog_auto_update_saved_at", value: new Date().toISOString() },
      ]),
    });
    return redirect("saved");
  } catch (error) {
    console.error("catalog-auto-schedule-save", error instanceof Error ? error.message : error);
    return redirect("error");
  }
}
