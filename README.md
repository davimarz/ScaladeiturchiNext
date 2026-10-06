# Scala dei Turchi Next

Nuova versione web di Scala dei Turchi Amazon. Il progetto originale Streamlit rimane separato e invariato.

## Architettura

- Next.js App Router
- Supabase/PostgreSQL
- Amazon Creators API lato server
- catalogo pubblico letto dal database
- sincronizzazione Amazon → database tramite endpoint protetto
- area amministrativa `/admin`
- tracciamento interno dei click affiliati senza memorizzare IP

## Variabili ambiente

Copia `.env.example` e configura solo sul server:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `AMAZON_PARTNER_TAG`
- `AMAZON_APPLICATION_ID`
- `AMAZON_CREDENTIAL_ID`
- `AMAZON_CREDENTIAL_SECRET`
- `AMAZON_CREDENTIAL_VERSION`
- `CRON_SECRET`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

Le credenziali Amazon e Supabase non devono essere esposte tramite variabili `NEXT_PUBLIC_*`.

## Sviluppo

```bash
npm install
npm run dev
```

## Build

```bash
npm run lint
npm run build
npm run start
```

## Docker

La configurazione `output: "standalone"` permette il deploy anche fuori da Vercel.

```bash
docker build -t scaladeiturchi-next .
docker run --env-file .env.local -p 3000:3000 scaladeiturchi-next
```

## Deploy

Il repository è pronto per essere importato in Vercel. Dopo il primo deploy vanno configurate le variabili ambiente server-side e verificata la sincronizzazione reale con Amazon Creators API.

## Correzioni admin e sicurezza
- Installazione riproducibile: `pnpm install --frozen-lockfile`; verifiche: `pnpm lint`, `pnpm test`, `pnpm build`.
- Applicare la migration in `supabase/migrations` prima di pubblicare questa versione. Il login fallisce in modo sicuro se la funzione di limitazione non è disponibile.
- Il login consente 10 tentativi per indirizzo ogni 15 minuti e 200 complessivi. L'indirizzo è usato soltanto tramite hash HMAC; fuori da Vercel vale un limite condiviso di 10.
- La funzione RPC è eseguibile solo da service_role e usa SECURITY INVOKER. Le tabelle dei tentativi restano nello schema privato, con RLS.
- Le operazioni admin richiedono stessa origine e sessione firmata.
- "Nascondi" disattiva il prodotto senza cancellarlo. Per ripubblicarlo, incollare nuovamente il link.
- Titolo e categoria dei prodotti manuali sono modificabili. Reincollare un link conserva foto, titolo e categoria già presenti se non sostituiti.
- Si estraggono immagini HTTPS sui domini Amazon consentiti, ignorando pixel 1x1. Si salva l'URL esterno; le foto caricate da PC sono salvate su Storage.
- Il catalogo manuale richiede solo le credenziali Supabase. Le credenziali Amazon sono necessarie soltanto per la sincronizzazione API.
- AssociateNotEligible richiede l'idoneità dell'account Amazon e non viene aggirato dal codice.

## Immagini automatiche dal link Amazon
Se non esiste una foto e non viene fornita un’immagine, l’admin legge la pagina pubblica canonica Amazon del prodotto e seleziona soltanto l’immagine principale. Le richieste hanno un timeout complessivo di 10 secondi, massimo 3 redirect verificati e un limite di 2 MB di HTML. Non vengono aggirati CAPTCHA o blocchi: se Amazon non permette la lettura, il prodotto viene salvato e l’admin segnala la foto mancante. Le foto esistenti sono conservate. Si salva il collegamento CDN Amazon, senza copiare il file.


## Chromium su Vercel

Le funzioni di importazione Amazon usano `@sparticuz/chromium-min`. Il pacchetto Chromium non viene salvato dentro `public/` e quindi non viene duplicato in ogni deployment Vercel. A runtime viene usato il pack ufficiale della release Chromium 153; opzionalmente può essere sostituito impostando `CHROMIUM_PACK_URL` su un URL HTTPS compatibile.
