// Protokol mezi serverem, klientem a stránkou šatníku. Každá zpráva je malá (limit KCDC je ~64 KB na událost):
// výsledky po stránkách, ikony po dávkách a jen ty, které stránka právě kreslí.
import type { Dotaz, Vysledek, Zoom } from "./core";

export const EV = {
  /** server -> klient: otevři šatník { info, q? } */
  otevrit: "satnik:otevrit",
  /** server -> klient: zavři (figurína zmizela, hráč dostal ránu…) { proc? } */
  zavrit: "satnik:zavrit",
  /** stránka -> klient -> server: Zadost */
  zadost: "satnik:zadost",
  /** server -> klient -> stránka: Odpoved */
  vysledek: "satnik:vysledek",
  /** server -> klient -> stránka: co má figurína na sobě (po každé změně) */
  figurina: "satnik:figurina",
  /** stránka -> klient */
  ready: "satnik:ready",
  /** stránka -> klient -> server: hráč šatník zavřel */
  konec: "satnik:konec",
} as const;

export interface Zadost {
  rid: number;
  op: "info" | "hledat" | "detail" | "ikony" | "oblect" | "svlect" | "pohlavi" | "otocit" | "zoom" | "moje" | "ukazat" | "obrazovka";
  dotaz?: Dotaz;
  id?: string;
  klice?: string[];
  pohlavi?: "m" | "f";
  /** otočení figuríny o stupně (+ doleva) */
  o?: number;
  zoom?: Zoom;
  /** obrazovka: poměr stran a podíl panelu */
  pomer?: number;
  panel?: number;
}

export interface VariantaZ {
  id: string;
  nazev: string;
  en: string;
  oznaceni: string;
  ikona: string;
  cena: number;
  vaha: number;
  obrana: [number, number, number];
  charisma: number;
  vrstva: string;
}

export interface DetailZ {
  klic: string;
  nazev: string;
  pod: string;
  slot: string;
  pohlavi: "m" | "f";
  kat: string;
  popis: string;
  varianty: VariantaZ[];
}

export interface FigurinaZ {
  pohlavi: "m" | "f";
  zoom: Zoom;
  /** kusy na figuríně: [id, název, slot, ikona] */
  na: [string, string, string, string][];
  /** figurína ve hře stojí (false = čeká se na místo nebo ji nejde vytvořit) */
  stoji: boolean;
  zprava?: string;
}

export interface Odpoved {
  rid: number;
  ok: boolean;
  chyba?: string;
  zprava?: string;
  vysledek?: Vysledek;
  detail?: DetailZ;
  ikony?: { k: string; d: string }[];
  dalsi?: boolean;
  info?: Info;
}

export interface Info {
  kusu: number;
  skupin: number;
  damskych: number;
  panskych: number;
  sloty: Record<string, string>;
  vrstvy: Record<string, string>;
  druhy: Record<string, string>;
  prikaz: string;
  /** krejčí: komu se dá oblečení ukázat (do chatu na blízko) */
  dosah: number;
}
