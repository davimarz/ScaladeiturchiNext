import { catalogConfig, type Catalog } from "../lib/catalog-config";

export default function CatalogImportNotice({ catalog, status, count }: {
  catalog: Catalog;
  status?: string;
  count?: string;
}) {
  if (!status)
    return null;
  const label = catalogConfig[catalog].label;
  const messages: Record<string, string> = {
    success: `${label}: ${count || "0"} prodotti salvati. La verifica di immagini, descrizioni e prezzi prosegue qui sotto.`,
    partial: `${label}: ${count || "0"} prodotti recuperati prima dell’interruzione della scansione. I dati sono salvati e la verifica prosegue qui sotto; riprova l’importazione per completare l’elenco.`,
    "price-only": `${label}: nessun nuovo prodotto rilevato dalla fonte. I dati esistenti sono conservati e vengono verificati qui sotto.`,
    "source-unavailable": `${label}: Amazon non ha restituito schede prodotto. I dati esistenti sono conservati. Se il catalogo è vuoto, puoi caricare la pagina HTML salvata da Amazon nelle Opzioni avanzate.`,
    busy: `${label}: un aggiornamento è già in corso. Attendi il termine prima di riprovare.`,
    "invalid-url": `${label}: inserisci un link Amazon.it valido per questo catalogo.`,
    "invalid-file": "Carica un file HTML di dimensioni inferiori a 40 MB.",
    session: "Sessione scaduta. Accedi nuovamente all’amministrazione.",
    "save-error": `${label}: importazione interrotta. I dati già salvati sono conservati; puoi riprovare.`,
  };
  const success = status === "success" || status === "price-only" || status === "partial";
  return <p className={success ? "adminNotice" : "adminError"}>{messages[status] || `${label}: importazione non completata (${status}).`}</p>;
}
