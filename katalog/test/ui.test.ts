// Stránka katalogu (ui/app.js) v node:vm nad minimálním falešným DOM: mřížka recykluje buňky a ikony drží jako blob: URL
// s horní mezí (dřív se při každém snímku posunu mazaly a stavěly všechny buňky a ikony zůstávaly v paměti navždy).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const appJs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui", "app.js"), "utf8");

class El {
  style: Record<string, string> = {};
  children: El[] = [];
  parentNode: El | null = null;
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  attrs: Record<string, string> = {};
  className = "";
  textContent = "";
  title = "";
  value = "";
  checked = false;
  disabled = false;
  hidden = false;
  scrollTop = 0;
  clientWidth = 1600;
  clientHeight = 1000;
  options: El[] = [];
  dataset: Record<string, string> = {};
  [k: string]: unknown;
  constructor(public tag: string, public id = "") {}
  classList = {
    add: (c: string) => void (this.className = [...new Set([...this.className.split(" ").filter(Boolean), c])].join(" ")),
    remove: (c: string) => void (this.className = this.className.split(" ").filter((x) => x && x !== c).join(" ")),
    contains: (c: string) => this.className.split(" ").includes(c),
  };
  addEventListener(n: string, f: (e: unknown) => void) {
    (this.listeners[n] ??= []).push(f);
  }
  appendChild(c: El) {
    c.parentNode = this;
    this.children.push(c);
    if (this.tag === "select") this.options.push(c);
    return c;
  }
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  focus() {}
  getContext() {
    return { clearRect() {}, drawImage() {} };
  }
}

function page() {
  const ids = new Map<string, El>();
  let created = 0;
  const winListeners: Record<string, ((e: unknown) => void)[]> = {};
  const timers: (() => void)[] = [];
  const sent: [string, any][] = [];
  let blobs = 0;
  let revoked = 0;
  const document = {
    getElementById: (id: string) => ids.get(id) ?? (ids.set(id, new El("div", id)), ids.get(id)!),
    createElement: (t: string) => (created++, new El(t)),
    createTextNode: (t: string) => Object.assign(new El("#text"), { textContent: t }),
    createDocumentFragment: () => new El("#frag"),
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const window: any = {
    addEventListener: (n: string, f: (e: unknown) => void) => void (winListeners[n] ??= []).push(f),
  };
  const ctx = vm.createContext({
    window,
    document,
    callEvent: (name: string, json: string) => sent.push([name, JSON.parse(json)]),
    setTimeout: (f: () => void) => (timers.push(f), timers.length),
    clearTimeout: () => {},
    requestAnimationFrame: (f: () => void) => (timers.push(f), timers.length),
    CustomEvent: class {},
    Event: class {},
    URL: { createObjectURL: () => "blob:" + ++blobs, revokeObjectURL: () => void revoked++ },
    Blob: class {},
    Uint8Array,
    atob: (b: string) => Buffer.from(b, "base64").toString("latin1"),
    Map,
    Object,
    Array,
    Math,
    Date,
    Number,
    String,
    JSON,
    isFinite,
    FileReader: class {},
    Image: class {},
  });
  window.document = document;
  vm.runInContext(appJs, ctx);
  const fire = (name: string, detail: unknown) => {
    for (const f of winListeners[name] ?? []) f({ detail: JSON.stringify(detail) });
  };
  const run = () => {
    for (let i = 0; i < 50 && timers.length; i++) timers.splice(0).forEach((f) => f());
  };
  return { ids, fire, run, sent, created: () => created, live: () => blobs - revoked, blobs: () => blobs };
}

const ROWS = Array.from({ length: 3000 }, (_, i) => ["item_" + i, "Předmět " + i, "ostatni", "", "", 1, 1, "ikona_" + i, true, false]);

/** odpovídá na žádosti stránky jako server */
function serve(pg: ReturnType<typeof page>) {
  for (let guard = 0; guard < 50; guard++) {
    const todo = pg.sent.splice(0).filter(([n]) => n === "katalog:zadost");
    if (!todo.length) return;
    for (const [, z] of todo) {
      if (z.op === "info") pg.fire("katalog:vysledek", { rid: z.rid, ok: true, info: { kategorie: {}, sloty: {}, podkategorie: {}, sady: [] } });
      else if (z.op === "hledat") pg.fire("katalog:vysledek", { rid: z.rid, ok: true, vysledek: { celkem: ROWS.length, radky: ROWS.slice(z.dotaz.od, z.dotaz.od + z.dotaz.pocet), kategorie: {} } });
      else if (z.op === "ikony") pg.fire("katalog:vysledek", { rid: z.rid, ok: true, ikony: z.klice.map((k: string) => ({ k, d: Buffer.from("png" + k).toString("base64") })) });
      else pg.fire("katalog:vysledek", { rid: z.rid, ok: true });
    }
    pg.run();
  }
}

describe("stránka katalogu: mřížka a ikony", () => {
  it("posun mřížky recykluje buňky (bez nových prvků) a ikony nastavuje jako blob: URL", () => {
    const pg = page();
    pg.fire("katalog:otevrit", {});
    pg.run();
    serve(pg);
    const cells = pg.ids.get("cells")!;
    const visible = () => cells.children.filter((c) => c.style.display !== "none");
    expect(visible().length).toBeGreaterThan(100);
    expect((visible()[0]._ico as El).style.backgroundImage).toMatch(/^url\(blob:/);
    const grid = pg.ids.get("mrizka")!;
    for (let y = 0; y < 3000; y += 61) {
      grid.scrollTop = y;
      grid.listeners.scroll[0]({});
      pg.run();
      serve(pg);
    }
    const before = pg.created();
    for (let y = 0; y < 3000; y += 61) {
      grid.scrollTop = y;
      grid.listeners.scroll[0]({});
      pg.run();
    }
    expect(pg.created()).toBe(before);                                  // druhý průjezd: žádný nový prvek
    expect(cells.children.length).toBeLessThanOrEqual(visible().length * 2 + 20);
  });

  it("ikon v paměti je nejvýš 800 (nejdéle nepoužité se uvolní, revokeObjectURL)", () => {
    const pg = page();
    pg.fire("katalog:otevrit", {});
    pg.run();
    serve(pg);
    const grid = pg.ids.get("mrizka")!;
    for (let y = 0; y < 3000 / 14 * 122; y += 900) {
      grid.scrollTop = y;
      grid.listeners.scroll[0]({});
      pg.run();
      serve(pg);
    }
    expect(pg.blobs()).toBeGreaterThan(1500);
    expect(pg.live()).toBeLessThanOrEqual(800);
  });
});
