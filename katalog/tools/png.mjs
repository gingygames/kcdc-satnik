// PNG bez závislostí (node:zlib): zápis ikon katalogu a čtení (pro tools/ikony.mjs).
//
// Zmenšení (měřeno na 3537 ikonách 64×64, původně 23,4 MB RGBA):
//  - bezztrátově (vždy): neviditelné pixely (alfa 0) mají barvu 0, do 256 barev paleta, bez průhlednosti RGB místo RGBA,
//    z několika voleb filtrů řádků ta nejmenší po zabalení: 21,2 MB (-9 %), pixely beze změny;
//  - `paleta: true` (výchozí v katalog.mjs i ikony.mjs): ztrátově na 256 barev (median cut + k-means, bez rozptylování),
//    PNG s paletou: ~11,9 MB (-49 %), PSNR medián 46,8 dB, nejhorší 39,6 dB; okem k nerozeznání.
// Výstup je pořád PNG (export `icon` slibuje base64 PNG).
import { deflateSync, inflateSync } from "node:zlib";

const CRC = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c;
}
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** řádky (bajty pixelů, `bpp` bajtů na pixel) -> data IDAT; filtr: 0–4 pro všechny řádky, -1 = nejmenší součet po řádcích */
function filtered(px, stride, h, bpp, mode) {
  const raw = Buffer.alloc((stride + 1) * h);
  const row = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const cur = px.subarray(y * stride, y * stride + stride);
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    let best = 0, bestSum = Infinity, bestRow = null;
    for (let f = mode < 0 ? 0 : mode; f <= (mode < 0 ? 4 : mode); f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? cur[x - bpp] : 0, b = prev ? prev[x] : 0, c = prev && x >= bpp ? prev[x - bpp] : 0;
        const v = (cur[x] - (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c))) & 255;
        row[x] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; bestRow = Buffer.from(row); }
    }
    raw[y * (stride + 1)] = best;
    bestRow.copy(raw, y * (stride + 1) + 1);
  }
  return raw;
}
function smallestIdat(px, stride, h, bpp) {
  let best = null;
  // u palety (indexy) filtry obvykle škodí: 0 je mezi kandidáty vždy
  for (const mode of [-1, 0, 1, 2, 4]) {
    const z = deflateSync(filtered(px, stride, h, bpp, mode), { level: 9, memLevel: 9 });
    if (!best || z.length < best.length) best = z;
  }
  return best;
}

/** RGBA (Uint8Array w*h*4) -> PNG; bez `opts.paleta` bezztrátově vůči viditelným pixelům */
export function encodePng(rgba, w, h, opts = {}) {
  const n = w * h;
  const px = Uint8Array.from((opts.paleta && quantize(rgba, n)) || rgba);
  let opaque = true;
  for (let i = 0; i < n; i++) {
    if (px[i * 4 + 3] === 0) px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 0;
    else if (px[i * 4 + 3] !== 255) opaque = false;
    if (px[i * 4 + 3] === 0) opaque = false;
  }
  // barvy
  const u32 = new Uint32Array(px.buffer, px.byteOffset, n);
  const colors = new Map();
  for (let i = 0; i < n && colors.size <= 256; i++) if (!colors.has(u32[i])) colors.set(u32[i], colors.size);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])];
  let idat;
  if (colors.size <= 256) {
    // paleta: průhledné barvy napřed (tRNS je pak kratší)
    const list = [...colors.keys()].sort((a, b) => (a >>> 24) - (b >>> 24));
    const index = new Map(list.map((c, i) => [c, i]));
    const depth = list.length <= 2 ? 1 : list.length <= 4 ? 2 : list.length <= 16 ? 4 : 8;
    const stride = Math.ceil((w * depth) / 8);
    const rows = Buffer.alloc(stride * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = index.get(u32[y * w + x]);
        const bit = x * depth;
        rows[y * stride + (bit >> 3)] |= v << (8 - depth - (bit & 7));
      }
    const plte = Buffer.alloc(list.length * 3);
    const alphas = list.map((c) => c >>> 24);
    list.forEach((c, i) => { plte[i * 3] = c & 255; plte[i * 3 + 1] = (c >>> 8) & 255; plte[i * 3 + 2] = (c >>> 16) & 255; });
    let t = alphas.length;
    while (t > 0 && alphas[t - 1] === 255) t--;
    ihdr[8] = depth; ihdr[9] = 3;
    idat = smallestIdat(rows, stride, h, 1);
    parts.push(chunk("IHDR", ihdr), chunk("PLTE", plte));
    if (t) parts.push(chunk("tRNS", Buffer.from(alphas.slice(0, t))));
  } else if (opaque) {
    const rgb = Buffer.alloc(n * 3);
    for (let i = 0; i < n; i++) rgb[i * 3] = px[i * 4], rgb[i * 3 + 1] = px[i * 4 + 1], rgb[i * 3 + 2] = px[i * 4 + 2];
    ihdr[8] = 8; ihdr[9] = 2;
    idat = smallestIdat(rgb, w * 3, h, 3);
    parts.push(chunk("IHDR", ihdr));
  } else {
    ihdr[8] = 8; ihdr[9] = 6;
    idat = smallestIdat(Buffer.from(px.buffer, px.byteOffset, px.length), w * 4, h, 4);
    parts.push(chunk("IHDR", ihdr));
  }
  parts.push(chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

// ztrátová paleta: median cut v RGBA (barvy vážené alfou) + pár kol k-means; bez rozptylování (u 64×64 ikon škodí kompresi).
function quantize(rgba, n, colors = 256, iters = 4) {
  const px = [];
  for (let i = 0; i < n; i++) if (rgba[i * 4 + 3]) px.push(i);
  if (!px.length) return null;
  const ch = (i, k) => (k === 3 ? rgba[i * 4 + 3] : (rgba[i * 4 + k] * rgba[i * 4 + 3]) / 255);
  let boxes = [px];
  while (boxes.length < colors - 1) {
    // rozdělit krabici s největším rozsahem (váženo počtem)
    let bi = -1, bk = 0, bscore = -1;
    boxes.forEach((b, j) => {
      if (b.length < 2) return;
      for (let k = 0; k < 4; k++) {
        let lo = 1e9, hi = -1e9;
        for (const i of b) { const v = ch(i, k); if (v < lo) lo = v; if (v > hi) hi = v; }
        const s = (hi - lo) * Math.sqrt(b.length);
        if (s > bscore) bscore = s, bi = j, bk = k;
      }
    });
    if (bi < 0 || bscore <= 0) break;
    const b = boxes[bi].sort((x, y) => ch(x, bk) - ch(y, bk));
    boxes.splice(bi, 1, b.slice(0, b.length >> 1), b.slice(b.length >> 1));
  }
  let pal = boxes.map((b) => { const s = [0, 0, 0, 0]; for (const i of b) for (let k = 0; k < 4; k++) s[k] += ch(i, k); return s.map((v) => v / b.length); });
  const nearest = (i) => {
    let best = 0, bd = Infinity;
    const r = ch(i, 0), g = ch(i, 1), bb = ch(i, 2), a = ch(i, 3);
    for (let j = 0; j < pal.length; j++) { const p = pal[j]; const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - bb) ** 2 + (p[3] - a) ** 2; if (d < bd) bd = d, best = j; }
    return best;
  };
  let asg = new Int32Array(n).fill(-1);
  for (let it = 0; it < iters; it++) {
    const sums = pal.map(() => [0, 0, 0, 0, 0]);
    for (const i of px) { const j = nearest(i); asg[i] = j; const s = sums[j]; for (let k = 0; k < 4; k++) s[k] += ch(i, k); s[4]++; }
    pal = pal.map((p, j) => (sums[j][4] ? sums[j].slice(0, 4).map((v) => v / sums[j][4]) : p));
  }
  for (const i of px) asg[i] = nearest(i);
  // zpět na RGBA (odnásobit alfou)
  const out = new Uint8Array(n * 4);
  const pr = pal.map((p) => { const a = Math.round(p[3]); return a ? [Math.min(255, Math.round((p[0] * 255) / a)), Math.min(255, Math.round((p[1] * 255) / a)), Math.min(255, Math.round((p[2] * 255) / a)), a] : [0, 0, 0, 0]; });
  for (let i = 0; i < n; i++) if (asg[i] >= 0) out.set(pr[asg[i]], i * 4);
  return out;
}

/** PNG (RGBA, RGB, šedá s alfou i bez, paleta i s 1–4 bity; 8 bitů na kanál, bez prokládání) -> { w, h, rgba } */
export function decodePng(buf) {
  let p = 8, w = 0, h = 0, ct = 0, bd = 8, plte = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; if (d[12]) throw new Error("prokládané PNG neumím"); }
    else if (type === "IDAT") idat.push(d);
    else if (type === "PLTE") plte = d;
    else if (type === "tRNS") trns = d;
    p += 12 + len;
  }
  if (bd !== 8 && !(ct === 3 && bd < 8)) throw new Error(`PNG s ${bd} bity na kanál neumím`);
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  const stride = ct === 3 ? Math.ceil((w * bd) / 8) : w * bpp;
  const raw = inflateSync(Buffer.concat(idat)), out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = y && x >= bpp ? out[(y - 1) * stride + x - bpp] : 0;
      out[y * stride + x] = (src[x] + (f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? paeth(a, b, c) : 0)) & 255;
    }
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x, o = i * 4;
      if (ct === 6) for (let k = 0; k < 4; k++) rgba[o + k] = out[i * 4 + k];
      else if (ct === 2) rgba.set([out[i * 3], out[i * 3 + 1], out[i * 3 + 2], 255], o);
      else if (ct === 0) rgba.set([out[i], out[i], out[i], 255], o);
      else if (ct === 4) rgba.set([out[i * 2], out[i * 2], out[i * 2], out[i * 2 + 1]], o);
      else {
        const bit = x * bd, ix = (out[y * stride + (bit >> 3)] >> (8 - bd - (bit & 7))) & ((1 << bd) - 1);
        rgba.set([plte[ix * 3], plte[ix * 3 + 1], plte[ix * 3 + 2], trns && ix < trns.length ? trns[ix] : 255], o);
      }
    }
  return { w, h, rgba };
}
