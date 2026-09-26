const sections = [
  ["HAUL", "Una selezione rapida di prodotti e occasioni da scoprire."],
  ["Vetrina", "Prodotti organizzati in una vetrina semplice e veloce da consultare."],
  ["Cerca", "Ricerca prodotti per parola chiave con risultati chiari e immediati."]
];

export default function Home() {
  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brandMark">ST</span><div><strong>Scala dei Turchi</strong><small>Offerte Amazon</small></div></div>
        <nav><a href="#haul">HAUL</a><a href="#vetrina">Vetrina</a><a href="#cerca">Cerca</a></nav>
      </header>
      <section className="hero">
        <p className="eyebrow">SCALA DEI TURCHI · SHOPPING</p>
        <h1>Trova prodotti e offerte senza perdere tempo.</h1>
        <p className="lead">Una nuova versione più rapida, indicizzabile e pronta per un catalogo alimentato da database.</p>
        <a className="cta" href="#cerca">Inizia a cercare</a>
      </section>
      <section className="features">
        {sections.map(([title,text],i) => <article id={i===0?"haul":i===1?"vetrina":"cerca"} key={title}><span>0{i+1}</span><h2>{title}</h2><p>{text}</p></article>)}
      </section>
      <footer>Scala dei Turchi · I link ai prodotti potranno essere link di affiliazione Amazon.</footer>
    </main>
  );
}
