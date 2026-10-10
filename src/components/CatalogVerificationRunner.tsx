"use client";

import Link from "next/link";

import { useEffect, useState } from "react";

import { catalogConfig, type Catalog } from "../lib/catalog-config";

import { readServiceJson } from "../lib/service-json";

type Import = {
  at: string;
  status?: string;
  count: number;
  error?: string | null;
};

type Progress = {
  remaining: number;
  complete: number;
  incomplete: number;
  total: number;
  missing?: Record<string, number>;
  lastImport?: Import | null;
  lastSuccessfulImport?: Import | null;
};

export default function CatalogVerificationRunner({ catalog, scope }: {
  catalog: Catalog | null;
  scope?: Catalog;
}) {
  const [progress, setProgress] = useState<Partial<Record<Catalog, Progress>>>({}), [running, setRunning] = useState(Boolean(catalog)), [message, setMessage] = useState("");
  const [action, setAction] = useState<{
    revision: number;
    target: Catalog | null;
    retry: boolean;
  }>({ revision: 0, target: catalog || scope || null, retry: false });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function run() {
      const catalogs = action.target ? [action.target] : Object.keys(catalogConfig) as Catalog[];
      let recovered = 0, checked = 0;
      try {
        for (const current of catalogs) {
          const response = await fetch("/api/admin/catalog-verify?catalog=" + current, { signal: controller.signal, cache: "no-store" });
          if (!response.ok)
            throw new Error("Impossibile leggere lo stato dei cataloghi.");
          let state = await readServiceJson<Progress>(response, "Stato temporaneamente non disponibile.");
          const importState = { lastImport: state.lastImport, lastSuccessfulImport: state.lastSuccessfulImport };
          const initial = state.complete;
          if (active)
            setProgress(previous => ({ ...previous, [current]: state }));
          if (!catalog && !action.revision)
            continue;
          let passes = 0, retry = action.retry;
          while (active && (state.remaining > 0 || retry) && passes < 150) {
            const result = await fetch("/api/admin/catalog-verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ catalog: current, retryFailed: retry }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(240000)]) });
            const data = await readServiceJson<Progress & {
              ok?: boolean;
              busy?: boolean;
              error?: string;
              checked?: number;
            }>(result, "Verifica interrotta. I dati salvati sono conservati.");
            if (result.status === 409 && data.busy)
              throw new Error("Un aggiornamento è già in corso. Riprova al termine.");
            if (!result.ok || !data.ok)
              throw new Error(data.error || "Verifica non disponibile.");
            retry = false;
            passes++;
            checked += data.checked || 0;
            state = { ...data, ...importState };
            if (active) {
              setProgress(previous => ({ ...previous, [current]: state }));
              setMessage(`${catalogConfig[current].label}: ${state.complete - initial} prodotti completati in questa verifica · ${state.remaining} da verificare.`);
            }
          }
          recovered += state.complete - initial;
        }
        if (active && (catalog || action.revision))
          setMessage(`Verifica terminata: ${checked} letture effettuate · ${recovered} prodotti completati. I prodotti ancora incompleti restano disponibili per una riprova mirata.`);
      }
      catch (error) {
        if (active)
          setMessage(error instanceof Error && error.name === "TimeoutError" ? "Tempo scaduto. I dati salvati sono conservati; puoi riprendere." : error instanceof Error ? error.message : "Verifica interrotta.");
      }
      finally {
        if (active)
          setRunning(false);
      }
    }
    void run();
    return () => { active = false; controller.abort(); };
  }, [catalog, action]);
  function start(target: Catalog | null, retry: boolean) { setRunning(true); setMessage(""); setAction(previous => ({ revision: previous.revision + 1, target, retry })); }
  return <div className="catalogVerifyRunner" aria-live="polite" aria-busy={running}><strong>Salute dei cataloghi {running ? "· verifica in corso…" : ""}</strong><div className="catalogHealthRows">{(Object.keys(progress) as Catalog[]).map(current => { const state = progress[current]!; const last = state.lastImport; const success = state.lastSuccessfulImport || (last?.status === "success" ? last : null); return <div className="catalogHealthRow" key={current}><strong>{catalogConfig[current].label}: {state.complete}/{state.total} completi</strong><span>{state.remaining} da verificare · {state.incomplete} non completati</span><div className="healthLinks">{Object.entries(state.missing || {}).map(([field, count]) => <Link key={field} href={`/admin/catalog-review?catalog=${current}&missing=${field}`}>{count} senza {field}{field === "prezzo" ? " rilevato" : ""}</Link>)}</div><p className="healthImportStatus">Importazione: {last ? last.error || last.status === "source-unavailable" ? "Fonte non disponibile; dati conservati" : last.status === "success" ? `${last.count} prodotti rilevati il ${new Date(last.at).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}` : "Nessun nuovo prodotto rilevato" : "Non ancora registrata"}.<br />Ultima importazione riuscita: {success ? new Date(success.at).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "Non registrata"}.<br />Verifica: {state.remaining ? "in corso o da riprendere" : state.incomplete ? "parziale" : "completa"}.</p><button type="button" disabled={running || (!state.incomplete && !state.remaining)} onClick={() => start(current, true)}>Riprova solo gli incompleti di {catalogConfig[current].label}</button></div>; })}</div>{message ? <span role="status">{message}</span> : null}<small>Completo = titolo, foto, descrizione e prezzo rilevato. Sconto e prezzo originario vengono mostrati solo quando disponibili. La riprova conserva i dati e non reimporta l’intero catalogo.</small><button type="button" disabled={running} onClick={() => start(catalog, false)}>{running ? "Verifica in corso…" : "Riprendi le verifiche in attesa"}</button></div>;
}
