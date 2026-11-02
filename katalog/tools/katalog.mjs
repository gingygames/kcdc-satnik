// Vygeneruje katalog předmětů z VAŠÍ instalace KCD2 (nic z hry není v repu, výstup je v .gitignore):
//   gen/katalog.json     předměty: id, názvy cs/en, kategorie, slot, vrstva, cena, váha, ikona
//   gen/ikony/<klíč>.png ikony předmětů 64x64 (z Libs/UI/Textures/Icons/Items/*_icon.dds, BC7 -> PNG)
//
//   npm run katalog                          (cesta ke hře z ../playground/playground.json, gameDir)
//   npm run katalog -- "D:/.../KingdomComeDeliverance2" [--bez-ikon] [--bezztratove]
//   ikony: PNG s paletou 256 barev (~ polovina velikosti, tools/png.mjs); --bezztratove = plné RGBA, jen bezztrátově zmenšené
//   už vygenerované ikony bez hry zmenší: npm run ikony
//
// Zdroje: Data/Tables.pak (Libs/Tables/item/item*.xml), Data/IPL_GameData.pak (ikony), Localization/{English,Czech}_xml.pak (text_ui_items.xml).
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeImage, findLayer, parseDDSHeader } from "dds-ktx-parser";
import { Pak } from "./pak.mjs";
import { encodePng } from "./png.mjs";
import { pohlavi, zaradit } from "../src/sloty.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const bezIkon = args.includes("--bez-ikon");
const paleta = !args.includes("--bezztratove"); // ikony jako PNG s paletou 256 barev (tools/png.mjs), ~ polovina velikosti
let hra = args.find((a) => !a.startsWith("--"));
if (!hra) {
  const pg = join(root, "..", "playground", "playground.json");
  if (existsSync(pg)) hra = JSON.parse(readFileSync(pg, "utf8")).gameDir;
}
if (!hra || !existsSync(join(hra, "Data", "Tables.pak"))) {
  console.error(`Nenašel jsem hru (Data/Tables.pak) v "${hra ?? ""}". Použití: npm run katalog -- "<složka KingdomComeDeliverance2>"`);
  process.exit(1);
}
const out = join(root, "gen");
const t0 = Date.now();

// 1. lokalizace
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unxml = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m));
function texty(pak) {
  const p = new Pak(join(hra, "Localization", pak));
  const x = p.read("text_ui_items.xml")?.toString("utf8") ?? "";
  p.close();
  const m = new Map();
  for (const r of x.matchAll(/<Row><Cell>([^<]*)<\/Cell>(?:<Cell>([^<]*)<\/Cell>)?(?:<Cell>([^<]*)<\/Cell>)?/g)) m.set(r[1].toLowerCase(), unxml(r[3] || r[2] || ""));
  return m;
}
const en = texty("English_xml.pak");
const cs = texty("Czech_xml.pak");

// 2. předměty
const ITEM_TAGS = new Set(["Armor", "Helmet", "Hood", "MeleeWeapon", "MissileWeapon", "Ammo", "Food", "Herb", "AlchemyBase", "Ointment", "Poison", "Document",
  "Die", "DiceBadge", "CraftingMaterial", "NPCTool", "ItemAlias", "Key", "KeyRing", "Money", "QuickSlotContainer", "PickableItem", "MiscItem"]);
const tables = new Pak(join(hra, "Data", "Tables.pak"));
const soubory = tables.list("Libs/Tables/item/item").filter((n) => /\/item(__\w+)?\.xml$/i.test(n) && !/__(test|autotests|deprecated)\.xml$/i.test(n));
const polozky = [];
const videno = new Set();
for (const f of soubory) {
  const x = tables.read(f).toString("utf8");
  for (const m of x.matchAll(/<(\w+) ((?:[\w:]+="[^"]*"\s*)+)\/?>/g)) {
    if (!ITEM_TAGS.has(m[1])) continue;
    const a = {};
    for (const at of m[2].matchAll(/([\w:]+)="([^"]*)"/g)) a[at[1]] = unxml(at[2]);
    if (!a.Name || videno.has(a.Name.toLowerCase())) continue;
    videno.add(a.Name.toLowerCase());
    const z = zaradit(m[1], a);
    const ui = (a.UIName || "").toLowerCase();
    const p = {
      id: a.Name, guid: a.Id || "", cs: cs.get(ui) || "", en: en.get(ui) || "", ...z,
      cena: Number(a.Price) || 0, vaha: Number(a.Weight) || 0, ikona: a.IconId || "", kval: Number(a.MaxQuality) || 1,
      quest: a.IsQuestItem === "true", typ: m[1],
    };
    if ((m[1] === "Armor" || m[1] === "Helmet" || m[1] === "Hood") && a.Clothing !== undefined && z.slot && z.kat !== "kun") {
      // oblečení: pohlaví podle modelu (f_… = dámské), model, popis (UIInfo) a obrana bod/sek/drcení, charisma
      const info = (a.UIInfo || "").toLowerCase();
      Object.assign(p, {
        pohlavi: pohlavi(a.Clothing), model: a.Clothing, popis: cs.get(info) || en.get(info) || "",
        obrana: [Number(a.DefenseStab) || 0, Number(a.DefenseSlash) || 0, Number(a.DefenseSmash) || 0], charisma: Number(a.Charisma) || 0,
      });
    }
    polozky.push(p);
  }
}
tables.close();
const tData = Date.now();

// 3. ikony
const klic = (s) => String(s).toLowerCase().replace(/[^a-z0-9_-]/g, "_");
let ikon = 0, bajtu = 0, chybi = 0;
if (!bezIkon) {
  rmSync(join(out, "ikony"), { recursive: true, force: true });
  mkdirSync(join(out, "ikony"), { recursive: true });
  const gd = new Pak(join(hra, "Data", "IPL_GameData.pak"));
  const hotovo = new Map();
  for (const p of polozky) {
    if (!p.ikona) continue;
    const k = klic(p.ikona);
    if (!hotovo.has(k)) {
      const dds = gd.read(`Libs/UI/Textures/Icons/Items/${p.ikona}_icon.dds`);
      let ok = false;
      if (dds) {
        try {
          const bytes = new Uint8Array(dds.buffer, dds.byteOffset, dds.length);
          const info = parseDDSHeader(bytes, bytes.length);
          const layer = info && findLayer(info, 0);
          if (layer) {
            const rgba = decodeImage(bytes.subarray(layer.offset), info.format, { ...layer, offset: 0 });
            const png = encodePng(rgba, layer.shape.width, layer.shape.height, { paleta });
            writeFileSync(join(out, "ikony", k + ".png"), png);
            ikon++;
            bajtu += png.length;
            ok = true;
          }
        } catch (e) {
          console.warn(`ikona ${p.ikona}: ${e.message}`);
        }
      }
      hotovo.set(k, ok);
    }
    if (hotovo.get(k)) p.ikona = k;
    else { p.ikona = ""; chybi++; }
  }
  gd.close();
} else {
  for (const p of polozky) p.ikona = existsSync(join(out, "ikony", klic(p.ikona) + ".png")) ? klic(p.ikona) : "";
}

polozky.sort((a, b) => a.id.localeCompare(b.id));
mkdirSync(out, { recursive: true });
const json = JSON.stringify({ verze: 1, generovano: new Date().toISOString(), zdroj: "instalace KCD2 (Tables.pak, IPL_GameData.pak, Localization)", polozky });
writeFileSync(join(out, "katalog.json"), json);
const kb = (n) => (n / 1024).toFixed(0) + " KB";
console.log(`katalog: ${polozky.length} předmětů (${kb(json.length)} JSON, data ${tData - t0} ms)`);
if (!bezIkon) console.log(`ikony: ${ikon} PNG, ${kb(bajtu)} celkem, průměr ${(bajtu / Math.max(1, ikon) / 1024).toFixed(1)} KB; bez ikony ${chybi} předmětů; ${Date.now() - tData} ms`);
console.log(`hotovo za ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${out}`);
