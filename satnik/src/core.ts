// Jádro šatníku: oblečení z katalogu, hledání, skupiny variant, co má figurína na sobě a záběr kamery.
// Čisté, bez globálů KCDC (testy i server).

/** předmět, jak ho vrací katalog (Exports.get("katalog", "items")) */
export interface KatalogPredmet {
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
  ikona: string;
  kval: number;
  quest: boolean;
  typ: string;
  zna?: boolean;
  oblect?: boolean;
  pohlavi?: "m" | "f";
  model?: string;
  popis?: string;
  obrana?: [number, number, number];
  charisma?: number;
}

/** kus oblečení v šatníku */
export interface Kus {
  id: string;
  guid: string;
  nazev: string;
  en: string;
  kat: string;
  pod: string;
  slot: string;
  vrstva: string;
  pohlavi: "m" | "f";
  model: string;
  popis: string;
  obrana: [number, number, number];
  charisma: number;
  cena: number;
  vaha: number;
  ikona: string;
  /** server KCDC třídu zná a jde obléct */
  zna: boolean;
}

/** skupina = jeden druh oblečení (stejné pohlaví, název a model bez varianty barvy), varianty = jednotlivé předměty */
export interface Skupina {
  klic: string;
  nazev: string;
  pod: string;
  slot: string;
  pohlavi: "m" | "f";
  kat: string;
  varianty: Kus[];
}

export const SLOTY: Record<string, string> = {
  hlava: "Hlava", krk: "Krk", trup: "Trup", kabat: "Kabát a sukně", paze: "Paže", ruce: "Ruce", nohy: "Nohy", boty: "Boty", pas: "Opasek",
};
export const VRSTVY: Record<string, string> = { latka: "látka", prosivanice: "prošívanice", krouzky: "kroužky", plat: "plát", ozdoba: "doplněk" };
export const DRUHY: Record<string, string> = { obleceni: "Oblečení", zbroj: "Zbroj" };

export interface Dotaz {
  q?: string;
  pohlavi?: "m" | "f";
  /** obleceni | zbroj */
  druh?: string;
  slot?: string;
  pod?: string;
  /** true = každá varianta zvlášť, jinak skupiny */
  varianty?: boolean;
  razeni?: "nazev" | "cena";
  od?: number;
  pocet?: number;
}

/** řádek výsledku (krátký kvůli limitu zprávy): klíč skupiny nebo id varianty */
export type Radek = [klic: string, nazev: string, pod: string, slot: string, ikona: string, pohlavi: "m" | "f", variant: number, cena: number, id: string];

export interface Vysledek {
  celkem: number;
  od: number;
  radky: Radek[];
  /** počty podle slotu pro stejný dotaz bez filtru slotu a podkategorie */
  sloty: Record<string, number>;
  /** podkategorie ve vybraném slotu (nebo všech) s počty */
  pod: Record<string, number>;
}

export const MAX_STRANKA = 200;

export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** model bez varianty barvy: F_Cotehardie01_m01 -> F_Cotehardie01, Cap01_mApprentice02 -> Cap01 */
export function zakladModelu(model: string): string {
  return String(model).replace(/_m[0-9A-Za-z]*$/, "");
}

/** krátké označení varianty pro krejčího: model bez základu + písmeno z id (Hood07_m04_C -> m04 C) */
export function oznaceniVarianty(k: Kus): string {
  const zaklad = zakladModelu(k.model);
  const barva = k.model.slice(zaklad.length).replace(/^_/, "");
  const konec = k.id.toLowerCase().startsWith(k.model.toLowerCase()) ? k.id.slice(k.model.length).replace(/^_/, "") : "";
  return [barva, konec].filter(Boolean).join(" ") || k.id;
}

export function zKatalogu(p: KatalogPredmet): Kus | null {
  if (!p.pohlavi || !SLOTY[p.slot] || (p.kat !== "obleceni" && p.kat !== "zbroj") || p.quest) return null;
  return {
    id: p.id, guid: p.guid, nazev: p.cs || p.en || p.id, en: p.en, kat: p.kat, pod: p.pod, slot: p.slot, vrstva: p.vrstva, pohlavi: p.pohlavi,
    model: p.model ?? p.id, popis: p.popis ?? "", obrana: p.obrana ?? [0, 0, 0], charisma: p.charisma ?? 0, cena: p.cena, vaha: p.vaha, ikona: p.ikona,
    zna: p.zna !== false && p.oblect !== false && !!p.guid,
  };
}

const PORADI_SLOTU = Object.keys(SLOTY);

export class Satnik {
  readonly kusy: Kus[];
  readonly skupiny: Skupina[];
  private podleId = new Map<string, Kus>();
  private podleKlice = new Map<string, Skupina>();
  private skupinaKusu = new Map<string, Skupina>();
  private senoSkupin: string[];

  /** `jenZnamé`: jen co server zná a jde obléct (figurína jiné neoblékne) */
  constructor(predmety: KatalogPredmet[], jenZname = true) {
    this.kusy = predmety.map(zKatalogu).filter((k): k is Kus => !!k && (!jenZname || k.zna));
    const mapa = new Map<string, Skupina>();
    for (const k of this.kusy) {
      this.podleId.set(k.id.toLowerCase(), k);
      const klic = `${k.pohlavi}:${zakladModelu(k.model)}:${norm(k.nazev)}`.toLowerCase();
      let s = mapa.get(klic);
      if (!s) mapa.set(klic, (s = { klic, nazev: k.nazev, pod: k.pod, slot: k.slot, pohlavi: k.pohlavi, kat: k.kat, varianty: [] }));
      s.varianty.push(k);
      this.skupinaKusu.set(k.id.toLowerCase(), s);
    }
    for (const s of mapa.values()) s.varianty.sort((a, b) => (a.model + a.id < b.model + b.id ? -1 : 1));
    this.skupiny = [...mapa.values()];
    for (const s of this.skupiny) this.podleKlice.set(s.klic, s);
    this.senoSkupin = this.skupiny.map((s) =>
      norm(`${s.nazev} ${s.pod} ${SLOTY[s.slot] ?? ""} ${s.pohlavi === "f" ? "damske zenske" : "panske muzske"} ${s.varianty.map((v) => `${v.id} ${v.en}`).join(" ")}`),
    );
  }

  kus(id: string): Kus | null {
    return this.podleId.get(String(id).toLowerCase()) ?? null;
  }

  skupina(klicNeboId: string): Skupina | null {
    const k = String(klicNeboId);
    return this.podleKlice.get(k.toLowerCase()) ?? this.skupinaKusu.get(k.toLowerCase()) ?? null;
  }

  hledat(d: Dotaz = {}): Vysledek {
    const tokens = norm(String(d.q ?? "").trim()).split(/\s+/).filter(Boolean);
    const zaklad: Skupina[] = [];
    for (let i = 0; i < this.skupiny.length; i++) {
      const s = this.skupiny[i];
      if (d.pohlavi && s.pohlavi !== d.pohlavi) continue;
      if (d.druh && s.kat !== d.druh) continue;
      if (tokens.length && !tokens.every((t) => this.senoSkupin[i].includes(t))) continue;
      zaklad.push(s);
    }
    const sloty: Record<string, number> = {};
    for (const s of zaklad) sloty[s.slot] = (sloty[s.slot] ?? 0) + (d.varianty ? s.varianty.length : 1);
    const veSlotu = zaklad.filter((s) => !d.slot || s.slot === d.slot);
    const pod: Record<string, number> = {};
    for (const s of veSlotu) pod[s.pod] = (pod[s.pod] ?? 0) + (d.varianty ? s.varianty.length : 1);
    const vybrane = veSlotu.filter((s) => !d.pod || s.pod === d.pod);

    const q = tokens.join(" ");
    const shoda = (s: Skupina) => (!q ? 0 : s.varianty.some((v) => v.id.toLowerCase() === q) ? 3 : norm(s.nazev) === q ? 2 : norm(s.nazev).startsWith(q) ? 1 : 0);
    const cena = (s: Skupina) => Math.min(...s.varianty.map((v) => v.cena));
    vybrane.sort((a, b) => {
      const x = shoda(b) - shoda(a);
      if (x) return x;
      if (d.razeni === "cena") return cena(a) - cena(b);
      const sl = PORADI_SLOTU.indexOf(a.slot) - PORADI_SLOTU.indexOf(b.slot);
      if (!d.slot && sl) return sl;
      return a.nazev.localeCompare(b.nazev, "cs") || (a.klic < b.klic ? -1 : 1);
    });

    const radky: Radek[] = [];
    const od = Math.max(0, Math.floor(Number(d.od) || 0));
    const pocet = Math.min(MAX_STRANKA, Math.max(1, Math.floor(Number(d.pocet) || 60)));
    let celkem = 0;
    if (d.varianty) {
      for (const s of vybrane)
        for (const v of s.varianty) {
          if (celkem >= od && radky.length < pocet) radky.push([v.id, v.nazev, v.pod, v.slot, v.ikona, v.pohlavi, 1, v.cena, v.id]);
          celkem++;
        }
    } else {
      celkem = vybrane.length;
      for (const s of vybrane.slice(od, od + pocet)) radky.push([s.klic, s.nazev, s.pod, s.slot, s.varianty[0].ikona, s.pohlavi, s.varianty.length, cena(s), s.varianty[0].id]);
    }
    return { celkem, od, radky, sloty, pod };
  }

  /** počty pro úvodní přehled */
  pocty(): { kusu: number; skupin: number; damskych: number; panskych: number } {
    return {
      kusu: this.kusy.length,
      skupin: this.skupiny.length,
      damskych: this.kusy.filter((k) => k.pohlavi === "f").length,
      panskych: this.kusy.filter((k) => k.pohlavi === "m").length,
    };
  }
}

// ---------------------------------------------------------------------------
// figurína: co má na sobě

/** místo na těle: dva kusy na stejném místě se vylučují (nový nahradí starý). Doplňky (prsten, náhrdelník…) jen se stejnou podkategorií. */
export function misto(k: Pick<Kus, "slot" | "vrstva" | "pod">): string {
  return k.vrstva === "ozdoba" ? `${k.slot}/${k.vrstva}/${k.pod}` : `${k.slot}/${k.vrstva}`;
}

/** oblékne kus: stejné místo nahradí, stejný kus podruhé svlékne (přepínač) */
export function obleknout(na: Kus[], k: Kus): Kus[] {
  if (na.some((x) => x.id === k.id)) return na.filter((x) => x.id !== k.id);
  const m = misto(k);
  return [...na.filter((x) => misto(x) !== m), k].sort(poradiNaTele);
}

export function poradiNaTele(a: Kus, b: Kus): number {
  return PORADI_SLOTU.indexOf(a.slot) - PORADI_SLOTU.indexOf(b.slot) || (a.vrstva < b.vrstva ? -1 : a.vrstva > b.vrstva ? 1 : 0);
}

/** text pro krejčího (chat, schránka): přesné názvy ze hry a id předmětů */
export function textZakazky(kusy: Kus[]): string[] {
  return kusy.map((k) => `${k.nazev} – ${k.id} (${k.pod}, ${(SLOTY[k.slot] ?? k.slot).toLowerCase()})`);
}

// ---------------------------------------------------------------------------
// záběr kamery na figurínu

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** yaw ve stupních: 0 = +Y, proti směru hodinových ručiček (jako příchod a dokumentace KCDC) */
export function smer(yaw: number): { x: number; y: number } {
  const a = (yaw * Math.PI) / 180;
  return { x: -Math.sin(a), y: Math.cos(a) };
}
export function yawK(dx: number, dy: number): number {
  return ((((Math.atan2(-dx, dy) * 180) / Math.PI) % 360) + 360) % 360;
}

/** přiblížení: [výška bodu, kam se kouká, vzdálenost kamery, výška kamery, svislé FOV] (vychází z náhledu v příchodu) */
export const ZOOM = {
  postava: [0.95, 2.8, 1.25, 46],
  horni: [1.35, 1.7, 1.5, 38],
  hlava: [1.62, 0.95, 1.66, 30],
  nohy: [0.45, 1.7, 0.85, 40],
} as const;
export type Zoom = keyof typeof ZOOM;

/** figurína stojí tak daleko před hráčem, aby kamera byla vždy mezi nimi (hráč zůstane za kamerou) */
export const ODSTUP = ZOOM.postava[1] + 0.7;

/**
 * Záběr na figurínu: kamera stojí před ní (ve směru, kam figurína kouká), a dívá se kousek vlevo od ní,
 * takže figurína vyjde do pravé části obrazovky vedle panelu. `panel` = podíl šířky obrazovky, který zabírá panel vlevo.
 */
export function zaber(m: V3, yawFigury: number, zoom: Zoom, pomer = 16 / 9, panel = 0.55): { position: V3; lookAt: V3; fov: number } {
  const [look, d, h, fov] = ZOOM[zoom] ?? ZOOM.postava;
  const f = smer(yawFigury); // figurína kouká sem, kamera stojí tady
  const vpravo = { x: -f.y, y: f.x }; // pravá ruka kamery (kamera kouká proti f)
  // střed volné části obrazovky v NDC (-1..1): panel kryje [-1, 2*panel-1], volno je [2*panel-1, 1]
  const x = Math.min(0.9, Math.max(0, panel));
  const posun = x * d * Math.tan(((fov / 2) * Math.PI) / 180) * Math.max(1, pomer);
  return {
    position: { x: m.x + f.x * d, y: m.y + f.y * d, z: m.z + h },
    lookAt: { x: m.x - vpravo.x * posun, y: m.y - vpravo.y * posun, z: m.z + look },
    fov,
  };
}
