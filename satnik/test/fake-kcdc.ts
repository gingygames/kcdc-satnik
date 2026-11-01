// Falešné API Kingdoms Connected pro testy serveru šatníku: jen globály, které src/server.ts používá, chovající se
// podle dokumentace v @kingdomsconnected/types. Hlavní je model replikace NPC: kdo kdy dostal figurínu.
//
// Replikace jako na serveru KCDC: `Npc.create` NPC rozešle hned všem hráčům v jeho virtuálním světě (dřív, než
// skript stihne zavolat `setVisibleTo`), každá další změna (oblečení, vzhled, otočení) jde hráčům, kteří NPC právě
// vidí: stejný svět a buď bez omezení, nebo omezení na ně. `npc.videli` = všichni, kdo kdy něco z figuríny dostali.
import vm from "node:vm";
import { buildSync } from "esbuild";

export type Fn = (...a: any[]) => any;

export class Vec {
  constructor(public x: number, public y: number, public z: number) {}
}

class StateBag {
  m = new Map<string, { v: any; scope: string }>();
  get(k: string) {
    return this.m.get(k)?.v;
  }
  has(k: string) {
    return this.m.has(k);
  }
  keys() {
    return [...this.m.keys()].sort();
  }
  set(k: string, v: any, o?: { scope?: string }) {
    const old = this.m.get(k)?.v;
    this.m.set(k, { v, scope: o?.scope ?? "broadcast" });
    return old !== v;
  }
  remove(k: string) {
    return this.m.delete(k);
  }
}

export function fakeServer(katalog: unknown[]) {
  const on = new Map<string, Fn[]>();
  const onClient = new Map<string, Fn>();
  const chat: [number, string][] = [];
  const exportsReg = new Map<string, Map<string, unknown>>();
  let current = "";
  let nextId = 1;
  const fire = (name: string, ...args: unknown[]) => (on.get(name) ?? []).forEach((f) => f(...args));

  class Player {
    static list: Player[] = [];
    virtualWorld = 0;
    state = new StateBag();
    emitted: [string, any][] = [];
    shots: any[] = [];
    items: { name: string; equipped: number }[] = [];
    appearance: { gender: "male" | "female" } = { gender: "male" };
    lookDirection = new Vec(0, 1, 0);
    id = nextId++;
    constructor(public nickname: string, public position: Vec) {
      Player.list.push(this);
    }
    setVirtualWorld(w: number) {
      this.virtualWorld = w;
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
  }

  class Npc {
    static list: Npc[] = [];
    state = new StateBag();
    visibleTo: Player | null = null;
    pinned: Player | null = null;
    wearing: string[] = [];
    appearance: any;
    removed = false;
    videli = new Set<number>();
    id = nextId++;
    virtualWorld: number;
    position: Vec;
    rotation: any;
    constructor(public o: any) {
      this.virtualWorld = o.virtualWorld ?? 0;
      this.position = o.position;
      this.rotation = o.rotation;
      this.appearance = { gender: /woman/.test(o.soul) ? "female" : "male" };
      // spawn jde hned všem ve světě, setVisibleTo přijde až po něm
      for (const p of Player.list) if (p.virtualWorld === this.virtualWorld) this.videli.add(p.id);
    }
    /** komu teď jde replikace */
    vidi(p: Player) {
      return !this.removed && p.virtualWorld === this.virtualWorld && (!this.visibleTo || this.visibleTo === p);
    }
    replikovat() {
      for (const p of Player.list) if (this.vidi(p)) this.videli.add(p.id);
    }
    setVisibleTo(p: Player | null) {
      this.visibleTo = p;
    }
    setVirtualWorld(w: number) {
      this.virtualWorld = w;
      this.replikovat();
    }
    pin(p: Player | null) {
      this.pinned = p;
    }
    wear(guids: string[]) {
      this.wearing = [...guids];
      this.replikovat();
      return true;
    }
    setAppearance(a: any) {
      this.appearance = { ...this.appearance, ...a };
      this.replikovat();
      return true;
    }
    teleport(pos: Vec, rot: any) {
      this.position = pos;
      this.rotation = rot;
      this.replikovat();
      return true;
    }
    remove() {
      this.removed = true;
      Npc.list.splice(Npc.list.indexOf(this), 1);
    }
    static create(o: any) {
      const n = new Npc(o);
      Npc.list.push(n);
      return n;
    }
    static all() {
      return [...Npc.list];
    }
    static roles() {
      return ["guard", "townsman", "townswoman"];
    }
  }

  const ctx = vm.createContext({
    Events: {
      on: (n: string, f: Fn) => (on.set(n, [...(on.get(n) ?? []), f]), () => {}),
      onClient: (n: string, f: Fn) => (onClient.set(n, f), () => {}),
    },
    Player,
    Npc,
    Vector3: Vec,
    World: {
      raycast: async () => ({ answered: true, hit: null }),
      resolveGround: async () => ({ hit: null }),
    },
    Camera: {
      setShot: (p: Player, o: any) => (p.shots.push(o), true),
      clearShot: (p: Player) => (p.shots.push(null), true),
    },
    Chat: { sendToPlayer: (p: Player, text: string) => void chat.push([p.id, text]) },
    Inventory: {
      get: (p: Player) => ({ items: p.items }),
      set: (e: any, inv: { items: { item: string }[] }) => {
        if (e instanceof Npc) e.wear(inv.items.map((i) => i.item));
        return { ok: true, code: "ok" };
      },
    },
    Exports: {
      register: (n: string, f: unknown) => (exportsReg.get(current)!.set(n, f), true),
      get: (res: string, n: string) => exportsReg.get(res)?.get(n),
    },
    console: { log: () => {} },
    setTimeout, clearTimeout, Date,
  });
  exportsReg.set("katalog", new Map<string, unknown>([["items", () => katalog], ["icon", () => "data:image/png;base64,AA"]]));

  const load = (resource: string, code: string, config?: object) => {
    current = resource;
    exportsReg.set(resource, new Map());
    if (config) vm.runInContext(`globalThis.${resource.toUpperCase()}_CONFIG = ${JSON.stringify(config)};`, ctx);
    vm.runInContext(code, ctx);
    fire("resourceStart", resource);
  };
  /** zpráva od klienta (stránka -> klient -> server) */
  const client = (name: string, p: Player, payload: unknown = "{}") => onClient.get(name)!(p, typeof payload === "string" ? payload : JSON.stringify(payload));
  return { ctx, fire, chat, exportsReg, Player, Npc, load, client };
}

/** src/server.ts sestavený jako na serveru (iife), bez zápisu na disk */
export function serverBundle(entry: string): string {
  const r = buildSync({ entryPoints: [entry], bundle: true, format: "iife", platform: "neutral", target: "es2022", write: false, logLevel: "error" });
  return r.outputFiles[0].text;
}
