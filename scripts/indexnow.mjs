// Meddelar Bing (och via IndexNow även Yandex m.fl.) att sidorna på www.mamosta.se har ändrats.
// Bing driver också sökningen i ChatGPT och Copilot. Kör efter en deploy:
//   node scripts/indexnow.mjs
// Nyckeln ligger publikt i public/<nyckel>.txt – det är så IndexNow verifierar att vi äger sajten.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEY = "b2905e0d6116e05ec04cbcae476d9e73";
const HOST = "www.mamosta.se";

const sitemap = readFileSync(join(root, "public/sitemap.xml"), "utf8");
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
});
console.log(`IndexNow: ${res.status} ${res.statusText} (${urlList.length} adresser)`);
