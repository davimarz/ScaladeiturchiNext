"use client";

export default function AdminCatalogActions() {
  const selectAll = (checked: boolean) => {
    document.querySelectorAll<HTMLInputElement>(".product-select").forEach((input) => {
      input.checked = checked;
    });
  };

  return (
    <>
      <form
        action="/api/admin/products/clear"
        method="post"
        className="adminDangerZone"
        onSubmit={(event) => {
          if (!window.confirm("Confermi di voler eliminare definitivamente TUTTI i prodotti dal catalogo?")) {
            event.preventDefault();
          }
        }}
      >
        <strong>Gestione catalogo</strong>
        <p>Svuota elimina tutti i prodotti, senza toccare categorie, configurazione Amazon o impostazioni.</p>
        <input name="confirm" placeholder={'Scrivi "SVUOTA CATALOGO"'} aria-label="Conferma svuota catalogo" required />
        <button type="submit" className="dangerButton">Svuota catalogo</button>
      </form>

      <form
        id="bulk-products-form"
        action="/api/admin/products/bulk-delete"
        method="post"
        className="adminActions"
        onSubmit={(event) => {
          if (!document.querySelector(".product-select:checked") || !window.confirm("Eliminare definitivamente i prodotti selezionati?")) {
            event.preventDefault();
          }
        }}
      >
        <label>
          <input type="checkbox" onChange={(event) => selectAll(event.target.checked)} /> Seleziona tutti in questa pagina
        </label>
        <button type="submit" className="dangerButton">Elimina selezionati</button>
      </form>
    </>
  );
}
