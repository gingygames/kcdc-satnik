// Kodér ikon (tools/png.mjs): bezztrátový režim vrací přesně stejné viditelné pixely, paleta je malá a věrná.
import { describe, expect, it } from "vitest";
// @ts-ignore nástroj je čisté .mjs bez typů
import { decodePng, encodePng } from "../tools/png.mjs";

/** ikona 64×64: průhledný okraj s „odpadem“ v RGB, přechod s texturou (šum) a poloprůhledný lem */
function ikona(): Uint8Array {
  const px = new Uint8Array(64 * 64 * 4);
  let seed = 7;
  const noise = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 24) % 24;
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const o = (y * 64 + x) * 4, r = Math.hypot(x - 32, y - 32), n = noise();
      px.set([60 + x * 2 + n, 40 + y * 2 + n, 30 + n, r < 24 ? 255 : r < 28 ? 128 : 0], o);
      if (r >= 28) px.set([200, 13, 77], o); // neviditelné pixely s náhodnou barvou (jako z BC7)
    }
  return px;
}
const visible = (px: Uint8Array) => Array.from({ length: 64 * 64 }, (_, i) => (px[i * 4 + 3] ? [...px.subarray(i * 4, i * 4 + 4)] : [0, 0, 0, 0]));

describe("tools/png.mjs", () => {
  it("bezztrátově: dekódované viditelné pixely jsou stejné, průhledné mají barvu 0", () => {
    const src = ikona();
    const png = encodePng(src, 64, 64);
    const back = decodePng(png);
    expect([back.w, back.h]).toEqual([64, 64]);
    expect(visible(back.rgba)).toEqual(visible(src));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  });

  it("málo barev = paleta s nižší bitovou hloubkou; neprůhledná ikona = RGB", () => {
    const two = new Uint8Array(64 * 64 * 4);
    for (let i = 0; i < 64 * 64; i++) two.set(i % 3 ? [255, 0, 0, 255] : [0, 0, 0, 0], i * 4);
    const png = encodePng(two, 64, 64);
    expect([png[24], png[25]]).toEqual([1, 3]); // 1 bit, paleta
    expect(visible(decodePng(png).rgba)).toEqual(visible(two));
    const opaque = ikona().map((v, i) => (i % 4 === 3 ? 255 : v));
    expect(encodePng(opaque, 64, 64)[25]).toBe(2);
  });

  it("paleta (ztrátově): menší soubor, chyba barev malá", () => {
    const src = ikona();
    const full = encodePng(src, 64, 64);
    const pal = encodePng(src, 64, 64, { paleta: true });
    expect(pal[25]).toBe(3);
    expect(pal.length).toBeLessThan(full.length);
    const back = decodePng(pal).rgba;
    let se = 0;
    for (let i = 0; i < src.length; i++) {
      const a = src[(i & ~3) + 3];
      const d = (i & 3) === 3 ? src[i] - back[i] : ((src[i] - back[i]) * a) / 255;
      se += d * d;
    }
    const psnr = 10 * Math.log10((255 * 255) / (se / src.length));
    expect(psnr).toBeGreaterThan(30);
  });
});
