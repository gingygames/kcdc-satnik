// Server katalogu na falešném KCDC: panel Správy (volající jen jako { id, nickname }), registrace panelu po startu
// Správy (exporty jdou číst až chvíli po resourceStart), oprávnění bez mostu a Správy, nouzový běh bez gen/.
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EV } from "../src/shared";
import { fakeServer, serverBundle } from "./fake-kcdc";

const KOD = serverBundle(join(import.meta.dirname, "..", "src", "server.ts"));
const flush = () => vi.advanceTimersByTimeAsync(0);

type Panel = { id: string; actions: { id: string; handler: (c: unknown) => unknown }[] };

function server(config: object = {}) {
  const s = fakeServer();
  const jan = new s.Player("Jan");
  const petr = new s.Player("Petr");
  const panely: [Panel, string][] = [];
  /** Správa: panel si nechá zaregistrovat; volajícího posílá jako { id, nickname } */
  const sprava = () => s.cizi("sprava", { panelVersion: 1, registerPanel: (def: Panel, owner: string) => void panely.push([def, owner]) });
  const akce = (id: string) => panely.at(-1)![0].actions.find((a) => a.id === id)!;
  return { ...s, jan, petr, panely, sprava, akce, load: (cfg: object = config) => s.load("katalog", KOD, cfg) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("panel Správy", () => {
  it("Správa startuje až po katalogu: registrace se zkouší znovu, dokud exporty nejdou číst", async () => {
    const s = server();
    s.load();
    expect(s.panely).toEqual([]);
    s.fire("resourceStart", "sprava"); // resource je ještě Loading: Exports.get hází
    await flush();
    expect(s.panely).toEqual([]);
    s.sprava();
    await vi.advanceTimersByTimeAsync(300);
    expect(s.panely.map(([p, owner]) => [p.id, owner])).toEqual([["katalog", "katalog"]]);
  });

  it("Správa už běží: panel se zaregistruje hned", () => {
    const s = server();
    s.sprava();
    s.load();
    expect(s.panely).toHaveLength(1);
  });

  it("akce Otevřít prohlížeč dostane volajícího jako { id, nickname } a otevře katalog celému hráči", async () => {
    const s = server({ opravneni: "" });
    s.sprava();
    s.load();
    expect(await s.akce("otevrit").handler({ caller: s.jan.ref(), params: {}, panel: "katalog", action: "otevrit" })).toBe("Katalog otevřen.");
    expect(s.jan.emitted).toEqual([[EV.otevrit, { vyber: null }]]);
  });

  it("volající mezitím odešel: srozumitelná zpráva, nic nespadne", async () => {
    const s = server({ opravneni: "" });
    s.sprava();
    s.load();
    const ref = s.petr.ref();
    s.petr.odpojit();
    expect(await s.akce("otevrit").handler({ caller: ref, params: {} })).toMatch(/Petr už není online/);
  });
});

describe("oprávnění bez mostu a Správy", () => {
  it("výchozí admin.items: nikdo", async () => {
    const s = server();
    s.load();
    s.fire("playerCommand", s.jan, "katalog", []);
    await flush();
    expect(s.chat).toEqual([[s.jan.id, "Na katalog nemáš oprávnění."]]);
    expect(s.jan.emitted).toEqual([]);
  });

  it("admini z configu (přezdívka nebo id) smějí, ostatní ne; opravneni \"\" pustí všechny", async () => {
    const s = server({ admini: ["jan", 999] });
    s.load();
    for (const p of [s.jan, s.petr]) s.fire("playerCommand", p, "katalog", []);
    await flush();
    expect(s.jan.emitted).toEqual([[EV.otevrit, { vyber: null }]]);
    expect(s.petr.emitted).toEqual([]);
    expect(s.chat).toEqual([[s.petr.id, "Na katalog nemáš oprávnění."]]);

    const v = server({ opravneni: "" });
    v.load();
    v.client(EV.zadost, v.petr, { rid: 7, op: "info" });
    await flush();
    expect(v.petr.emitted.at(-1)?.[1]).toMatchObject({ rid: 7, ok: true, info: { pocet: 1 } });
  });
});

describe("nouzový běh", () => {
  it("bez gen/ varuje a jmenuje očekávanou cestu i slozka z configu", () => {
    const s = server({ slozka: "resources/katalog-jinde" });
    s.load();
    const varovani = s.logy.find((l) => l.includes("VAROVÁNÍ"))!;
    expect(varovani).toContain("resources/katalog-jinde/gen/katalog.json");
    expect(varovani).toContain("`slozka`");
    expect(s.logy.some((l) => /1 předmětů/.test(l))).toBe(true);
  });
});
