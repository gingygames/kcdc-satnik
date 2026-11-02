// Server šatníku na falešném KCDC: figurínu a její převlékání vidí jen hráč, který šatník otevřel.
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KatalogPredmet } from "../src/core";
import { EV } from "../src/shared";
import { Vec, fakeServer, serverBundle } from "./fake-kcdc";

const kus = (id: string, cs: string, x: Partial<KatalogPredmet> = {}): KatalogPredmet => ({
  id, guid: "g-" + id, cs, en: "", kat: "obleceni", pod: "košile a tuniky", slot: "trup", vrstva: "latka", cena: 100, vaha: 1, ikona: id.toLowerCase(),
  kval: 4, quest: false, typ: "Armor", pohlavi: "m", model: id.replace(/_[A-Z]\d*$/, ""), zna: true, oblect: true, ...x,
});
const KATALOG = [
  kus("TunicShort05_m09_D", "Košile krátká"),
  kus("Hood07_m04_C", "Kápě", { slot: "hlava", pod: "kápě" }),
  kus("F_Cotehardie01_m03_B", "Cotehardie dámská", { pohlavi: "f", pod: "šaty" }),
];
const KOD = serverBundle(join(import.meta.dirname, "..", "src", "server.ts"));
const SVET = 900000;
const flush = () => vi.advanceTimersByTimeAsync(0);

function server(config?: object) {
  const s = fakeServer(KATALOG);
  const jan = new s.Player("Jan", new Vec(100, 100, 30));
  const petr = new s.Player("Petr", new Vec(102, 101, 30)); // stojí vedle
  s.load("satnik", KOD, config);
  const cmd = async (p: any, line = "") => {
    s.fire("playerCommand", p, "satnik", line ? line.split(" ") : []);
    await flush();
  };
  const zadost = async (p: any, z: object) => {
    s.client(EV.zadost, p, { rid: 1, ...z });
    await vi.advanceTimersByTimeAsync(200); // převlečení se slévá 120 ms
  };
  const figurina = (p: any) => s.Npc.list.find((n: any) => n.state.get("satnik") === p.id);
  return { ...s, jan, petr, cmd, zadost, figurina };
}

describe("soukromý náhled", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("figurína vzniká v soukromém světě hráče, ostatní ji nedostanou ani při převlékání", async () => {
    const s = server();
    await s.cmd(s.jan);
    const f = s.figurina(s.jan)!;
    expect(f).toBeTruthy();
    expect(f.virtualWorld).toBe(SVET + s.jan.id);
    expect(f.visibleTo).toBe(s.jan);
    expect(f.pinned).toBe(s.jan);
    expect(s.jan.virtualWorld).toBe(SVET + s.jan.id);
    expect(s.petr.virtualWorld).toBe(0);

    await s.zadost(s.jan, { op: "oblect", id: "TunicShort05_m09_D" });
    await s.zadost(s.jan, { op: "oblect", id: "Hood07_m04_C" });
    await s.zadost(s.jan, { op: "otocit", o: 40 });
    expect(new Set(f.wearing)).toEqual(new Set(["g-Hood07_m04_C", "g-TunicShort05_m09_D"]));
    expect([...f.videli]).toEqual([s.jan.id]);
    // stav figuríny (co má na sobě) jde jen jemu
    expect(s.petr.emitted).toEqual([]);
  });

  it("přepnutí na dámskou figurínu: nová figurína zase jen v soukromém světě", async () => {
    const s = server();
    await s.cmd(s.jan);
    const muz = s.figurina(s.jan)!;
    await s.zadost(s.jan, { op: "oblect", id: "F_Cotehardie01_m03_B" });
    const zena = s.figurina(s.jan)!;
    expect(zena).not.toBe(muz);
    expect(muz.removed).toBe(true);
    expect(zena.o.soul).toBe("townswoman");
    expect(zena.virtualWorld).toBe(SVET + s.jan.id);
    expect(zena.wearing).toEqual(["g-F_Cotehardie01_m03_B"]);
    expect([...zena.videli]).toEqual([s.jan.id]);
  });

  it("zavření vrátí hráče do jeho světa a figurínu odstraní", async () => {
    const s = server();
    s.jan.virtualWorld = 5; // hráč byl v jiném světě (jiný modul)
    await s.cmd(s.jan);
    expect(s.jan.virtualWorld).toBe(SVET + s.jan.id);
    const f = s.figurina(s.jan)!;
    s.client(EV.konec, s.jan);
    expect(f.removed).toBe(true);
    expect(s.jan.virtualWorld).toBe(5);
    expect(s.jan.state.has("satnik.svet")).toBe(false);
    expect(s.jan.shots.at(-1)).toBeNull(); // kamera zpět
  });

  it("příkaz /satnik zavrit dělá totéž", async () => {
    const s = server();
    await s.cmd(s.jan);
    await s.cmd(s.jan, "zavrit");
    expect(s.Npc.list).toEqual([]);
    expect(s.jan.virtualWorld).toBe(0);
  });

  it("když hráče mezitím přesunul jiný modul, šatník ho tam nechá", async () => {
    const s = server();
    await s.cmd(s.jan);
    s.jan.virtualWorld = 7000 + s.jan.id; // příchod
    await s.cmd(s.jan, "zavrit");
    expect(s.jan.virtualWorld).toBe(7000 + s.jan.id);
  });

  it("dva hráči najednou: každý má svůj svět a vidí jen svou figurínu", async () => {
    const s = server();
    await s.cmd(s.jan);
    await s.cmd(s.petr);
    const fj = s.figurina(s.jan)!;
    const fp = s.figurina(s.petr)!;
    expect(fj.virtualWorld).not.toBe(fp.virtualWorld);
    expect(s.jan.virtualWorld).not.toBe(s.petr.virtualWorld);
    await s.zadost(s.jan, { op: "oblect", id: "TunicShort05_m09_D" });
    await s.zadost(s.petr, { op: "oblect", id: "Hood07_m04_C" });
    expect([...fj.videli]).toEqual([s.jan.id]);
    expect([...fp.videli]).toEqual([s.petr.id]);
    expect(fj.wearing).toEqual(["g-TunicShort05_m09_D"]);
    expect(fp.wearing).toEqual(["g-Hood07_m04_C"]);
    // Jan zavře, Petr dál prohlíží
    await s.cmd(s.jan, "zavrit");
    expect(fj.removed).toBe(true);
    expect(fp.removed).toBe(false);
    expect(s.petr.virtualWorld).toBe(SVET + s.petr.id);
  });

  it("odpojení: figurína zmizí, nic nezůstane", async () => {
    const s = server();
    await s.cmd(s.jan);
    const f = s.figurina(s.jan)!;
    s.jan.odpojit();
    expect(f.removed).toBe(true);
    expect(s.Npc.list).toEqual([]);
    await s.zadost(s.petr, { op: "info" });
    expect(s.petr.emitted.at(-1)).toEqual([EV.vysledek, { rid: 1, ok: false, chyba: "Šatník není otevřený." }]);
  });

  it("odpojení během hledání místa: figurína vůbec nevznikne", async () => {
    const s = server();
    s.fire("playerCommand", s.jan, "satnik", []); // bez flush: hledání místa ještě běží
    s.jan.odpojit();
    await flush();
    expect(s.Npc.list).toEqual([]);
  });

  it("zastavení resource: všichni zpět ve svém světě, figuríny pryč", async () => {
    const s = server();
    await s.cmd(s.jan);
    await s.cmd(s.petr);
    s.fire("resourceStop", "satnik");
    expect(s.Npc.list).toEqual([]);
    expect(s.jan.virtualWorld).toBe(0);
    expect(s.petr.virtualWorld).toBe(0);
    expect(s.jan.emitted.at(-1)?.[0]).toBe(EV.zavrit);
  });

  it("restart bez resourceStop (pád): nová instance uklidí figuríny i hráče v soukromých světech", async () => {
    const s = server();
    s.jan.virtualWorld = 3;
    await s.cmd(s.jan);
    await s.cmd(s.petr);
    const cizi = s.Npc.create({ soul: "guard", virtualWorld: 0 }); // NPC jiného modulu zůstane
    s.load("satnik", KOD); // nová instance, stará nic neuklidila
    expect(s.Npc.list).toEqual([cizi]);
    expect(s.jan.virtualWorld).toBe(3);
    expect(s.petr.virtualWorld).toBe(0);
    expect(s.jan.state.has("satnik.svet")).toBe(false);
    expect(s.jan.emitted.at(-1)?.[0]).toBe(EV.zavrit);
  });

  it("Ukázat krejčímu: dostanou to hráči kolem v původním světě, i když je hráč v soukromém", async () => {
    const s = server();
    const daleko = new s.Player("Daleko", new Vec(300, 300, 30));
    await s.cmd(s.jan);
    await s.zadost(s.jan, { op: "oblect", id: "TunicShort05_m09_D" });
    await s.zadost(s.jan, { op: "ukazat" });
    const komu = new Set(s.chat.map(([id]) => id));
    expect(komu).toEqual(new Set([s.jan.id, s.petr.id]));
    expect(komu.has(daleko.id)).toBe(false);
    expect(s.jan.emitted.at(-1)?.[1]).toMatchObject({ ok: true, zprava: "Ukázáno 1 hráčům v okolí a tobě v chatu." });
  });

  it("rána zavře šatník a hned po ní nejde otevřít (útěk z boje do soukromého světa)", async () => {
    const s = server();
    await s.cmd(s.jan);
    s.fire("playerDamage", s.jan, null, 10, "torso", "combat");
    expect(s.Npc.list).toEqual([]);
    expect(s.jan.virtualWorld).toBe(0);
    await s.cmd(s.jan);
    expect(s.Npc.list).toEqual([]);
    expect(s.chat.at(-1)?.[1]).toMatch(/Po ráně jde šatník otevřít až za 20 s/);
    await vi.advanceTimersByTimeAsync(20000);
    await s.cmd(s.jan);
    expect(s.figurina(s.jan)).toBeTruthy();
  });

  it("starý postup (jen setVisibleTo po create) by figurínu ostatním ukázal: model replikace to zachytí", () => {
    const s = server();
    const npc = s.Npc.create({ soul: "townsman", virtualWorld: 0 });
    npc.setVisibleTo(s.jan);
    expect(npc.videli.has(s.petr.id)).toBe(true);
  });
});

describe("otáčení figuríny", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("⟲ ⟳ otočí jen figurínu, kamera zůstane na místě (jinak by obíhala s ní a otočení nebylo vidět)", async () => {
    const s = server();
    await s.cmd(s.jan);
    const f = s.figurina(s.jan)!;
    const yaw0 = f.rotation.z;
    const zaber0 = s.jan.shots.at(-1);
    expect(zaber0?.position).toBeTruthy();

    await s.zadost(s.jan, { op: "otocit", o: 45 });
    expect(f.rotation.z).toBeCloseTo((yaw0 + 45) % 360);
    expect(s.jan.shots.at(-1).position).toEqual(zaber0.position);
    expect(s.jan.shots.at(-1).lookAt).toEqual(zaber0.lookAt);

    await s.zadost(s.jan, { op: "otocit", o: -90 });
    expect(f.rotation.z).toBeCloseTo((yaw0 - 45 + 360) % 360);
    expect(s.jan.shots.at(-1).position).toEqual(zaber0.position);

    // nekonečno od klienta nic neotočí (dřív NaN)
    await s.zadost(s.jan, { op: "otocit", o: "Infinity" });
    expect(f.rotation.z).toBeCloseTo((yaw0 - 45 + 360) % 360);
  });

  it("přepnutí pohlaví zachová natočení těla i kameru", async () => {
    const s = server();
    await s.cmd(s.jan);
    const yaw0 = s.figurina(s.jan)!.rotation.z;
    const zaber0 = s.jan.shots.at(-1);
    await s.zadost(s.jan, { op: "otocit", o: 90 });
    await s.zadost(s.jan, { op: "oblect", id: "F_Cotehardie01_m03_B" });
    const zena = s.figurina(s.jan)!;
    expect(zena.o.soul).toBe("townswoman");
    expect(zena.rotation.z).toBeCloseTo((yaw0 + 90) % 360);
    // další záběr (zoom) míří pořád stejným směrem jako na začátku
    await s.zadost(s.jan, { op: "zoom", zoom: "postava" });
    expect(s.jan.shots.at(-1).position).toEqual(zaber0.position);
  });
});
