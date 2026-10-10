import { NextRequest } from "next/server";
import { adminCookie, verifyAdminSessionValue } from "./admin-auth";
import { isSameOrigin } from "./admin-request";
import { catalogConfig, type Catalog } from "./catalog-config";
import { importCatalog, validCatalogUrl } from "./catalog-import";
import { withCatalogJob, CatalogBusyError } from "./catalog-job";

export async function handleCatalogImport(request: NextRequest, catalog: Catalog) {
  const config = catalogConfig[catalog];
  let target = "/admin/" + catalog;
  const finish = (status: string, count?: number) => {
    const params = new URLSearchParams({ [config.statusKey]: status });
    if (count != null) params.set(config.countKey, String(count));
    return new Response(null, { status: 303, headers: { location: target + "?" + params } });
  };
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  if (!verifyAdminSessionValue(request.cookies.get(adminCookie.name)?.value)) return finish("session");
  try {
    const form = await request.formData();
    if (form.get("return_to") === "/admin") target = "/admin";
    const sourceUrl = String(form.get(config.field) || config.url).trim();
    if (!validCatalogUrl(catalog, sourceUrl)) return finish("invalid-url");
    const file = form.get("html_file");
    if (file instanceof File && file.size > 0 && (file.size > 40 * 1024 * 1024 || !/\.html?$/i.test(file.name))) return finish("invalid-file");
    const html = file instanceof File && file.size > 0 ? await file.text() : undefined;
    const result = await withCatalogJob(catalog, () => importCatalog(catalog, sourceUrl, html));
    return finish(result.status, result.count);
  } catch (error) {
    if (error instanceof CatalogBusyError) return finish("busy");
    console.error("catalog-import", catalog, error instanceof Error ? error.message : String(error));
    return finish("save-error");
  }
}
