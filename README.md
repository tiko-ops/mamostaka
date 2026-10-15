# Mamosta

Enkel svensk texträttning på [www.mamosta.se](https://www.mamosta.se). Klistra in en text, tryck **Korrigera** och se rättningen med markerade ändringar och förklaringar. Det finns också språkguider om vanliga fel.

## Struktur

```
public/               Gränssnittet – statisk HTML, CSS och vanilla JS (inget byggsteg)
  index.html          Startsidan
  integritet.html     Integritetssidan
  styles.css          All CSS, designtokens som CSS-variabler (ljust + mörkt läge)
  app.js              Anrop, ord-diff, ångra, förklaringar, kopiera, felhantering
  guider/             Genererade guidesidor (redigera inte här – se nedan)
  robots.txt, sitemap.xml, favicon.svg, apple-touch-icon.png, og-image.png
content/guider/       Texterna till guiderna (HTML + metadata överst)
scripts/build.mjs     Bygger guiderna och sitemap.xml, och sätter versionsnummer på CSS/JS
pages/404.tsx         Svensk 404-sida (enda React-sidan)
app/api/correct/      API:t (Next.js route handler) – det enda som körs på servern
next.config.mjs       Pekar /, /integritet och /guider/... till de statiska filerna
archive/              Den gamla React-versionen av sidorna (används inte)
```

Next.js används bara för API-routen. Sidorna är vanliga statiska filer.

## API

`POST /api/correct` har två lägen.

**Rätta** – svaret strömmas som `text/plain`:

```json
{ "text": "Din text, max 5000 tecken" }
```

Om strömningen avbryts slutar svaret med `[Fel vid strömning]`.

**Förklara ändringar** – svaret är JSON `{ "reasons": ["...", ...] }`, en per ändring:

```json
{
  "lang": "sv",
  "changes": [{ "from": "dem", "to": "de", "context": "…sa att [dem → de] inte fick…" }]
}
```

`lang`: `sv`, `sv-enkel`, `en`, `ar`, `ckb` (sorani) eller `kmr` (kurmanji). Max 40 ändringar, max 400 tecken per fält.

Fel ger **400 / 429 / 500 / 504** med `{ "error": "Vänligt felmeddelande på svenska" }`.

Ändringarna (överstruket/markerat) räknas fram i webbläsaren med en ord-diff i `public/app.js`, och bara de ändrade orden plus lite sammanhang skickas för att förklaras.

**Begränsning:** 20 rättningar och 40 förklaringsanrop per IP-adress och 10 minuter. Räknaren ligger i serverns minne (per instans), så den är ett skydd mot enkla bottar – inte en garanti. Se *Skydd mot höga kostnader* nedan.

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

## Guider

Guiderna på `/guider` är statiska sidor. Ändra eller lägg till texter i `content/guider/` (ny guide: lägg också till dess namn i `ORDER` i `scripts/build.mjs`) och kör:

```bash
node scripts/build.mjs
```

Skriptet skriver `public/guider/*.html`, hubbsidan `/guider` och en ny `public/sitemap.xml`. Checka in resultatet.

## SEO

- **En adress:** `mamosta.se` omdirigeras permanent till `www.mamosta.se` (next.config.mjs), så att Google bara ser en version av varje sida.
- **Sökord:** startsidan är optimerad för *stavningskontroll* och *grammatikkontroll*, med en FAQ och strukturerad data (Organization, WebSite, WebApplication, FAQPage).
- **Guider:** 14 språkguider i `content/guider/` – nya guider läggs till där och i `ORDER` i `scripts/build.mjs`.
- **Andra språk:** `/en` (Swedish grammar checker) och `/ar` (arabiska) är landningssidor med `hreflang`. Knappen leder till `/?lang=en` resp. `/?lang=ar`, som förväljer förklaringsspråket.
- **AI-sök:** `public/llms.txt` genereras av `scripts/build.mjs`.
- **IndexNow:** efter en deploy med nya eller ändrade sidor, kör `node scripts/indexnow.mjs` för att meddela Bing (som även driver ChatGPT-sök och Copilot). Nyckelfilen `public/<nyckel>.txt` ska ligga kvar – den är publik med flit.

## Snabbhet och cache

- `styles.css` och `app.js` länkas med `?v=hash` och cachas i ett år (`immutable`). Hashen sätts av `scripts/build.mjs`, som körs automatiskt i `npm run build` – även på Vercel – så en ändring i CSS/JS når besökarna direkt vid nästa deploy.
- HTML-sidorna cachas i Vercels CDN men kontrolleras alltid av webbläsaren, så nytt innehåll syns direkt.
- Interna länkar förhandsladdas när man håller musen över dem (*speculation rules*, Chrome/Edge), och sidbyten tonar mjukt (*view transitions*).

## Skydd mot höga kostnader

Räknaren i API:t räcker långt men är inte vattentät. Gör gärna även detta:

1. **OpenAI → Settings → Limits:** sätt en månadsbudget (till exempel 10–20 USD) och e-postvarning.
2. **Vercel → Project → Firewall → Rules:** lägg till en *Rate limit*-regel för sökvägen `/api/correct` om din plan har det.

## Driftsättning

Projektet ligger på Vercel (ramverk: Next.js). En push till `main` driftsätter till www.mamosta.se. Andra grenar får en förhandsversion (preview).

## Integritet

Inga cookies och inga externa typsnitt. Texten skickas till OpenAI för att rättas och sparas inte av Mamosta.

## Statistik

Besöksstatistik via **Vercel Web Analytics** – anonymt och utan cookies. Slå på det i Vercel → Project → Analytics → Enable. Skriptet (`/_vercel/insights/script.js`) laddas i alla sidor, men först när sidan faktiskt visas, så att förhandsladdade sidor inte räknas som besök.

`public/app.js` skickar även anonyma händelser med `track()` – aldrig någon text:

| Händelse | Data |
| --- | --- |
| Korrigera | `langd`: kort (≤200 tecken) / medel (≤1000) / lång |
| Resultat | `andringar`: 0 / 1–3 / 4–10 / 11+ / omskriven |
| Visa ändringar, Kopiera, Ångra ändring, Återställ ändring | – |
| Förklaringsspråk | `sprak`: sv, sv-enkel, en, ar, ckb, kmr |
| Guide från förklaring | `guide`: guidens slug |
| Fel | `typ`: tom text, för lång, 400, 429, 500, 504, timeout, nätverk, offline, ström, förklaring |

Händelser (*custom events*) syns bara i Vercel på Pro-planen. På Hobby räknas besök, sidor, källor, länder och enheter.
