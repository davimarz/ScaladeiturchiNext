"use client";

import type { FormEvent } from "react";

export type CatalogFilterValues = {
  brand: string;
  min: string;
  max: string;
  sort: string;
  incomplete: boolean;
};

export default function CatalogFilterPanel({ value, brands, defaultSortLabel, onChange, onSubmit, onReset, className = "" }: {
  value: CatalogFilterValues;
  brands: string[];
  defaultSortLabel: string;
  onChange: (value: CatalogFilterValues) => void;
  onSubmit: (event: FormEvent) => void;
  onReset: () => void;
  className?: string;
}) {
  return <details className={`catalogFilters ${className}`.trim()}>
   <summary>Filtri e ordinamento</summary>
   <form onSubmit={onSubmit} className="filterFields">
    <label>Marca<select value={value.brand} onChange={(event) => onChange({ ...value, brand: event.target.value })}><option value="">Tutte le marche</option>{brands.map((brand) => <option key={brand}>{brand}</option>)}</select></label>
    <label>Prezzo minimo (€)<input type="number" min="0" step="0.01" value={value.min} onChange={(event) => onChange({ ...value, min: event.target.value })}/></label>
    <label>Prezzo massimo (€)<input type="number" min={value.min || "0"} step="0.01" value={value.max} onChange={(event) => onChange({ ...value, max: event.target.value })}/></label>
    <label>Ordina per<select value={value.sort} onChange={(event) => onChange({ ...value, sort: event.target.value })}><option value="default">{defaultSortLabel}</option><option value="price-asc">Prezzo crescente</option><option value="price-desc">Prezzo decrescente</option><option value="discount">Sconto maggiore</option></select></label>
    <label className="checkFilter"><input type="checkbox" checked={value.incomplete} onChange={(event) => onChange({ ...value, incomplete: event.target.checked })}/><span><strong>Mostra anche prodotti incompleti</strong><small>Normalmente sono mostrati solo prodotti con foto, descrizione e prezzo rilevato.</small></span></label>
    <div className="filterActions"><button type="button" className="secondaryButton" onClick={onReset}>Azzera filtri</button><button type="submit">Applica filtri</button></div>
   </form>
  </details>;
}
