import { describe, expect, it } from "vitest";
import { Katalog, davky, klicIkony, norm, type Predmet } from "../src/core";
import { pohlavi, zaradit } from "../src/sloty";

const p = (id: string, cs: string, kat: string, x: Partial<Predmet> = {}): Predmet => ({
  id, guid: "", cs, en: "", kat, pod: "", slot: "", vrstva: "", cena: 1, vaha: 1, ikona: klicIkony(id), kval: 1, quest: false, typ: "Armor", ...x,
});
const data = [
  p("TunicShort05_m09_D", "Košile krátká", "obleceni", { slot: "trup", cena: 349 }),
  p("BootsAnkle01_m01_C", "Boty pracovní", "obleceni", { slot: "boty", cena: 423 }),
  p("sword_long_01", "Dlouhý meč", "zbrane", { cena: 2000, ikona: "" }),
  p("npc_tool", "Nástroj", "system"),
  ...Array.from({ length: 250 }, (_, i) => p("apple_" + i, "Jablko " + i, "jidlo")),
];
const k = new Katalog(data, (id) => !id.startsWith("sword"), (id) => /tunic|boots/i.test(id));

describe("hledání a filtry", () => {
  it("hledá bez diakritiky a v id", () => {
    expect(k.hledat({ q: "kosile" }).radky.map((r) => r[0])).toEqual(["TunicShort05_m09_D"]);
    expect(k.hledat({ q: "bootsankle" }).celkem).toBe(1);
    expect(norm("Dlouhý MEČ")).toBe("dlouhy mec");
  });
  it("filtruje kategorii, slot, zná server a obléct; počty kategorií bez filtru kategorie", () => {
    const r = k.hledat({ kat: "obleceni", oblect: true });
    expect(r.celkem).toBe(2);
    expect(r.kategorie.jidlo).toBeUndefined();          // oblect filtruje i počty
    expect(k.hledat({ slot: "boty" }).radky[0][0]).toBe("BootsAnkle01_m01_C");
    expect(k.hledat({ zna: false }).radky.map((x) => x[0])).toEqual(["sword_long_01"]);
    expect(k.hledat({}).kategorie.jidlo).toBe(250);
  });
  it("systémové jen s vse", () => {
    expect(k.hledat({ q: "nastroj" }).celkem).toBe(0);
    expect(k.hledat({ q: "nastroj", vse: true }).celkem).toBe(1);
  });
  it("stránkuje a omezí stránku na 200", () => {
    const a = k.hledat({ kat: "jidlo", od: 0, pocet: 100 });
    const b = k.hledat({ kat: "jidlo", od: 100, pocet: 100 });
    expect(a.celkem).toBe(250);
    expect(a.radky).toHaveLength(100);
    expect(new Set([...a.radky, ...b.radky].map((r) => r[0])).size).toBe(200);
    expect(k.hledat({ kat: "jidlo", pocet: 999 }).radky).toHaveLength(200);
    expect(k.hledat({ kat: "jidlo", od: 240, pocet: 100 }).radky).toHaveLength(10);
  });
  it("přesná shoda id je první, řazení podle ceny", () => {
    expect(k.hledat({ q: "apple_1" }).radky[0][0]).toBe("apple_1");
    expect(k.hledat({ kat: "obleceni", razeni: "cena" }).radky[0][0]).toBe("BootsAnkle01_m01_C");
  });
});

describe("ikony", () => {
  it("chybějící ikona je prázdný klíč, klíč je bezpečné jméno souboru", () => {
    expect(k.get("sword_long_01")!.ikona).toBe("");
    expect(klicIkony("../Hood07 m04")).toBe("___hood07_m04");
  });
  it("dávky ikon se vejdou do limitu zprávy", () => {
    const b = davky(Array.from({ length: 10 }, (_, i) => ({ k: "i" + i, data: "x".repeat(4000) })), 11000);
    expect(b.map((x) => x.length)).toEqual([2, 2, 2, 2, 2]);
  });
});

describe("zařazení", () => {
  it("slot a vrstva z prefixu modelu", () => {
    expect(zaradit("Armor", { Clothing: "TunicShort05_m09" })).toMatchObject({ kat: "obleceni", slot: "trup", vrstva: "latka" });
    expect(zaradit("Armor", { Clothing: "f_SimpleDress05_m01" })).toMatchObject({ slot: "trup" });
    expect(zaradit("Armor", { Clothing: "BrigandineArm01" })).toMatchObject({ kat: "zbroj", slot: "paze" });
    expect(zaradit("Armor", { Clothing: "NobleSaddle02" })).toMatchObject({ kat: "kun" });
    expect(zaradit("MeleeWeapon", { Class: "8" })).toMatchObject({ kat: "zbrane", slot: "stit" });
  });
});

describe("pohlaví oblečení", () => {
  it("dámské podle modelu f_, filtr pohlavi a hledání slovem dámské", () => {
    expect(pohlavi("f_SimpleDress05_m01")).toBe("f");
    expect(pohlavi("F_Cotehardie01_m01")).toBe("f");
    expect(pohlavi("TunicShort05_m09")).toBe("m");
    const kk = new Katalog([
      p("F_Cotehardie01_m01_B", "Cotehardie dámská", "obleceni", { slot: "trup", pohlavi: "f" }),
      p("TunicShort05_m09_D", "Košile krátká", "obleceni", { slot: "trup", pohlavi: "m" }),
    ]);
    expect(kk.hledat({ pohlavi: "f" }).radky.map((r) => r[0])).toEqual(["F_Cotehardie01_m01_B"]);
    expect(kk.hledat({ q: "damske" }).celkem).toBe(1);
  });
});
