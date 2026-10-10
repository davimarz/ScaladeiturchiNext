"use client";

import Link from "next/link";

import { useCallback, useEffect, useMemo, useState } from "react";

import { catalogConfig, type Catalog } from "../lib/catalog-config";

import { readServiceJson } from "../lib/service-json";

import { catalogHasAnomalies } from "../lib/catalog-verification";

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
  const [progress, setProgress] = useState<Partial<Record<Catalog, Progress>>>({});
  const [running, setRunning] = useState<Partial<Record<Catalog, boolean>>>({});
  const [messages, setMessages] = useState<Partial<Record<Catalog, string>>>({});
  const visibleCatalogs = useMemo(() => scope ? [scope] : Object.keys(catalogConfig) as Catalog[], [scope]);

  const runCatalog = useCallback(async (current: Catalog, retryFailed: boolean, signal?: AbortSignal) => {
    setRunning(previous => ({ ...previous, [current]: true }));
    setMessages(previous => ({ ...previous, [current]: "" }));
    let recovered = 0, checked = 0;
    try {
      const response = await fetch("/api/admin/catalog-verify?catalog=" + current, { signal, cache: "no-store" });
      if (!response.ok)
        throw new Error("Impossibile leggere lo stato di " + catalogConfig[current].label + ".");
      let state = await readServiceJson<Progress>(response, "Stato temporaneamente non disponibile.");
      const importState = { lastImport: state.lastImport, lastSuccessfulImport: state.lastSuccessfulImport };
      const initial = state.complete;
      setProgress(previous => ({ ...previous, [current]: state }));
      let passes = 0;
      let retry = retryFailed && catalogHasAnomalies(state);
      while ((state.remaining > 0 || retry) && passes < 150) {
        const result = await fetch("/api/admin/catalog-verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ catalog: current, retryFailed: retry }),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(240000)]) : AbortSignal.timeout(240000),
        });
        const data = await readServiceJson<Progress & { ok?: boolean; busy?: boolean; error?: string; checked?: number }>(result, "Verifica interrotta. I dati salvati sono conservati.");
        if (result.status === 409 && data.busy)
          throw new Error(catalogConfig[current].label + ": un aggiornamento è già in corso. Riprova al termine.");
        if (!result.ok || !data.ok)
          throw new Error(data.error || "Verifica non disponibile.");
        retry = false;
        passes++;
        checked += data.checked || 0;
        state = { ...data, ...importState };
        setProgress(previous => ({ ...previous, [current]: state }));
        setMessages(previous => ({ ...previous, [current]: `${state.complete - initial} prodotti completati · ${state.remaining} da verificare.` }));
      }
      recovered = state.complete - initial;
      setMessages(previous => ({ ...previous, [current]: catalogHasAnomalies(state)
        ? `Verifica terminata: ${checked} letture · ${recovered} prodotti completati. Restano anomalie da riprovare.`
        : `Verifica terminata: ${checked} letture · catalogo completo, nessuna anomalia.` }));
    }
    catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setMessages(previous => ({ ...previous, [current]: error instanceof Error && error.name === "TimeoutError" ? "Tempo scaduto. I dati salvati sono conservati; puoi riprendere." : error instanceof Error ? error.message : "Verifica interrotta." }));
    }
    finally {
      setRunning(previous => ({ ...previous, [current]: false }));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function run() {
      await Promise.all(visibleCatalogs.map(async current => {
        if (catalog === current) {
          await runCatalog(current, false, controller.signal);
          return;
        }
        try {
          const response = await fetch("/api/admin/catalog-verify?catalog=" + current, { signal: controller.signal, cache: "no-store" });
          if (!response.ok)
            throw new Error("Impossibile leggere lo stato dei cataloghi.");
          const state = await readServiceJson<Progress>(response, "Stato temporaneamente non disponibile.");
          setProgress(previous => ({ ...previous, [current]: state }));
        }
        catch (error) {
          if (!(error instanceof Error && error.name === "AbortError"))
            setMessages(previous => ({ ...previous, [current]: error instanceof Error ? error.message : "Stato non disponibile." }));
        }
      }));
    }
    void run();
    return () => controller.abort();
  }, [catalog, runCatalog, visibleCatalogs]);

  const anythingRunning = visibleCatalogs.some(current => running[current]);
  return <div className="catalogVerifyRunner" aria-live="polite" aria-busy={anythingRunning}>
    <strong>Salute dei cataloghi {anythingRunning ? "· aggiornamenti indipendenti in corso…" : ""}</strong>
    <div className="catalogHealthRows">{visibleCatalogs.map(current => {
      const state = progress[current];
      if (!state) return <div className="catalogHealthRow" key={current}><strong>{catalogConfig[current].label}</strong><span>Caricamento stato…</span></div>;
      const last = state.lastImport;
      const success = state.lastSuccessfulImport || (last?.status === "success" ? last : null);
      const hasAnomalies = catalogHasAnomalies(state);
      const isRunning = Boolean(running[current]);
      return <div className="catalogHealthRow" key={current} aria-busy={isRunning}>
        <strong>{catalogConfig[current].label}: {state.complete}/{state.total} completi {isRunning ? "· verifica in corso…" : ""}</strong>
        <span>{state.remaining} da verificare · {state.incomplete} non completati</span>
        <div className="healthLinks">{Object.entries(state.missing || {}).map(([field, count]) => <Link key={field} href={`/admin/catalog-review?catalog=${current}&missing=${field}`}>{count} senza {field}{field === "prezzo" ? " rilevato" : ""}</Link>)}</div>
        <p className="healthImportStatus">Importazione: {last ? last.error || last.status === "source-unavailable" ? "Fonte non disponibile; dati conservati" : last.status === "success" ? `${last.count} prodotti rilevati il ${new Date(last.at).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}` : "Nessun nuovo prodotto rilevato" : "Non ancora registrata"}.<br />Ultima importazione riuscita: {success ? new Date(success.at).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "Non registrata"}.<br />Verifica: {isRunning ? "in corso" : state.remaining ? "da riprendere" : state.incomplete ? "parziale" : "completa"}.</p>
        {hasAnomalies ? <button type="button" disabled={isRunning} onClick={() => void runCatalog(current, true)}>{isRunning ? `Verifica ${catalogConfig[current].label} in corso…` : `Riprova le anomalie di ${catalogConfig[current].label}`}</button> : <span className="catalogComplete">✓ Nessuna anomalia da riprovare</span>}
        {messages[current] ? <span role="status">{messages[current]}</span> : null}
      </div>;
    })}</div>
    <small>Completo = titolo, foto, descrizione e prezzo rilevato. Ogni catalogo si può verificare separatamente; una verifica non blocca i pulsanti degli altri. Sconto e prezzo originario vengono mostrati solo quando disponibili.</small>
  </div>;
}
