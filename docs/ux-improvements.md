# Scala dei Turchi — 30 miglioramenti approvati

Implementazione del 10 ottobre 2026 sul ramo `fix/ai-missing-prices`. La pubblicazione prevista è la Preview; Production resta sul ramo `main`.

| N. | Miglioramento | Comportamento implementato |
| --- | --- | --- |
| 1 | Priorità alla completezza | Vista iniziale con titolo utile, foto reale, descrizione e prezzo con data di lettura. |
| 2 | Prodotti incompleti | Filtro esplicito e pulsante per includerli, con conteggio degli esclusi. |
| 3 | Titoli leggibili | Titolo breve nelle schede, completo nei dettagli; rifiuto dei titoli della navigazione Amazon. |
| 4 | Prezzi e risparmi | Prezzo dominante, riferimento solo se superiore, sconto coerente con la stessa osservazione. |
| 5 | Data del prezzo | “Rilevato oggi” o data storica in Europa/Roma; ora precisa nei dettagli. |
| 6 | Descrizione utile | Anteprima delle informazioni reali ed espansione del testo disponibile. |
| 7 | Schede coerenti | Componente unico per cataloghi, risultati AI e preferiti. |
| 8 | Immagini uniformi | Area fotografica comune, proporzioni e dimensioni uniformi. |
| 9 | Categorie riconoscibili | Tecnologia, casa, bellezza, tempo libero e altri prodotti; classificazione prudente dal titolo. |
| 10 | Filtri | Categoria, marca riconosciuta, intervallo di prezzo, dati incompleti e presenza del prezzo; pannello comprimibile. |
| 11 | Ordinamenti | Prezzo crescente/decrescente e sconto; classifica Amazon come predefinito dei Bestseller. |
| 12 | Conteggi | Totale filtrato, numero di schede mostrate e paginazione dell'insieme filtrato. |
| 13 | Ricerca tollerante | Marche, ASIN, sinonimi comuni e piccoli errori di battitura; suggerimenti e azzeramento dei filtri quando vuota. |
| 14 | Sezioni comprensibili | Spiegazione della provenienza e delle differenze dei tre cataloghi. |
| 15 | Home compatta | Pagina iniziale dedicata, quattro ingressi e otto prodotti iniziali con caricamento progressivo. |
| 16 | AI visibile | Ingresso dalla home e navigazione, richiesta con esigenza e budget. |
| 17 | Esempi AI | Richieste concrete e varie, integrate con i suggerimenti disponibili. |
| 18 | Motivazioni verificabili | Budget confrontato solo con un prezzo datato; altrimenti parole effettivamente presenti nel titolo e invito a verificare le altre esigenze. |
| 19 | Stati AI | Attesa effettiva con secondi trascorsi, messaggio per fonti lente, errori leggibili e prevenzione degli invii sovrapposti. |
| 20 | Preferiti senza account | Salvataggio locale fino a 100 ASIN, aggiornamento dei dati dal catalogo e copie locali dei risultati AI. |
| 21 | Confronto | Da due a tre prodotti, tabella dei soli dati disponibili e rimozione delle selezioni. |
| 22 | Condivisione | Web Share, copia del link e link WhatsApp della singola scheda. |
| 23 | Trasparenza | Avvertenza affiliata e conferma di prezzo/disponibilità su Amazon; nessuna urgenza o valutazione inventata. |
| 24 | Ergonomia mobile | Filtri in una colonna sui piccoli schermi, controlli da almeno 44px, strumenti su righe e confronto scorrevole. |
| 25 | Stati accessibili | Focus visibile, etichette, stato premuto, occupato, annunci dei risultati e messaggi di errore. |
| 26 | Admin ordinato | Salute dei cataloghi e aggiornamenti prioritari; gestione distruttiva, diagnostica, storico e strumenti manuali comprimibili. |
| 27 | Dati mancanti azionabili | Conteggi e collegamenti ai prodotti senza titolo, immagine, descrizione o prezzo rilevato. |
| 28 | Riprova mirata | Reset dei soli tentativi falliti dentro il blocco del catalogo, conservazione dei verificati e riepilogo dei prodotti recuperati. |
| 29 | Esiti distinti | Fonte non disponibile, prodotti rilevati, verifica parziale/completa e ultima importazione riuscita separati. |
| 30 | Interessi aggregati | Conteggi giornalieri di consultazioni, ricerche, filtri, ordinamenti, preferiti, confronti e condivisioni; prodotti più cliccati da dati esistenti. |

## Verifiche e limiti

- 71 test automatici: qualità e prezzo, ricerca e filtri, paginazione oltre 1.000 righe, copie locali e validazione degli eventi, riprova dei soli falliti, autorizzazioni admin, pipeline AI e importatori.
- ESLint e build Next.js verificati. Le prove sulla Preview vengono annotate nella descrizione della PR.
- Le categorie e le marche sono riconosciute solo quando il titolo dà elementi utili; gli altri prodotti restano in “Altri prodotti” e non ricevono una marca inventata.
- L'indice presentato è limitato a 11.000 prodotti per catalogo e segnala il limite quando raggiunto. Il catalogo attuale è molto più piccolo.
- Le statistiche contano interazioni, non persone uniche; non salvano identità, IP, cookie di tracciamento o testo libero delle ricerche. Lo storico AI preesistente rimane separato. I nuovi conteggi partono da questa versione.
- Prezzi e immagini mancanti dipendono anche dalle risposte Amazon. HAUL ha recentemente risposto HTTP 503; Creators API ha restituito `AssociateNotEligible`. Il codice conserva i dati esistenti e mostra gli esiti, senza dichiarare recuperi non riusciti.
- L'aggiornamento giornaliero in Production resta collegato alla versione precedentemente pubblicata: il nuovo scheduler sarà operativo sul sito principale quando questa PR sarà distribuita su `main`.
- La scheda “Cerca” resta rimossa. La ricerca è disponibile dentro i cataloghi.

## Prove nella Preview

- Home con otto schede iniziali: immagini caricate e nessuna eccedenza orizzontale sul viewport desktop disponibile.
- Offerte Lampo: filtro Oral-B, massimo 50 €, prezzo crescente restituisce tre schede a 20,47 €, 32,97 € e 36,88 €.
- Preferiti: salvataggio conservato tra le pagine; confronto con tre prodotti e rifiuto esplicito del quarto.
- Admin: gruppo HAUL senza descrizione apre 33 schede; conteggi dei tre cataloghi ed esiti di importazione leggibili.
- Eventi aggregati di consultazione, filtro, ordinamento e salvataggio presenti nel database.
- Assistente AI: richiesta con esigenza e budget, stato di attesa effettivo e invio disabilitato durante la ricerca; controllo dei prezzi datati e delle motivazioni. La prova ha identificato accessori compatibili tra i dispositivi: è stato aggiunto un filtro con casi di regressione per spazzolini, cuffie e smartphone.
- Le regole responsive sono state controllate nel CSS; non è stata simulata una sessione reale su telefono.
