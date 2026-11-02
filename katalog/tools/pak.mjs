// Čtení paků KCD2 (obyčejný zip, i zip64) bez rozbalování na disk: centrální adresář + inflateRaw jednotlivých položek.
import { closeSync, openSync, readSync, fstatSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

function read(fd, pos, len) {
  const b = Buffer.alloc(len);
  readSync(fd, b, 0, len, pos);
  return b;
}

export class Pak {
  constructor(path) {
    this.path = path;
    this.fd = openSync(path, "r");
    const size = fstatSync(this.fd).size;
    const tailLen = Math.min(size, 65557 + 20);
    const tail = read(this.fd, size - tailLen, tailLen);
    let e = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error(`${path}: není zip`);
    let count = tail.readUInt16LE(e + 10);
    let cdSize = tail.readUInt32LE(e + 12);
    let cdOff = tail.readUInt32LE(e + 16);
    const loc = e - 20;                                   // zip64 locator těsně před EOCD
    if (loc >= 0 && tail.readUInt32LE(loc) === 0x07064b50) {
      const z = read(this.fd, Number(tail.readBigUInt64LE(loc + 8)), 56);
      count = Number(z.readBigUInt64LE(32));
      cdSize = Number(z.readBigUInt64LE(40));
      cdOff = Number(z.readBigUInt64LE(48));
    }
    const cd = read(this.fd, cdOff, cdSize);
    /** @type {Map<string, {name: string, method: number, csize: number, size: number, off: number}>} */
    this.entries = new Map();
    let p = 0;
    for (let n = 0; n < count && p + 46 <= cd.length; n++) {
      const method = cd.readUInt16LE(p + 10);
      let csize = cd.readUInt32LE(p + 20), size = cd.readUInt32LE(p + 24);
      const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
      let off = cd.readUInt32LE(p + 42);
      const name = cd.toString("utf8", p + 46, p + 46 + nl);
      if (csize === 0xffffffff || size === 0xffffffff || off === 0xffffffff) {
        let x = p + 46 + nl;
        const end = x + xl;
        while (x + 4 <= end) {
          const id = cd.readUInt16LE(x), len = cd.readUInt16LE(x + 2);
          if (id === 1) {
            let q = x + 4;
            if (size === 0xffffffff) { size = Number(cd.readBigUInt64LE(q)); q += 8; }
            if (csize === 0xffffffff) { csize = Number(cd.readBigUInt64LE(q)); q += 8; }
            if (off === 0xffffffff) off = Number(cd.readBigUInt64LE(q));
          }
          x += 4 + len;
        }
      }
      this.entries.set(name.toLowerCase(), { name, method, csize, size, off });
      p += 46 + nl + xl + cl;
    }
  }
  /** názvy položek začínající prefixem (bez ohledu na velikost písmen) */
  list(prefix = "") {
    const p = prefix.toLowerCase();
    return [...this.entries.values()].filter((e) => e.name.toLowerCase().startsWith(p)).map((e) => e.name);
  }
  has(name) {
    return this.entries.has(name.toLowerCase());
  }
  /** obsah položky, null když chybí */
  read(name) {
    const e = this.entries.get(name.toLowerCase());
    if (!e) return null;
    const h = read(this.fd, e.off, 30);
    const data = read(this.fd, e.off + 30 + h.readUInt16LE(26) + h.readUInt16LE(28), e.csize);
    if (e.method === 0) return data;
    if (e.method === 8) return inflateRawSync(data);
    throw new Error(`${e.name}: komprese ${e.method} neumím`);
  }
  close() {
    closeSync(this.fd);
  }
}
