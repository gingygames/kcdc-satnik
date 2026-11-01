// Sestaví resource "satnik" pro Kingdoms Connected do dist/satnik/:
//   server.js, client.js, ui/ (+ ui/kit z ../ui-kit), package.json (manifest), satnik_config.js
// Data a ikony nemá vlastní: bere je za běhu z resource `katalog` (Exports "items" a "icon").
//
//   node tools/build.mjs [--out <resources/satnik na serveru>]
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyKit } from "../../ui-kit/copy.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist", "satnik");
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
copyKit(join(dist, "ui", "kit"));

const manifest = {
  name: "satnik",
  version: pkg.version,
  description: "Šatník: všechno oblečení ze hry s ikonami a přesnými názvy, vyzkoušení na figuríně (/satnik, pro všechny)",
  author: "gingy-kcdc",
  mafiahub: {
    serverScripts: ["satnik_config.js", "server.js"],
    clientScripts: ["client.js"],
    files: ["ui/**"],
    // katalog dává data a ikony (bez něj je šatník prázdný); most a Správa jen pro volitelné oprávnění
    resourceDependencies: [{ name: "katalog" }, { name: "most", optional: true }],
    exports: ["version", "open", "close", "get", "search", "outfit"],
    errorBehavior: "continue",
  },
};
writeFileSync(join(dist, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
const config = join(dist, "satnik_config.js");
if (!existsSync(config)) copyFileSync(join(root, "config", "satnik_config.example.js"), config);

const kb = (f) => (readFileSync(f).length / 1024).toFixed(1);
console.log(`satnik (KCDC): server ${kb(join(dist, "server.js"))} KB, client ${kb(join(dist, "client.js"))} KB -> dist/satnik`);

const out = arg("--out");
if (out) {
  mkdirSync(out, { recursive: true });
  for (const f of ["server.js", "client.js", "package.json"]) copyFileSync(join(dist, f), join(out, f));
  if (!existsSync(join(out, "satnik_config.js"))) copyFileSync(config, join(out, "satnik_config.js"));
  rmSync(join(out, "ui"), { recursive: true, force: true });
  cpSync(join(dist, "ui"), join(out, "ui"), { recursive: true });
  console.log("nasazeno do " + out + " (satnik_config.js se nepřepisuje)");
}
