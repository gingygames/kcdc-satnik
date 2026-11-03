// Falešné API Kingdoms Connected pro testy serveru katalogu: jen globály, které src/server.ts používá, podle dokumentace
// v @kingdomsconnected/types a smlouvy mostu (most/CONTRACT.md): `Exports.get` na resource, který neběží, hází;
// `require("fs")` tu není (server běží nouzově z Inventory.classes()), Správa posílá hráče jen jako { id, nickname }.
import vm from "node:vm";
import { buildSync } from "esbuild";

export type Fn = (...a: any[]) => any;

export function fakeServer() {
  const on = new Map<string, Fn[]>();
  const onClient = new Map<string, Fn>();
  const chat: [number, string][] = [];
  const logy: string[] = [];
  const exportsReg = new Map<string, Map<string, unknown>>();
  let current = "";
  let nextId = 1;
  const fire = (name: string, ...args: unknown[]) => (on.get(name) ?? []).forEach((f) => f(...args));

  class Player {
    static list: Player[] = [];
    virtualWorld = 0;
    emitted: [string, any][] = [];
    id = nextId++;
    constructor(public nickname: string) {
      Player.list.push(this);
    }
    emit(n: string, payload?: string) {
      this.emitted.push([n, payload ? JSON.parse(payload) : undefined]);
    }
    static all() {
      return [...Player.list];
    }
    static getById(id: number) {
      return Player.list.find((p) => p.id === id) ?? null;
    }
    /** test: odpojení (server pak hráče nezná) */
    odpojit() {
      Player.list.splice(Player.list.indexOf(this), 1);
      fire("playerDisconnect", this);
    }
    /** odkaz, jak ho posílá Správa (přes hranici resource jde jen kopie bez prototypu) */
    ref() {
      return { id: this.id, nickname: this.nickname };
    }
  }

  const ctx = vm.createContext({
    Events: {
      on: (n: string, f: Fn) => (on.set(n, [...(on.get(n) ?? []), f]), () => {}),
      onClient: (n: string, f: Fn) => (onClient.set(n, f), () => {}),
    },
    Player,
    Chat: { sendToPlayer: (p: Player, text: string) => void chat.push([p.id, text]) },
    Inventory: {
      classes: () => [{ name: "TunicShort05_m09_D", id: "g-tunic", category: "Armor", maximumQuality: 4, quest: false }],
      getItemPrice: (id: string) => (id === "TunicShort05_m09_D" ? { pristine: 349 } : null),
    },
    Exports: {
      register: (n: string, f: unknown) => (exportsReg.get(current)!.set(n, f), true),
      get: (res: string, n: string) => {
        const r = exportsReg.get(res);
        if (!r) throw new Error(`resource ${res} is not running`);
        return r.get(n);
      },
    },
    require: (m: string) => {
      throw new Error(`module ${m} not available`);
    },
    console: { log: (t: string) => void logy.push(String(t)) },
    setTimeout, clearTimeout, Date,
  });

  const load = (resource: string, code: string, config?: object) => {
    current = resource;
    exportsReg.set(resource, new Map());
    if (config) vm.runInContext(`globalThis.${resource.toUpperCase()}_CONFIG = ${JSON.stringify(config)};`, ctx);
    vm.runInContext(code, ctx);
    fire("resourceStart", resource);
  };
  /** cizí resource s exporty (Správa…) */
  const cizi = (resource: string, exporty: Record<string, unknown>) => exportsReg.set(resource, new Map(Object.entries(exporty)));
  /** zpráva od klienta (stránka -> klient -> server) */
  const client = (name: string, p: Player, payload: unknown = "{}") => onClient.get(name)!(p, typeof payload === "string" ? payload : JSON.stringify(payload));
  return { ctx, fire, chat, logy, exportsReg, Player, load, cizi, client };
}

/** src/server.ts sestavený jako na serveru (iife), bez zápisu na disk */
export function serverBundle(entry: string): string {
  const r = buildSync({ entryPoints: [entry], bundle: true, format: "iife", platform: "neutral", target: "es2022", write: false, logLevel: "error" });
  return r.outputFiles[0].text;
}
