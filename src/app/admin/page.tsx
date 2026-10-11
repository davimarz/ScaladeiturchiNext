  return (<main className="adminShell">
   <section className="adminHeader">
    <div>
     <p className="eyebrow">SCALA DEI TURCHI</p>
     <h1>Dashboard</h1>
    </div>
    <div className="adminActions">
     <Link href="/" target="_blank" rel="noopener noreferrer">Apri il sito</Link>
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
