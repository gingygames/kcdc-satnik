// Šatník - server (Kingdoms Connected). Pro všechny hráče: /satnik otevře katalog oblečení ze hry s ikonami a přesnými názvy
// a vedle něj figurínu (NPC), kterou vidí jen ten hráč (soukromý virtuální svět + setVisibleTo). Figurína se obléká bez
// zásahu do inventáře hráče.
// Data a ikony bere z resource `katalog` (Exports.get("katalog", "items" | "icon")), sám nic negeneruje.
import { EV, type DetailZ, type FigurinaZ, type Info, type Odpoved, type Zadost } from "./shared";
import {
  DRUHY, ODSTUP, SLOTY, Satnik, VRSTVY, ZOOM, obleknout, oznaceniVarianty, poradiNaTele, smer, textZakazky, yawK, zaber,
  type KatalogPredmet, type Kus, type V3, type Zoom,
} from "./core";

const VERZE = 1;

interface Config {
  prikaz?: string;
  /** oprávnění podle smlouvy mostu; "" = všichni hráči */
  opravneni?: string;
  /** role NPC pro figurínu (Npc.roles()); "" = vybere se sama */
  figurinaMuz?: string;
  figurinaZena?: string;
  /** figurína dostane tvář a vlasy hráče, když má stejné pohlaví */
  mojeTvar?: boolean;
  /** podíl šířky obrazovky, který zabírá panel vlevo (figurína vyjde vpravo vedle něj) */
  panel?: number;
  /** komu se ukáže oblečení v chatu (metry) */
  dosahUkazat?: number;
  /** zavřít šatník, když hráč dostane ránu */
  zavritPriZasahu?: boolean;
  /** po ráně jde šatník otevřít až za tolik sekund (soukromý svět nesmí sloužit k útěku z boje) */
  pauzaPoZasahu?: number;
  /** soukromé virtuální světy náhledu: základ + id hráče (příchod má 7000 + id, ať se nepotkají) */
  svet?: number;
}
const CFG: Required<Config> = {
  prikaz: "satnik", opravneni: "", figurinaMuz: "", figurinaZena: "", mojeTvar: true, panel: 0.56, dosahUkazat: 8, zavritPriZasahu: true,
  pauzaPoZasahu: 20, svet: 900000,
  ...((globalThis as any).SATNIK_CONFIG ?? {}),
};
/** klíč ve stavu hráče (jen na serveru): svět, do kterého se vrátí po zavření; přežije restart resource */
const PUVODNI = "satnik.svet";
const log = (t: string) => console.log("[satnik] " + t);
const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z);
const rot = (yaw: number) => v3(0, 0, yaw);

// ---------------------------------------------------------------------------
// data z katalogu

let satnik = new Satnik([]);
let nacteno = false;

function katalog<T = unknown>(jmeno: string): T | undefined {
  try {
    return Exports.get("katalog", jmeno) as T;
  } catch {
    return undefined;
  }
}

function nacist(): void {
  const items = katalog<(kats?: string[]) => KatalogPredmet[]>("items");
  if (typeof items !== "function") {
    log("katalog neběží nebo nemá export items (katalog >= PR satnik): šatník je prázdný, zkusím znovu při startu katalogu");
    return;
  }
  const t0 = Date.now();
  satnik = new Satnik(items(["obleceni", "zbroj"]));
  nacteno = true;
  const c = satnik.pocty();
  log(`${c.kusu} kusů oblečení a zbroje (${c.skupin} druhů; pánských ${c.panskych}, dámských ${c.damskych}); ${Date.now() - t0} ms`);
}
nacist();
Events.on("resourceStart", (name: string) => {
  if (name === "katalog") nacist();
});

const cache = new Map<string, string>();
function ikona(klic: string): string {
  if (cache.has(klic)) return cache.get(klic)!;
  const f = katalog<(k: string) => string | null>("icon");
  const d = (typeof f === "function" ? f(klic) : null) ?? "";
  if (d) {
    if (cache.size > 800) cache.delete(cache.keys().next().value as string);
    cache.set(klic, d);
  }
  return d;
}

/** dávky ikon do jedné zprávy (base64 pod limit znaků) */
function davky(ikony: { k: string; d: string }[], limit = 40000): { k: string; d: string }[][] {
  const out: { k: string; d: string }[][] = [];
  let cur: { k: string; d: string }[] = [];
  let len = 0;
  for (const i of ikony) {
    const n = i.d.length + 64;
    if (cur.length && len + n > limit) (out.push(cur), (cur = []), (len = 0));
    cur.push(i);
    len += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

// ---------------------------------------------------------------------------
// oprávnění: "" = všichni; jinak Správa (has) a most

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
  const perm = CFG.opravneni;
  if (!perm) return true;
  try {
    const f = export_("sprava", "has") as ((id: number, perm: string) => unknown) | undefined;
    if (typeof f === "function" && (await f(p.id, perm))) return true;
  } catch { /* Správa neběží */ }
  try {
    const api = export_("most", "api") as any;
    if (api?.perms?.has) return !!(await api.perms.has(p.id, perm));
  } catch { /* most neběží */ }
  return false;
}

// ---------------------------------------------------------------------------
// soukromý svět: figurínu vidí jen hráč, který šatník otevřel. Samotné `setVisibleTo` nestačí: `Npc.create` NPC
// rozešle klientům poblíž hned při vytvoření, takže ostatní hráči figurínu i její převlékání viděli. Proto figurína
// vzniká v soukromém virtuálním světě (svet + id hráče) a hráč se do něj na dobu náhledu přesune; `setVisibleTo`
// zůstává jako druhá pojistka. Ostatní hráče po tu dobu nevidí ani on, ani oni jeho.

function soukromySvet(pid: number): number {
  return CFG.svet + pid;
}
function jeSoukromy(svet: number): boolean {
  return svet >= CFG.svet && svet < CFG.svet + 0x1000000;
}

/** hráč do soukromého světa; kam se vrátí, si pamatuje stav hráče (jen server), aby to přežilo restart resource */
function doSoukromi(p: Player): void {
  const svet = soukromySvet(p.id);
  if (p.virtualWorld === svet) return;
  if (!p.state.has(PUVODNI)) p.state.set(PUVODNI, p.virtualWorld, { scope: "server" });
  p.setVirtualWorld(svet);
}

/** hráč zpět do světa, odkud přišel; když ho mezitím přesunul jiný modul, nechá ho tam */
function zeSoukromi(p: Player): void {
  if (!p.state.has(PUVODNI)) return;
  const puvodni = Number(p.state.get(PUVODNI)) || 0;
  p.state.remove(PUVODNI);
  if (jeSoukromy(p.virtualWorld)) p.setVirtualWorld(jeSoukromy(puvodni) ? 0 : puvodni);
}

// ---------------------------------------------------------------------------
// figurína

interface Relace {
  pid: number;
  npc: Npc | null;
  pohlavi: "m" | "f";
  na: Kus[];
  /** kde figurína stojí a kam kouká (k hráči) */
  misto: V3 | null;
  yaw: number;
  zoom: Zoom;
  pomer: number;
  panel: number;
  zrizuje: boolean;
  zprava?: string;
  oblekT?: Timeout;
}
const relace = new Map<number, Relace>();

let roleCache: string[] | null = null;
function role(pohlavi: "m" | "f"): string {
  const zadana = pohlavi === "f" ? CFG.figurinaZena : CFG.figurinaMuz;
  if (zadana) return zadana;
  if (!roleCache) {
    try {
      roleCache = Npc.roles();
      log(`role NPC (${roleCache.length}): ${roleCache.slice(0, 40).join(", ")}`);
    } catch {
      roleCache = [];
    }
  }
  const zena = /woman|female|girl|lady|maid|wife|nun|wench|mother|daughter/i;
  if (pohlavi === "f") return roleCache.find((r) => /townswoman/i.test(r)) ?? roleCache.find((r) => zena.test(r)) ?? "townswoman";
  return roleCache.find((r) => /townsman/i.test(r)) ?? roleCache.find((r) => !zena.test(r) && /peasant|villager|citizen|farmer|man$/i.test(r)) ?? "townsman";
}

/** volné místo před hráčem (kamera stojí mezi hráčem a figurínou); zeď nebo strom -> zkusí jiný směr */
async function najitMisto(p: Player): Promise<{ misto: V3; yaw: number }> {
  const pos = p.position;
  const ld = p.lookDirection;
  const yaw0 = ld && Math.hypot(ld.x, ld.y) > 0.01 ? yawK(ld.x, ld.y) : 0;
  for (const dy of [0, 40, -40, 80, -80, 130, -130, 180]) {
    const f = smer(yaw0 + dy);
    const z = pos.z + 1.2;
    const cil = { x: pos.x + f.x * (ODSTUP + 0.4), y: pos.y + f.y * (ODSTUP + 0.4) };
    try {
      const r = await World.raycast(p, v3(pos.x + f.x * 0.45, pos.y + f.y * 0.45, z), v3(cil.x, cil.y, z), { mode: "anything" });
      if (!r.answered) break;
      if (r.hit) continue;
      const m = { x: pos.x + f.x * ODSTUP, y: pos.y + f.y * ODSTUP };
      const g = await World.resolveGround(p, v3(m.x, m.y, pos.z), { up: 1.5, down: 3 });
      const gz = g.hit ? g.hit.position.z : pos.z;
      if (Math.abs(gz - pos.z) > 1.4) continue; // schod, sráz: kamera by koukala do země
      return { misto: { x: m.x, y: m.y, z: gz }, yaw: (yaw0 + dy + 180) % 360 };
    } catch {
      break;
    }
  }
  const f = smer(yaw0);
  return { misto: { x: pos.x + f.x * ODSTUP, y: pos.y + f.y * ODSTUP, z: pos.z }, yaw: (yaw0 + 180) % 360 };
}

function stav(r: Relace): FigurinaZ {
  return { pohlavi: r.pohlavi, zoom: r.zoom, na: r.na.map((k) => [k.id, k.nazev, k.slot, k.ikona]), stoji: !!r.npc, zprava: r.zprava };
}
function poslatStav(r: Relace): void {
  const p = Player.getById(r.pid);
  if (p) p.emit(EV.figurina, JSON.stringify(stav(r)));
}

function zabrat(r: Relace, ms = 600): void {
  const p = Player.getById(r.pid);
  if (!p || !r.misto) return;
  const z = zaber(r.misto, r.yaw, r.zoom, r.pomer, r.panel);
  Camera.setShot(p, { position: v3(z.position.x, z.position.y, z.position.z), lookAt: v3(z.lookAt.x, z.lookAt.y, z.lookAt.z), duration: ms, fov: z.fov });
}

function vytvoritFigurinu(r: Relace, p: Player): void {
  if (!r.misto) return;
  try {
    const npc = Npc.create({
      soul: role(r.pohlavi), name: "Figurína", position: v3(r.misto.x, r.misto.y, r.misto.z), rotation: rot(r.yaw),
      invulnerable: true, frozen: true, interactable: false, nametag: false, lootable: false, locomotion: "kinematic",
      virtualWorld: soukromySvet(r.pid), // od prvního okamžiku mimo svět ostatních
    });
    npc.setVisibleTo(p); // druhá pojistka: replikace jen tomuto hráči
    npc.pin(p);
    npc.state.set("satnik", r.pid, { scope: "server" });
    r.npc = npc;
    // prázdný inventář hned po vytvoření: bez něj `wear([])` nechá oblečení duše NPC (docs: před založením zásoby)
    const prazdny = Inventory.set(npc, { items: [] });
    if (!prazdny.ok) log("figurína: Inventory.set [] " + prazdny.code);
    const g = npc.appearance?.gender;
    if (g && g !== (r.pohlavi === "f" ? "female" : "male")) log(`role ${role(r.pohlavi)} má pohlaví ${g}, čekal jsem ${r.pohlavi}: nastav figurinaMuz/figurinaZena v satnik_config.js`);
    if (CFG.mojeTvar && p.appearance?.gender === (r.pohlavi === "f" ? "female" : "male")) {
      try {
        npc.setAppearance(p.appearance);
      } catch { /* jiná tvář nevadí */ }
    }
    r.zprava = undefined;
    obleknoutHned(r);
  } catch (e) {
    r.npc = null;
    r.zprava = "Figurínu se nepodařilo postavit: " + String((e as Error)?.message ?? e);
    log(r.zprava);
  }
}

function odstranitFigurinu(r: Relace): void {
  if (r.oblekT) clearTimeout(r.oblekT);
  try {
    r.npc?.remove();
  } catch { /* už není */ }
  r.npc = null;
}

/** figurína dostane přesně kusy `r.na` (Npc.wear bere GUID tříd); prázdné = svlečená */
function obleknoutHned(r: Relace): void {
  r.oblekT = undefined;
  const npc = r.npc;
  if (!npc) return;
  const guids = r.na.map((k) => k.guid).filter(Boolean);
  let ok = false;
  try {
    ok = npc.wear(guids);
  } catch (e) {
    log("Npc.wear: " + String(e));
  }
  if (!ok) {
    // záloha: celý inventář figuríny (Inventory.set obléká rovnou, ověřeno u hráčů v příchodu)
    const res = Inventory.set(npc, { items: r.na.map((k) => ({ item: k.guid, amount: 1, equipped: 1 })) });
    if (!res.ok) r.zprava = `Figurína tohle obléct neumí (${res.code}).`;
  }
  poslatStav(r);
}
/** změny v rychlém sledu (klikání v mřížce) se slijí do jednoho převlečení */
function obleknoutPozdeji(r: Relace): void {
  if (r.oblekT) clearTimeout(r.oblekT);
  r.oblekT = setTimeout(() => obleknoutHned(r), 120);
}

const rana = new Map<number, number>();

async function otevrit(p: Player, q?: string): Promise<string> {
  if (!(await muze(p))) return "Na šatník nemáš oprávnění.";
  if (!Player.getById(p.id)) return ""; // odpojil se během kontroly oprávnění: figurína by zůstala viset
  const zbyva = CFG.pauzaPoZasahu * 1000 - (Date.now() - (rana.get(p.id) ?? -Infinity));
  if (!relace.has(p.id) && zbyva > 0) return `Po ráně jde šatník otevřít až za ${Math.ceil(zbyva / 1000)} s.`;
  if (!nacteno) nacist();
  if (!satnik.kusy.length) return "Šatník je prázdný: na serveru neběží katalog s daty (katalog/gen).";
  let r = relace.get(p.id);
  const info = infoZ();
  if (r) {
    p.emit(EV.otevrit, JSON.stringify({ info, q: q ?? "", figurina: stav(r) }));
    return "";
  }
  const pohlavi: "m" | "f" = p.appearance?.gender === "female" ? "f" : "m";
  r = { pid: p.id, npc: null, pohlavi, na: [], misto: null, yaw: 0, zoom: "postava", pomer: 16 / 9, panel: CFG.panel, zrizuje: true };
  relace.set(p.id, r);
  p.emit(EV.otevrit, JSON.stringify({ info, q: q ?? "", figurina: stav(r) }));
  const m = await najitMisto(p);
  if (relace.get(p.id) !== r) return ""; // mezitím zavřel
  r.misto = m.misto;
  r.yaw = m.yaw;
  r.zrizuje = false;
  doSoukromi(p);
  vytvoritFigurinu(r, p);
  zabrat(r, 900);
  log(`${p.nickname} otevřel šatník (figurína ${r.pohlavi} na ${m.misto.x.toFixed(1)} ${m.misto.y.toFixed(1)})`);
  return "";
}

function zavrit(pid: number, proc?: string): void {
  const r = relace.get(pid);
  if (!r) return;
  relace.delete(pid);
  odstranitFigurinu(r);
  const p = Player.getById(pid);
  if (p) {
    zeSoukromi(p);
    Camera.clearShot(p, 700);
    p.emit(EV.zavrit, JSON.stringify({ proc: proc ?? "" }));
    if (proc) Chat.sendToPlayer(p, "Šatník: " + proc);
  }
}

// ---------------------------------------------------------------------------
// zprávy stránky

function infoZ(): Info {
  return { ...satnik.pocty(), sloty: SLOTY, vrstvy: VRSTVY, druhy: DRUHY, prikaz: CFG.prikaz, dosah: CFG.dosahUkazat };
}

function detailZ(klic: string): DetailZ | null {
  const s = satnik.skupina(klic);
  if (!s) return null;
  return {
    klic: s.klic, nazev: s.nazev, pod: s.pod, slot: s.slot, pohlavi: s.pohlavi, kat: s.kat,
    popis: s.varianty.find((v) => v.popis)?.popis ?? "",
    varianty: s.varianty.map((v) => ({ id: v.id, nazev: v.nazev, en: v.en, oznaceni: oznaceniVarianty(v), ikona: v.ikona, cena: v.cena, vaha: v.vaha, obrana: v.obrana, charisma: v.charisma, vrstva: v.vrstva })),
  };
}

/** krejčí: hráčům na doslech (a sobě) do chatu, co má figurína na sobě */
function ukazat(p: Player, r: Relace): string {
  if (!r.na.length) throw new Error("Figurína nemá nic na sobě.");
  const radky = textZakazky(r.na);
  const pos = p.position;
  // hráč je při náhledu v soukromém světě: ukazuje se těm, kdo stojí kolem ve světě, odkud přišel
  const svet = p.state.has(PUVODNI) ? Number(p.state.get(PUVODNI)) || 0 : p.virtualWorld;
  const okoli = Player.all().filter((h) => h.id !== p.id && h.virtualWorld === svet && Math.hypot(h.position.x - pos.x, h.position.y - pos.y, h.position.z - pos.z) <= CFG.dosahUkazat);
  const komu = [p, ...okoli];
  for (const h of komu) {
    Chat.sendToPlayer(h, `${p.nickname} ukazuje oblečení ze šatníku (/${CFG.prikaz} <id> ho otevře):`, { author: "Šatník" });
    for (const t of radky) Chat.sendToPlayer(h, "• " + t, { author: "Šatník" });
  }
  log(`${p.nickname} ukázal ${r.na.length} kusů ${komu.length - 1} hráčům`);
  return komu.length > 1 ? `Ukázáno ${komu.length - 1} hráčům v okolí a tobě v chatu.` : "V okolí nikdo není, seznam máš v chatu.";
}

const reply = (p: Player, o: Odpoved) => p.emit(EV.vysledek, JSON.stringify(o));
const posledni = new Map<number, number>();

function zpracovat(p: Player, z: Zadost): void {
  const rid = Number(z?.rid) || 0;
  const r = relace.get(p.id);
  if (!r) return reply(p, { rid, ok: false, chyba: "Šatník není otevřený." });
  try {
    switch (z.op) {
      case "info":
        return reply(p, { rid, ok: true, info: infoZ() });
      case "hledat":
        return reply(p, { rid, ok: true, vysledek: satnik.hledat(z.dotaz ?? {}) });
      case "detail": {
        const d = detailZ(String(z.id ?? ""));
        return reply(p, d ? { rid, ok: true, detail: d } : { rid, ok: false, chyba: "Neznámý kus." });
      }
      case "ikony": {
        const klice = (z.klice ?? []).slice(0, 120).map(String);
        const balik = davky(klice.map((k) => ({ k, d: ikona(k) })));
        balik.forEach((b, i) => reply(p, { rid, ok: true, ikony: b, dalsi: i < balik.length - 1 }));
        if (!balik.length) reply(p, { rid, ok: true, ikony: [] });
        return;
      }
      case "oblect": {
        const k = satnik.kus(String(z.id ?? ""));
        if (!k) throw new Error("Neznámý kus.");
        if (k.pohlavi !== r.pohlavi) {
          // dámský kus na pánské figuríně nejde (hra nemá model): figurína se převlékne za ženu / muže
          r.na = r.na.filter((x) => x.pohlavi === k.pohlavi);
          zmenitPohlavi(p, r, k.pohlavi);
        }
        r.na = obleknout(r.na, k);
        r.zprava = undefined;
        obleknoutPozdeji(r);
        return reply(p, { rid, ok: true });
      }
      case "svlect":
        r.na = z.id ? r.na.filter((x) => x.id !== z.id) : [];
        r.zprava = undefined;
        obleknoutPozdeji(r);
        return reply(p, { rid, ok: true });
      case "pohlavi":
        if (z.pohlavi === "m" || z.pohlavi === "f") {
          r.na = r.na.filter((x) => x.pohlavi === z.pohlavi);
          zmenitPohlavi(p, r, z.pohlavi);
        }
        return reply(p, { rid, ok: true });
      case "otocit":
        r.yaw = (((r.yaw + (Number(z.o) || 0)) % 360) + 360) % 360;
        r.npc?.teleport(v3(r.misto!.x, r.misto!.y, r.misto!.z), rot(r.yaw));
        zabrat(r, 400);
        return reply(p, { rid, ok: true });
      case "zoom":
        if (z.zoom && z.zoom in ZOOM) r.zoom = z.zoom;
        zabrat(r, 700);
        poslatStav(r);
        return reply(p, { rid, ok: true });
      case "obrazovka":
        r.pomer = Math.min(4, Math.max(1, Number(z.pomer) || 16 / 9));
        r.panel = Math.min(0.8, Math.max(0, Number(z.panel) || CFG.panel));
        zabrat(r, 300);
        return reply(p, { rid, ok: true });
      case "moje": {
        const inv = Inventory.get(p);
        const moje = (inv?.items ?? []).filter((x) => x.equipped > 0).map((x) => satnik.kus(x.name)).filter((k): k is Kus => !!k);
        if (!moje.length) throw new Error("Na sobě nemáš nic, co šatník zná.");
        const pohl = moje[0].pohlavi;
        if (pohl !== r.pohlavi) zmenitPohlavi(p, r, pohl);
        r.na = moje.filter((k) => k.pohlavi === pohl).sort(poradiNaTele);
        obleknoutPozdeji(r);
        return reply(p, { rid, ok: true, zprava: `Figurína má tvoje oblečení (${r.na.length} kusů).` });
      }
      case "ukazat": {
        const t = Date.now();
        if (t - (posledni.get(p.id) ?? 0) < 10000) throw new Error("Ukázat jde jednou za 10 s.");
        posledni.set(p.id, t);
        return reply(p, { rid, ok: true, zprava: ukazat(p, r) });
      }
      default:
        return reply(p, { rid, ok: false, chyba: "neznámá operace" });
    }
  } catch (e) {
    reply(p, { rid, ok: false, chyba: String((e as Error)?.message ?? e) });
  }
}

function zmenitPohlavi(p: Player, r: Relace, pohlavi: "m" | "f"): void {
  if (r.pohlavi === pohlavi) return;
  r.pohlavi = pohlavi;
  odstranitFigurinu(r);
  vytvoritFigurinu(r, p);
}

Events.onClient(EV.zadost, (sender: unknown, raw: unknown) => {
  let z: Zadost;
  try {
    z = (typeof raw === "string" ? JSON.parse(raw) : raw) as Zadost;
  } catch {
    return;
  }
  zpracovat(sender as Player, z);
});
Events.onClient(EV.konec, (sender: unknown) => zavrit((sender as Player).id));

const ZAVRIT = new Set(["zavrit", "zavřít"]);
Events.on("playerCommand", (p: Player, command: string, args: string[]) => {
  if (command.toLowerCase().replace(/^\//, "") !== CFG.prikaz) return;
  const q = args.join(" ").trim();
  if (ZAVRIT.has(q.toLowerCase())) return zavrit(p.id);
  otevrit(p, q).then((t) => t && Chat.sendToPlayer(p, t)).catch((e) => log("otevrit: " + String(e)));
});

Events.on("playerDisconnect", (p: Player) => {
  const r = relace.get(p.id);
  if (r) (relace.delete(p.id), odstranitFigurinu(r));
  posledni.delete(p.id);
  rana.delete(p.id);
});
Events.on("playerDamage", (p: Player) => {
  rana.set(p.id, Date.now());
  if (CFG.zavritPriZasahu && relace.has(p.id)) zavrit(p.id, "zavřeno, dostal jsi ránu.");
});
Events.on("playerDied", (p: Player) => zavrit(p.id));
Events.on("resourceStop", (name: string) => {
  if (name !== "satnik") return;
  for (const pid of [...relace.keys()]) zavrit(pid);
});

// nápověda v konzoli Správy (`;`): přesný popis místo odhadu ze zdroje
function popsatPrikaz(): void {
  try {
    const f = Exports.get("sprava", "registerChatCommands") as ((owner: string, defs: unknown[]) => void) | undefined;
    if (typeof f === "function")
      f("satnik", [{ name: CFG.prikaz, help: "šatník: všechno oblečení ze hry s ikonami a přesnými názvy, vyzkoušení na figuríně", usage: `/${CFG.prikaz} [hledat | id | zavrit]`, perm: CFG.opravneni || undefined }]);
  } catch { /* Správa neběží */ }
}
Events.on("resourceStart", (name: string) => {
  if (name === "sprava") popsatPrikaz();
});
popsatPrikaz();

// po restartu resource (nebo pádu bez resourceStop) mohly zůstat figuríny a hráči v soukromých světech předchozí instance
for (const npc of Npc.all()) {
  try {
    if (npc.state.has("satnik") || jeSoukromy(npc.virtualWorld)) npc.remove();
  } catch { /* nic */ }
}
for (const p of Player.all()) {
  try {
    if (!p.state.has(PUVODNI) && !jeSoukromy(p.virtualWorld)) continue;
    if (!p.state.has(PUVODNI)) p.state.set(PUVODNI, 0, { scope: "server" });
    zeSoukromi(p);
    Camera.clearShot(p, 300);
    p.emit(EV.zavrit, JSON.stringify({ proc: "" }));
    log(`${p.nickname} vrácen ze soukromého světa šatníku (restart)`);
  } catch { /* nic */ }
}

// ---------------------------------------------------------------------------
// API pro ostatní resources (krejčí, obchody…)

const api = {
  version: VERZE,
  /** otevře šatník hráči, volitelně s hledáním (id nebo text) */
  open: (playerId: number, q?: string) => {
    const p = Player.getById(playerId);
    return p ? otevrit(p, q) : Promise.resolve("hráč není online");
  },
  close: (playerId: number) => zavrit(playerId),
  /** kus podle id (jméno třídy), null když ho šatník nezná */
  get: (id: string) => satnik.kus(id),
  /** hledání jako na stránce: { q, pohlavi, druh, slot, pod, varianty, razeni, od, pocet<=200 } */
  search: (d: Parameters<Satnik["hledat"]>[0]) => satnik.hledat(d),
  /** co má hráčova figurína na sobě (id předmětů), null když šatník nemá otevřený */
  outfit: (playerId: number) => relace.get(playerId)?.na.map((k) => k.id) ?? null,
};
for (const [name, value] of Object.entries(api)) Exports.register(name, value);
log(`verze ${VERZE}, příkaz /${CFG.prikaz}, oprávnění ${CFG.opravneni || "všichni"}, figurína: muž ${role("m")}, žena ${role("f")}`);
