// Katalog předmětů - server (Kingdoms Connected).
// Data: gen/katalog.json + gen/ikony/*.png z `npm run katalog` (z instalace hry; v repu nejsou). Bez nich běží nouzově jen
// s tím, co zná server (Inventory.classes(): oblečení, bez ikon).
// Prohlížeč: /katalog nebo panel Katalog ve Správě (F10). API pro moduly: Exports.get("katalog", "search" | "get" | "icon" | ...).
import { Katalog, MAX_STRANKA, davky, klicIkony, radek, type Dotaz, type Predmet } from "./core";
import { KATEGORIE, SLOTY } from "./sloty";
import { EV, IKONA_KOLEKCE, MAX_PNG, type KolekceIkona, type Odpoved, type Zadost } from "./shared";

declare const require: (m: string) => any;
const nodeRequire = require;   // nepřímo, ať esbuild modul nebalí (fs a buffer dává server KCDC)
const VERZE = 1;

interface Config {
  /** složka resource na serveru (relativně k pracovní složce serveru) */
  slozka?: string;
  prikaz?: string;
  /** oprávnění pro prohlížeč a akce (smlouva mostu); výchozí admin.items */
  opravneni?: string;
  /** názvy startovních sad příchodu, když je příchod sám nenabízí */
  sady?: string[];
}
const CFG: Config = { slozka: "resources/katalog", prikaz: "katalog", opravneni: "admin.items", ...((globalThis as any).KATALOG_CONFIG ?? {}) };
const log = (t: string) => console.log("[katalog] " + t);

let fs: any = null;
try {
  fs = nodeRequire("fs");
} catch {
  log("fs není k dispozici: katalog jen z Inventory.classes(), bez ikon a kolekce");
}
const cesta = (...p: string[]) => [CFG.slozka, ...p].join("/");

// ---------------------------------------------------------------------------
// načtení

function nacist(): { polozky: Predmet[]; generovano: string } {
  try {
    const d = JSON.parse(fs.readFileSync(cesta("gen", "katalog.json"), "utf8"));
    return { polozky: d.polozky, generovano: d.generovano ?? "" };
  } catch (e) {
    log(`gen/katalog.json chybí (${String((e as Error)?.message ?? e)}). Vygeneruj ho: cd katalog && npm run katalog && npm run build. Zatím jen předměty ze serveru.`);
    const polozky: Predmet[] = Inventory.classes().map((c) => ({
      id: c.name, guid: c.id, cs: "", en: c.name, kat: "obleceni", pod: c.category, slot: "", vrstva: "", cena: 0, vaha: 0, ikona: "", kval: c.maximumQuality, quest: c.quest, typ: c.category,
    }));
    return { polozky, generovano: "" };
  }
}

const t0 = Date.now();
const zdroj = nacist();
const oblectelne = new Set(Inventory.classes().map((c) => c.name.toLowerCase()));
const kat = new Katalog(zdroj.polozky, (id) => Inventory.getItemPrice(id) !== null, (id) => oblectelne.has(id.toLowerCase()));
const ikonCelkem = new Set(kat.polozky.map((p) => p.ikona).filter(Boolean)).size;
log(`${kat.polozky.length} předmětů (server zná ${kat.polozky.filter((p) => p.zna).length}, obléct ${kat.polozky.filter((p) => p.oblect).length}), ${ikonCelkem} ikon; ${Date.now() - t0} ms`);

const podkategorie: Record<string, Record<string, number>> = {};
for (const k of Object.keys(KATEGORIE)) podkategorie[k] = kat.podkategorie(k);

// ---------------------------------------------------------------------------
// ikony (čtou se z disku až na žádost, malá mezipaměť)

const cache = new Map<string, string>();
function ikona(klic: string): string | null {
  const k = String(klic);
  if (cache.has(k)) return cache.get(k)!;
  let soubor: string;
  if (k.startsWith("kolekce:")) soubor = cesta("data", "kolekce", klicIkony(k.slice(8)) + ".png");
  else soubor = cesta("gen", "ikony", klicIkony(k) + ".png");
  let d: string | null = null;
  try {
    d = fs ? (fs.readFileSync(soubor) as { toString(enc: string): string }).toString("base64") : null;
  } catch {
    d = null;
  }
  if (d !== null) {
    if (cache.size > 600) cache.delete(cache.keys().next().value as string);
    cache.set(k, d);
  }
  return d;
}

// ---------------------------------------------------------------------------
// kolekce ikon (ikony původů příchodu a dalších modulů)

let kolekce: KolekceIkona[] = [];
try {
  kolekce = JSON.parse(fs.readFileSync(cesta("data", "kolekce.json"), "utf8"));
} catch {
  kolekce = [];
}
function ulozitKolekci() {
  fs.mkdirSync(cesta("data", "kolekce"), { recursive: true });
  fs.writeFileSync(cesta("data", "kolekce.json"), JSON.stringify(kolekce, null, 1), "utf8");
}
function kolekcePridat(nazev: string, png?: string, hra?: string): KolekceIkona {
  const jmeno = String(nazev ?? "").trim().slice(0, 60);
  if (!jmeno) throw new Error("chybí název");
  if (!fs) throw new Error("server nemá fs");
  const id = klicIkony(jmeno).slice(0, 40) + "-" + Date.now().toString(36);
  if (hra) {
    if (ikona(hra) === null) throw new Error("ikona hry " + hra + " neexistuje");
    const z: KolekceIkona = { id, nazev: jmeno, zdroj: "hra", ikona: klicIkony(hra) };
    kolekce.push(z);
    ulozitKolekci();
    return z;
  }
  const bin = nodeRequire("buffer").Buffer.from(String(png ?? ""), "base64");
  if (bin.length < 8 || bin.length > MAX_PNG || bin.readUInt32BE(0) !== 0x89504e47) throw new Error(`čekám PNG do ${MAX_PNG / 1024} KB`);
  const w = bin.readUInt32BE(16), h = bin.readUInt32BE(20);
  if (w !== IKONA_KOLEKCE || h !== IKONA_KOLEKCE) throw new Error(`ikona musí mít ${IKONA_KOLEKCE}x${IKONA_KOLEKCE} px (má ${w}x${h})`);
  fs.mkdirSync(cesta("data", "kolekce"), { recursive: true });
  fs.writeFileSync(cesta("data", "kolekce", id + ".png"), bin);
  const z: KolekceIkona = { id, nazev: jmeno, zdroj: "soubor", ikona: "kolekce:" + id };
  kolekce.push(z);
  ulozitKolekci();
  return z;
}
function kolekceSmazat(id: string): boolean {
  const i = kolekce.findIndex((k) => k.id === id);
  if (i < 0) return false;
  const [z] = kolekce.splice(i, 1);
  if (z.zdroj === "soubor") try { fs.unlinkSync(cesta("data", "kolekce", z.id + ".png")); } catch { /* nic */ }
  cache.delete(z.ikona);
  ulozitKolekci();
  return true;
}

// ---------------------------------------------------------------------------
// oprávnění: Správa (has/isAdmin) -> most -> nikdo

// exporty jiných resource (Správa, most): Exports.get se volá při každé zprávě stránky (ikony chodí v desítkách zpráv),
// proto mezipaměť na 5 s; start nebo stop kteréhokoli resource ji smaže (po restartu mostu je to nový objekt)
const exporty = new Map<string, { at: number; v: unknown }>();
function export_(res: string, name: string): unknown {
  const k = res + "." + name;
  const t = Date.now();
  const c = exporty.get(k);
  if (c && t - c.at < 5000) return c.v;
  let v: unknown;
  try {
    v = Exports.get(res, name);
  } catch {
    v = undefined; // resource neběží
  }
  exporty.set(k, { at: t, v });
  return v;
}
Events.on("resourceStart", () => exporty.clear());
Events.on("resourceStop", () => exporty.clear());

async function muze(p: Player): Promise<boolean> {
  const perm = CFG.opravneni ?? "admin.items";
  for (const [res, fn, args] of [["sprava", "has", [p.id, perm]], ["sprava", "isAdmin", [p.id]]] as const) {
    try {
      const f = export_(res, fn) as ((...a: unknown[]) => unknown) | undefined;
      if (typeof f === "function") {
        const r = await f(...args);
        if (r) return true;
      }
    } catch { /* Správa neběží */ }
  }
  try {
    const api = export_("most", "api") as any;
    if (api?.perms?.has) return !!(await api.perms.has(p.id, perm));
  } catch { /* most neběží */ }
  return false;
}

// ---------------------------------------------------------------------------
// akce

function sady(): string[] {
  try {
    const f = Exports.get("prichod", "katalogSady") as (() => string[]) | undefined;
    if (typeof f === "function") return f();
  } catch { /* příchod neběží */ }
  return CFG.sady ?? [];
}

function provest(p: Player, z: Zadost): string {
  const pr = kat.get(String(z.id ?? ""));
  if (!pr) throw new Error("neznámý předmět " + z.id);
  if (!pr.zna) throw new Error(`server KCDC třídu ${pr.id} nezná`);
  const pocet = Math.min(10000, Math.max(1, Math.floor(Number(z.pocet) || 1)));
  const kvalita = Math.min(pr.kval || 1, Math.max(1, Math.floor(Number(z.kvalita) || 1)));
  const stav = Math.min(100, Math.max(1, Number(z.stav) || 100)) / 100;
  const meta: Record<string, unknown> = {};
  if (kvalita > 1) meta.quality = kvalita;
  if (stav < 1) meta.condition = stav;
  if (z.akce === "dat") {
    const cil = z.hrac ? Player.getById(Number(z.hrac)) : p;
    if (!cil) throw new Error("hráč není online");
    const r = Inventory.add(cil, { item: pr.id, amount: pocet, metadata: Object.keys(meta).length ? meta : undefined });
    if (!r.ok) throw new Error("Inventory.add: " + ((r as any).error ?? "odmítnuto"));
    log(`${p.nickname} dal ${cil.nickname} ${pocet}x ${pr.id} (kvalita ${kvalita}, stav ${Math.round(stav * 100)} %)`);
    return `${cil.nickname} dostal ${pocet}× ${Katalog.nazev(pr)}`;
  }
  if (z.akce === "spawn") {
    const pos = (p as any).position as { x: number; y: number; z: number };
    const dir = p.lookDirection ?? { x: 0, y: 1, z: 0 };
    const misto = { x: pos.x + dir.x * 1.5, y: pos.y + dir.y * 1.5, z: pos.z + 0.3 };
    GroundItem.spawn(pr.id, misto, undefined, pocet, (p as any).virtualWorld, { quality: kvalita, condition: stav });
    log(`${p.nickname} spawnul ${pocet}x ${pr.id}`);
    return `Položeno u tebe: ${pocet}× ${Katalog.nazev(pr)}`;
  }
  if (z.akce === "sada") {
    const f = (() => { try { return Exports.get("prichod", "katalogPridat") as ((sada: string, item: string, pocet: number) => unknown) | undefined; } catch { return undefined; } })();
    if (typeof f !== "function") throw new Error("příchod neběží nebo ještě neumí přidat předmět do sady (export katalogPridat)");
    const r = f(String(z.sada ?? ""), pr.id, pocet) as { ok?: boolean; error?: string } | boolean | string;
    if (r === false || (typeof r === "object" && r && r.ok === false)) throw new Error("příchod odmítl: " + ((r as any)?.error ?? ""));
    return typeof r === "string" ? r : `Přidáno do sady ${z.sada}: ${pocet}× ${Katalog.nazev(pr)}`;
  }
  throw new Error("neznámá akce");
}

// ---------------------------------------------------------------------------
// zprávy stránky

const reply = (p: Player, o: Odpoved) => p.emit(EV.vysledek, JSON.stringify(o));

async function zpracovat(p: Player, z: Zadost) {
  const rid = Number(z?.rid) || 0;
  if (!(await muze(p))) return reply(p, { rid, ok: false, chyba: "Na katalog nemáš oprávnění (" + CFG.opravneni + ")." });
  try {
    switch (z.op) {
      case "info":
        return reply(p, {
          rid, ok: true,
          info: { pocet: kat.polozky.length, ikon: ikonCelkem, kategorie: KATEGORIE, sloty: SLOTY, podkategorie, generovano: zdroj.generovano, sady: sady() },
        });
      case "hledat":
        return reply(p, { rid, ok: true, vysledek: kat.hledat(z.dotaz ?? {}) });
      case "detail": {
        const pr = kat.get(String(z.id));
        if (!pr) return reply(p, { rid, ok: false, chyba: "neznámý předmět" });
        return reply(p, { rid, ok: true, predmet: { ...pr, cenaServer: Inventory.getItemPrice(pr.id)?.pristine ?? null } });
      }
      case "ikony": {
        const klice = (z.klice ?? []).slice(0, 120).map(String);
        const balik = davky(klice.map((k) => ({ k, data: ikona(k) ?? "" })));
        balik.forEach((b, i) => reply(p, { rid, ok: true, ikony: b.map((x) => ({ k: x.k, d: x.data })), dalsi: i < balik.length - 1 }));
        if (!balik.length) reply(p, { rid, ok: true, ikony: [] });
        return;
      }
      case "akce":
        return reply(p, { rid, ok: true, zprava: provest(p, z) });
      case "hraci":
        return reply(p, { rid, ok: true, hraci: Player.all().map((h) => ({ id: h.id, jmeno: h.nickname })) });
      case "kolekce":
        return reply(p, { rid, ok: true, kolekce });
      case "kolekcePridat":
        kolekcePridat(String(z.nazev), z.png, z.hra);
        return reply(p, { rid, ok: true, kolekce, zprava: "Ikona přidána do kolekce." });
      case "kolekceSmazat":
        return reply(p, { rid, ok: kolekceSmazat(String(z.id)), kolekce });
      default:
        return reply(p, { rid, ok: false, chyba: "neznámá operace" });
    }
  } catch (e) {
    reply(p, { rid, ok: false, chyba: String((e as Error)?.message ?? e) });
  }
}

Events.onClient(EV.zadost, (sender: unknown, raw: unknown) => {
  const p = sender as Player;
  let z: Zadost;
  try {
    z = (typeof raw === "string" ? JSON.parse(raw) : raw) as Zadost;
  } catch {
    return;
  }
  zpracovat(p, z).catch((e) => log("zadost: " + String(e)));
});

/** otevře prohlížeč hráči; `vyber` = režim výběru pro jiný modul (výsledek přijde exportem `onVyber`) */
async function otevrit(p: Player, vyber?: { pro: string; kat?: string; oblect?: boolean }): Promise<string> {
  if (!(await muze(p))) return "Na katalog nemáš oprávnění.";
  p.emit(EV.otevrit, JSON.stringify({ vyber: vyber ?? null }));
  return "Katalog otevřen.";
}

const vyberCekaji = new Map<string, (playerId: number, itemId: string) => void>();
Events.onClient(EV.vybrano, (sender: unknown, raw: unknown) => {
  try {
    const d = (typeof raw === "string" ? JSON.parse(raw) : raw) as { pro: string; id: string };
    const pr = kat.get(d.id);
    const fn = vyberCekaji.get(String(d.pro));
    if (pr && fn) fn((sender as Player).id, pr.id);
  } catch { /* nic */ }
});

Events.on("playerCommand", (p: Player, command: string, args: string[]) => {
  if (command.toLowerCase().replace(/^\//, "") !== (CFG.prikaz ?? "katalog")) return;
  const q = args.join(" ").trim();
  if (!q) {
    otevrit(p).then((t) => t !== "Katalog otevřen." && Chat.sendToPlayer(p, t));
    return;
  }
  muze(p).then((ok) => {
    if (!ok) return Chat.sendToPlayer(p, "Na katalog nemáš oprávnění.");
    const r = kat.hledat({ q, pocet: 8, vse: true });
    Chat.sendToPlayer(p, `Katalog: ${r.celkem} výsledků pro "${q}"` + (r.celkem ? ": " + r.radky.map((x) => `${x[1]} (${x[0]})`).join(", ") : ""));
  });
});

// ---------------------------------------------------------------------------
// panel ve Správě (F10): záložka Katalog

function panel() {
  return {
    id: "katalog",
    title: "Katalog",
    group: "Správa",
    order: 15,
    perm: CFG.opravneni,
    description: `${kat.polozky.length} předmětů hry s ikonami. Prohlížeč: mřížka, filtry, dát hráči, spawn, startovní sady příchodu.`,
    actions: [
      { id: "otevrit", label: "Otevřít prohlížeč", autorun: false, handler: (c: { caller: Player }) => otevrit(c.caller) },
      {
        id: "hledat", label: "Hledat", submit: "Hledat",
        params: [{ name: "q", label: "Hledat (název, id)", type: "string", required: true }],
        handler: (c: { params: { q: string } }) => {
          const r = kat.hledat({ q: c.params.q, pocet: 50, vse: true });
          return { type: "table", columns: ["id", "nazev", "kategorie", "slot", "cena", "zna"], rows: r.radky.map((x) => ({ id: x[0], nazev: x[1], kategorie: x[3], slot: SLOTY[x[4]] ?? "", cena: x[5], zna: x[8] ? "ano" : "ne" })) };
        },
      },
    ],
  };
}

function zaregistrovatPanel() {
  try {
    const f = Exports.get("sprava", "registerPanel") as ((def: unknown, owner: string) => void) | undefined;
    if (typeof f === "function") f(panel(), "katalog");
  } catch { /* Správa neběží, panel si vezme přes spravaPanels */ }
}
Events.on("resourceStart", (name: string) => {
  if (name === "sprava") zaregistrovatPanel();
});
zaregistrovatPanel();

// ---------------------------------------------------------------------------
// API pro ostatní resources

const api = {
  version: VERZE,
  /** předmět podle id (jméno třídy), null když není */
  get: (id: string) => kat.get(id),
  /** hledání: { q, kat, pod, slot, zna, oblect, vse, razeni, od, pocet<=200 } -> { celkem, od, radky, kategorie }; radky = [id, nazev, kat, pod, slot, cena, vaha, ikona, zna, oblect] */
  search: (d: Dotaz) => kat.hledat(d),
  /** zkratka pro výběr: [{ id, nazev, kat, pod, slot, ikona, zna, oblect }] */
  find: (q: string, opts: { kat?: string; oblect?: boolean; pocet?: number } = {}) =>
    kat.hledat({ q, kat: opts.kat, oblect: opts.oblect, pocet: opts.pocet ?? 20, vse: true }).radky.map((r) => ({ id: r[0], nazev: r[1], kat: r[2], pod: r[3], slot: r[4], ikona: r[7], zna: !!r[8], oblect: !!r[9] })),
  /** ikona jako base64 PNG (64x64), null když chybí; klíč = `ikona` z výsledku, nebo "kolekce:<id>" */
  icon: (klic: string) => ikona(klic),
  /** relativní cesta k PNG na serveru (pro moduly, které soubor posílají samy) */
  iconPath: (klic: string) => (String(klic).startsWith("kolekce:") ? cesta("data", "kolekce", klicIkony(String(klic).slice(8)) + ".png") : cesta("gen", "ikony", klicIkony(klic) + ".png")),
  categories: () => ({ kategorie: KATEGORIE, sloty: SLOTY, podkategorie }),
  /** celé předměty (i s pohlavi, model, popis, obrana) v daných kategoriích, bez systémových; pro šatník a podobné moduly */
  items: (kats?: string[]) => kat.polozky.filter((p) => p.kat !== "system" && (!kats?.length || kats.includes(p.kat))),
  /** otevře prohlížeč hráči; s `vyber` v režimu výběru a vybraný předmět dostane handler z `onSelect(pro, fn)` */
  open: (playerId: number, vyber?: { pro: string; kat?: string; oblect?: boolean }) => {
    const p = Player.getById(playerId);
    return p ? otevrit(p, vyber) : Promise.resolve("hráč není online");
  },
  onSelect: (pro: string, fn: (playerId: number, itemId: string) => void) => void vyberCekaji.set(String(pro), fn),
  /** kolekce ikon (ikony původů atd.) */
  collection: () => kolekce.slice(),
  collectionAdd: (nazev: string, opts: { png?: string; hra?: string }) => kolekcePridat(nazev, opts?.png, opts?.hra),
  collectionRemove: (id: string) => kolekceSmazat(id),
  /** Správa si panel bere i sama (config `moduly`) */
  spravaPanels: () => [panel()],
  radek,
};
for (const [name, value] of Object.entries(api)) Exports.register(name, value);
log(`verze ${VERZE}, příkaz /${CFG.prikaz}, oprávnění ${CFG.opravneni}, max ${MAX_STRANKA} řádků na stránku`);
