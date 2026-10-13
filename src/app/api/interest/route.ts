import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "../../../lib/admin-request";
import { validInterest } from "../../../lib/interest-events";
import { supabaseAdminFetch } from "../../../lib/supabase/admin";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
    if (!isSameOrigin(request))
        return NextResponse.json({ ok: false }, { status: 403 });
    const text = await request.text();
    if (text.length > 512)
        return NextResponse.json({ ok: false }, { status: 413 });
    let body: {
        event?: unknown;
        catalog?: unknown;
    };
    try {
        body = JSON.parse(text);
    }
    catch {
        return NextResponse.json({ ok: false }, { status: 400 });
    }
    if (!body || !validInterest(body.event, body.catalog))
        return NextResponse.json({ ok: false }, { status: 400 });
    try {
        await supabaseAdminFetch("rpc/record_shopping_interest", { method: "POST", body: JSON.stringify({ p_event: body.event, p_catalog: body.catalog }) });
        return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
    catch {
        return NextResponse.json({ ok: false }, { status: 503 });
    }
}
