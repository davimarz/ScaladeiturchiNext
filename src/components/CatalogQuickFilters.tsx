"use client";

import type { CatalogFilterValues } from "./CatalogFilterPanel";

const priceRanges = [
  { label: "Tutti i prezzi", min: "", max: "" },
  { label: "Fino a 25 €", min: "", max: "25" },
  { label: "25–50 €", min: "25", max: "50" },
  { label: "Oltre 50 €", min: "50", max: "" },
];

export default function CatalogQuickFilters({ value, onApply }: {
  value: CatalogFilterValues;
  onApply: (next: CatalogFilterValues) => void;
}) {
  return <div className="quickFilterBar" role="group" aria-label="Filtri rapidi per prezzo e ordinamento">
    <span className="quickFilterLabel">Prezzo</span>
    {priceRanges.map(({ label, min, max }) => <button key={label} type="button"
      aria-pressed={value.min === min && value.max === max}
      onClick={() => onApply({ ...value, min, max })}>{label}</button>)}
    <span className="quickFilterDivider" aria-hidden="true" />
    <span className="quickFilterLabel">Ordina</span>
    <button type="button" aria-pressed={value.sort === "discount"} onClick={() => onApply({ ...value, sort: "discount" })}>Sconto maggiore</button>
    <button type="button" aria-pressed={value.sort === "price-asc"} onClick={() => onApply({ ...value, sort: "price-asc" })}>Prezzo minore</button>
  </div>;
}
