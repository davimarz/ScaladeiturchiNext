import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminCookie, verifyAdminSessionValue } from "../../../../lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MARKETPLACE = "www.amazon.it";
const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG || "eiapromo-21";

function safeErrorBody(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const body = value as {
    error?: string;
    error_description?: string;
    errors?: Array<{ code?: string; message?: string }>;
  };
  return {
    error: body.error || null,
    errorDescription: body.error_description || null,
    code: body.errors?.[0]?.code || null,
    message: body.errors?.[0]?.message || null,
  };
}

export async function POST() {
  const cookieStore = await cookies();
  const session = cookieStore.get(adminCookie.name)?.value;
  if (!verifyAdminSessionValue(session)) {
    return NextResponse.json({ ok: false, stage: "auth", status: 401, message: "Sessione amministratore non valida." }, { status: 401 });
  }

  const clientId = process.env.AMAZON_CREATORS_CLIENT_ID || process.env.AMAZON_CREDENTIAL_ID;
  const clientSecret = process.env.AMAZON_CREATORS_CLIENT_SECRET || process.env.AMAZON_CREDENTIAL_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      ok: false,
      stage: "configuration",
      status: 0,
      message: "Credenziali Creators API mancanti nel server.",
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
      partnerTag: PARTNER_TAG,
      marketplace: MARKETPLACE,
    });
  }

  let token = "";
  try {
    const tokenResponse = await fetch("https://api.amazon.co.uk/auth/o2/token", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "creatorsapi::default",
      }),
    });

    const tokenBody = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !(tokenBody as { access_token?: string }).access_token) {
      const details = safeErrorBody(tokenBody);
      return NextResponse.json({
        ok: false,
        stage: "token",
        status: tokenResponse.status,
        message: details.errorDescription || details.message || details.error || "Amazon non ha rilasciato il token Creators.",
        code: details.code || details.error,
        partnerTag: PARTNER_TAG,
        marketplace: MARKETPLACE,
      });
    }
    token = String((tokenBody as { access_token: string }).access_token);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      stage: "token",
      status: 0,
      message: error instanceof Error ? error.message : "Errore durante la richiesta del token.",
      partnerTag: PARTNER_TAG,
      marketplace: MARKETPLACE,
    });
  }

  try {
    const response = await fetch("https://creatorsapi.amazon/catalog/v1/searchItems", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
        "x-marketplace": MARKETPLACE,
      },
      body: JSON.stringify({
        partnerTag: PARTNER_TAG,
        marketplace: MARKETPLACE,
        keywords: "macchina da caffe",
        itemCount: 4,
        searchIndex: "All",
        resources: ["itemInfo.title", "images.primary.medium", "offersV2.listings.price"],
      }),
    });

    const body = await response.json().catch(() => ({})) as {
      searchResult?: { items?: unknown[] };
      errors?: Array<{ code?: string; message?: string }>;
    };

    if (!response.ok) {
      const details = safeErrorBody(body);
      return NextResponse.json({
        ok: false,
        stage: "searchItems",
        status: response.status,
        code: details.code,
        message: details.message || "Amazon ha rifiutato SearchItems.",
        partnerTag: PARTNER_TAG,
        marketplace: MARKETPLACE,
      });
    }

    return NextResponse.json({
      ok: true,
      stage: "searchItems",
      status: response.status,
      message: "Creators API operativa: token ottenuto e SearchItems riuscito.",
      items: body.searchResult?.items?.length ?? 0,
      partnerTag: PARTNER_TAG,
      marketplace: MARKETPLACE,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      stage: "searchItems",
      status: 0,
      message: error instanceof Error ? error.message : "Errore durante SearchItems.",
      partnerTag: PARTNER_TAG,
      marketplace: MARKETPLACE,
    });
  }
}
