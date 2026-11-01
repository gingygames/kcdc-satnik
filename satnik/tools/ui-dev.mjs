// Náhled stránky šatníku bez hry: http server s jádrem šatníku nad ../katalog/gen a falešný most (callEvent -> POST /api -> CustomEvent).
//   node tools/ui-dev.mjs [port]       potom http://127.0.0.1:5179/?q=kapuce&klik=1&pohlavi=f
// Potřebuje `npm run katalog` v katalogu a `npm run build` tady (bere dist/satnik/ui). Figurína je jen stav, kamera tu není.
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.argv[2]) || 5179;
const gen = join(root, "..", "katalog", "gen");
const coreJs = buildSync({ entryPoints: [join(root, "src", "core.ts")], bundle: true, format: "cjs", platform: "node", write: false }).outputFiles[0].text;
const m = { exports: {} };
new Function("module", "exports", "require", coreJs)(m, m.exports, () => ({}));
const { Satnik, SLOTY, VRSTVY, DRUHY, obleknout, oznaceniVarianty, poradiNaTele } = m.exports;
const s = new Satnik(JSON.parse(readFileSync(join(gen, "katalog.json"), "utf8")).polozky);
const ikona = (k) => { const f = join(gen, "ikony", k + ".png"); return existsSync(f) ? readFileSync(f).toString("base64") : ""; };
const fig = { pohlavi: "m", zoom: "postava", na: [] };
const stav = () => ({ pohlavi: fig.pohlavi, zoom: fig.zoom, na: fig.na.map((k) => [k.id, k.nazev, k.slot, k.ikona]), stoji: true });

function api(z) {
  const rid = z.rid, ok = (x = {}) => [{ rid, ok: true, ...x }, { _ev: "satnik:figurina", ...stav() }];
  switch (z.op) {
    case "hledat": return [{ rid, ok: true, vysledek: s.hledat(z.dotaz) }];
    case "detail": {
      const g = s.skupina(z.id);
      if (!g) return [{ rid, ok: false, chyba: "Neznámý kus." }];
      return [{ rid, ok: true, detail: { ...g, popis: g.varianty.find((v) => v.popis)?.popis ?? "", varianty: g.varianty.map((v) => ({ ...v, oznaceni: oznaceniVarianty(v) })) } }];
    }
    case "ikony": return [{ rid, ok: true, ikony: z.klice.map((k) => ({ k, d: ikona(k) })) }];
    case "oblect": { const k = s.kus(z.id); if (k.pohlavi !== fig.pohlavi) (fig.pohlavi = k.pohlavi), (fig.na = fig.na.filter((x) => x.pohlavi === k.pohlavi)); fig.na = obleknout(fig.na, k); return ok(); }
    case "svlect": fig.na = z.id ? fig.na.filter((x) => x.id !== z.id) : []; return ok();
    case "pohlavi": fig.pohlavi = z.pohlavi; fig.na = fig.na.filter((x) => x.pohlavi === z.pohlavi); return ok();
    case "zoom": fig.zoom = z.zoom; return ok();
    case "moje": fig.na = ["Hood07_m04_C", "TunicShort05_m09_D"].map((id) => s.kus(id)).filter(Boolean).sort(poradiNaTele); return ok({ zprava: "(náhled) tvoje oblečení" });
    case "ukazat": return ok({ zprava: "(náhled) ukázáno 1 hráči" });
    default: return [{ rid, ok: true }];
  }
}

const INFO = { ...s.pocty(), sloty: SLOTY, vrstvy: VRSTVY, druhy: DRUHY, prikaz: "satnik", dosah: 8 };
const BRIDGE = `<script>
var P = new URLSearchParams(location.search);
if (P.get("klik")) setTimeout(function () { var c = document.querySelectorAll(".cell")[Number(P.get("klik")) - 1]; if (c) c.click(); }, 1500);
window.callEvent = function (name, json) {
  var ev = function (n, d) { window.dispatchEvent(new CustomEvent(n, { detail: JSON.stringify(d) })); };
  if (name === "satnik:ready") { setTimeout(function () { ev("satnik:otevrit", { info: ${JSON.stringify(INFO)}, q: P.get("q") || "", figurina: { pohlavi: P.get("pohlavi") || "m", zoom: "postava", na: [], stoji: true } }); if (P.get("pohlavi")) callEvent("satnik:zadost", JSON.stringify({ rid: 0, op: "pohlavi", pohlavi: P.get("pohlavi") })); }, 0); return; }
  if (name !== "satnik:zadost") { console.log(name, json); return; }
  fetch("/api", { method: "POST", body: json }).then(function (r) { return r.json(); }).then(function (list) {
    list.forEach(function (o) { if (o._ev) { var n = o._ev; delete o._ev; ev(n, o); } else ev("satnik:vysledek", o); });
  });
};
</script>`;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png" };
const ui = join(root, "dist", "satnik", "ui");
createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api") {
    let b = "";
    req.on("data", (c) => (b += c)).on("end", () => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(api(JSON.parse(b)))); });
    return;
  }
  const path = req.url.split("?")[0].replace(/^\/$/, "/index.html");
  const f = join(ui, path);
  if (!f.startsWith(ui) || !existsSync(f)) { res.statusCode = 404; return res.end(); }
  let body = readFileSync(f);
  if (path === "/index.html") body = body.toString().replace('<script src="app.js">', BRIDGE + '<script src="app.js">');
  res.setHeader("content-type", TYPES[extname(f)] ?? "application/octet-stream");
  res.end(body);
}).listen(port, "127.0.0.1", () => console.log(`náhled šatníku: http://127.0.0.1:${port}/`));
