// Šatník - klient (Kingdoms Connected). Panel `ui/index.html` vlevo přes celou výšku, vpravo je vidět figurína (záběr kamery
// nastavuje server). Klient jen předává zprávy mezi serverem a stránkou a drží ovládání, dokud je šatník otevřený.
import { EV } from "./shared";

const VIEW_URL = "fw://resources/satnik/ui/index.html";
const PANEL = 0.56; // podíl šířky obrazovky (stejný výchozí jako CFG.panel na serveru)
let view = -1;
let ready = false;
let shown = false;
let held = false;
const fronta: [string, unknown][] = [];
const log = (t: string) => console.log("[satnik] " + t);
const odhlasit: (() => void)[] = [];

function geometry() {
  const s = Web.getScreenSize();
  const width = Math.max(Math.min(720, s.width), Math.round(s.width * PANEL));
  return { width: Math.min(width, s.width), height: s.height, x: 0, y: 0, screen: s };
}

function controls(on: boolean) {
  if (!on && !held) (Controls.disable(), (held = true));
  else if (on && held) (Controls.enable(), (held = false));
}

function ensureView(): boolean {
  if (view >= 0) return true;
  try {
    const g = geometry();
    view = Web.createView(VIEW_URL, { width: g.width, height: g.height, x: g.x, y: g.y, zIndex: 205, visible: false });
  } catch (e) {
    log("view nejde vytvořit: " + String(e));
    return false;
  }
  Web.on(view, EV.ready, () => {
    ready = true;
    for (const [n, p] of fronta.splice(0)) Web.emit(view, n, p);
  });
  Web.on(view, EV.konec, () => {
    hide();
    Events.emitServer(EV.konec, "{}");
  });
  Web.on(view, EV.zadost, (payload: unknown) => Events.emitServer(EV.zadost, typeof payload === "string" ? payload : JSON.stringify(payload)));
  return true;
}

function toPage(name: string, payload: unknown) {
  if (view < 0) return;
  if (ready) Web.emit(view, name, payload);
  else fronta.push([name, payload]);
}

function show() {
  if (!ensureView()) return;
  const g = geometry();
  Web.resizeView(view, g.width, g.height);
  Web.setViewPosition(view, g.x, g.y);
  Web.showView(view);
  Web.focusView(view, true);
  shown = true;
  controls(false);
  // server potřebuje poměr stran a šířku panelu, aby figurínu postavil do volné části obrazovky
  Events.emitServer(EV.zadost, JSON.stringify({ rid: 0, op: "obrazovka", pomer: g.screen.width / g.screen.height, panel: g.width / g.screen.width }));
}

function hide() {
  controls(true);
  if (view < 0 || !shown) return;
  Web.focusView(view, false);
  Web.hideView(view);
  shown = false;
}

function withView(then: () => void, tries = 10) {
  if (ensureView()) return then();
  if (tries > 0) setTimeout(() => withView(then, tries - 1), 500);
}

odhlasit.push(
  Events.on(EV.otevrit, (raw: unknown) =>
    withView(() => {
      show();
      toPage(EV.otevrit, raw);
    }),
  ),
  Events.on(EV.zavrit, (raw: unknown) => {
    toPage(EV.zavrit, raw);
    hide();
  }),
  Events.on(EV.vysledek, (raw: unknown) => toPage(EV.vysledek, raw)),
  Events.on(EV.figurina, (raw: unknown) => toPage(EV.figurina, raw)),
);

// klientské resources sdílejí jeden isolate: při zastavení vrátit ovládání, schovat a zrušit view a odhlásit posluchače
Events.on("resourceStop", (name: string) => {
  if (name !== "satnik") return;
  hide();
  for (const f of odhlasit.splice(0)) try { f(); } catch { /* nic */ }
  if (view >= 0) try { Web.destroyView(view); } catch (e) { log("destroyView: " + String(e)); }
  view = -1;
  ready = false;
  fronta.length = 0;
});
