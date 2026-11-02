// Zmenší už vygenerované ikony v gen/ikony (bez instalace hry): přečte každé PNG a zapíše ho znovu kodérem z png.mjs.
//   node tools/ikony.mjs                výchozí: paleta 256 barev (ztrátově, okem k nerozeznání, ~ -49 %)
//   node tools/ikony.mjs --bezztratove  jen bezztrátové zmenšení (~ -9 %)
// Soubor se přepíše jen tehdy, když je nový menší. Potom `npm run build` (dist/katalog/gen/ikony).
import { readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng } from "./png.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = join(root, "gen", "ikony");
const paleta = !process.argv.includes("--bezztratove");
const t0 = Date.now();
let pred = 0, po = 0, zmeneno = 0, chyby = 0;
const soubory = readdirSync(dir).filter((f) => f.endsWith(".png"));
for (const f of soubory) {
  const cesta = join(dir, f);
  const puvodni = readFileSync(cesta);
  pred += puvodni.length;
  try {
    const { w, h, rgba } = decodePng(puvodni);
    const novy = encodePng(rgba, w, h, { paleta });
    if (novy.length < puvodni.length) {
      writeFileSync(cesta + ".tmp", novy);
      renameSync(cesta + ".tmp", cesta);
      zmeneno++;
      po += novy.length;
    } else po += puvodni.length;
  } catch (e) {
    chyby++;
    po += puvodni.length;
    console.warn(`${f}: ${e.message}`);
  }
}
const mb = (n) => (n / 1e6).toFixed(1) + " MB";
console.log(`ikony: ${soubory.length} PNG, ${mb(pred)} -> ${mb(po)} (${Math.round((1 - po / Math.max(1, pred)) * 100)} % méně), přepsáno ${zmeneno}, chyb ${chyby}, ${paleta ? "paleta" : "bezztrátově"}; ${((Date.now() - t0) / 1000).toFixed(0)} s`);
