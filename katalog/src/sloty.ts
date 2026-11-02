// Kategorie, slot a vrstva předmětu. Tabulky hry (item*.xml) nesou jen typ elementu (Armor, MeleeWeapon, Food...) a pár čísel;
// slot oblečení v nich není, proto se odvozuje z prefixu jména modelu (`Clothing`, např. TunicShort05_m09 -> tunicshort).
// Čistý kód bez KCDC: používá ho generátor (tools/katalog.mjs) i testy.

export interface Zarazeni {
  /** hlavní kategorie (id) */
  kat: string;
  /** podkategorie (id, česky) */
  pod: string;
  /** slot těla nebo koně, "" když se nenosí */
  slot: string;
  /** vrstva: latka | prosivanice | krouzky | plat | ozdoba | "" */
  vrstva: string;
}

export const KATEGORIE: Record<string, string> = {
  zbrane: "Zbraně",
  strelne: "Střelné zbraně a střely",
  obleceni: "Oblečení",
  zbroj: "Zbroj a přilby",
  kun: "Výstroj koně",
  jidlo: "Jídlo a pití",
  alchymie: "Alchymie a byliny",
  dokumenty: "Knihy a listiny",
  kostky: "Kostky",
  suroviny: "Suroviny",
  ostatni: "Ostatní",
  system: "Systémové (NPC, aliasy)",
};

export const SLOTY: Record<string, string> = {
  hlava: "Hlava", krk: "Krk", trup: "Trup", kabat: "Kabát / sukně", paze: "Paže", ruce: "Ruce", nohy: "Nohy", boty: "Boty",
  pas: "Opasek / pochva", kun: "Kůň", zbran: "Zbraň", stit: "Štít", strela: "Střely",
};

// prefix modelu (malými písmeny, bez "f_") -> [podkategorie, slot, vrstva]; vyhrává nejdelší prefix
const OBLECENI: [string, string, string, string][] = [
  ["cap", "čepice", "hlava", "latka"], ["haircap", "čepice", "hlava", "latka"], ["hood", "kápě", "hlava", "latka"],
  ["coifcap", "čepec", "hlava", "latka"], ["coifsmall", "čepec", "hlava", "latka"], ["coiflarge", "čepec", "hlava", "prosivanice"],
  ["coifmail", "kroužkový kapuc", "hlava", "krouzky"], ["wreath", "věnec", "hlava", "ozdoba"], ["spectacles", "brýle", "hlava", "ozdoba"],
  ["eyepatch", "páska přes oko", "hlava", "ozdoba"], ["bagoverhead", "pytel přes hlavu", "hlava", "ozdoba"],
  ["bascinet", "přilba", "hlava", "plat"], ["kettlehat", "přilba", "hlava", "plat"], ["skullcap", "přilba", "hlava", "plat"],
  ["plaguesuit", "maska", "hlava", "ozdoba"], ["hairdecor", "ozdoba vlasů", "hlava", "ozdoba"], ["veil", "závoj", "hlava", "latka"], ["bonnet", "čepec", "hlava", "latka"], ["tarasmura", "přilba", "hlava", "plat"],
  ["collarchain", "kroužkový límec", "krk", "krouzky"], ["collarpadded", "prošívaný límec", "krk", "prosivanice"],
  ["necklace", "náhrdelník", "krk", "ozdoba"], ["noose", "oprátka", "krk", "ozdoba"],
  ["tunic", "košile a tuniky", "trup", "latka"], ["torso", "košile a tuniky", "trup", "latka"], ["habit", "hábit", "trup", "latka"],
  ["caftan", "kaftan", "trup", "latka"], ["simpledress", "šaty", "trup", "latka"], ["dress", "šaty", "trup", "latka"],
  ["cotehardie", "šaty", "trup", "latka"], ["gambeson", "prošívanice", "trup", "prosivanice"],
  ["mailshort", "kroužková košile", "trup", "krouzky"], ["maillong", "kroužková košile", "trup", "krouzky"],
  ["cuirass", "kyrys", "trup", "plat"], ["brigandine", "brigantina", "trup", "plat"], ["brigandinearm", "brigantinové rukávy", "paze", "plat"],
  ["coat", "kabát", "kabat", "ozdoba"], ["waffenrock", "waffenrock", "kabat", "ozdoba"], ["surcote", "suknice", "kabat", "ozdoba"],
  ["armplate", "plátové rukávy", "paze", "plat"], ["gloves", "rukavice", "ruce", "latka"], ["gauntlets", "plátové rukavice", "ruce", "plat"],
  ["handwrap", "obvaz", "ruce", "latka"], ["ring", "prsten", "ruce", "ozdoba"],
  ["hose", "nohavice", "nohy", "latka"], ["prepadenihenrybreeches", "nohavice", "nohy", "latka"], ["legspadded", "prošívané nohavice", "nohy", "prosivanice"],
  ["legsbrigandine", "brigantinové nohavice", "nohy", "plat"], ["legsplate", "plátové nohavice", "nohy", "plat"],
  ["shoes", "boty", "boty", "latka"], ["boots", "boty", "boty", "latka"], ["spurs", "ostruhy", "boty", "ozdoba"],
  ["scabbard", "pochva", "pas", "ozdoba"],
  ["caparison", "čabraka", "kun", "latka"], ["noblecaparison", "čabraka", "kun", "latka"], ["paddedcaparison", "čabraka", "kun", "prosivanice"],
  ["saddle", "sedlo", "kun", ""], ["warsaddle", "sedlo", "kun", ""], ["noblesaddle", "sedlo", "kun", ""], ["basicsaddle", "sedlo", "kun", ""],
  ["eastsaddle", "sedlo", "kun", ""], ["bridle", "uzda", "kun", ""], ["basicbridle", "uzda", "kun", ""], ["noblebridle", "uzda", "kun", ""],
  ["eastbridle", "uzda", "kun", ""], ["cartbridle", "uzda", "kun", ""], ["nomadbridle", "uzda", "kun", ""],
  ["chanfron", "chanfron", "kun", "plat"], ["warchanfron", "chanfron", "kun", "plat"], ["cumanchanfron", "chanfron", "kun", "plat"],
  ["basicharness", "postroj", "kun", ""], ["horseshoe", "podkovy", "kun", ""], ["kovanizavodnipodkovy", "podkovy", "kun", ""],
  ["yoke", "jho", "kun", ""],
];
const OBLECENI_PODLE_DELKY = OBLECENI.slice().sort((a, b) => b[0].length - a[0].length);

const ZBRANE: Record<number, string> = {
  0: "dýky", 1: "meče", 2: "šavle", 3: "sekery", 4: "dlouhé meče", 5: "palcáty", 6: "řemdihy", 7: "dřevcové zbraně", 8: "štíty",
  11: "pochodně", 12: "pěsti", 16: "lovecké tesáky", 17: "rozbité štíty",
};
const JIDLO: Record<number, string> = { 0: "ovoce", 1: "lektvary", 2: "maso", 3: "pití", 5: "polévky a kaše", 6: "zelenina", 7: "houby", 8: "pečivo", 9: "mléčné" };
const DOKUMENTY: Record<number, string> = { 1: "knihy", 2: "recepty", 3: "dovednostní knihy", 4: "mapy", 5: "dopisy" };

function strelna(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("crossbow")) return "kuše";
  if (n.includes("bow")) return "luky";
  if (/gun|pistal|hakovnic|handgonne|firearm/.test(n)) return "palné zbraně";
  return "střelné";
}

/** prefix modelu: TunicShort05_m09 -> tunicshort, f_SimpleDress05 -> simpledress */
export function prefixModelu(model: string): string {
  const m = /^(?:f_)?([A-Za-z]+)/i.exec(model.trim());
  return m ? m[1].toLowerCase() : "";
}

/** pohlaví oblečení podle modelu: dámské modely mají prefix `f_` (f_SimpleDress05), ostatní jsou pánské */
export function pohlavi(model: string): "m" | "f" {
  return /^f_/i.test(String(model).trim()) ? "f" : "m";
}

export function zaradit(tag: string, a: Record<string, string>): Zarazeni {
  const num = (k: string) => (a[k] === undefined || a[k] === "" ? NaN : Number(a[k]));
  switch (tag) {
    case "MeleeWeapon": {
      const pod = ZBRANE[num("Class")] ?? "ostatní";
      return { kat: "zbrane", pod, slot: pod.endsWith("štíty") ? "stit" : "zbran", vrstva: "" };
    }
    case "MissileWeapon":
      return { kat: "strelne", pod: strelna(a.Name || ""), slot: "zbran", vrstva: "" };
    case "Ammo":
      return { kat: "strelne", pod: "střely", slot: "strela", vrstva: "" };
    case "Armor": case "Helmet": case "Hood": {
      const p = prefixModelu(a.Clothing || a.Name || "");
      const r = OBLECENI_PODLE_DELKY.find(([k]) => p.startsWith(k));
      if (!r) return { kat: tag === "Helmet" ? "zbroj" : "obleceni", pod: tag === "Helmet" ? "přilba" : tag === "Hood" ? "kápě" : "ostatní", slot: tag === "Armor" ? "" : "hlava", vrstva: "" };
      const [, pod, slot, vrstva] = r;
      const kat = slot === "kun" ? "kun" : vrstva === "krouzky" || vrstva === "plat" ? "zbroj" : "obleceni";
      return { kat, pod, slot, vrstva };
    }
    case "Food":
      return { kat: num("Type") === 1 ? "alchymie" : "jidlo", pod: JIDLO[num("Type")] ?? "jídlo", slot: "", vrstva: "" };
    case "Herb": return { kat: "alchymie", pod: "byliny", slot: "", vrstva: "" };
    case "AlchemyBase": return { kat: "alchymie", pod: "základy", slot: "", vrstva: "" };
    case "Ointment": return { kat: "alchymie", pod: "masti", slot: "", vrstva: "" };
    case "Poison": return { kat: "alchymie", pod: "jedy", slot: "", vrstva: "" };
    case "Document": return { kat: "dokumenty", pod: DOKUMENTY[num("Type")] ?? "listiny", slot: "", vrstva: "" };
    case "Die": return { kat: "kostky", pod: "kostky", slot: "", vrstva: "" };
    case "DiceBadge": return { kat: "kostky", pod: "odznaky", slot: "", vrstva: "" };
    case "CraftingMaterial": return { kat: "suroviny", pod: "suroviny", slot: "", vrstva: "" };
    case "NPCTool": return { kat: "system", pod: "nástroje NPC", slot: "", vrstva: "" };
    case "ItemAlias": return { kat: "system", pod: "aliasy", slot: "", vrstva: "" };
    case "Key": case "KeyRing": return { kat: "ostatni", pod: "klíče", slot: "", vrstva: "" };
    case "Money": return { kat: "ostatni", pod: "peníze", slot: "", vrstva: "" };
    case "QuickSlotContainer": return { kat: "ostatni", pod: "měšce a pouzdra", slot: "", vrstva: "" };
    default: return { kat: "ostatni", pod: "ostatní", slot: "", vrstva: "" };
  }
}
