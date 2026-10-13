import { NextRequest } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../lib/admin-auth";
import { isSameOrigin } from "../../../../lib/admin-request";
import { isAmazonBestsellersUrl, isAmazonDealsUrl, isAmazonHaulUrl } from "../../../../lib/haul-import";
import { supabaseAdminFetch } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Catalog = "haul" | "offerte-lambo" | "bestseller";

function redirect(status: string, catalog?: string) {
  const params = new URLSearchParams({ source: status });
  if (catalog) params.set("catalog", catalog);
  return new Response(null, {
    status: 303,
    headers: { location: "/admin?" + params.toString() },
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (!verifyAdminSessionValue(request.cookies.get(adminCookie.name)?.value)) return redirect("session");

  const form = await request.formData();
  const catalog = String(form.get("catalog") ?? "") as Catalog;

  const config = catalog === "haul"
    ? { field: "haul_url", key: "haul_source_url", validate: isAmazonHaulUrl }
    : catalog === "offerte-lambo"
      ? { field: "lambo_url", key: "offerte_lambo_source_url", validate: isAmazonDealsUrl }
      : catalog === "bestseller"
        ? { field: "bestseller_url", key: "bestseller_source_url", validate: isAmazonBestsellersUrl }
        : null;

  if (!config) return redirect("invalid");
  const value = String(form.get(config.field) ?? "").trim();
  if (!config.validate(value)) return redirect("invalid", catalog);

  try {
    await supabaseAdminFetch("site_settings?on_conflict=key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ key: config.key, value }]),
    });
    return redirect("saved", catalog);
  } catch (error) {
    console.error("catalog-source-save", error instanceof Error ? error.message : error);
    return redirect("error", catalog);
  }
}
