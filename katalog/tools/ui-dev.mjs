// Náhled stránky katalogu bez hry: http server s jádrem katalogu nad gen/ a falešný most (callEvent -> POST /api -> CustomEvent).
//   node tools/ui-dev.mjs [port]          potom http://127.0.0.1:5178/?vyber=prichod  (vyber = režim výběru)
// Potřebuje `npm run katalog` a `npm run build` (bere dist/katalog/ui).
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.argv[2]) || 5178;
const coreJs = buildSync({ entryPoints: [join(root, "src", "core.ts")], bundle: true, format: "cjs", platform: "node", write: false }).outputFiles[0].text;
const slotyJs = buildSync({ entryPoints: [join(root, "src", "sloty.ts")], bundle: true, format: "cjs", platform: "node", write: false }).outputFiles[0].text;
const load = (code) => { const m = { exports: {} }; new Function("module", "exports", "require", code)(m, m.exports, () => ({})); return m.exports; };
const { Katalog, davky } = load(coreJs);
const { KATEGORIE, SLOTY } = load(slotyJs);
const data = JSON.parse(readFileSync(join(root, "gen", "katalog.json"), "utf8"));
const kat = new Katalog(data.polozky, (id) => !/^npc|alias/i.test(id), (id) => /^(f_)?(tunic|hose|shoes|boots|hood|cap|coat|gambeson)/i.test(id));
const pod = Object.fromEntries(Object.keys(KATEGORIE).map((k) => [k, kat.podkategorie(k)]));
const kolekce = [];
const ikona = (k) => { const f = join(root, "gen", "ikony", k + ".png"); return existsSync(f) ? readFileSync(f).toString("base64") : ""; };

function api(z) {
  const rid = z.rid;
  switch (z.op) {
    case "info": return [{ rid, ok: true, info: { pocet: kat.polozky.length, ikon: 0, kategorie: KATEGORIE, sloty: SLOTY, podkategorie: pod, generovano: data.generovano, sady: ["Sedlák", "Měšťan", "Zbrojnoš"] } }];
    case "hledat": return [{ rid, ok: true, vysledek: kat.hledat(z.dotaz) }];
    case "detail": { const p = kat.get(z.id); return [{ rid, ok: !!p, predmet: p && { ...p, cenaServer: p.cena } }]; }
    case "ikony": { const b = davky(z.klice.map((k) => ({ k, data: ikona(k) }))); return b.map((x, i) => ({ rid, ok: true, ikony: x.map((y) => ({ k: y.k, d: y.data })), dalsi: i < b.length - 1 })); }
    case "hraci": return [{ rid, ok: true, hraci: [{ id: 1, jmeno: "Jindřich" }, { id: 2, jmeno: "Hans" }] }];
    case "akce": return [{ rid, ok: true, zprava: `(náhled) ${z.akce} ${z.pocet}× ${z.id}` }];
    case "kolekce": return [{ rid, ok: true, kolekce }];
    case "kolekcePridat": kolekce.push({ id: "k" + kolekce.length, nazev: z.nazev, zdroj: z.hra ? "hra" : "soubor", ikona: z.hra || "" }); return [{ rid, ok: true, kolekce, zprava: "Přidáno (náhled)" }];
    case "kolekceSmazat": kolekce.splice(kolekce.findIndex((k) => k.id === z.id), 1); return [{ rid, ok: true, kolekce }];
  }
  return [{ rid, ok: false, chyba: "?" }];
}

const BRIDGE = `<script>
var P = new URLSearchParams(location.search);
setTimeout(function () {
  if (P.get("q")) { var q = document.getElementById("q"); q.value = P.get("q"); q.dispatchEvent(new Event("input")); }
  if (P.get("tab")) document.querySelector('[data-tab="' + P.get("tab") + '"]').click();
}, 400);
if (P.get("klik")) setTimeout(function () { var c = document.querySelectorAll(".cell")[Number(P.get("klik")) - 1]; if (c) c.click(); }, 3000);
window.callEvent = function (name, json) {
  if (name === "katalog:ready") { var v = new URLSearchParams(location.search).get("vyber");
    setTimeout(function () { window.dispatchEvent(new CustomEvent("katalog:otevrit", { detail: JSON.stringify({ vyber: v ? { pro: v, oblect: true } : null }) })); }, 0); return; }
  if (name !== "katalog:zadost") { console.log(name, json); return; }
  fetch("/api", { method: "POST", body: json }).then(function (r) { return r.json(); }).then(function (list) {
    list.forEach(function (o) { window.dispatchEvent(new CustomEvent("katalog:vysledek", { detail: JSON.stringify(o) })); });
  });
};
</script>`;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png" };
createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api") {
    let b = "";
    req.on("data", (c) => (b += c)).on("end", () => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(api(JSON.parse(b)))); });
    return;
  }
  const path = req.url.split("?")[0].replace(/^\/$/, "/index.html");
  const f = join(root, "dist", "katalog", "ui", path);
  if (!f.startsWith(join(root, "dist", "katalog", "ui")) || !existsSync(f)) { res.statusCode = 404; return res.end(); }
  let body = readFileSync(f);
  if (path === "/index.html") body = body.toString().replace('<script src="app.js">', BRIDGE + '<script src="app.js">');
  res.setHeader("content-type", TYPES[extname(f)] ?? "application/octet-stream");
  res.end(body);
}).listen(port, "127.0.0.1", () => console.log(`náhled katalogu: http://127.0.0.1:${port}/`));
