import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseAdminFetch } from "./supabase/admin";
import type { Catalog } from "./catalog-config";
export class CatalogBusyError extends Error {
  constructor() { super("Un aggiornamento di questo catalogo è già in corso."); }
}
export async function withCatalogJob<T>(catalog: Catalog | "scheduler", work: () => Promise<T>): Promise<T> {
  const token = randomUUID();
  const acquired = await supabaseAdminFetch<boolean>("rpc/claim_catalog_job", {
    method: "POST", body: JSON.stringify({ p_catalog: catalog, p_token: token }),
  });
  if (!acquired) throw new CatalogBusyError();
  try { return await work(); }
  finally {
    await supabaseAdminFetch("rpc/release_catalog_job", {
      method: "POST", body: JSON.stringify({ p_catalog: catalog, p_token: token }),
    }).catch(error => console.warn("catalog-job-release", error instanceof Error ? error.message : String(error)));
  }
}
