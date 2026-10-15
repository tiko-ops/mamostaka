// Bygger de statiska sidorna:
//  - content/guider/*.html → public/guider/*.html (+ hubbsida) och public/sitemap.xml
//  - versionsnummer på styles.css och app.js i alla HTML-filer (?v=hash), så att de
//    kan cachas länge i webbläsaren men ändå uppdateras direkt vid nästa deploy.
// Körs automatiskt av "npm run build" (även på Vercel). Manuellt: node scripts/build.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://www.mamosta.se";
const today = new Date().toISOString().slice(0, 10);

const hash = (file) =>
  createHash("sha256").update(readFileSync(join(root, "public", file))).digest("hex").slice(0, 10);
const CSS = `/styles.css?v=${hash("styles.css")}`;
const JS = `/app.js?v=${hash("app.js")}`;

// Vercel Web Analytics (anonymt, utan cookies). Laddas först när sidan faktiskt visas,
// så att förhandsladdade sidor inte räknas som besök.
const ANALYTICS = `<script>
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    (function () {
      function load() {
        var s = document.createElement("script");
        s.defer = true;
        s.src = "/_vercel/insights/script.js";
        document.head.appendChild(s);
      }
      if (document.prerendering) document.addEventListener("prerenderingchange", load, { once: true });
      else load();
    })();
  </script>`;

// Förhandsladdar en intern sida när man håller musen över länken (Chrome/Edge),
// så att sidbyten känns direkta. Andra webbläsare ignorerar detta.
const SPECULATION = `<script type="speculationrules">
  {"prerender": [{"where": {"and": [{"href_matches": "/*"}, {"not": {"href_matches": "/api/*"}}]}, "eagerness": "moderate"}]}
  </script>`;

// Ordningen styr hubbsidan och "Fler guider"
const ORDER = [
  "de-eller-dem",
  "sarskrivning",
  "komma",
  "och-eller-att",
  "var-eller-vart",
  "sin-eller-hans",
  "stor-eller-liten-bokstav",
  "ihop-eller-isar",
  "enda-eller-anda",
  "an-eller-en",
  "sen-eller-sedan",
  "mig-eller-mej",
  "forkortningar",
  "siffror-och-datum",
];

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const strip = (html) => html.replace(/<[^>]+>/g, "");

const guides = ORDER.map((slug) => {
  const raw = readFileSync(join(root, "content/guider", `${slug}.html`), "utf8");
  const m = raw.match(/^<!--\s*([\s\S]*?)\s*-->\s*([\s\S]*)$/);
  if (!m) throw new Error(`Saknar metadata i ${slug}.html`);
  return { slug, ...JSON.parse(m[1]), body: m[2].trim() };
});

function page({ title, description, path, ogType = "article", jsonLd, main }) {
  const url = SITE + path;
  return `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${url}">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#f7f6f2" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#161716" media="(prefers-color-scheme: dark)">
  <meta property="og:type" content="${ogType}">
  <meta property="og:locale" content="sv_SE">
  <meta property="og:site_name" content="Mamosta">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="stylesheet" href="${CSS}">
  ${SPECULATION}
  ${ANALYTICS}
  <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
  </script>
</head>
<body>
  <a class="skip-link" href="#content">Hoppa till innehållet</a>

  <header class="site-header">
    <div class="wrap">
      <a class="logo" href="/" aria-label="Mamosta, startsida">Mamosta</a>
      <nav aria-label="Huvudmeny">
        <a href="/">Rätta text</a>
        <a href="/guider"${path.startsWith("/guider") ? ' aria-current="page"' : ""}>Guider</a>
      </nav>
    </div>
  </header>

  <main id="content" class="wrap prose">
${main}
  </main>

  <footer class="site-footer">
    <div class="wrap">
      <p>© Mamosta · <a href="/guider">Guider</a> · <a href="/integritet">Integritet</a> · Inga cookies</p>
    </div>
  </footer>
</body>
</html>
`;
}

const breadcrumb = (items) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({
    "@type": "ListItem",
    position: i + 1,
    name,
    item: SITE + path,
  })),
});

const cta = `
    <aside class="cta">
      <p><strong>Osäker på din egen text?</strong> Klistra in den så rättar Mamosta stavning, grammatik och särskrivningar – och förklarar varför.</p>
      <a class="btn btn-primary" href="/">Rätta din text</a>
    </aside>`;

mkdirSync(join(root, "public/guider"), { recursive: true });

for (const g of guides) {
  const path = `/guider/${g.slug}`;
  const others = guides
    .filter((o) => o.slug !== g.slug)
    .map((o) => `        <li><a href="/guider/${o.slug}">${esc(o.h1)}</a></li>`)
    .join("\n");

  const main = `    <nav class="crumbs" aria-label="Brödsmulor"><a href="/">Mamosta</a> <span aria-hidden="true">/</span> <a href="/guider">Guider</a></nav>
    <article>
      <h1>${esc(g.h1)}</h1>
      <div class="answer">
        <p class="answer-label">Kort svar</p>
        <p>${g.short}</p>
      </div>
${g.body
  .split("\n")
  .map((l) => (l ? "      " + l : l))
  .join("\n")}
    </article>
${cta}
    <section class="more" aria-labelledby="more-title">
      <h2 id="more-title">Fler guider</h2>
      <ul>
${others}
      </ul>
    </section>`;

  const html = page({
    title: `${g.title} | Mamosta`,
    description: g.description,
    path,
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Article",
          headline: g.title,
          description: g.description,
          inLanguage: "sv",
          url: SITE + path,
          dateModified: today,
          author: { "@type": "Organization", name: "Mamosta", url: SITE + "/" },
          publisher: { "@type": "Organization", name: "Mamosta", url: SITE + "/" },
        },
        breadcrumb([["Mamosta", "/"], ["Guider", "/guider"], [g.h1, path]]),
      ],
    },
    main,
  });
  writeFileSync(join(root, "public/guider", `${g.slug}.html`), html);
}

// Hubbsida
const cards = guides
  .map(
    (g) => `      <li>
        <a href="/guider/${g.slug}">${esc(g.h1)}</a>
        <p>${esc(strip(g.short))}</p>
      </li>`
  )
  .join("\n");

writeFileSync(
  join(root, "public/guider/index.html"),
  page({
    title: "Språkguider – vanliga fel i svenska | Mamosta",
    description:
      "Korta guider om de vanligaste felen i svenska: de eller dem, särskrivning, komma, och eller att, var eller vart och mer. Med knep och övningar.",
    path: "/guider",
    ogType: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          name: "Språkguider",
          inLanguage: "sv",
          url: SITE + "/guider",
          hasPart: guides.map((g) => ({ "@type": "Article", headline: g.title, url: `${SITE}/guider/${g.slug}` })),
        },
        breadcrumb([["Mamosta", "/"], ["Guider", "/guider"]]),
      ],
    },
    main: `    <h1>Språkguider</h1>
    <p class="lead">Korta svar på de vanligaste frågorna om svensk stavning och grammatik – med knep som gör det lätt att komma ihåg.</p>
    <ul class="guide-list">
${cards}
    </ul>
${cta}`,
  })
);

// Sitemap
const urls = ["/", "/en", "/ar", "/guider", ...guides.map((g) => `/guider/${g.slug}`), "/integritet"];
writeFileSync(
  join(root, "public/sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${SITE}${u}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`).join("\n")}
</urlset>
`
);

// Versionsnummer i de handskrivna sidorna
for (const file of ["index.html", "integritet.html", "en.html", "ar.html"]) {
  const path = join(root, "public", file);
  const html = readFileSync(path, "utf8")
    .replace(/href="\/styles\.css(\?v=\w+)?"/g, `href="${CSS}"`)
    .replace(/src="\/app\.js(\?v=\w+)?"/g, `src="${JS}"`);
  writeFileSync(path, html);
}

// llms.txt – kort beskrivning av sajten för AI-assistenter och AI-sök
writeFileSync(
  join(root, "public/llms.txt"),
  `# Mamosta

> Mamosta (www.mamosta.se) är en gratis stavningskontroll och grammatikkontroll för svensk text. Användaren klistrar in en text (max 5 000 tecken) och får den rättad – stavfel, särskrivningar, grammatik som de/dem, kommatering och stor/liten bokstav – med en kort förklaring till varje ändring. Förklaringarna finns på svenska, enkel svenska, engelska, arabiska och kurdiska (sorani och kurmanji). Inget konto, inga cookies, och texten sparas inte.

## Verktyg

- [Rätta svensk text](${SITE}/): stavnings- och grammatikkontroll med förklaringar
- [Swedish grammar checker (English)](${SITE}/en): samma verktyg, beskrivet på engelska
- [مدقق اللغة السويدية (العربية)](${SITE}/ar): samma verktyg, beskrivet på arabiska

## Språkguider

${guides.map((g) => `- [${g.h1}](${SITE}/guider/${g.slug}): ${g.description}`).join("\n")}

## Övrigt

- [Integritet](${SITE}/integritet): hur texten hanteras (sparas inte, inga cookies)
`
);

// Samma versionsnummer till 404-sidan (pages/404.tsx)
writeFileSync(join(root, "lib/assets.json"), JSON.stringify({ css: CSS, js: JS }, null, 2) + "\n");

console.log(`Byggde ${guides.length} guider, hubbsida och sitemap.xml (${CSS}, ${JS})`);
