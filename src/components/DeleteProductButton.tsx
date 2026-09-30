"use client";

export default function DeleteProductButton({ id }: { id: string }) {
  return (
    <form
      action="/api/admin/products/delete"
      method="post"
      onSubmit={(event) => {
        if (!window.confirm("Vuoi eliminare questo prodotto dal catalogo?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="dangerButton">Elimina</button>
    </form>
  );
}
