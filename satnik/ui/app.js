// Šatník: stránka (CEF hry, ES5). Mluví jen přes události:
//   stránka -> klient -> server: satnik:zadost {rid, op, ...}      server -> stránka: satnik:vysledek {rid, ok, ...}
//   server -> stránka: satnik:otevrit {info, q, figurina}, satnik:figurina (co má figurína na sobě), satnik:zavrit
// Výsledky po stránkách (BLOK), ikony jen pro viditelné buňky a po dávkách. Texty ze serveru jen přes textContent.
(function () {
  "use strict";
  var EV = { zadost: "satnik:zadost", vysledek: "satnik:vysledek", otevrit: "satnik:otevrit", zavrit: "satnik:zavrit", figurina: "satnik:figurina", ready: "satnik:ready", konec: "satnik:konec" };
  var BLOK = 120, CW = 108, CH = 128, OTOCENI = 30;
  var rid = 0, cekaji = {};
  var st = { info: null, dotaz: { razeni: "nazev", pohlavi: "m" }, celkem: 0, bloky: {}, verze: 0, sel: null, detail: null, varSel: null, fig: { pohlavi: "m", zoom: "postava", na: [] } };
  var IKON_MAX = 800;      // ikon v paměti stránky (blob: URL); nejdéle nepoužité se uvolní
  var ikony = new Map(), chciIkony = {};   // klíč -> blob URL | "" (chybí) | null (čeká)
  var $ = function (id) { return document.getElementById(id); };

  function send(name, payload) {
    var json = JSON.stringify(payload);
    if (typeof callEvent === "function") callEvent(name, json);
    else if (window.__satnikDev) window.__satnikDev(name, json);
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
    if (cb) cekaji[z.rid] = cb;
    send(EV.zadost, z);
  }
  on(EV.vysledek, function (o) {
    if (!o) return;
    var cb = cekaji[o.rid];
    if (!o.dalsi) delete cekaji[o.rid];
    if (cb) cb(o);
    else if (o.ok === false && o.chyba) toast(o.chyba, true);
  });
  // akce bez vlastní odpovědi: chyba do toastu, zpráva jako potvrzení
  function akce(op, data) {
    zadost(op, data, function (o) {
      if (!o.ok) toast(o.chyba || "chyba", true);
      else if (o.zprava) toast(o.zprava);
    });
  }

  var h = function (tag, props) {
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
  };
  function toast(t, err) { if (window.Kit) Kit.toast(String(t || ""), err ? "err" : "ok"); }
  function fmt(n) { return (Math.round(n * 100) / 100).toLocaleString("cs-CZ"); }
  function naSobe(id) { for (var i = 0; i < st.fig.na.length; i++) if (st.fig.na[i][0] === id) return true; return false; }

  function kopirovat(text, co) {
    var ta = h("textarea", { style: "position:fixed;left:-9999px;top:0" });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (!ok && navigator.clipboard) { navigator.clipboard.writeText(text).then(function () { toast("Zkopírováno: " + co); }, function () { toast("Schránka nejde, opiš: " + text, true); }); return; }
    toast(ok ? "Zkopírováno: " + co : "Schránka nejde, opiš: " + text, !ok);
  }

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
      if (!o.dalsi) { kresli(); prekresliIkony(); }
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
  function prekresliIkony() {
    var els = document.querySelectorAll("[data-ikona]");
    for (var i = 0; i < els.length; i++) nastavIkonu(els[i], els[i].getAttribute("data-ikona"));
  }

  // --- výsledky a virtuální mřížka --------------------------------------------
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
    var verze = st.verze;
    var d = {};
    for (var k in st.dotaz) d[k] = st.dotaz[k];
    d.od = b * BLOK;
    d.pocet = BLOK;
    zadost("hledat", { dotaz: d }, function (o) {
      if (verze !== st.verze) return;
      if (!o.ok) { toast(o.chyba || "chyba", true); return; }
      st.bloky[b] = o.vysledek.radky;
      st.celkem = o.vysledek.celkem;
      if (b === 0) { kresliSloty(o.vysledek.sloty); kresliPod(o.vysledek.pod); }
      $("stav").textContent = st.celkem.toLocaleString("cs-CZ") + (st.dotaz.varianty ? " kusů" : " druhů");
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
    var n = h("span", { class: "n" }), ico = h("div", { class: "ico" }, n), nm = h("div", { class: "nm" }), pd = h("div", { class: "pd" });
    el = h("div", { class: "cell" }, ico, nm, pd);
    el._ico = ico;
    el._n = n;
    el._nm = nm;
    el._pd = pd;
    $("cells").appendChild(el);
    return el;
  }
  function kresli() {
    var g = $("mrizka"), cols = sloupce(), rows = Math.ceil(st.celkem / cols);
    var vyska = rows * CH + "px";
    if ($("spacer").style.height !== vyska) $("spacer").style.height = vyska;
    var r0 = Math.max(0, Math.floor(g.scrollTop / CH) - 2), r1 = Math.min(rows, Math.ceil((g.scrollTop + g.clientHeight) / CH) + 2);
    var S = (st.info && st.info.sloty) || {};
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
        el._pd.textContent = x[2] + " · " + (S[x[3]] || x[3]);
        el._n.textContent = x[6] > 1 ? "×" + x[6] : "";
        el._n.style.display = x[6] > 1 ? "" : "none";
        el.title = x[1] + " (" + x[8] + ")" + (x[6] > 1 ? " · " + x[6] + " variant" : "");
      }
      var cls = "cell" + (st.sel && st.sel[0] === x[0] ? " sel" : "") + (naSobe(x[8]) ? " na" : "");
      if (el.className !== cls) el.className = cls;
      var left = 4 + c * CW, top = r * CH;
      if (el._l !== left) { el._l = left; el.style.left = left + "px"; }
      if (el._t !== top) { el._t = top; el.style.top = top + "px"; }
      nastavIkonu(el._ico, x[4]);
    }
  }
  function bunkaZ(t) {
    for (; t && t.id !== "cells"; t = t.parentNode) if (t._x) return t;
    return null;
  }
  $("cells").addEventListener("click", function (e) { var el = bunkaZ(e.target); if (el) vyber(el._x); });
  var rafT = 0;
  $("mrizka").addEventListener("scroll", function () { if (!rafT) rafT = requestAnimationFrame(function () { rafT = 0; kresli(); }); });
  window.addEventListener("resize", kresli);

  function kresliSloty(pocty) {
    var box = $("sloty");
    box.textContent = "";
    var vse = 0;
    for (var k in pocty) vse += pocty[k];
    var chip = function (id, label, n) {
      return h("button", { class: "k-chip", "aria-pressed": (st.dotaz.slot || "") === id ? "true" : "false", onclick: function () { st.dotaz.slot = id || undefined; st.dotaz.pod = undefined; hledej(); } }, label + " ", h("span", { class: "k-muted", text: String(n) }));
    };
    box.appendChild(chip("", "Celé tělo", vse));
    var S = (st.info && st.info.sloty) || {};
    Object.keys(S).forEach(function (s) { if (pocty[s]) box.appendChild(chip(s, S[s], pocty[s])); });
  }
  function kresliPod(pocty) {
    var sel = $("pod");
    var cur = st.dotaz.pod || "";
    sel.textContent = "";
    sel.appendChild(h("option", { value: "", text: "Všechny kusy" }));
    Object.keys(pocty).sort(function (a, b) { return a.localeCompare(b, "cs"); }).forEach(function (x) { sel.appendChild(h("option", { value: x, text: x + " (" + pocty[x] + ")" })); });
    sel.value = cur;
  }

  // --- výběr, detail a varianty -------------------------------------------------
  function vyber(x) {
    st.sel = x;
    // klik = vyzkoušet: figurína si kus hned oblékne (už oblečený se jen ukáže)
    if (!naSobe(x[8])) akce("oblect", { id: x[8] });
    st.varSel = x[8];
    nactiDetail(x[0]);
    kresli();
  }
  function nactiDetail(klic) {
    zadost("detail", { id: klic }, function (o) {
      if (!o.ok) return toast(o.chyba, true);
      st.detail = o.detail;
      kresliDetail();
    });
  }
  function radekNazvu(dl, label, text, trida) {
    dl.appendChild(h("dt", { text: label }));
    dl.appendChild(h("dd", { class: trida || "", text: text }));
    dl.appendChild(h("button", { class: "k-btn k-btn--quiet k-btn--sm", title: "Kopírovat", text: "⧉", onclick: function () { kopirovat(text, text); } }));
  }
  function kresliDetail() {
    var d = st.detail, box = $("detail");
    if (!d) return;
    var v = null;
    for (var i = 0; i < d.varianty.length; i++) if (d.varianty[i].id === st.varSel) v = d.varianty[i];
    if (!v) v = d.varianty[0];
    var I = st.info || { sloty: {}, vrstvy: {}, druhy: {} };
    box.textContent = "";
    var big = h("div", { class: "big", "data-ikona": v.ikona });
    nastavIkonu(big, v.ikona);
    box.appendChild(h("div", { class: "hlava" }, big, h("div", null,
      h("h3", { text: v.nazev }),
      h("div", { class: "k-muted", text: d.pod + " · " + (I.sloty[d.slot] || d.slot) + " · " + (d.pohlavi === "f" ? "dámské" : "pánské") }))));
    if (d.popis) box.appendChild(h("p", { class: "popis", text: d.popis }));

    var dl = h("dl", { class: "nazvy" });
    radekNazvu(dl, "Název ve hře", v.nazev);
    if (v.en) radekNazvu(dl, "Anglicky", v.en);
    radekNazvu(dl, "Id předmětu", v.id, "id");
    box.appendChild(dl);

    if (d.varianty.length > 1) {
      box.appendChild(h("div", { class: "k-muted", text: "Varianty (" + d.varianty.length + "): barva a provedení" }));
      var vb = h("div", { class: "var" });
      d.varianty.forEach(function (x) {
        var ico = h("div", { class: "ico", "data-ikona": x.ikona });
        nastavIkonu(ico, x.ikona);
        vb.appendChild(h("button", { "aria-pressed": x.id === v.id ? "true" : "false", title: x.id, onclick: function () { st.varSel = x.id; if (!naSobe(x.id)) akce("oblect", { id: x.id }); kresliDetail(); } }, ico, x.oznaceni));
      });
      box.appendChild(vb);
    }
    var c = h("dl", { class: "cisla" });
    var row = function (a, b) { c.appendChild(h("dt", { text: a })); c.appendChild(h("dd", { text: String(b) })); };
    row("Cena", fmt(v.cena) + " gr");
    row("Váha", fmt(v.vaha));
    if (v.vrstva) row("Vrstva", I.vrstvy[v.vrstva] || v.vrstva);
    if (v.obrana[0] + v.obrana[1] + v.obrana[2] > 0) row("Obrana", "bod " + v.obrana[0] + " · sek " + v.obrana[1] + " · drcení " + v.obrana[2]);
    if (v.charisma) row("Charisma", v.charisma);
    box.appendChild(c);
    var nosi = naSobe(v.id);
    box.appendChild(h("button", { class: "k-btn" + (nosi ? " k-btn--ghost" : ""), text: nosi ? "Svléct z figuríny" : "Obléct na figurínu", onclick: function () { akce(nosi ? "svlect" : "oblect", { id: v.id }); } }));
  }

  // --- figurína -------------------------------------------------------------------
  function nastavPohlaviTab(p) {
    var tabs = document.querySelectorAll("[data-pohlavi]");
    for (var i = 0; i < tabs.length; i++) tabs[i].setAttribute("aria-selected", tabs[i].getAttribute("data-pohlavi") === p ? "true" : "false");
  }
  function nastavZoomTab(z) {
    var tabs = document.querySelectorAll("[data-zoom]");
    for (var i = 0; i < tabs.length; i++) tabs[i].setAttribute("aria-selected", tabs[i].getAttribute("data-zoom") === z ? "true" : "false");
  }
  function figurina(f) {
    if (!f) return;
    var predtim = st.fig.pohlavi;
    st.fig = f;
    nastavZoomTab(f.zoom);
    if (f.pohlavi !== predtim || f.pohlavi !== st.dotaz.pohlavi) {
      // figurína se převlékla za druhé pohlaví (dámský kus na pánské): katalog jde za ní
      st.dotaz.pohlavi = f.pohlavi;
      nastavPohlaviTab(f.pohlavi);
      hledej();
    }
    var box = $("na");
    box.textContent = "";
    if (!f.na.length) box.appendChild(h("span", { class: "k-muted", text: f.stoji ? "nic (klikni na kus v mřížce)" : "figurína se staví…" }));
    f.na.forEach(function (x) {
      var b = h("button", { title: x[1] + " (" + x[0] + "), klik svlékne", "data-ikona": x[3], onclick: function () { akce("svlect", { id: x[0] }); } });
      nastavIkonu(b, x[3]);
      b.style.backgroundSize = "40px";
      box.appendChild(b);
    });
    if (f.zprava) toast(f.zprava, true);
    kresli();
    if (st.detail) kresliDetail();
  }
  on(EV.figurina, figurina);

  function seznam() {
    return st.fig.na.map(function (x) { return x[1] + " – " + x[0]; }).join("\n");
  }

  // --- ovládání ---------------------------------------------------------------------
  function zavrit() { send(EV.konec, {}); }
  $("zavrit").addEventListener("click", zavrit);
  var tabs = document.querySelectorAll("[data-pohlavi]");
  for (var i = 0; i < tabs.length; i++) tabs[i].addEventListener("click", function () {
    var p = this.getAttribute("data-pohlavi");
    if (p === st.dotaz.pohlavi) return;
    st.dotaz.pohlavi = p;
    st.dotaz.slot = st.dotaz.pod = undefined;
    nastavPohlaviTab(p);
    akce("pohlavi", { pohlavi: p });
    hledej();
  });
  var zooms = document.querySelectorAll("[data-zoom]");
  for (var j = 0; j < zooms.length; j++) zooms[j].addEventListener("click", function () { var z = this.getAttribute("data-zoom"); nastavZoomTab(z); akce("zoom", { zoom: z }); });
  $("vlevo").addEventListener("click", function () { akce("otocit", { o: OTOCENI }); });
  $("vpravo").addEventListener("click", function () { akce("otocit", { o: -OTOCENI }); });
  $("moje").addEventListener("click", function () { akce("moje"); });
  $("svlect").addEventListener("click", function () { akce("svlect"); });
  $("kopirovat").addEventListener("click", function () { if (!st.fig.na.length) return toast("Figurína nemá nic na sobě.", true); kopirovat(seznam(), st.fig.na.length + " kusů"); });
  $("ukazat").addEventListener("click", function () { akce("ukazat"); });

  var qT = 0;
  $("q").addEventListener("input", function () {
    clearTimeout(qT);
    qT = setTimeout(function () { st.dotaz.q = $("q").value || undefined; hledej(); }, 180);
  });
  $("druh").addEventListener("change", function () { st.dotaz.druh = this.value || undefined; hledej(); });
  $("pod").addEventListener("change", function () { st.dotaz.pod = this.value || undefined; hledej(); });
  $("razeni").addEventListener("change", function () { st.dotaz.razeni = this.value; hledej(); });
  $("varianty").addEventListener("change", function () { st.dotaz.varianty = this.checked || undefined; hledej(); });

  document.addEventListener("keydown", function (e) {
    var pise = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA");
    if (e.key === "Escape") { e.preventDefault(); if (pise && e.target.value) { e.target.value = ""; st.dotaz.q = undefined; hledej(); } else zavrit(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) { e.preventDefault(); $("q").focus(); $("q").select(); return; }
    if (pise) return;
    if (e.key === "q" || e.key === "Q") akce("otocit", { o: OTOCENI });
    if (e.key === "e" || e.key === "E") akce("otocit", { o: -OTOCENI });
  });
  if (window.Kit && Kit.keys) Kit.keys($("klavesy"), [["klik", "vyzkoušet"], ["Q / E", "otočit"], ["Ctrl+F", "hledat"], ["Esc", "zavřít"]]);

  on(EV.otevrit, function (d) {
    if (!d) return;
    st.info = d.info;
    if (d.figurina) { st.fig.pohlavi = d.figurina.pohlavi; st.dotaz.pohlavi = d.figurina.pohlavi; nastavPohlaviTab(d.figurina.pohlavi); figurina(d.figurina); }
    if (d.q) { $("q").value = d.q; st.dotaz.q = d.q; }
    hledej();
    $("q").focus();
  });
  on(EV.zavrit, function () { st.detail = null; });
  send(EV.ready, {});
})();
