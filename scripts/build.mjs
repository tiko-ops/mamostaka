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
  "apostrof",
  "en-eller-ett",
  "kolon-och-semikolon",
];

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const strip = (html) => html.replace(/<[^>]+>/g, "");

// Engelska guider för den som lär sig svenska (/en/<slug>), med koppling till svensk motsvarighet
const EN_ORDER = ["de-or-dem", "en-or-ett", "swedish-word-order", "swedish-compound-words"];
const enGuides = EN_ORDER.map((slug) => {
  const raw = readFileSync(join(root, "content/en-guides", `${slug}.html`), "utf8");
  const m = raw.match(/^<!--\s*([\s\S]*?)\s*-->\s*([\s\S]*)$/);
  if (!m) throw new Error(`Saknar metadata i en-guides/${slug}.html`);
  return { slug, ...JSON.parse(m[1]), body: m[2].trim() };
});
const enFor = (svSlug) => enGuides.find((g) => g.sv === svSlug);

const guides = ORDER.map((slug) => {
  const raw = readFileSync(join(root, "content/guider", `${slug}.html`), "utf8");
  const m = raw.match(/^<!--\s*([\s\S]*?)\s*-->\s*([\s\S]*)$/);
  if (!m) throw new Error(`Saknar metadata i ${slug}.html`);
  return { slug, ...JSON.parse(m[1]), body: m[2].trim() };
});

function page({ title, description, path, ogType = "article", jsonLd, main, mainClass = "wrap prose", script = "", skipTo = "#content", alternates = [] }) {
  const url = SITE + path;
  return `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${url}">${alternates
    .map(([hl, href]) => `
  <link rel="alternate" hreflang="${hl}" href="${SITE}${href}">`)
    .join("")}
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
  </script>${script}
</head>
<body>
  <a class="skip-link" href="${skipTo}">${skipTo === "#text" ? "Hoppa till textfältet" : "Hoppa till innehållet"}</a>

  <header class="site-header">
    <div class="wrap">
      <a class="logo" href="/" aria-label="Mamosta, startsida">Mamosta</a>
      <nav aria-label="Huvudmeny">
        <a href="/">Rätta text</a>
        <a href="/guider"${path.startsWith("/guider") ? ' aria-current="page"' : ""}>Guider</a>
      </nav>
    </div>
  </header>

  <main id="content" class="${mainClass}">
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

  const en = enFor(g.slug);
  const html = page({
    title: `${g.title} | Mamosta`,
    description: g.description,
    path,
    alternates: en ? [["sv", path], ["en", `/en/${en.slug}`]] : [],
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
    alternates: [["sv", "/guider"], ["en", "/en/guides"]],
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

// Sidor för olika användningar (personligt brev, CV …) – med rättningsverktyget inbyggt
const USE_ORDER = ["personligt-brev", "cv", "uppsats", "mejl"];
const useCases = USE_ORDER.map((slug) => {
  const raw = readFileSync(join(root, "content/ratta", `${slug}.html`), "utf8");
  const m = raw.match(/^<!--\s*([\s\S]*?)\s*-->\s*([\s\S]*)$/);
  if (!m) throw new Error(`Saknar metadata i ratta/${slug}.html`);
  return { slug, ...JSON.parse(m[1]), body: m[2].trim() };
});

// Verktyget hämtas från startsidan, så att det alltid är samma formulär och resultatvy
const indexHtml = readFileSync(join(root, "public/index.html"), "utf8");
const toolStart = indexHtml.indexOf('    <form id="form"');
const toolEnd = indexHtml.indexOf("</p>", indexHtml.indexOf('<p id="status"')) + "</p>".length;
if (toolStart < 0 || toolEnd < toolStart) throw new Error("Hittar inte verktyget i public/index.html");
const tool = indexHtml.slice(toolStart, toolEnd);

mkdirSync(join(root, "public/ratta"), { recursive: true });
for (const u of useCases) {
  const path = `/ratta/${u.slug}`;
  const others = useCases
    .filter((o) => o.slug !== u.slug)
    .map((o) => `        <li><a href="/ratta/${o.slug}">${esc(o.name)}</a></li>`)
    .join("\n");
  const exampleBtn = '<button id="example" type="button" class="link-btn">';
  if (!tool.includes(exampleBtn)) throw new Error("Hittar inte exempelknappen i verktyget");
  const localTool = u.example
    ? tool.replace(exampleBtn, `<button id="example" type="button" class="link-btn" data-example="${esc(u.example)}">`)
    : tool;
  const main = `    <section class="intro">
      <h1>${esc(u.h1)}</h1>
      <p class="lead">${esc(u.lead)}</p>
    </section>

${localTool}

    <article class="prose usecase">
${u.body
  .split("\n")
  .map((l) => (l ? "      " + l : l))
  .join("\n")}

      <section class="more" aria-labelledby="more-title">
        <h2 id="more-title">Rätta andra texter</h2>
        <ul>
${others}
        </ul>
      </section>
    </article>`;

  writeFileSync(
    join(root, "public/ratta", `${u.slug}.html`),
    page({
      title: u.title,
      description: u.description,
      path,
      ogType: "website",
      mainClass: "wrap",
      skipTo: "#text",
      script: `\n  <script src="${JS}" defer></script>`,
      jsonLd: {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebPage",
            name: u.title,
            url: SITE + path,
            inLanguage: "sv",
            description: u.description,
            isPartOf: { "@id": `${SITE}/#site` },
          },
          breadcrumb([["Mamosta", "/"], [u.name, path]]),
        ],
      },
      main,
    })
  );
}

// Engelska och arabiska sidor (/en, /ar) med verktyget inbyggt och översatt gränssnitt
const TOOL_TEXTS = {
  en: [
    ["Text att korrigera", "Swedish text to check"],
    ["Klistra in din text här…", "Paste your Swedish text here…"],
    ["Prova med en exempeltext", "Try an example text"],
    ["för att korrigera</span>", "to check</span>"],
    ["0 ord · 0 / 5 000 tecken", "0 words · 0 / 5,000 characters"],
    ['<span class="label">Korrigera</span>', '<span class="label">Check text</span>'],
    [">Rensa</button>", ">Clear</button>"],
    ["Din text sparas inte.", "Your text is not stored."],
    [">Resultat</h2>", ">Result</h2>"],
    ['aria-label="Visa"', 'aria-label="View"'],
    [">Korrigerad text</button>", ">Corrected text</button>"],
    [">Ändringar</button>", ">Changes</button>"],
    [">Kopiera</button>", ">Copy</button>"],
    ["<del>Överstruket</del> är borttaget, <ins>markerat</ins> är tillagt. Klicka på en ändring för att ångra den.",
     "<del>Struck through</del> is removed, <ins>highlighted</ins> is added. Click a change to undo it."],
    [">Vad ändrades?</h3>", ">What changed?</h3>"],
    ["<span>Förklaringar på</span>", "<span>Explanations in</span>"],
    ['<option value="sv">Svenska</option>', '<option value="sv">Swedish</option>'],
    ['<option value="sv-enkel">Enkel svenska</option>', '<option value="sv-enkel">Simple Swedish</option>'],
  ],
  ar: [
    ["Text att korrigera", "النص السويدي المراد تصحيحه"],
    ["Klistra in din text här…", "الصق نصك السويدي هنا…"],
    ["Prova med en exempeltext", "جرّب نصاً تجريبياً"],
    ["för att korrigera</span>", "للتصحيح</span>"],
    ["0 ord · 0 / 5 000 tecken", "0 كلمة · 0 / 5000 حرف"],
    ['<span class="label">Korrigera</span>', '<span class="label">صحّح النص</span>'],
    [">Rensa</button>", ">مسح</button>"],
    ["Din text sparas inte.", "نصك لا يُحفظ."],
    [">Resultat</h2>", ">النتيجة</h2>"],
    ['aria-label="Visa"', 'aria-label="عرض"'],
    [">Korrigerad text</button>", ">النص المصحّح</button>"],
    [">Ändringar</button>", ">التغييرات</button>"],
    [">Kopiera</button>", ">نسخ</button>"],
    ["<del>Överstruket</del> är borttaget, <ins>markerat</ins> är tillagt. Klicka på en ändring för att ångra den.",
     "<del>المشطوب</del> محذوف، و<ins>المظلّل</ins> مُضاف. اضغط على أي تغيير للتراجع عنه."],
    [">Vad ändrades?</h3>", ">ماذا تغيّر؟</h3>"],
    ["<span>Förklaringar på</span>", "<span>الشرح بـ</span>"],
    ['<option value="sv">Svenska</option>', '<option value="sv">السويدية</option>'],
    ['<option value="sv-enkel">Enkel svenska</option>', '<option value="sv-enkel">سويدية مبسّطة</option>'],
  ],
};

for (const lang of ["en", "ar"]) {
  const raw = readFileSync(join(root, "content/lang", `${lang}.html`), "utf8");
  const m = raw.match(/^<!--\s*([\s\S]*?)\s*-->\s*([\s\S]*)$/);
  if (!m) throw new Error(`Saknar metadata i lang/${lang}.html`);
  const L = JSON.parse(m[1]);
  const body = m[2].trim();
  const path = `/${lang}`;

  let localTool = tool;
  for (const [from, to] of TOOL_TEXTS[lang]) {
    if (!localTool.includes(from)) throw new Error(`Hittar inte "${from}" i verktyget (${lang})`);
    localTool = localTool.split(from).join(to);
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: L.h1,
        url: SITE + path,
        inLanguage: lang,
        description: L.description,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "All",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "SEK" },
        isPartOf: { "@id": `${SITE}/#site` },
      },
      {
        "@type": "FAQPage",
        inLanguage: lang,
        mainEntity: L.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      },
    ],
  };

  const faq = L.faq
    .map(([q, a]) => `      <details>\n        <summary>${esc(q)}</summary>\n        <p>${esc(a)}</p>\n      </details>`)
    .join("\n");
  const nav = L.navLinks
    .map(([href, label, hl]) => `        <a href="${href}" hreflang="${hl}" lang="${hl}">${label}</a>`)
    .join("\n");

  const html = `<!doctype html>
<html lang="${lang}" dir="${L.dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(L.title)}</title>
  <meta name="description" content="${esc(L.description)}">
  <link rel="canonical" href="${SITE}${path}">
  <link rel="alternate" hreflang="sv" href="${SITE}/">
  <link rel="alternate" hreflang="en" href="${SITE}/en">
  <link rel="alternate" hreflang="ar" href="${SITE}/ar">
  <link rel="alternate" hreflang="x-default" href="${SITE}/">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#f7f6f2" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#161716" media="(prefers-color-scheme: dark)">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="${L.ogLocale}">
  <meta property="og:site_name" content="Mamosta">
  <meta property="og:title" content="${esc(L.title)}">
  <meta property="og:description" content="${esc(L.description)}">
  <meta property="og:url" content="${SITE}${path}">
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
  <script src="${JS}" defer></script>
</head>
<body>
  <a class="skip-link" href="#text">${esc(L.skip)}</a>

  <header class="site-header">
    <div class="wrap">
      <a class="logo" href="${path}" aria-label="Mamosta">Mamosta</a>
      <nav aria-label="${esc(L.nav)}">
${nav}
      </nav>
    </div>
  </header>

  <main class="wrap">
    <section class="intro">
      <h1>${esc(L.h1)}</h1>
      <p class="lead">${esc(L.lead)}</p>
    </section>

${localTool}

    <section class="about">
${body
  .split("\n")
  .map((l) => (l ? "      " + l : l))
  .join("\n")}
    </section>

    <section class="faq" aria-labelledby="faq-title">
      <h2 id="faq-title">${esc(L.faqTitle)}</h2>
${faq}
    </section>
  </main>

  <footer class="site-footer">
    <div class="wrap">
      <p>${L.footer}</p>
    </div>
  </footer>
</body>
</html>
`;
  writeFileSync(join(root, "public", `${lang}.html`), html);
}

// Engelska guider och hubb
function enPage({ title, description, path, jsonLd, main, alternates = [] }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${SITE}${path}">${alternates
    .map(([hl, href]) => `\n  <link rel="alternate" hreflang="${hl}" href="${SITE}${href}">`)
    .join("")}
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#f7f6f2" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#161716" media="(prefers-color-scheme: dark)">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="en_GB">
  <meta property="og:site_name" content="Mamosta">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${SITE}${path}">
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
  <a class="skip-link" href="#content">Skip to content</a>

  <header class="site-header">
    <div class="wrap">
      <a class="logo" href="/en" aria-label="Mamosta, Swedish grammar checker">Mamosta</a>
      <nav aria-label="Main menu">
        <a href="/en">Check text</a>
        <a href="/en/guides"${path.startsWith("/en/guides") ? ' aria-current="page"' : ""}>Guides</a>
        <a href="/" hreflang="sv" lang="sv">Svenska</a>
      </nav>
    </div>
  </header>

  <main id="content" class="wrap prose">
${main}
  </main>

  <footer class="site-footer">
    <div class="wrap">
      <p>© Mamosta · <a href="/en">Swedish grammar checker</a> · <a href="/en/guides">Guides</a> · No cookies</p>
    </div>
  </footer>
</body>
</html>
`;
}

const enCta = `
    <aside class="cta">
      <p><strong>Check your own Swedish text.</strong> Paste it into Mamosta and get spelling and grammar corrected – with every change explained in English. Free, no sign-up.</p>
      <a class="btn btn-primary" href="/en">Check your Swedish text</a>
    </aside>`;

mkdirSync(join(root, "public/en"), { recursive: true });
for (const g of enGuides) {
  const path = `/en/${g.slug}`;
  const others = enGuides
    .filter((o) => o.slug !== g.slug)
    .map((o) => `        <li><a href="/en/${o.slug}">${esc(o.h1)}</a></li>`)
    .join("\n");
  const main = `    <nav class="crumbs" aria-label="Breadcrumbs"><a href="/en">Mamosta</a> <span aria-hidden="true">/</span> <a href="/en/guides">Guides</a></nav>
    <article>
      <h1>${esc(g.h1)}</h1>
      <div class="answer">
        <p class="answer-label">Short answer</p>
        <p>${g.short}</p>
      </div>
${g.body
  .split("\n")
  .map((l) => (l ? "      " + l : l))
  .join("\n")}
    </article>
${enCta}
    <section class="more" aria-labelledby="more-title">
      <h2 id="more-title">More guides</h2>
      <ul>
${others}
      </ul>
    </section>`;
  writeFileSync(
    join(root, "public/en", `${g.slug}.html`),
    enPage({
      title: `${g.title} | Mamosta`,
      description: g.description,
      path,
      alternates: g.sv ? [["en", path], ["sv", `/guider/${g.sv}`]] : [],
      jsonLd: {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Article",
            headline: g.title,
            description: g.description,
            inLanguage: "en",
            url: SITE + path,
            dateModified: today,
            author: { "@type": "Organization", name: "Mamosta", url: SITE + "/en" },
            publisher: { "@type": "Organization", name: "Mamosta", url: SITE + "/" },
          },
          breadcrumb([["Mamosta", "/en"], ["Guides", "/en/guides"], [g.h1, path]]),
        ],
      },
      main,
    })
  );
}

const enCards = enGuides
  .map((g) => `      <li>\n        <a href="/en/${g.slug}">${esc(g.h1)}</a>\n        <p>${esc(strip(g.short))}</p>\n      </li>`)
  .join("\n");
writeFileSync(
  join(root, "public/en/guides.html"),
  enPage({
    title: "Common Swedish grammar mistakes – guides for learners | Mamosta",
    description:
      "Short English guides to the most common Swedish grammar mistakes: de or dem, en or ett, word order and compound words. With tricks, examples and exercises.",
    path: "/en/guides",
    alternates: [["en", "/en/guides"], ["sv", "/guider"]],
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          name: "Common Swedish grammar mistakes",
          inLanguage: "en",
          url: SITE + "/en/guides",
          hasPart: enGuides.map((g) => ({ "@type": "Article", headline: g.title, url: `${SITE}/en/${g.slug}` })),
        },
        breadcrumb([["Mamosta", "/en"], ["Guides", "/en/guides"]]),
      ],
    },
    main: `    <h1>Common Swedish grammar mistakes</h1>
    <p class="lead">Short guides in English for people learning Swedish – with simple rules, tricks that are easy to remember, and exercises.</p>
    <ul class="guide-list">
${enCards}
    </ul>
    <p>More guides in Swedish: <a href="/guider" hreflang="sv" lang="sv">Språkguider</a>.</p>
${enCta}`,
  })
);

// Sitemap
const urls = [
  "/",
  ...useCases.map((u) => `/ratta/${u.slug}`),
  "/en",
  "/en/guides",
  ...enGuides.map((g) => `/en/${g.slug}`),
  "/ar",
  "/guider",
  ...guides.map((g) => `/guider/${g.slug}`),
  "/integritet",
];
writeFileSync(
  join(root, "public/sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${SITE}${u}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`).join("\n")}
</urlset>
`
);

// Versionsnummer i de handskrivna sidorna
for (const file of ["index.html", "integritet.html"]) {
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

## Rätta en viss sorts text

${useCases.map((u) => `- [${u.name}](${SITE}/ratta/${u.slug}): ${u.description}`).join("\n")}

## Guides in English (for learners of Swedish)

${enGuides.map((g) => `- [${g.h1}](${SITE}/en/${g.slug}): ${g.description}`).join("\n")}

## Språkguider

${guides.map((g) => `- [${g.h1}](${SITE}/guider/${g.slug}): ${g.description}`).join("\n")}

## Övrigt

- [Integritet](${SITE}/integritet): hur texten hanteras (sparas inte, inga cookies)
`
);

// Samma versionsnummer till 404-sidan (pages/404.tsx)
writeFileSync(join(root, "lib/assets.json"), JSON.stringify({ css: CSS, js: JS }, null, 2) + "\n");

console.log(`Byggde ${guides.length} guider, hubbsida och sitemap.xml (${CSS}, ${JS})`);
