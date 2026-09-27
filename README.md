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
