// Katalog předmětů: stránka (CEF hry, ES5). Mluví jen přes dvě události:
//   stránka -> klient -> server: katalog:zadost {rid, op, ...}     server -> klient -> stránka: katalog:vysledek {rid, ok, ...}
// Výsledky hledání chodí po stránkách (BLOK položek), ikony jen pro viditelné buňky a po dávkách. Texty jen přes textContent.
(function () {
  "use strict";
  var EV = { zadost: "katalog:zadost", vysledek: "katalog:vysledek", otevrit: "katalog:otevrit", ready: "katalog:ready", zavrit: "katalog:zavrit", vybrano: "katalog:vybrano" };
  var BLOK = 120, CW = 108, CH = 122;
  var rid = 0, cekaji = {};
  var st = { info: null, dotaz: { razeni: "nazev" }, celkem: 0, bloky: {}, verze: 0, sel: null, vyber: null, hraci: [], kats: {} };
  var IKON_MAX = 800;      // ikon v paměti stránky (blob: URL, ~6 kB každá); nejdéle nepoužité se uvolní
  var ikony = new Map();   // klíč -> blob URL | "" (chybí) | null (čeká na server); pořadí = naposled použité na konci
  var chciIkony = {};      // klíč -> true (čeká na odeslání)
  var $ = function (id) { return document.getElementById(id); };

  function send(name, payload) {
    var json = JSON.stringify(payload);
    if (typeof callEvent === "function") callEvent(name, json);
    else if (window.__katalogDev) window.__katalogDev(name, json);
  }
  function on(name, fn) {
    window.addEventListener(name, function (e) {
      var d = e.detail;
      if (typeof d === "string") { try { d = JSON.parse(d); } catch (x) { return; } }
      fn(d);
    });
  }
  function zadost(op, data, cb) {
    var z = data || {};
    z.rid = ++rid;
    z.op = op;
    cekaji[z.rid] = cb;
    send(EV.zadost, z);
  }
  on(EV.vysledek, function (o) {
    if (!o) return;
    var cb = cekaji[o.rid];
    if (!o.dalsi) delete cekaji[o.rid];
    if (cb) cb(o);
  });

  function h(tag, props) {
    var el = document.createElement(tag);
    for (var k in props || {}) {
      var v = props[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === "text") el.textContent = v;
      else if (k === "class") el.className = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) el.appendChild(typeof arguments[i] === "string" ? document.createTextNode(arguments[i]) : arguments[i]);
    return el;
  }
  function toast(t, err) { if (window.Kit) Kit.toast(String(t || ""), err ? "err" : "ok"); }
  function fmt(n) { return (Math.round(n * 100) / 100).toLocaleString("cs-CZ"); }

  // --- ikony: sběr viditelných, dávka za 40 ms; každá se jednou převede na blob: URL ------
  // (data: URL by se v každém snímku posunu parsovalo jako ~9 kB CSS na buňku)
  function blobUrl(b64) {
    try {
      var bin = atob(b64), u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([u8], { type: "image/png" }));
    } catch (e) { return "data:image/png;base64," + b64; }
  }
  function ikonaGet(k) {
    if (!ikony.has(k)) return undefined;
    var v = ikony.get(k);
    ikony.delete(k);
    ikony.set(k, v);
    return v;
  }
  function ikonaPut(k, v) {
    var old = ikony.get(k);
    if (old && old !== v) URL.revokeObjectURL(old);
    ikony.delete(k);
    ikony.set(k, v);
    if (ikony.size <= IKON_MAX) return;
    var it = ikony.keys(), n;
    while (ikony.size > IKON_MAX && !(n = it.next()).done) {
      var ov = ikony.get(n.value);
      if (ov === null) continue;          // čeká na odpověď
      ikony.delete(n.value);
      if (ov && ov.indexOf("blob:") === 0) URL.revokeObjectURL(ov);
    }
  }
  var ikonyT = 0;
  function chciIkonu(k) {
    if (!k || ikony.has(k) || chciIkony[k]) return;
    chciIkony[k] = true;
    clearTimeout(ikonyT);
    ikonyT = setTimeout(posliIkony, 40);
  }
  function posliIkony() {
    var klice = Object.keys(chciIkony).slice(0, 120);
    if (!klice.length) return;
    klice.forEach(function (k) { delete chciIkony[k]; ikonaPut(k, null); });
    zadost("ikony", { klice: klice }, function (o) {
      (o.ikony || []).forEach(function (i) { ikonaPut(i.k, i.d ? blobUrl(i.d) : ""); });
      if (!o.dalsi) { kresli(); if (st.sel) ukazIkonuDetailu(); kresliKolekci(); }
      if (Object.keys(chciIkony).length) posliIkony();
    });
  }
  /** nastaví ikonu prvku; když se nic nezměnilo, na styl nesahá (recyklované buňky mřížky) */
  function nastavIkonu(el, k) {
    var d = k ? ikonaGet(k) : "";
    if (el._ik === k && el._iu === d) return;
    el._ik = k;
    el._iu = d;
    if (!k || d === "") { el.style.backgroundImage = ""; el.classList.add("chybi"); return; }
    el.classList.remove("chybi");
    if (d) el.style.backgroundImage = "url(" + d + ")";
    else { el.style.backgroundImage = ""; chciIkonu(k); }
  }

  // --- data a virtuální mřížka ----------------------------------------------
  function hledej() {
    st.verze++;
    st.bloky = {};
    st.celkem = 0;
    $("mrizka").scrollTop = 0;
    nactiBlok(0);
  }
  function nactiBlok(b) {
    if (st.bloky[b]) return;
    st.bloky[b] = "nacita";
    var verze = st.verze, t = Date.now();
    var d = {};
    for (var k in st.dotaz) d[k] = st.dotaz[k];
    d.od = b * BLOK;
    d.pocet = BLOK;
    zadost("hledat", { dotaz: d }, function (o) {
      if (verze !== st.verze) return;
      if (!o.ok) { toast(o.chyba || "chyba", true); return; }
      st.bloky[b] = o.vysledek.radky;
      st.celkem = o.vysledek.celkem;
      st.kats = o.vysledek.kategorie;
      $("stav").textContent = st.celkem.toLocaleString("cs-CZ") + " předmětů · " + (Date.now() - t) + " ms";
      kresliKategorie();
      kresli();
    });
  }
  function sloupce() { return Math.max(1, Math.floor(($("mrizka").clientWidth - 8) / CW)); }
  // buňky se recyklují: posun jen přesune, co odjelo z obrazovky, a přepíše jejich obsah (žádné mazání a stavění DOM)
  var bunky = {};   // index výsledku -> prvek
  var volne = [];   // skryté prvky k dalšímu použití
  function bunka() {
    var el = volne.pop();
    if (el) { el.style.display = ""; return el; }
    var ico = h("div", { class: "ico" }), nm = h("div", { class: "nm" });
    el = h("div", { class: "cell" }, ico, nm);
    el._ico = ico;
    el._nm = nm;
    $("cells").appendChild(el);
    return el;
  }
  function kresli() {
    var g = $("mrizka"), cols = sloupce(), rows = Math.ceil(st.celkem / cols);
    var vyska = rows * CH + "px";
    if ($("spacer").style.height !== vyska) $("spacer").style.height = vyska;
    var r0 = Math.max(0, Math.floor(g.scrollTop / CH) - 2), r1 = Math.min(rows, Math.ceil((g.scrollTop + g.clientHeight) / CH) + 2);
    // 1) co má být vidět; 2) buňky mimo to se uvolní; 3) zbytek dostane buňku (stará zůstane na místě, uvolněná se přesune)
    var chci = [], idx = {};
    for (var r = r0; r < r1; r++) {
      for (var c = 0; c < cols; c++) {
        var i = r * cols + c;
        if (i >= st.celkem) break;
        var blok = st.bloky[Math.floor(i / BLOK)];
        if (!blok) { nactiBlok(Math.floor(i / BLOK)); continue; }
        if (blok === "nacita") continue;
        var x = blok[i % BLOK];
        if (!x) continue;
        chci.push(i, x, r, c);
        idx[i] = true;
      }
    }
    for (var k in bunky) if (!idx[k]) { var z = bunky[k]; z.style.display = "none"; z._x = null; volne.push(z); delete bunky[k]; }
    for (var j = 0; j < chci.length; j += 4) {
      i = chci[j]; x = chci[j + 1]; r = chci[j + 2]; c = chci[j + 3];
      var el = bunky[i] || (bunky[i] = bunka());
      if (el._x !== x) {
        el._x = x;
        el._nm.textContent = x[1];
        el.title = x[1] + " (" + x[0] + ")";
      }
      var cls = "cell" + (st.sel && st.sel[0] === x[0] ? " sel" : "") + (x[8] ? "" : " nezna");
      if (el.className !== cls) el.className = cls;
      var left = 4 + c * CW, top = r * CH;
      if (el._l !== left) { el._l = left; el.style.left = left + "px"; }
      if (el._t !== top) { el._t = top; el.style.top = top + "px"; }
      nastavIkonu(el._ico, x[7]);
    }
  }
  function bunkaZ(t) {
    for (; t && t.id !== "cells"; t = t.parentNode) if (t._x) return t;
    return null;
  }
  $("cells").addEventListener("click", function (e) { var el = bunkaZ(e.target); if (el) vyberRadek(el._x); });
  $("cells").addEventListener("dblclick", function (e) { if (bunkaZ(e.target) && st.vyber) potvrdVyber(); });
  var rafT = 0;
  $("mrizka").addEventListener("scroll", function () { if (!rafT) rafT = requestAnimationFrame(function () { rafT = 0; kresli(); }); });
  window.addEventListener("resize", kresli);

  function kresliKategorie() {
    var box = $("kats");
    box.textContent = "";
    var vse = 0;
    for (var k in st.kats) vse += st.kats[k];
    var chip = function (id, label, n) {
      return h("button", { class: "k-chip", "aria-pressed": (st.dotaz.kat || "") === id ? "true" : "false", onclick: function () { st.dotaz.kat = id || undefined; st.dotaz.pod = undefined; podkategorie(); hledej(); } }, label, h("span", { class: "k-muted", text: String(n) }));
    };
    box.appendChild(chip("", "Vše", vse));
    var K = (st.info && st.info.kategorie) || {};
    Object.keys(K).forEach(function (k) { if (st.kats[k]) box.appendChild(chip(k, K[k], st.kats[k])); });
  }
  function podkategorie() {
    var sel = $("pod");
    sel.textContent = "";
    sel.appendChild(h("option", { value: "", text: "Všechny podkategorie" }));
    var p = (st.info && st.dotaz.kat && st.info.podkategorie[st.dotaz.kat]) || {};
    Object.keys(p).sort().forEach(function (x) { sel.appendChild(h("option", { value: x, text: x + " (" + p[x] + ")" })); });
    sel.disabled = !st.dotaz.kat;
  }

  // --- detail a akce --------------------------------------------------------
  function vyberRadek(x) {
    st.sel = x;
    $("zPredmetu").disabled = !x[7];
    kresli();
    var box = $("detail");
    box.textContent = "";
    box.appendChild(h("div", { class: "big", id: "bigIco" }));
    ukazIkonuDetailu();
    box.appendChild(h("h3", { text: x[1] }));
    box.appendChild(h("div", { class: "k-muted", text: x[0] }));
    zadost("detail", { id: x[0] }, function (o) {
      if (!o.ok || st.sel !== x) return;
      var p = o.predmet, I = st.info || { kategorie: {}, sloty: {} };
      var dl = h("dl");
      var row = function (a, b) { dl.appendChild(h("dt", { text: a })); dl.appendChild(h("dd", { text: String(b) })); };
      if (p.en && p.en !== x[1]) row("Anglicky", p.en);
      row("Kategorie", (I.kategorie[p.kat] || p.kat) + " / " + p.pod);
      if (p.slot) row("Slot", (I.sloty[p.slot] || p.slot) + (p.vrstva ? " · " + p.vrstva : ""));
      row("Cena", fmt(p.cena) + (p.cenaServer != null && p.cenaServer !== p.cena ? " (server " + fmt(p.cenaServer) + ")" : ""));
      row("Váha", fmt(p.vaha));
      row("Max. kvalita", p.kval);
      row("Typ v tabulkách", p.typ);
      if (p.guid) row("GUID", p.guid);
      box.appendChild(dl);
      box.appendChild(h("div", null, h("span", { class: "k-badge" + (p.zna ? " k-badge--ok" : ""), text: p.zna ? "zná server" : "server nezná" }), h("span", { class: "k-badge" + (p.oblect ? " k-badge--ok" : ""), text: p.oblect ? "jde obléct" : "nejde obléct" }), p.quest ? h("span", { class: "k-badge", text: "questový" }) : null));
      box.appendChild(akce(p));
    });
  }
  function ukazIkonuDetailu() {
    var el = $("bigIco");
    if (el && st.sel) nastavIkonu(el, st.sel[7]);
  }
  function num(label, id, val, min, max) {
    return h("label", null, label + " ", h("input", { class: "k-input", id: id, type: "number", value: val, min: min, max: max }));
  }
  function v(id, def) { var n = Number(($(id) || {}).value); return isFinite(n) && n > 0 ? n : def; }
  function akce(p) {
    var box = h("div", { class: "akce" });
    if (st.vyber) {
      box.appendChild(h("button", { class: "k-btn", text: "Vybrat pro " + st.vyber.pro, onclick: potvrdVyber }));
      return box;
    }
    var hrac = h("select", { class: "k-input", id: "aHrac" });
    hrac.appendChild(h("option", { value: "", text: "mně" }));
    st.hraci.forEach(function (x) { hrac.appendChild(h("option", { value: String(x.id), text: x.jmeno })); });
    box.appendChild(h("div", { class: "row" }, num("Počet", "aPocet", 1, 1, 10000), num("Kvalita", "aKval", 1, 1, p.kval || 1), num("Stav %", "aStav", 100, 1, 100)));
    var spust = function (druh, extra) {
      if (!p.zna) { toast("Server tuhle třídu nezná, nejde dát ani spawnout.", true); return; }
      var z = { id: p.id, akce: druh, pocet: v("aPocet", 1), kvalita: v("aKval", 1), stav: v("aStav", 100) };
      for (var k in extra || {}) z[k] = extra[k];
      zadost("akce", z, function (o) { toast(o.ok ? o.zprava : o.chyba, !o.ok); });
    };
    box.appendChild(h("div", { class: "row" }, hrac, h("button", { class: "k-btn", text: "Dát hráči", disabled: !p.zna, onclick: function () { spust("dat", { hrac: Number(hrac.value) || 0 }); } })));
    box.appendChild(h("div", { class: "row" }, h("button", { class: "k-btn k-btn--ghost", text: "Spawnout u mě", disabled: !p.zna, onclick: function () { spust("spawn"); } })));
    var sady = (st.info && st.info.sady) || [];
    var sada = h("select", { class: "k-input", id: "aSada", disabled: !sady.length });
    if (!sady.length) sada.appendChild(h("option", { value: "", text: "příchod nemá sady" }));
    sady.forEach(function (s) { sada.appendChild(h("option", { value: s, text: s })); });
    box.appendChild(h("div", { class: "row" }, sada, h("button", { class: "k-btn k-btn--ghost", text: "Přidat do startovní sady", disabled: !sady.length, onclick: function () { spust("sada", { sada: sada.value }); } })));
    return box;
  }
  function potvrdVyber() {
    if (!st.sel || !st.vyber) return;
    send(EV.vybrano, { pro: st.vyber.pro, id: st.sel[0] });
  }

  // --- filtry ---------------------------------------------------------------
  var qT = 0;
  $("q").addEventListener("input", function () {
    clearTimeout(qT);
    qT = setTimeout(function () { st.dotaz.q = $("q").value || undefined; hledej(); }, 150);
  });
  function bool(id) { var x = $(id).value; return x === "" ? undefined : x === "1"; }
  ["pod", "slot", "zna", "oblect", "razeni", "vse"].forEach(function (id) {
    $(id).addEventListener("change", function () {
      st.dotaz.pod = $("pod").value || undefined;
      st.dotaz.slot = $("slot").value || undefined;
      st.dotaz.zna = bool("zna");
      st.dotaz.oblect = bool("oblect");
      st.dotaz.razeni = $("razeni").value;
      st.dotaz.vse = $("vse").checked || undefined;
      hledej();
    });
  });

  // --- kolekce ikon ---------------------------------------------------------
  var kolekce = [];
  function nactiKolekci() { zadost("kolekce", {}, function (o) { if (o.ok) { kolekce = o.kolekce || []; kresliKolekci(); } }); }
  function kresliKolekci() {
    var box = $("kolekce");
    box.textContent = "";
    if (!kolekce.length) box.appendChild(h("div", { class: "k-empty" }, h("strong", { text: "Kolekce je prázdná." }), " Nahraj obrázek, nebo vyber předmět a vezmi jeho ikonu."));
    kolekce.forEach(function (k) {
      var ico = h("div", { class: "ico" });
      nastavIkonu(ico, k.ikona);
      box.appendChild(h("div", { class: "kol", title: k.id }, ico, h("div", { text: k.nazev }), h("button", { class: "k-btn k-btn--ghost", text: "Smazat", onclick: function () {
        zadost("kolekceSmazat", { id: k.id }, function (o) { kolekce = o.kolekce || kolekce; kresliKolekci(); });
      } })));
    });
  }
  function pridej(data) {
    var nazev = $("kNazev").value.trim();
    if (!nazev) { toast("Napiš název ikony.", true); $("kNazev").focus(); return; }
    data.nazev = nazev;
    zadost("kolekcePridat", data, function (o) {
      toast(o.ok ? o.zprava : o.chyba, !o.ok);
      if (o.ok) { kolekce = o.kolekce; kresliKolekci(); $("orez").hidden = true; $("kNazev").value = ""; }
    });
  }
  $("zPredmetu").addEventListener("click", function () { if (st.sel && st.sel[7]) pridej({ hra: st.sel[7] }); });

  var obr = null, oz = { zoom: 1, x: 0, y: 0 };
  function kresliOrez() {
    if (!obr) return;
    var c = $("platno"), x = c.getContext("2d"), s = Math.min(obr.width, obr.height) / oz.zoom;
    var sx = Math.max(0, Math.min(obr.width - s, (obr.width - s) / 2 + oz.x)), sy = Math.max(0, Math.min(obr.height - s, (obr.height - s) / 2 + oz.y));
    x.clearRect(0, 0, 256, 256);
    x.drawImage(obr, sx, sy, s, s, 0, 0, 256, 256);
    var n = $("nahled").getContext("2d");
    n.clearRect(0, 0, 64, 64);
    n.imageSmoothingQuality = "high";
    n.drawImage(obr, sx, sy, s, s, 0, 0, 64, 64);
  }
  $("soubor").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var i = new Image();
      i.onload = function () { obr = i; oz = { zoom: 1, x: 0, y: 0 }; $("zoom").value = "1"; $("orez").hidden = false; if (!$("kNazev").value) $("kNazev").value = f.name.replace(/\.\w+$/, ""); kresliOrez(); };
      i.src = r.result;
    };
    r.readAsDataURL(f);
  });
  $("zoom").addEventListener("input", function () { oz.zoom = Number($("zoom").value); kresliOrez(); });
  (function () {
    var drag = null;
    $("platno").addEventListener("mousedown", function (e) { drag = { x: e.clientX, y: e.clientY, ox: oz.x, oy: oz.y }; });
    window.addEventListener("mouseup", function () { drag = null; });
    window.addEventListener("mousemove", function (e) {
      if (!drag || !obr) return;
      var k = Math.min(obr.width, obr.height) / oz.zoom / 256;
      oz.x = drag.ox - (e.clientX - drag.x) * k;
      oz.y = drag.oy - (e.clientY - drag.y) * k;
      kresliOrez();
    });
  })();
  $("ulozit").addEventListener("click", function () { pridej({ png: $("nahled").toDataURL("image/png").split(",")[1] }); });

  // --- záložky, zavření, otevření -------------------------------------------
  Array.prototype.forEach.call(document.querySelectorAll(".k-tab"), function (t) {
    t.addEventListener("click", function () {
      Array.prototype.forEach.call(document.querySelectorAll(".k-tab"), function (x) { x.setAttribute("aria-selected", x === t ? "true" : "false"); });
      $("predmety").hidden = t.dataset.tab !== "predmety";
      $("ikony").hidden = t.dataset.tab !== "ikony";
      if (t.dataset.tab === "ikony") nactiKolekci(); else kresli();
    });
  });
  function zavri() { send(EV.zavrit, {}); }
  $("zavrit").addEventListener("click", zavri);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") zavri();
    if (e.key === "f" && e.ctrlKey) { e.preventDefault(); $("q").focus(); }
  });

  on(EV.otevrit, function (m) {
    st.vyber = (m && m.vyber) || null;
    $("vyber").hidden = !st.vyber;
    $("vyber").textContent = st.vyber ? "Výběr předmětu pro: " + st.vyber.pro + " (dvojklik vybere)" : "";
    if (st.vyber) { st.dotaz.kat = st.vyber.kat || undefined; if (st.vyber.oblect) { st.dotaz.oblect = true; $("oblect").value = "1"; } }
    zadost("info", {}, function (o) {
      if (!o.ok) { toast(o.chyba, true); return; }
      st.info = o.info;
      var s = $("slot");
      if (s.options.length < 2) Object.keys(o.info.sloty).forEach(function (k) { s.appendChild(h("option", { value: k, text: o.info.sloty[k] })); });
      podkategorie();
      hledej();
    });
    zadost("hraci", {}, function (o) { if (o.ok) st.hraci = o.hraci; });
    setTimeout(function () { $("q").focus(); }, 50);
  });
  send(EV.ready, {});
})();
