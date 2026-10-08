import { NextRequest, NextResponse } from "next/server";
import { createAdminSessionValue, adminCookie } from "../../../../lib/admin-auth";
import { supabaseAdminFetch } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SettingRow = { key: string; value: unknown };

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

export async function POST(request: NextRequest) {
  const expected = process.env.CATALOG_CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!expected || auth !== "Bearer " + expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rows = await supabaseAdminFetch<SettingRow[]>(
    "site_settings?key=in.(catalog_auto_update_enabled,catalog_auto_update_time,catalog_auto_update_last_day)&select=key,value",
  );
  const settings = new Map(rows.map((row) => [row.key, row.value]));
  const enabled = settings.get("catalog_auto_update_enabled") === true;
  const scheduled = valueString(settings.get("catalog_auto_update_time"), "06:00");
  const lastDay = valueString(settings.get("catalog_auto_update_last_day"));
  const now = romeParts();

  if (!enabled) return NextResponse.json({ ok: true, skipped: "disabled" });
  if (lastDay === now.day) return NextResponse.json({ ok: true, skipped: "already-run", day: now.day });

  const diff = minutes(now.time) - minutes(scheduled);
  if (diff < 0 || diff > 9) {
    return NextResponse.json({ ok: true, skipped: "not-due", now: now.time, scheduled });
  }

  // Mark before execution so a second scheduler tick cannot start duplicate imports.
  await supabaseAdminFetch("site_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      { key: "catalog_auto_update_last_day", value: now.day },
      { key: "catalog_auto_update_last_started_at", value: new Date().toISOString() },
      { key: "catalog_auto_update_last_status", value: "running" },
    ]),
  });

  const origin = request.nextUrl.origin;
  const session = createAdminSessionValue();
  const cookie = adminCookie.name + "=" + session;
  const commonHeaders = {
    origin,
    "sec-fetch-site": "same-origin",
    cookie,
  };

  const jobs = [
    { name: "HAUL", path: "/api/admin/haul/import", statusKey: "haul_import" },
    { name: "Offerte Lampo", path: "/api/admin/offerte-lambo/import", statusKey: "lambo_import" },
    { name: "Bestseller", path: "/api/admin/bestseller/import", statusKey: "bestseller_import" },
  ];

  const results = await Promise.all(jobs.map(async (job) => {
    try {
      const form = new FormData();
      form.set("return_to", "/admin");
      const response = await fetch(origin + job.path, {
        method: "POST",
        headers: commonHeaders,
        body: form,
        redirect: "manual",
        signal: AbortSignal.timeout(285_000),
      });
      const status = statusFromLocation(response.headers.get("location"), job.statusKey);
      return { name: job.name, http: response.status, status };
    } catch (error) {
      return { name: job.name, http: 0, status: error instanceof Error ? error.message.slice(0, 160) : "error" };
    }
  }));

  const good = new Set(["success", "price-only"]);
  const allOk = results.every((result) => good.has(result.status));
  const summary = results.map((result) => result.name + ": " + result.status).join(" · ");

  await supabaseAdminFetch("site_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      { key: "catalog_auto_update_last_finished_at", value: new Date().toISOString() },
      { key: "catalog_auto_update_last_status", value: allOk ? "success" : "partial" },
      { key: "catalog_auto_update_last_message", value: summary },
    ]),
  });

  return NextResponse.json({ ok: allOk, day: now.day, scheduled, results });
}
