import { NextRequest, NextResponse } from "next/server";
import { syncAmazonCatalog } from "../../../lib/catalog-sync";
import { supabaseAdminFetch } from "../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = await supabaseAdminFetch<Array<{ id: number }>>("sync_runs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ source: "amazon-creators-api", status: "running" }),
  });

  const runId = started[0]?.id;

  try {
    const result = await syncAmazonCatalog();

    if (runId) {
      await supabaseAdminFetch(`sync_runs?id=eq.${runId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "success",
          products_seen: result.productsSeen,
          products_updated: result.productsUpdated,
          finished_at: new Date().toISOString(),
        }),
      });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";

    if (runId) {
      await supabaseAdminFetch(`sync_runs?id=eq.${runId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "error",
          error_message: message.slice(0, 1000),
          finished_at: new Date().toISOString(),
        }),
      });
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
