// Sestaví resource "katalog" pro Kingdoms Connected do dist/katalog/:
//   server.js, client.js, ui/ (+ ui/kit z ../ui-kit, je-li), package.json (manifest), katalog_config.js, gen/ (z `npm run katalog`)
// gen/ (data a ikony ze hry) je jen na serveru: klient ho nestahuje (není v `files`), ikony chodí na žádost událostmi.
//
//   node tools/build.mjs [--out <resources/katalog na serveru>]
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyKit } from "../../ui-kit/copy.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist", "katalog");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const node = (bin, ...args) => execFileSync(process.execPath, [join(root, "node_modules", ...bin), ...args], { stdio: "inherit" });

node(["typescript", "bin", "tsc"], "-p", join(root, "tsconfig.server.json"));
node(["typescript", "bin", "tsc"], "-p", join(root, "tsconfig.client.json"));
mkdirSync(dist, { recursive: true });
for (const [entry, out] of [["src/server.ts", "server.js"], ["src/client.ts", "client.js"]]) {
  node(["esbuild", "bin", "esbuild"], join(root, entry), "--bundle", "--format=iife", "--platform=neutral", "--target=es2022", "--charset=utf8",
    `--outfile=${join(dist, out)}`, "--log-level=warning");
}
rmSync(join(dist, "ui"), { recursive: true, force: true });
cpSync(join(root, "ui"), join(dist, "ui"), { recursive: true });
copyKit(join(dist, "ui", "kit"));                       // ui-kit: theme.css, components.css, kit.js

const manifest = {
  name: "katalog",
  version: pkg.version,
  description: "Katalog předmětů KCD2 s ikonami: prohlížeč pro adminy (/katalog, F10) a výběr předmětu pro moduly",
  author: "gingy-kcdc",
  mafiahub: {
    serverScripts: ["katalog_config.js", "server.js"],
    clientScripts: ["client.js"],
    files: ["ui/**"],
    // most ne: čte se jen při kontrole oprávnění a jeho restart by restartoval i katalog (a s ním šatník);
    // sprava ne: sprava závisí na katalogu (#20), opačný směr = cyklus, který nasadit.mjs odmítne
    resourceDependencies: [],
    exports: ["version", "get", "search", "find", "icon", "iconPath", "categories", "items", "open", "onSelect", "collection", "collectionAdd", "collectionRemove", "spravaPanels", "radek"],
    errorBehavior: "continue",
  },
};
writeFileSync(join(dist, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
const config = join(dist, "katalog_config.js");
if (!existsSync(config)) copyFileSync(join(root, "config", "katalog_config.example.js"), config);

const gen = join(root, "gen");
rmSync(join(dist, "gen"), { recursive: true, force: true });
let genInfo = "gen/ chybí: spusť npm run katalog (bez něj jen předměty ze serveru, bez ikon)";
if (existsSync(join(gen, "katalog.json"))) {
  cpSync(gen, join(dist, "gen"), { recursive: true });
  const ik = existsSync(join(gen, "ikony")) ? readdirSync(join(gen, "ikony")) : [];
  const bytes = ik.reduce((s, f) => s + statSync(join(gen, "ikony", f)).size, 0);
  genInfo = `gen: katalog ${(statSync(join(gen, "katalog.json")).size / 1024).toFixed(0)} KB, ${ik.length} ikon ${(bytes / 1048576).toFixed(1)} MB`;
}
const kb = (f) => (readFileSync(f).length / 1024).toFixed(1);
console.log(`katalog (KCDC): server ${kb(join(dist, "server.js"))} KB, client ${kb(join(dist, "client.js"))} KB; ${genInfo} -> dist/katalog`);

const out = arg("--out");
if (out) {
  mkdirSync(out, { recursive: true });
  for (const f of ["server.js", "client.js", "package.json"]) copyFileSync(join(dist, f), join(out, f));
  if (!existsSync(join(out, "katalog_config.js"))) copyFileSync(config, join(out, "katalog_config.js"));
  for (const d of ["ui", "gen"]) {
    rmSync(join(out, d), { recursive: true, force: true });
    if (existsSync(join(dist, d))) cpSync(join(dist, d), join(out, d), { recursive: true });
  }
  console.log("nasazeno do " + out + " (katalog_config.js a data/ se nepřepisují)");
}
