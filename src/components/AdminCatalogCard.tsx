"use client";

type Props = {
  catalog: "haul" | "offerte-lampo" | "bestseller";
  label: string;
  count: number;
};

export default function AdminCatalogCard({ catalog, label, count }: Props) {
  return (
    <article className="catalogManagerCard">
      <div>
        <span className="catalogManagerLabel">{label}</span>
        <strong>{count} prodotti</strong>
      </div>
      <form
        action="/api/admin/catalogs/clear"
        method="post"
        onSubmit={(event) => {
          if (!window.confirm(`Svuotare solo il catalogo ${label}? Gli altri cataloghi non verranno modificati.`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="catalog" value={catalog} />
        <button type="submit" className="dangerButton" disabled={count === 0}>
          Svuota {label}
        </button>
      </form>
    </article>
  );
}
