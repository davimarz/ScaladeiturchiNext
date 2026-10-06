import { NextRequest } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "../../../../../lib/admin-auth";
import { isSameOrigin } from "../../../../../lib/admin-request";
import { supabaseAdminFetch } from "../../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CatalogKey = "haul" | "offerte-lampo";

const catalogs: Record<CatalogKey, {
  filter: string;
  otherFlag: "in_offerte_lambo" | "in_haul";
  ownFlag: "in_haul" | "in_offerte_lambo";
}> = {
  haul: {
    filter: "in_haul=eq.true",
    ownFlag: "in_haul",
    otherFlag: "in_offerte_lambo",
  },
  "offerte-lampo": {
    filter: "in_offerte_lambo=eq.true",
    ownFlag: "in_offerte_lambo",
    otherFlag: "in_haul",
  },
};

function redirect(status: string, catalog?: string) {
  const params = new URLSearchParams({ catalog_clear: status });
  if (catalog) params.set("catalog", catalog);
  return new Response(null, { status: 303, headers: { location: "/admin?" + params.toString() } });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (!verifyAdminSessionValue(request.cookies.get(adminCookie.name)?.value)) return redirect("session");

  const form = await request.formData();
  const catalog = String(form.get("catalog") ?? "") as CatalogKey;
  const config = catalogs[catalog];
  if (!config) return redirect("invalid");

  try {
    const products = await supabaseAdminFetch<Array<{
      id: string;
      in_haul: boolean;
      in_offerte_lambo: boolean;
    }>>(
      `products?${config.filter}&select=id,in_haul,in_offerte_lambo&limit=1000`,
    );

    const sharedIds = products
      .filter((product) => product[config.otherFlag])
      .map((product) => product.id);
    const exclusiveIds = products
      .filter((product) => !product[config.otherFlag])
      .map((product) => product.id);

    for (let offset = 0; offset < sharedIds.length; offset += 100) {
      const ids = sharedIds.slice(offset, offset + 100);
      await supabaseAdminFetch(`products?id=in.(${ids.join(",")})`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ [config.ownFlag]: false, updated_at: new Date().toISOString() }),
      });
    }

    for (let offset = 0; offset < exclusiveIds.length; offset += 100) {
      const ids = exclusiveIds.slice(offset, offset + 100);
      await supabaseAdminFetch(`products?id=in.(${ids.join(",")})`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
    }

    return redirect("success", catalog);
  } catch (error) {
    console.error("catalog-clear", error instanceof Error ? error.message : error);
    return redirect("error", catalog);
  }
}
