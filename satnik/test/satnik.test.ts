import { describe, expect, it } from "vitest";
import { ODSTUP, Satnik, ZOOM, misto, obleknout, oznaceniVarianty, smer, textZakazky, yawK, zaber, zakladModelu, type KatalogPredmet } from "../src/core";

const p = (id: string, cs: string, x: Partial<KatalogPredmet> = {}): KatalogPredmet => ({
  id, guid: "g-" + id, cs, en: "", kat: "obleceni", pod: "", slot: "trup", vrstva: "latka", cena: 100, vaha: 1, ikona: id.toLowerCase(), kval: 4, quest: false, typ: "Armor",
  pohlavi: "m", model: id.replace(/_[A-Z]\d*$/, ""), zna: true, oblect: true, ...x,
});
const data: KatalogPredmet[] = [
  ...Array.from({ length: 14 }, (_, i) => p(`F_Cotehardie01_m${String(i + 1).padStart(2, "0")}_B`, "Cotehardie dámská", { pohlavi: "f", pod: "šaty", cena: 2000 + i })),
  p("TunicShort05_m09_D", "Košile krátká", { pod: "košile a tuniky", cena: 349 }),
  p("TunicShort05_m01_D", "Košile krátká", { pod: "košile a tuniky", cena: 300 }),
  p("Hood07_m04_C", "Kápě", { slot: "hlava", pod: "kápě", model: "Hood07_m04" }),
  p("Cap01_m01_A", "Čepice", { slot: "hlava", pod: "čepice", model: "Cap01_m01" }),
  p("BascinetOpen03_m01_C4", "Bacinet", { kat: "zbroj", slot: "hlava", pod: "přilba", vrstva: "plat", model: "BascinetOpen03_m01" }),
  p("Ring01_m01", "Prsten", { slot: "ruce", pod: "prsten", vrstva: "ozdoba", model: "Ring01_m01" }),
  p("Gloves01_m01", "Rukavice", { slot: "ruce", pod: "rukavice", model: "Gloves01_m01" }),
  p("nezname", "Neznámé", { zna: false }),
  p("questovy", "Questový", { quest: true }),
  p("sedlo", "Sedlo", { kat: "kun", slot: "kun", pohlavi: undefined }),
];
const s = new Satnik(data);

describe("data z katalogu", () => {
  it("bere jen oblečení a zbroj na tělo, co server umí obléct, bez questových a koně", () => {
    expect(s.kus("nezname")).toBeNull();
    expect(s.kus("questovy")).toBeNull();
    expect(s.kus("sedlo")).toBeNull();
    expect(s.kus("hood07_m04_c")?.nazev).toBe("Kápě");
    expect(new Satnik(data, false).kus("nezname")).not.toBeNull();
  });
  it("varianty barev jsou jedna skupina, označení varianty pro krejčího", () => {
    expect(zakladModelu("F_Cotehardie01_m03")).toBe("F_Cotehardie01");
    expect(zakladModelu("Cap01_mApprentice02")).toBe("Cap01");
    const g = s.skupina("F_Cotehardie01_m05_B")!;
    expect(g.varianty).toHaveLength(14);
    expect(s.skupina(g.klic)).toBe(g);
    expect(oznaceniVarianty(s.kus("Hood07_m04_C")!)).toBe("m04 C");
    expect(s.pocty()).toMatchObject({ kusu: 21, damskych: 14, panskych: 7 });
  });
});

describe("hledání", () => {
  it("pohlaví, skupiny vs. varianty a počty slotů", () => {
    const f = s.hledat({ pohlavi: "f" });
    expect(f.celkem).toBe(1);
    expect(f.radky[0][6]).toBe(14);
    expect(s.hledat({ pohlavi: "f", varianty: true }).celkem).toBe(14);
    const m = s.hledat({ pohlavi: "m" });
    expect(m.sloty).toEqual({ hlava: 3, trup: 1, ruce: 2 });
    expect(s.hledat({ pohlavi: "m", slot: "hlava" }).pod).toEqual({ kápě: 1, čepice: 1, přilba: 1 });
    expect(s.hledat({ pohlavi: "m", druh: "zbroj" }).radky.map((r) => r[8])).toEqual(["BascinetOpen03_m01_C4"]);
  });
  it("hledá bez diakritiky, v id i slovem dámské; přesné id je první", () => {
    expect(s.hledat({ q: "kosile" }).radky[0][1]).toBe("Košile krátká");
    expect(s.hledat({ q: "damske" }).celkem).toBe(1);
    expect(s.hledat({ q: "tunicshort05_m01_d" }).radky[0][1]).toBe("Košile krátká");
    expect(s.hledat({ q: "cap01_m01_a" }).radky[0][8]).toBe("Cap01_m01_A");
  });
  it("řadí podle těla (hlava nahoře), stránkuje", () => {
    expect(s.hledat({ pohlavi: "m" }).radky[0][3]).toBe("hlava");
    expect(s.hledat({ pohlavi: "m", razeni: "cena" }).radky.map((r) => r[7])[0]).toBe(100);
    const a = s.hledat({ pohlavi: "f", varianty: true, od: 10, pocet: 10 });
    expect(a.radky).toHaveLength(4);
    expect(a.celkem).toBe(14);
  });
});

describe("figurína", () => {
  const k = (id: string) => s.kus(id)!;
  it("stejné místo nahradí, jiné vrstvy a doplňky přidá, druhý klik svlékne", () => {
    let na = obleknout([], k("Hood07_m04_C"));
    na = obleknout(na, k("Cap01_m01_A")); // čepice místo kápě (hlava/látka)
    expect(na.map((x) => x.id)).toEqual(["Cap01_m01_A"]);
    na = obleknout(na, k("BascinetOpen03_m01_C4")); // přilba je jiná vrstva
    na = obleknout(na, k("Ring01_m01"));
    na = obleknout(na, k("Gloves01_m01"));
    expect(na).toHaveLength(4);
    expect(misto(k("Ring01_m01"))).toBe("ruce/ozdoba/prsten");
    na = obleknout(na, k("Ring01_m01"));
    expect(na.map((x) => x.id)).not.toContain("Ring01_m01");
  });
  it("text pro krejčího má přesný název a id", () => {
    expect(textZakazky([k("Hood07_m04_C")])).toEqual(["Kápě – Hood07_m04_C (kápě, hlava)"]);
  });
});

describe("záběr kamery", () => {
  it("kamera stojí před figurínou mezi ní a hráčem, figurína vyjde vpravo", () => {
    const hrac = { x: 100, y: 100, z: 10 };
    const yawHrace = 90; // kouká na -X
    const f = smer(yawHrace);
    const m = { x: hrac.x + f.x * ODSTUP, y: hrac.y + f.y * ODSTUP, z: 10 };
    const yawFig = (yawHrace + 180) % 360; // figurína kouká na hráče
    for (const zoom of Object.keys(ZOOM) as (keyof typeof ZOOM)[]) {
      const z = zaber(m, yawFig, zoom);
      const kHraci = Math.hypot(z.position.x - hrac.x, z.position.y - hrac.y);
      const kFigure = Math.hypot(z.position.x - m.x, z.position.y - m.y);
      expect(kHraci + kFigure).toBeCloseTo(ODSTUP, 5); // na spojnici
      expect(kHraci).toBeGreaterThan(0.5); // hráč je za kamerou, ne v záběru
    }
    // pohled kamery míří vlevo od figuríny: figurína je vpravo od směru pohledu
    const z = zaber(m, yawFig, "postava");
    const pohled = { x: z.lookAt.x - z.position.x, y: z.lookAt.y - z.position.y };
    const naFig = { x: m.x - z.position.x, y: m.y - z.position.y };
    const kriz = pohled.x * naFig.y - pohled.y * naFig.x; // < 0 = figurína po směru hodinových ručiček = vpravo
    expect(kriz).toBeLessThan(0);
    expect(zaber(m, yawFig, "postava", 16 / 9, 0).lookAt).toMatchObject({ x: m.x, y: m.y });
    expect(yawK(-1, 0)).toBeCloseTo(90, 5);
  });
});
