// Jádro katalogu: předměty, hledání, filtry, stránkování. Čisté, bez globálů KCDC (testy, server i generátor).
import { KATEGORIE, SLOTY } from "./sloty";

/** předmět, jak ho zapíše generátor (gen/katalog.json) */
export interface Predmet {
  /** jméno třídy z tabulek hry = to, co bere Inventory.add / GroundItem.spawn */
  id: string;
  guid: string;
  cs: string;
  en: string;
  kat: string;
  pod: string;
  slot: string;
  vrstva: string;
  cena: number;
  vaha: number;
  /** klíč ikony (gen/ikony/<ikona>.png), "" = hra ikonu nemá */
  ikona: string;
  /** nejvyšší kvalita */
  kval: number;
  quest: boolean;
  /** element tabulky (Armor, MeleeWeapon...) */
  typ: string;
  /** jen oblečení a zbroj na tělo: "f" = dámské (model f_…), "m" = pánské */
  pohlavi?: "m" | "f";
  /** model z tabulek (`Clothing`, např. F_Cotehardie01_m01) */
  model?: string;
  /** popis ze hry (UIInfo), česky, jinak anglicky */
  popis?: string;
  /** obrana bod / sek / drcení */
  obrana?: [number, number, number];
  charisma?: number;
}

/** předmět s tím, co zjistí server za běhu */
export interface PredmetZ extends Predmet {
  /** server KCDC třídu zná (Inventory.getItemPrice !== null) */
  zna: boolean;
  /** jde obléct (Inventory.classes()) */
  oblect: boolean;
}

export interface Dotaz {
  q?: string;
  kat?: string;
  pod?: string;
  slot?: string;
  zna?: boolean;
  oblect?: boolean;
  /** "m" | "f": jen pánské / dámské oblečení */
  pohlavi?: string;
  /** i systémové (NPC nástroje, aliasy) a questové; výchozí ne */
  vse?: boolean;
  razeni?: "nazev" | "cena" | "vaha" | "id";
  od?: number;
  pocet?: number;
}

/** řádek pro klienta (krátký kvůli limitu zprávy) */
export type Radek = [id: string, nazev: string, kat: string, pod: string, slot: string, cena: number, vaha: number, ikona: string, zna: 0 | 1, oblect: 0 | 1];

export interface Vysledek {
  celkem: number;
  od: number;
  radky: Radek[];
  /** počty podle kategorie pro stejný dotaz bez filtru kategorie */
  kategorie: Record<string, number>;
}

export const MAX_STRANKA = 200;

/** malá písmena bez diakritiky */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export class Katalog {
  readonly polozky: PredmetZ[];
  private podleId = new Map<string, PredmetZ>();
  private seno: string[];
  private nazvy: string[];

  constructor(polozky: Predmet[], zna: (id: string) => boolean = () => true, oblect: (id: string) => boolean = () => false) {
    this.polozky = polozky.map((p) => ({ ...p, zna: zna(p.id), oblect: oblect(p.id) }));
    for (const p of this.polozky) this.podleId.set(p.id.toLowerCase(), p);
    this.nazvy = this.polozky.map((p) => norm(Katalog.nazev(p)));
    this.seno = this.polozky.map((p) => norm(`${p.id} ${p.cs} ${p.en} ${p.pod} ${KATEGORIE[p.kat] ?? ""} ${SLOTY[p.slot] ?? ""} ${p.pohlavi === "f" ? "dámské" : p.pohlavi === "m" ? "pánské" : ""}`));
  }

  get(id: string): PredmetZ | null {
    return this.podleId.get(String(id).toLowerCase()) ?? null;
  }

  /** názvy v češtině, jinak anglicky, jinak id */
  static nazev(p: Predmet): string {
    return p.cs || p.en || p.id;
  }

  hledat(d: Dotaz = {}): Vysledek {
    const tokens = norm(String(d.q ?? "").trim()).split(/\s+/).filter(Boolean);
    const q = tokens.join(" ");
    const zaklad: number[] = [];
    for (let i = 0; i < this.polozky.length; i++) {
      const p = this.polozky[i];
      if (!d.vse && (p.kat === "system" || (p.quest && !tokens.length))) continue;
      if (d.zna !== undefined && p.zna !== d.zna) continue;
      if (d.oblect !== undefined && p.oblect !== d.oblect) continue;
      if (d.slot && p.slot !== d.slot) continue;
      if (d.pohlavi && p.pohlavi !== d.pohlavi) continue;
      if (tokens.length && !tokens.every((t) => this.seno[i].includes(t))) continue;
      zaklad.push(i);
    }
    const kategorie: Record<string, number> = {};
    for (const i of zaklad) kategorie[this.polozky[i].kat] = (kategorie[this.polozky[i].kat] ?? 0) + 1;
    let vybrane = zaklad.filter((i) => (!d.kat || this.polozky[i].kat === d.kat) && (!d.pod || this.polozky[i].pod === d.pod));

    const shoda = (i: number) => {
      if (!q) return 0;
      const p = this.polozky[i];
      if (p.id.toLowerCase() === q) return 3;
      const n = this.nazvy[i];
      return n === q ? 2 : n.startsWith(q) ? 1 : 0;
    };
    const r = d.razeni ?? "nazev";
    const klic = (i: number) => (r === "id" ? this.polozky[i].id : this.nazvy[i]);
    vybrane = vybrane.sort((a, b) => {
      const s = shoda(b) - shoda(a);
      if (s) return s;
      if (r === "cena") return this.polozky[b].cena - this.polozky[a].cena;
      if (r === "vaha") return this.polozky[b].vaha - this.polozky[a].vaha;
      return klic(a) < klic(b) ? -1 : klic(a) > klic(b) ? 1 : 0;
    });

    const od = Math.max(0, Math.floor(Number(d.od) || 0));
    const pocet = Math.min(MAX_STRANKA, Math.max(1, Math.floor(Number(d.pocet) || 60)));
    return { celkem: vybrane.length, od, radky: vybrane.slice(od, od + pocet).map((i) => radek(this.polozky[i])), kategorie };
  }

  /** podkategorie v kategorii s počty (pro filtr) */
  podkategorie(kat: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const p of this.polozky) if (p.kat === kat) out[p.pod] = (out[p.pod] ?? 0) + 1;
    return out;
  }
}

export function radek(p: PredmetZ): Radek {
  return [p.id, Katalog.nazev(p), p.kat, p.pod, p.slot, p.cena, p.vaha, p.ikona, p.zna ? 1 : 0, p.oblect ? 1 : 0];
}

/** klíč ikony do jména souboru: jen [a-z0-9_-], malými */
export function klicIkony(iconId: string): string {
  return String(iconId).toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

/** dávky ikon pro jednu zprávu: base64 se vejde pod limit (znaků) */
export function davky<T extends { data: string }>(ikony: T[], limit = 40000): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let len = 0;
  for (const i of ikony) {
    const n = i.data.length + 64;
    if (cur.length && len + n > limit) {
      out.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(i);
    len += n;
  }
  if (cur.length) out.push(cur);
  return out;
}
