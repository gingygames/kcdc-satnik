// Katalog předmětů - klient (Kingdoms Connected). Jen most mezi serverem a stránkou `ui/index.html`:
// server pošle `katalog:otevrit`, stránka posílá žádosti (`katalog:zadost`) a dostává odpovědi (`katalog:vysledek`).
import { EV } from "./shared";

const VIEW_URL = "fw://resources/katalog/ui/index.html";
let view = -1;
let ready = false;
let shown = false;
const fronta: [string, unknown][] = [];
const log = (t: string) => console.log("[katalog] " + t);
const odhlasit: (() => void)[] = [];

function geometry() {
  const s = Web.getScreenSize();
  const width = Math.min(1280, s.width - 40);
  const height = Math.min(820, s.height - 40);
  return { width, height, x: Math.round((s.width - width) / 2), y: Math.round((s.height - height) / 2) };
}

function ensureView(): boolean {
  if (view >= 0) return true;
  try {
    view = Web.createView(VIEW_URL, { ...geometry(), zIndex: 210, visible: false });
  } catch (e) {
    log("view nejde vytvořit: " + String(e));
    return false;
  }
  Web.on(view, EV.ready, () => {
    ready = true;
    for (const [n, p] of fronta.splice(0)) Web.emit(view, n, p);
  });
  Web.on(view, EV.zavrit, () => hide());
  Web.on(view, EV.zadost, (payload: unknown) => Events.emitServer(EV.zadost, typeof payload === "string" ? payload : JSON.stringify(payload)));
  Web.on(view, EV.vybrano, (payload: unknown) => {
    Events.emitServer(EV.vybrano, typeof payload === "string" ? payload : JSON.stringify(payload));
    hide();
  });
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
}

function hide() {
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
  Events.on(EV.vysledek, (raw: unknown) => toPage(EV.vysledek, raw)),
);

// klientské resources sdílejí jeden isolate: při zastavení schovat a zrušit view a odhlásit posluchače
Events.on("resourceStop", (name: string) => {
  if (name !== "katalog") return;
  hide();
  for (const f of odhlasit.splice(0)) try { f(); } catch { /* nic */ }
  if (view >= 0) try { Web.destroyView(view); } catch (e) { log("destroyView: " + String(e)); }
  view = -1;
  ready = false;
  fronta.length = 0;
});
