import ProductBrowser from "../components/ProductBrowser";

const demoCards = [
  ["HAUL", "Occasioni recenti", "Prodotti selezionati e aggiunti al catalogo."],
  ["VETRINA", "In evidenza", "Una selezione ordinata delle proposte più interessanti."],
  ["CERCA", "Trova subito", "Ricerca per nome e categoria con risultati immediati."]
];

export default function Home() {
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#" aria-label="Scala dei Turchi - home">
          <span className="brandMark">ST</span>
          <span><strong>Scala dei Turchi</strong><small>Offerte Amazon</small></span>
        </a>
        <nav aria-label="Navigazione principale">
          <a href="#haul">HAUL</a><a href="#vetrina">Vetrina</a><a href="#cerca">Cerca</a>
        </nav>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">SCALA DEI TURCHI · SHOPPING</p>
          <h1>Offerte utili.<br/>Ricerca veloce.</h1>
          <p className="lead">Consulta prodotti Amazon selezionati in una vetrina semplice, rapida e pensata anche per smartphone.</p>
          <div className="heroActions"><a className="cta" href="#cerca">Cerca un prodotto</a><a className="secondary" href="#vetrina">Apri la vetrina</a></div>
        </div>
        <aside className="heroPanel">
          <span>CATALOGO</span>
          <strong>Amazon Italia</strong>
          <p>I prodotti possono essere inseriti tramite link affiliati ufficiali Amazon. Prezzi e disponibilità aggiornati sono consultabili direttamente su Amazon.</p>
        </aside>
      </section>

      <section className="showcase" id="vetrina">
        <div className="sectionHead"><div><p className="eyebrow">ESPLORA</p><h2>Tre modi per trovare ciò che ti serve</h2></div><p>Il catalogo viene letto dal database e resta disponibile anche quando Creators API non è accessibile.</p></div>
        <div className="cards">
          {demoCards.map(([tag,title,text],index) => <article id={index === 0 ? "haul" : undefined} key={tag}><span className="cardTag">{tag}</span><div className="cardNumber">0{index+1}</div><h3>{title}</h3><p>{text}</p><a href="#cerca">Esplora <span aria-hidden="true">→</span></a></article>)}
        </div>
      </section>

      <ProductBrowser />

      <section className="notice"><strong>Trasparenza</strong><p>Scala dei Turchi partecipa al Programma Affiliazione Amazon. Alcuni link ai prodotti possono generare una commissione senza costi aggiuntivi per chi acquista.</p></section>
      <footer><strong>Scala dei Turchi</strong><span>Offerte Amazon · Italia</span></footer>
    </main>
  );
}
