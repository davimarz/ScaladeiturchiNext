import "server-only";
import { createHmac } from "node:crypto";
import { supabaseAdminFetch } from "./supabase/admin";

export async function consumeLoginAttempt(request: Request) {
  // Vercel replaces this header at its trusted proxy. On other hosts use the shared limit.
  const ip = process.env.VERCEL ? request.headers.get("x-forwarded-for")?.split(",")[0].trim() : null;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("Missing ADMIN_SESSION_SECRET");
  const key = ip ? createHmac("sha256", secret).update(ip).digest("hex") : "shared";
  return supabaseAdminFetch<boolean>("rpc/consume_admin_login_attempt", {
    method: "POST", body: JSON.stringify({ p_client_key: key }),
  });
}
