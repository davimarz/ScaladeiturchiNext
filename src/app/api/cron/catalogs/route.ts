import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminFetch } from "../../../../lib/supabase/admin";
import { verifyCatalogProductsBatch, catalogVerificationSummary } from "../../../../lib/catalog-sync";
import { catalogConfig, isCatalog, type Catalog } from "../../../../lib/catalog-config";
import { importCatalog, validCatalogUrl } from "../../../../lib/catalog-import";
import { withCatalogJob, CatalogBusyError } from "../../../../lib/catalog-job";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const catalogs: Catalog[] = ["haul", "offerte-lambo", "bestseller"];
async function save(rows: Array<{ key: string; value: unknown }>) {
  await supabaseAdminFetch("site_settings?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
}
function romeNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const values = new Map(parts.map(part => [part.type, part.value]));
  return { day: [values.get("year"), values.get("month"), values.get("day")].join("-"), time: values.get("hour") + ":" + values.get("minute") };
}
async function tick() {
  const rows = await supabaseAdminFetch<Array<{ key: string; value: unknown }>>("site_settings?key=in.(catalog_auto_update_enabled,catalog_auto_update_time,catalog_auto_update_last_day,catalog_auto_update_stage,catalog_auto_update_had_error,catalog_auto_update_last_message,haul_source_url,offerte_lambo_source_url,bestseller_source_url)&select=key,value");
  const settings = new Map(rows.map(row => [row.key, row.value]));
  if (settings.get("catalog_auto_update_enabled") !== true) return { ok: true, skipped: "disabled" };
  const now = romeNow();
  const scheduled = String(settings.get("catalog_auto_update_time") || "06:00");
  let stage = String(settings.get("catalog_auto_update_stage") || "done");
  let hadError = settings.get("catalog_auto_update_had_error") === true;
  let message = String(settings.get("catalog_auto_update_last_message") || "");
  // Resume yesterday's interrupted cycle before starting another one.
  if (stage === "done" && settings.get("catalog_auto_update_last_day") !== now.day) {
    if (now.time < scheduled) return { ok: true, skipped: "not-due" };
    stage = "haul"; hadError = false; message = "";
    await save([{ key: "catalog_auto_update_last_day", value: now.day }, { key: "catalog_auto_update_stage", value: stage },
      { key: "catalog_auto_update_had_error", value: false }, { key: "catalog_auto_update_last_started_at", value: new Date().toISOString() },
      { key: "catalog_auto_update_last_status", value: "running" }, { key: "catalog_auto_update_last_message", value: "" }]);
  }
  if (stage === "done") return { ok: true, skipped: "complete" };
  const verifying = stage.startsWith("verify-");
  const catalog = verifying ? stage.slice(7) : stage;
  if (!isCatalog(catalog)) throw new Error("Invalid scheduler stage");
  const config = catalogConfig[catalog];
  if (!verifying) {
    const url = String(settings.get(config.sourceKey) || config.url);
    if (!validCatalogUrl(catalog, url)) throw new Error("Invalid catalog source");
    const result = await withCatalogJob(catalog, () => importCatalog(catalog, url));
    hadError ||= result.status !== "success";
    message = [message, config.label + ": " + result.count + " prodotti rilevati" + (result.scanError ? " (fonte non disponibile)" : "")].filter(Boolean).join(" · ");
    await save([{ key: "catalog_auto_update_stage", value: "verify-" + catalog }, { key: "catalog_auto_update_had_error", value: hadError }, { key: "catalog_auto_update_last_message", value: message }]);
    return { ok: true, catalog, phase: "import", result };
  }
  const result = await withCatalogJob(catalog, () => verifyCatalogProductsBatch(catalog, 6));
  const summary = await catalogVerificationSummary(catalog);
  if (summary.remaining > 0) return { ok: true, catalog, phase: "verify", result, summary };
  hadError ||= summary.incomplete > 0;
  message += " · " + config.label + ": " + summary.complete + "/" + summary.total + " completi";
  const next = catalogs.at(catalogs.indexOf(catalog) + 1) || "done";
  await save([{ key: "catalog_auto_update_stage", value: next }, { key: "catalog_auto_update_had_error", value: hadError }, { key: "catalog_auto_update_last_message", value: message },
    ...(next === "done" ? [{ key: "catalog_auto_update_last_finished_at", value: new Date().toISOString() }, { key: "catalog_auto_update_last_status", value: hadError ? "partial" : "success" }] : [])]);
  return { ok: true, catalog, phase: "verify", result, summary, next };
}
export async function POST(request: NextRequest) {
  const expected = process.env.CATALOG_CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== "Bearer " + expected) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await withCatalogJob("scheduler", tick)); }
  catch (error) {
    if (error instanceof CatalogBusyError) return NextResponse.json({ ok: true, skipped: "already-running" });
    console.error("catalog-cron", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false, error: "Catalog update failed" }, { status: 503 });
  }
}
export const GET = POST;
