"use client";
import { useEffect, useState } from "react";
import { catalogConfig, type Catalog } from "../lib/catalog-config";
import { readServiceJson } from "../lib/service-json";
type Progress = { remaining: number; complete: number; incomplete: number; total: number };
export default function CatalogVerificationRunner({ catalog }: { catalog: Catalog | null }) {
  const [progress, setProgress] = useState<Partial<Record<Catalog, Progress>>>({});
  const [running, setRunning] = useState(Boolean(catalog));
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function run() {
      const catalogs = catalog ? [catalog] : Object.keys(catalogConfig) as Catalog[];
      try {
        for (const current of catalogs) {
          const summary = await fetch("/api/admin/catalog-verify?catalog=" + current, { signal: controller.signal, cache: "no-store" });
          if (!summary.ok) throw new Error("Impossibile leggere lo stato della verifica.");
          let state = await readServiceJson<Progress>(summary, "Stato temporaneamente non disponibile.");
          if (active) setProgress(previous => ({ ...previous, [current]: state }));
          if (!catalog && revision === 0) continue;
          let passes = 0;
          while (active && state.remaining > 0 && passes < 150) {
            const response = await fetch("/api/admin/catalog-verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ catalog: current }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(240000)]) });
            const data = await readServiceJson<Progress & { ok?: boolean; busy?: boolean; error?: string }>(response, "Verifica interrotta dal servizio. I dati salvati sono conservati: puoi riprendere.");
            if (response.status === 409 && data.busy) {
              if (active) setMessage("Un aggiornamento è in corso. Puoi riprendere la verifica al termine.");
              break;
            }
            if (!response.ok || !data.ok) throw new Error(data.error || "Verifica temporaneamente non disponibile.");
            state = data;
            passes++;
            if (active) { setProgress(previous => ({ ...previous, [current]: data })); setMessage(""); }
          }
        }
      } catch (error) {
        if (active) setMessage(error instanceof Error && error.name === "TimeoutError" ? "La richiesta è scaduta. I dati salvati sono conservati: puoi riprendere." : error instanceof Error ? error.message : "Verifica interrotta.");
      } finally { if (active) setRunning(false); }
    }
    void run();
    return () => { active = false; controller.abort(); };
  }, [catalog, revision]);
  return <div className="catalogVerifyRunner" aria-live="polite">
    <strong>Completezza dei cataloghi {running ? "· verifica in corso…" : ""}</strong>
    {(Object.keys(progress) as Catalog[]).map(current => {
      const state = progress[current]!;
      return <span key={current}>{catalogConfig[current].label}: {state.complete}/{state.total} completi · {state.remaining} da verificare · {state.incomplete} non completati</span>;
    })}
    {message ? <span>{message}</span> : null}
    <small>Completo = titolo, immagine, descrizione e prezzo rilevato. Sconto e prezzo originario vengono mostrati quando disponibili.</small>
    <button type="button" disabled={running} onClick={() => { setRunning(true); setMessage(""); setRevision(value => value + 1); }}>{running ? "Verifica in corso…" : "Verifica / riprendi i dati"}</button>
  </div>;
}
