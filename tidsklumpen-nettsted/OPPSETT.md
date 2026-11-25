# Tidsklumpen: slik settes fredagsreisene opp

Alt i denne mappa skal ligge i roten av GitHub-repoet:

- `index.html` (hele nettsiden)
- `vercel.json` (sier at fredagsjobben skal gå hver fredag)
- `api/` (påmelding, status, avmelding og fredagsjobben)

## Én gang i Vercel

1. **Storage**: lag en Upstash Redis-database og koble den til prosjektet. Vercel legger da inn `KV_REST_API_URL` og `KV_REST_API_TOKEN` selv.
2. **Settings, Environment Variables**: legg inn
   - `RESEND_API_KEY`: nøkkelen fra Resend
   - `CRON_SECRET`: en lang, tilfeldig tekst du finner på selv (minst 16 tegn)
   - `EPOST_FRA`: for eksempel `Ludvig og Knut <knut@tidsklumpen.no>`. Vent med denne til domenet er godkjent i Resend. Uten den sendes det fra Resends testadresse, og da kommer e-post bare fram til adressen Resend-kontoen din er registrert på.
3. **Deploy på nytt** etter at variablene er lagt inn, ellers ser ikke funksjonene dem.

## Slik virker det

- Noen skriver inn e-posten sin. Første reise sendes med en gang.
- Reisen åpner seg når de trykker på knappen i e-posten. Adressen regnes som bekreftet først da, og bare bekreftede adresser får flere e-poster.
- Hver fredag låser `/api/fredag` opp neste reise og sender e-posten. De som meldte seg på siste døgn, venter til neste fredag.
- Avmeldingslenke står i hver e-post. Avmelding sletter adressen.

## Greit å vite

- Klokkeslettet står i `vercel.json` som `0 15 * * 5`. Det er UTC, altså 16-tida norsk vintertid. På gratisplanen kjører Vercel jobben en gang i løpet av den timen. Om sommeren må 15 byttes til 14.
- Fredagsjobben kan kjøres for hånd fra Vercel (Cron Jobs, Run) hvis du vil teste.
- Nye episoder: bytt ut `index.html` og `api/_lib/episoder.json`. Begge lages av byggeskriptet.
- I forhåndsvisningen på claude.ai er alle reisene åpne. Låsen gjelder bare på tidsklumpen.no og vercel.app.
