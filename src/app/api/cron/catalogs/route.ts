import { NextRequest, NextResponse } from "next/server";
import { createAdminSessionValue, adminCookie } from "../../../../lib/admin-auth";
import { supabaseAdminFetch } from "../../../../lib/supabase/admin";
import { verifyCatalogProductsBatch } from "../../../../lib/catalog-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SettingRow = { key: string; value: unknown };
type Stage = "haul" | "offerte-lambo" | "bestseller" | "done" | "";

function valueString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function romeParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return {
    day: [map.get("year"), map.get("month"), map.get("day")].join("-"),
    time: [map.get("hour"), map.get("minute")].join(":"),
  };
}

function minutes(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
}

function statusFromLocation(location: string | null, key: string) {
  if (!location) return "unknown";
  try {
    const url = new URL(location, "https://local.invalid");
    return url.searchParams.get(key) || "unknown";
  } catch {
    return "unknown";
  }
}

async function saveSettings(rows: Array<{ key: string; value: unknown }>) {
  await supabaseAdminFetch("site_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
}

export async function POST(request: NextRequest) {
  const expected = process.env.CATALOG_CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!expected || auth !== "Bearer " + expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rows = await supabaseAdminFetch<SettingRow[]>(
    "site_settings?key=in.(catalog_auto_update_enabled,catalog_auto_update_time,catalog_auto_update_last_day,catalog_auto_update_stage,catalog_auto_update_had_error,catalog_auto_update_last_message,haul_source_url,offerte_lambo_source_url,bestseller_source_url)&select=key,value",
  );
  const settings = new Map(rows.map((row) => [row.key, row.value]));
  const enabled = settings.get("catalog_auto_update_enabled") === true;
  const scheduled = valueString(settings.get("catalog_auto_update_time"), "06:00");
  const lastDay = valueString(settings.get("catalog_auto_update_last_day"));
  let stage = valueString(settings.get("catalog_auto_update_stage")) as Stage;
  let hadError = settings.get("catalog_auto_update_had_error") === true;
  let message = valueString(settings.get("catalog_auto_update_last_message"));
  const now = romeParts();

  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: "auto-update-disabled" });
  }

  const verificationTick = async () => {
    // Sequential on purpose: never open two Amazon browser batches at the same time.
    const lambo = await verifyCatalogProductsBatch("offerte-lambo", 3).catch((error) => ({
      checked: 0, verified: 0, pending: 0, failed: 1,
      error: error instanceof Error ? error.message : String(error),
    }));
    const bestseller = await verifyCatalogProductsBatch("bestseller", 3).catch((error) => ({
      checked: 0, verified: 0, pending: 0, failed: 1,
      error: error instanceof Error ? error.message : String(error),
    }));
    return { lambo, bestseller };
  };

  const diff = minutes(now.time) - minutes(scheduled);
  if (lastDay !== now.day) {
    if (diff < 0 || diff > 1) {
      const verification = await verificationTick();
      return NextResponse.json({ ok: true, skipped: "daily-import-not-due", now: now.time, scheduled, verification });
    }

    stage = "haul";
    hadError = false;
    message = "";
    await saveSettings([
      { key: "catalog_auto_update_last_day", value: now.day },
      { key: "catalog_auto_update_stage", value: stage },
      { key: "catalog_auto_update_had_error", value: false },
      { key: "catalog_auto_update_last_started_at", value: new Date().toISOString() },
      { key: "catalog_auto_update_last_status", value: "running" },
      { key: "catalog_auto_update_last_message", value: "" },
    ]);
  }

  if (!stage || stage === "done") {
    const verification = await verificationTick();
    return NextResponse.json({ ok: true, skipped: "daily-import-complete", day: now.day, verification });
  }

  const origin = request.nextUrl.origin;
  const session = createAdminSessionValue();
  const commonHeaders = {
    origin,
    "sec-fetch-site": "same-origin",
    cookie: adminCookie.name + "=" + session,
  };

  const jobs = {
    haul: {
      name: "HAUL",
      path: "/api/admin/haul/import",
      statusKey: "haul_import",
      field: "haul_url",
      url: valueString(settings.get("haul_source_url"), "https://www.amazon.it/haul/store?ref_=nav_cs_hul_disb"),
      next: "offerte-lambo" as Stage,
    },
    "offerte-lambo": {
      name: "Offerte Lampo",
      path: "/api/admin/offerte-lambo/import",
      statusKey: "lambo_import",
      field: "lambo_url",
      url: valueString(settings.get("offerte_lambo_source_url"), "https://www.amazon.it/offerte-lampo-del-giorno/s?k=offerte+lampo+del+giorno"),
      next: "bestseller" as Stage,
    },
    bestseller: {
      name: "Bestseller",
      path: "/api/admin/bestseller/import",
      statusKey: "bestseller_import",
      field: "bestseller_url",
      url: valueString(settings.get("bestseller_source_url"), "https://www.amazon.it/gp/bestsellers/?ref_=nav_cs_bestsellers"),
      next: "done" as Stage,
    },
  } as const;

  const job = jobs[stage as keyof typeof jobs];
  if (!job) {
    await saveSettings([{ key: "catalog_auto_update_stage", value: "done" }]);
    return NextResponse.json({ ok: false, error: "Invalid scheduler stage" }, { status: 500 });
  }

  let result: { name: string; http: number; status: string };
  try {
    const form = new FormData();
    form.set("return_to", "/admin");
    form.set(job.field, job.url);
    const response = await fetch(origin + job.path, {
      method: "POST",
      headers: commonHeaders,
      body: form,
      redirect: "manual",
      signal: AbortSignal.timeout(285_000),
    });
    result = {
      name: job.name,
      http: response.status,
      status: statusFromLocation(response.headers.get("location"), job.statusKey),
    };
  } catch (error) {
    result = {
      name: job.name,
      http: 0,
      status: error instanceof Error ? error.message.slice(0, 160) : "error",
    };
  }

  const good = new Set(["success", "price-only"]);
  hadError = hadError || !good.has(result.status);
  message = [message, result.name + ": " + result.status].filter(Boolean).join(" · ");

  const updates: Array<{ key: string; value: unknown }> = [
    { key: "catalog_auto_update_stage", value: job.next },
    { key: "catalog_auto_update_had_error", value: hadError },
    { key: "catalog_auto_update_last_message", value: message },
  ];

  if (job.next === "done") {
    updates.push(
      { key: "catalog_auto_update_last_finished_at", value: new Date().toISOString() },
      { key: "catalog_auto_update_last_status", value: hadError ? "partial" : "success" },
    );
  }

  await saveSettings(updates);
  return NextResponse.json({ ok: good.has(result.status), day: now.day, stage, next: job.next, result });
}
