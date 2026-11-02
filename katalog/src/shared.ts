// Protokol mezi serverem, klientem a stránkou katalogu. Každá zpráva je malá (pod ~12 000 znaků, limit KCDC je ~64 KB na událost):
// výsledky hledání jdou po stránkách, ikony po dávkách a jen ty, které stránka právě zobrazuje.
import type { Dotaz, PredmetZ, Vysledek } from "./core";

export const EV = {
  /** server -> klient: otevři prohlížeč { vyber?: { pro: string, kat?, oblect? } } */
  otevrit: "katalog:otevrit",
  /** stránka -> klient -> server: Zadost */
  zadost: "katalog:zadost",
  /** server -> klient -> stránka: Odpoved */
  vysledek: "katalog:vysledek",
  /** stránka -> klient */
  ready: "katalog:ready",
  zavrit: "katalog:zavrit",
  /** stránka -> klient: vybraný předmět (režim výběru pro jiný modul) */
  vybrano: "katalog:vybrano",
} as const;

/** stránka -> server: { rid, ... }; server -> stránka EV.vysledek { rid, ok, ... } */
export interface Zadost {
  rid: number;
  op: "hledat" | "detail" | "ikony" | "akce" | "hraci" | "kolekce" | "kolekcePridat" | "kolekceSmazat" | "info";
  dotaz?: Dotaz;
  id?: string;
  klice?: string[];
  akce?: "dat" | "spawn" | "sada";
  hrac?: number;
  pocet?: number;
  kvalita?: number;
  /** stav 0..100 % */
  stav?: number;
  sada?: string;
  /** kolekce ikon: název a PNG (base64, už oříznuté a zmenšené stránkou) nebo klíč ikony hry */
  nazev?: string;
  png?: string;
  hra?: string;
}

export interface Odpoved {
  rid: number;
  ok: boolean;
  chyba?: string;
  zprava?: string;
  vysledek?: Vysledek;
  predmet?: PredmetZ & { cenaServer?: number | null };
  /** k = klíč ikony, d = base64 PNG ("" = chybí); posílá se v několika odpovědích se stejným rid a `dalsi` */
  ikony?: { k: string; d: string }[];
  dalsi?: boolean;
  hraci?: { id: number; jmeno: string }[];
  kolekce?: KolekceIkona[];
  info?: { pocet: number; ikon: number; kategorie: Record<string, string>; sloty: Record<string, string>; podkategorie: Record<string, Record<string, number>>; generovano: string; sady: string[] };
}

export interface KolekceIkona {
  id: string;
  nazev: string;
  /** "soubor" = nahraná PNG (data/kolekce/<id>.png), "hra" = ikona předmětu hry */
  zdroj: "soubor" | "hra";
  /** klíč ikony pro katalog:ikony (u souboru "kolekce:<id>") */
  ikona: string;
}

export const IKONA_KOLEKCE = 64;
export const MAX_PNG = 48 * 1024;
