# Mamosta

Enkel svensk texträttning på [www.mamosta.se](https://www.mamosta.se). Klistra in en text, tryck **Korrigera** och se rättningen med markerade ändringar.

## Struktur

```
public/               Gränssnittet – statisk HTML, CSS och vanilla JS (inget byggsteg)
  index.html          Startsidan
  integritet.html     Integritetssidan
  styles.css          All CSS, designtokens som CSS-variabler (ljust + mörkt läge)
  app.js              Teckenräknare, anrop, ord-diff, kopiera, felhantering
  robots.txt, sitemap.xml, favicon.svg, apple-touch-icon.png, og-image.png
app/api/correct/      API:t (Next.js route handler) – det enda som körs på servern
next.config.mjs       Pekar / → /index.html och /integritet → /integritet.html
archive/              Den gamla React-versionen av sidorna (används inte)
```

Next.js används bara för API-routen. Sidorna är vanliga statiska filer.

## API

`POST /api/correct`

```json
{ "text": "Din text, max 5000 tecken" }
```

- **200** – den korrigerade texten strömmas som `text/plain`. Om strömningen avbryts avslutas svaret med `[Fel vid strömning]`.
- **400 / 429 / 500 / 504** – `{ "error": "Vänligt felmeddelande på svenska" }`

API:t returnerar bara den korrigerade texten. Ändringarna (överstruket/markerat) räknas fram i webbläsaren med en ord-diff i `public/app.js`.

Användarens text loggas eller sparas aldrig. Bara felstatus loggas.

## Miljövariabler

| Namn | Krävs | Beskrivning |
| --- | --- | --- |
| `OPENAI_API_KEY` | Ja | Används bara på servern, når aldrig webbläsaren |
| `OPENAI_MODEL` | Nej | Standard `gpt-4o-mini` |

Lokalt: kopiera `.env.example` till `.env.local` och fyll i. I produktion: Vercel → Project → Settings → Environment Variables. Checka aldrig in riktiga nycklar.

## Köra lokalt

Kräver Node 18.18 eller senare.

```bash
npm install
cp .env.example .env.local   # fyll i OPENAI_API_KEY
npm run dev
```

Öppna http://localhost:3000.

## Driftsättning

Projektet ligger på Vercel (ramverk: Next.js). En push till `main` driftsätter till www.mamosta.se. Andra grenar får en förhandsversion (preview).

## Integritet

Inga cookies, ingen analys, inga spårningsskript och inga externa typsnitt. Texten skickas till OpenAI för att rättas och sparas inte av Mamosta.
