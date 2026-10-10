import VisitorInterests from "../../components/VisitorInterests";

import CatalogImportNotice from "../../components/CatalogImportNotice";

import Link from "next/link";

import Image from "next/image";

import { MANUAL_SOURCE_FILTER, MANUAL_SOURCES } from "../../lib/product-validation";

import { cookies } from "next/headers";

import DeleteProductButton from "../../components/DeleteProductButton";

import AdminCatalogActions from "../../components/AdminCatalogActions";

import AdminUpdateButton from "../../components/AdminUpdateButton";

import AdminCatalogCard from "../../components/AdminCatalogCard";

import CreatorsApiTest from "../../components/CreatorsApiTest";

import CatalogAutoSchedule from "../../components/CatalogAutoSchedule";

import CatalogVerificationRunner from "../../components/CatalogVerificationRunner";

import { adminCookie, verifyAdminSessionValue } from "../../lib/admin-auth";

import { supabaseAdminFetch } from "../../lib/supabase/admin";

import { currentUsageDay, DAILY_REQUEST_LIMIT, DAILY_TOKEN_LIMIT } from "../../lib/ai-limits";

export const dynamic = "force-dynamic";

type AIUsage = {
  usage_day: string;
  requests_count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  reserved_tokens: number;
  last_request_at: string | null;
  exhausted_at: string | null;
};

type AIHistory = {
  id: number;
  created_at: string;
  query: string;
  status: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  products_count: number;
  error_message: string | null;
  product_asins: string[];
  product_titles: string[];
};

type Product = {
  id: string;
  asin: string;
  title: string;
  current_price: number | null;
  list_price: number | null;
  discount_percent: number | null;
  currency: string;
  updated_at: string;
  active: boolean;
  source: string | null;
  category_id: string | null;
  image_url: string | null;
};

type CatalogStats = {
  haul_count: number;
  lambo_count: number;
  bestseller_count: number;
  haul_last_price: string | null;
  lambo_last_price: string | null;
  bestseller_last_price: string | null;
};

export default async function AdminPage({ searchParams, }: {
  searchParams: Promise<{
    error?: string;
    manual?: string;
    image_error?: string;
    delete?: string;
    bulk?: string;
    clear?: string;
    page?: string;
    haul_import?: string;
    haul_count?: string;
    lambo_import?: string;
    lambo_count?: string;
    bestseller_import?: string;
    bestseller_count?: string;
    price_seen?: string;
    price_updated?: string;
    price_unchanged?: string;
    price_failed?: string;
    images_recovered?: string;
    images_missing?: string;
    catalog_clear?: string;
    catalog?: string;
    auto_schedule?: string;
    source?: string;
  }>;
}) {
  const cookieStore = await cookies();
  const session = cookieStore.get(adminCookie.name)?.value;
  const authenticated = verifyAdminSessionValue(session);
  const params = await searchParams;
  if (!authenticated) {
    return (<main className="adminShell">
    <section className="adminLogin">
     <p className="eyebrow">AREA RISERVATA</p>
     <h1>Amministrazione</h1>
     <p>Inserisci la password amministratore.</p>
     {params.error ? <p className="adminError">{params.error === "rate-limit" ? "Troppi tentativi. Riprova tra 15 minuti." : params.error === "unavailable" ? "Accesso temporaneamente non disponibile. Riprova più tardi." : "Password non valida o sessione scaduta."}</p> : null}
     <form action="/api/admin/login" method="post" className="adminForm">
      <input type="password" name="password" required autoComplete="current-password" placeholder="Password"/>
      <button type="submit">Accedi</button>
     </form>
     <Link href="/">← Torna al sito</Link>
    </section>
   </main>);
  }
  const imageHttpStatus = params.image_error?.match(/^http-(\d{3})$/)?.[1];
  const returnedPageTitle = params.image_error?.startsWith("page-") ? params.image_error.slice(5, 125) : null;
  const imageFailure = returnedPageTitle ? "Amazon ha restituito la pagina «" + returnedPageTitle + "» senza foto del prodotto." : imageHttpStatus ? "Amazon ha risposto con un errore (" + imageHttpStatus + ")." : params.image_error === "blocked" ? "Amazon ha bloccato la lettura automatica della pagina." : params.image_error === "large" ? "La pagina Amazon supera il limite di lettura." : params.image_error === "timeout" ? "Amazon non ha risposto in tempo." : "La foto non è stata trovata nella pagina Amazon.";
  const pageNumber = Number(params.page ?? 1);
  const page = Number.isFinite(pageNumber) ? Math.min(10000, Math.max(1, Math.floor(pageNumber))) : 1;
  const usageDay = currentUsageDay();
  const [products, categories, settings, catalogStats, aiUsage, aiHistory, aiHistoryStats] = await Promise.all([
    supabaseAdminFetch<Product[]>(`products?active=eq.true&${MANUAL_SOURCE_FILTER}&select=id,asin,title,current_price,list_price,discount_percent,currency,updated_at,active,source,category_id,image_url&order=updated_at.desc,id.asc&limit=30&offset=${(page - 1) * 30}`),
    supabaseAdminFetch<Array<{
      id: string;
      name: string;
    }>>("categories?active=eq.true&select=id,name&order=sort_order.asc"),
    supabaseAdminFetch<Array<{
      key: string;
      value: unknown;
    }>>("site_settings?key=in.(haul_source_url,offerte_lambo_source_url,bestseller_source_url,catalog_auto_update_enabled,catalog_auto_update_time,catalog_auto_update_last_started_at,catalog_auto_update_last_finished_at,catalog_auto_update_last_status,catalog_auto_update_last_message)&select=key,value"),
    supabaseAdminFetch<CatalogStats[]>("rpc/admin_catalog_stats", {
      method: "POST",
      body: JSON.stringify({}),
    }),
    supabaseAdminFetch<AIUsage[]>("ai_daily_usage?usage_day=eq." + encodeURIComponent(usageDay) + "&select=usage_day,requests_count,input_tokens,output_tokens,total_tokens,reserved_tokens,last_request_at,exhausted_at&limit=1"),
    supabaseAdminFetch<AIHistory[]>("ai_search_history?select=id,created_at,query,status,model,input_tokens,output_tokens,total_tokens,products_count,error_message,product_asins,product_titles&order=created_at.desc&limit=20"),
    supabaseAdminFetch<AIHistory[]>("ai_search_history?select=id,created_at,query,status,model,input_tokens,output_tokens,total_tokens,products_count,error_message,product_asins,product_titles&order=created_at.desc&limit=500"),
  ]);
  const settingsByKey = new Map(settings.map((row) => [row.key, row.value]));
  const stats = catalogStats[0];
  const savedHaulUrl = typeof settingsByKey.get("haul_source_url") === "string" ? settingsByKey.get("haul_source_url") as string : "https://www.amazon.it/haul/store?ref_=nav_cs_hul_disb";
  const savedLamboUrl = typeof settingsByKey.get("offerte_lambo_source_url") === "string" ? settingsByKey.get("offerte_lambo_source_url") as string : "https://www.amazon.it/gp/goldbox/?ie=UTF8&ref_=topnav_storetab_gb";
  const savedBestsellerUrl = typeof settingsByKey.get("bestseller_source_url") === "string" ? settingsByKey.get("bestseller_source_url") as string : "https://www.amazon.it/gp/bestsellers/?ref_=nav_cs_bestsellers";
  const catalogAutoEnabled = settingsByKey.get("catalog_auto_update_enabled") === true;
  const catalogAutoTime = typeof settingsByKey.get("catalog_auto_update_time") === "string" ? settingsByKey.get("catalog_auto_update_time") as string : "06:00";
  const catalogAutoLastRunRaw = typeof settingsByKey.get("catalog_auto_update_last_started_at") === "string" ? settingsByKey.get("catalog_auto_update_last_started_at") as string : "";
  const catalogAutoLastStatus = typeof settingsByKey.get("catalog_auto_update_last_status") === "string" ? settingsByKey.get("catalog_auto_update_last_status") as string : "";
  const catalogAutoLastMessage = typeof settingsByKey.get("catalog_auto_update_last_message") === "string" ? settingsByKey.get("catalog_auto_update_last_message") as string : "";
  const formatLastCheck = (value: string | null | undefined) => value ? new Date(value).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "Mai";
  const todayAI = aiUsage[0];
  const aiRequests = todayAI?.requests_count ?? 0;
  const aiTokens = todayAI?.total_tokens ?? 0;
  const aiRemainingRequests = Math.max(0, DAILY_REQUEST_LIMIT - aiRequests);
  const aiRemainingTokens = Math.max(0, DAILY_TOKEN_LIMIT - aiTokens - (todayAI?.reserved_tokens ?? 0));
  const aiExhausted = Boolean(todayAI?.exhausted_at) || aiRemainingRequests === 0 || aiRemainingTokens === 0;
  const productSearchRanking = (() => {
    const stats = new Map<string, {
      asin: string;
      title: string;
      searches: number;
      queries: string[];
    }>();
    for (const item of aiHistoryStats) {
      if (item.status !== "success")
        continue;
      const seenInQuery = new Set<string>();
      const asins = Array.isArray(item.product_asins) ? item.product_asins : [];
      const titles = Array.isArray(item.product_titles) ? item.product_titles : [];
      for (let index = 0; index < asins.length; index++) {
        const asin = String(asins[index] ?? "").trim().toUpperCase();
        if (!/^[A-Z0-9]{10}$/.test(asin) || seenInQuery.has(asin))
          continue;
        seenInQuery.add(asin);
        const title = String(titles[index] ?? "").trim() || asin;
        const current = stats.get(asin);
        if (current) {
          current.searches += 1;
          if (current.title === current.asin && title !== asin)
            current.title = title;
          if (!current.queries.includes(item.query))
            current.queries.push(item.query);
        }
        else {
          stats.set(asin, { asin, title, searches: 1, queries: [item.query] });
        }
      }
    }
    return [...stats.values()]
      .sort((a, b) => b.searches - a.searches || a.title.localeCompare(b.title, "it"))
      .slice(0, 20);
  })();
  return (<main className="adminShell">
   <section className="adminHeader">
    <div>
     <p className="eyebrow">SCALA DEI TURCHI</p>
     <h1>Dashboard</h1>
    </div>
    <div className="adminActions">
     <Link href="/" target="_blank" rel="noopener noreferrer">Apri il sito</Link>
     <Link href="/admin/haul">HAUL</Link>
     <Link href="/admin/offerte-lambo">Offerte Lampo</Link>
     <Link href="/admin/bestseller">Bestseller</Link>
     <form action="/api/admin/logout" method="post">
      <button type="submit">Esci</button>
     </form>
    </div>
   </section>

   <section className="adminPanel"><h2>Salute e completezza dei cataloghi</h2><CatalogVerificationRunner catalog={params.haul_import === "success" || params.haul_import === "price-only" || params.haul_import === "source-unavailable"
      ? "haul"
      : params.lambo_import === "success" || params.lambo_import === "price-only" || params.lambo_import === "source-unavailable"
        ? "offerte-lambo"
        : params.bestseller_import === "success" || params.bestseller_import === "price-only" || params.bestseller_import === "source-unavailable"
          ? "bestseller"
          : null}/></section>
   <VisitorInterests />
   <section className="adminPanel compactImportPanel">
    <div className="compactPanelHead">
     <div>
      <h2>Aggiornamento rapido Amazon</h2>
      <p>Un solo clic avvia browser, scroll, rilevamento prodotti e importazione.</p>
     </div>
    </div>

    <CatalogImportNotice catalog="haul" status={params.haul_import} count={params.haul_count}/>
    <CatalogImportNotice catalog="offerte-lambo" status={params.lambo_import} count={params.lambo_count}/>
    <CatalogImportNotice catalog="bestseller" status={params.bestseller_import} count={params.bestseller_count}/>
    {params.auto_schedule === "saved" ? <p className="adminNotice">Orario dell&apos;aggiornamento automatico salvato.</p> : null}
    {params.auto_schedule === "invalid" ? <p className="adminError">Inserisci un orario valido.</p> : null}
    {params.auto_schedule === "error" ? <p className="adminError">Non è stato possibile salvare lo scheduler automatico.</p> : null}
    {params.source === "saved" ? <p className="adminNotice">Link del catalogo salvato. Verrà usato dai prossimi aggiornamenti manuali e automatici.</p> : null}
    {params.source === "invalid" ? <p className="adminError">Il link inserito non è valido per il catalogo selezionato.</p> : null}
    {params.source === "error" ? <p className="adminError">Non è stato possibile salvare il link del catalogo.</p> : null}

    <CatalogAutoSchedule enabled={catalogAutoEnabled} time={catalogAutoTime} lastRun={catalogAutoLastRunRaw ? formatLastCheck(catalogAutoLastRunRaw) : ""} lastStatus={catalogAutoLastStatus} lastMessage={catalogAutoLastMessage}/>

    <div className="quickImportGrid">
     <form action="/api/admin/haul/import" method="post" className="quickImportCard">
      <input type="hidden" name="return_to" value="/admin"/>
      <div className="quickImportMeta">
       <strong>HAUL</strong>
       <span>Ultimo controllo: {formatLastCheck(stats?.haul_last_price)}</span>
      </div>
      <div className="quickImportControls">
       <input name="haul_url" type="url" defaultValue={savedHaulUrl} aria-label="URL Amazon HAUL" required/>
       <button type="submit" formAction="/api/admin/catalog-source" formMethod="post" name="catalog" value="haul" className="quickImportSaveButton">Salva link</button>
       <AdminUpdateButton idleLabel="Aggiorna HAUL"/>
      </div>
      <Link href="/admin/haul" className="quickImportLink">Opzioni avanzate</Link>
     </form>

     <form action="/api/admin/offerte-lambo/import" method="post" className="quickImportCard">
      <input type="hidden" name="return_to" value="/admin"/>
      <div className="quickImportMeta">
       <strong>Offerte Lampo</strong>
       <span>Ultimo controllo: {formatLastCheck(stats?.lambo_last_price)}</span>
      </div>
      <div className="quickImportControls">
       <input name="lambo_url" type="url" defaultValue={savedLamboUrl} aria-label="URL Amazon Offerte Lampo" required/>
       <button type="submit" formAction="/api/admin/catalog-source" formMethod="post" name="catalog" value="offerte-lambo" className="quickImportSaveButton">Salva link</button>
       <AdminUpdateButton idleLabel="Aggiorna Offerte"/>
      </div>
      <Link href="/admin/offerte-lambo" className="quickImportLink">Opzioni avanzate</Link>
     </form>

     <form action="/api/admin/bestseller/import" method="post" className="quickImportCard">
      <input type="hidden" name="return_to" value="/admin"/>
      <div className="quickImportMeta">
       <strong>Bestseller</strong>
       <span>Ultimo controllo: {formatLastCheck(stats?.bestseller_last_price)}</span>
      </div>
      <div className="quickImportControls">
       <input name="bestseller_url" type="url" defaultValue={savedBestsellerUrl} aria-label="URL Amazon Bestseller" required/>
       <button type="submit" formAction="/api/admin/catalog-source" formMethod="post" name="catalog" value="bestseller" className="quickImportSaveButton">Salva link</button>
       <AdminUpdateButton idleLabel="Aggiorna Bestseller"/>
      </div>
      <Link href="/admin/bestseller" className="quickImportLink">Opzioni avanzate</Link>
     </form>
    </div>
   </section>

   <details className="adminAdvanced"><summary>Gestione e svuotamento dei cataloghi</summary>
   <section className="adminPanel catalogManagerPanel">
    <div className="compactPanelHead">
     <div>
      <h2>Cataloghi</h2>
      <p>Ogni scheda pubblica ha il proprio catalogo indipendente. Puoi controllare quanti prodotti contiene e svuotare solo quello che ti interessa.</p>
     </div>
    </div>

    {params.catalog_clear === "success" ? (<p className="adminNotice">
      Catalogo {params.catalog === "haul" ? "HAUL" : params.catalog === "offerte-lampo" ? "Offerte Lampo" : params.catalog === "bestseller" ? "Bestseller" : ""} svuotato senza modificare gli altri cataloghi.
     </p>) : null}
    {params.catalog_clear === "error" ? <p className="adminError">Non è stato possibile svuotare il catalogo selezionato.</p> : null}

    <div className="catalogManagerGrid">
     <AdminCatalogCard catalog="haul" label="HAUL" count={Number(stats?.haul_count ?? 0)}/>
     <AdminCatalogCard catalog="offerte-lampo" label="Offerte Lampo" count={Number(stats?.lambo_count ?? 0)}/>
     <AdminCatalogCard catalog="bestseller" label="Bestseller" count={Number(stats?.bestseller_count ?? 0)}/>
    </div>
   </section>

   </details>

   <details className="adminAdvanced"><summary>Diagnostica Amazon Creators API</summary>
   <section className="adminPanel">
    <div className="compactPanelHead">
     <div>
      <h2>Diagnostica Amazon Creators API</h2>
      <p>Controlla in tempo reale se token e SearchItems sono autorizzati per il tuo account, senza mostrare credenziali sensibili.</p>
     </div>
    </div>
    <CreatorsApiTest />
   </section>

   </details>

   <details className="adminAdvanced"><summary>Utilizzo AI, ricerche e storico</summary>
   <section className="adminPanel aiUsagePanel">
    <div className="compactPanelHead">
     <div>
      <h2>Utilizzo AI</h2>
      <p>Gemini 3.5 Flash-Lite · limite interno giornaliero di sicurezza · reset alla mezzanotte Pacifico, circa le 09:00 in Italia.</p>
     </div>
     <span className={aiExhausted ? "aiStatus exhausted" : "aiStatus available"}>
      {aiExhausted ? "Limite raggiunto" : "Disponibile"}
     </span>
    </div>

    <div className="aiUsageGrid">
     <div><span>Richieste oggi</span><strong>{aiRequests} / {DAILY_REQUEST_LIMIT}</strong><small>{aiRemainingRequests} disponibili</small></div>
     <div><span>Token utilizzati</span><strong>{aiTokens.toLocaleString("it-IT")} / {DAILY_TOKEN_LIMIT.toLocaleString("it-IT")}</strong><small>{aiRemainingTokens.toLocaleString("it-IT")} disponibili</small></div>
     <div><span>Input / output</span><strong>{(todayAI?.input_tokens ?? 0).toLocaleString("it-IT")} / {(todayAI?.output_tokens ?? 0).toLocaleString("it-IT")}</strong><small>token registrati</small></div>
     <div><span>Ultima richiesta</span><strong>{formatLastCheck(todayAI?.last_request_at)}</strong><small>{todayAI?.exhausted_at ? "Quota esaurita: " + formatLastCheck(todayAI.exhausted_at) : "Quota non esaurita"}</small></div>
    </div>

    <details className="adminAdvancedPanel aiHistoryPanel">
     <summary>Prodotti più ricercati</summary>
     <p>Classifica dei prodotti comparsi più spesso nelle ricerche dei clienti, con le domande che li hanno generati.</p>
     <div className="adminTableWrap">
      <table className="adminTable">
       <thead>
        <tr>
         <th>Posizione</th>
         <th>Prodotto</th>
         <th>ASIN</th>
         <th>Ricerche</th>
         <th>Domande dei clienti</th>
        </tr>
       </thead>
       <tbody>
        {productSearchRanking.length ? productSearchRanking.map((item, index) => (<tr key={item.asin}>
          <td>{index + 1}</td>
          <td>{item.title}</td>
          <td>{item.asin}</td>
          <td><strong>{item.searches}</strong></td>
          <td>{item.queries.slice(0, 5).join(" · ")}</td>
         </tr>)) : (<tr><td colSpan={5}>Nessun prodotto ancora conteggiato.</td></tr>)}
       </tbody>
      </table>
     </div>
    </details>

    <details className="adminAdvancedPanel aiHistoryPanel">
     <summary>Cronologia delle ricerche</summary>
     <p>Ultime domande inviate dai clienti all&apos;assistente AI.</p>
     <div className="adminTableWrap">
      <table className="adminTable">
       <thead>
        <tr>
         <th>Data</th>
         <th>Domanda</th>
         <th>Stato</th>
         <th>Prodotti</th>
         <th>Token</th>
         <th>Modello</th>
        </tr>
       </thead>
       <tbody>
        {aiHistory.length ? aiHistory.map((item) => (<tr key={item.id}>
          <td>{new Date(item.created_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}</td>
          <td>{item.query}</td>
          <td>{item.status}</td>
          <td>{item.products_count}</td>
          <td>{item.total_tokens.toLocaleString("it-IT")}</td>
          <td>{item.model ?? "—"}</td>
         </tr>)) : (<tr><td colSpan={6}>Nessuna domanda registrata.</td></tr>)}
       </tbody>
      </table>
     </div>
    </details>
   </section>

   </details>

   <details className="adminAdvanced"><summary>Gestione prodotti manuali e strumenti avanzati</summary>
   <section className="adminPanel">
    <h2>Prodotti manuali</h2>
    <AdminCatalogActions />
    <nav className="adminActions" aria-label="Pagine dei prodotti manuali">
     {page > 1 ? <Link href={"/admin?page=" + (page - 1)}>← Precedenti</Link> : null}
     <span>Pagina {page}</span>
     {products.length === 30 ? <Link href={"/admin?page=" + (page + 1)}>Successivi →</Link> : null}
    </nav>
    <div className="adminTableWrap">
     <table className="adminTable">
      <thead>
       <tr>
        <th>Seleziona</th>
        <th>Immagine</th>
        <th>Codice</th>
        <th>Titolo</th>
        <th>Fonte</th>
        <th>Prezzo attuale</th>
        <th>Prezzo precedente</th>
        <th>Sconto</th>
        <th>Aggiornato</th>
        <th>Modifica</th>
        <th>Azioni</th>
       </tr>
      </thead>
      <tbody>
       {products.map((product) => (<tr key={product.id}>
         <td><input type="checkbox" name="ids" value={product.id} className="product-select" form="bulk-products-form" aria-label={"Seleziona " + product.title}/></td>
         <td>{product.image_url ? <Image src={product.image_url} alt={product.title} width={72} height={72} unoptimized style={{ objectFit: "contain" }}/> : "Foto non disponibile"}</td>
         <td>{product.asin}</td>
         <td>{product.title}</td>
         <td>{product.source ?? "—"}</td>
         <td>
          {product.current_price == null
        ? "Su Amazon"
        : new Intl.NumberFormat("it-IT", {
          style: "currency",
          currency: product.currency,
        }).format(product.current_price)}
         </td>
         <td>{product.list_price == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: product.currency }).format(product.list_price)}</td>
         <td>{product.discount_percent == null ? "—" : "−" + Math.round(product.discount_percent) + "%"}</td>
         <td>{new Date(product.updated_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}</td>
         <td>
          {MANUAL_SOURCES.some((source) => source === product.source) ? (<form action="/api/admin/products/update" method="post" className="adminForm">
            <input type="hidden" name="id" value={product.id}/>
            <input name="title" aria-label={"Titolo " + product.asin} defaultValue={product.title} required maxLength={300}/>
            <select name="category_id" aria-label={"Categoria " + product.asin} defaultValue={product.category_id ?? ""}>
             <option value="">Senza categoria</option>
             {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <button type="submit">Salva</button>
           </form>) : "—"}
         </td>
         <td>
          {MANUAL_SOURCES.some((source) => source === product.source) ? (<DeleteProductButton id={product.id}/>) : ("—")}
         </td>
        </tr>))}
      </tbody>
     </table>
    </div>
   </section>
   <section className="adminPanel">
    <h2>Catalogo manuale</h2>
    <p>
     Aggiungi prodotti con un link Amazon o con codice HTML che contiene il link e l&apos;immagine.
     Dal normale link il sistema cerca automaticamente l&apos;immagine principale su Amazon. Puoi anche scegliere titolo e categoria.
    </p>

    {params.manual === "success" ? <p className="adminNotice">Prodotto aggiunto al catalogo.</p> : null}
    {params.manual === "success-image" ? <p className="adminNotice">Prodotto aggiunto con immagine.</p> : null}
    {params.manual === "updated" ? <p className="adminNotice">Prodotto aggiornato nel catalogo.</p> : null}
    {params.manual === "updated-image" ? <p className="adminNotice">Prodotto aggiornato con immagine.</p> : null}
    {params.manual === "success-no-image" || params.manual === "updated-no-image" ? <p className="adminError">Prodotto salvato senza foto. {imageFailure} Puoi reincollare il link per riprovare.</p> : null}
    {params.manual === "invalid" ? <p className="adminError">Inserisci un link Amazon valido (amazon.it, amzn.to o link.amazon).</p> : null}
    {params.manual === "unresolved" ? <p className="adminError">Non sono riuscito a risolvere il link corto Amazon. Prova con il link completo del prodotto.</p> : null}
    {params.manual === "noasin" ? <p className="adminError">Non sono riuscito a trovare l&apos;ASIN nel link. Prova con il link della pagina prodotto.</p> : null}
    {params.manual === "image-invalid" ? <p className="adminError">Immagine non valida. Usa JPG, PNG o WEBP fino a 5 MB.</p> : null}
    {params.manual === "error" ? <p className="adminError">Errore durante il salvataggio del prodotto. Riprova.</p> : null}
    {params.delete === "success" ? <p className="adminNotice">Prodotto manuale eliminato.</p> : null}
    {params.bulk === "success" ? <p className="adminNotice">Prodotti selezionati eliminati.</p> : null}
    {params.clear === "success" ? <p className="adminNotice">Prodotti manuali svuotati. HAUL, Offerte Lampo e Bestseller sono rimasti intatti.</p> : null}
    {params.delete === "invalid" ? <p className="adminError">Prodotto non valido.</p> : null}
    {params.delete === "error" ? <p className="adminError">Errore durante l&apos;eliminazione del prodotto.</p> : null}

    <form action="/api/admin/products" method="post" encType="multipart/form-data" className="adminForm">
     <label htmlFor="amazon-input">Link Amazon o codice HTML</label>
     <textarea id="amazon-input" name="amazon_input" required maxLength={100000} rows={5} placeholder="Incolla il link Amazon oppure il codice HTML con link e immagine"/>
     <label htmlFor="product-title">Titolo (facoltativo)</label>
     <input id="product-title" name="title" maxLength={300} placeholder="Nome del prodotto"/>
     <label htmlFor="product-category">Categoria</label>
     <select id="product-category" name="category_id" defaultValue="">
      <option value="">Non specificata / mantieni quella esistente</option>
      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
     </select>
     <label htmlFor="product-image">Foto da PC (facoltativa, massimo 5 MB)</label>
     <input id="product-image" type="file" name="image" accept="image/jpeg,image/png,image/webp"/>
     <button type="submit">Aggiungi prodotto</button>
    </form>

    <p className="adminHint">
     Incolla il link e premi “Aggiungi prodotto”: la foto viene cercata automaticamente sulla pagina Amazon. Le immagini già presenti vengono conservate. Il caricamento da PC è soltanto un&apos;alternativa facoltativa.
    </p>
   </section>

   </details>
  </main>);
}
