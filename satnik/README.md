# satnik – šatník pro všechny hráče (Kingdoms Connected)

Resource `satnik` pro KCDC. Každý hráč si příkazem **`/satnik`** otevře katalog **všeho oblečení a zbroje ze hry** s ikonami z inventáře a **přesnými názvy** (česky, anglicky, id předmětu). Vedle katalogu stojí **figurína**, kterou vidí jen on. Na ní si kusy vyzkouší, pánské i dámské. Hlavní účel: hráč vybere, co chce, a **ukáže to krejčímu** na RP serveru (přesný název a id, aby krejčí věděl, co vyrobit). Na webu ani na serveru jinak náhledy ze hry nejsou.

## Co umí

- **Katalog:** 2 467 kusů ve 632 druzích (2 140 pánských, 327 dámských; jen co server umí obléct). Druh = stejný název a model, varianty barev a provedení jsou uvnitř (např. *Cotehardie dámská* ×14). Přepínač „každá varianta zvlášť“ ukáže všechny kusy.
- **Filtry:** Pánské / Dámské, část těla (hlava, krk, trup, kabát a sukně, paže, ruce, nohy, boty, opasek) s počty, druh kusu (kápě, šaty, prošívanice…), oblečení / zbroj, řazení podle těla nebo ceny, hledání bez diakritiky v názvu i id (`kosile`, `F_Cotehardie01_m03_B`, `damske`).
- **Detail:** ikona, popis ze hry, **název ve hře**, anglický název a **id předmětu**, každé s tlačítkem Kopírovat. Dál varianty s ikonami, cena, váha, vrstva, obrana (bod / sek / drcení) a charisma.
- **Figurína:** klik na kus = figurína si ho hned oblékne. Kus na stejném místě těla nahradí předchozí, vrstvy (košile, prošívanice, kroužky, plát, kabát) a doplňky se skládají. Dámský kus oblékne ženskou figurínu a naopak. Figurína dostane tvář a vlasy hráče, když má stejné pohlaví.
- **Kamera:** záběr Postava / Trup / Hlava / Nohy, otáčení figuríny (⟲ ⟳, klávesy Q / E): otáčí se jen figurína, kamera zůstává, kde byla při otevření. Figurína stojí vpravo vedle panelu.
- **Moje oblečení:** figurína si oblékne, co má hráč právě na sobě (výchozí bod pro „chci to samé, ale v modré“).
- **Pro krejčího:** *Kopírovat seznam* (názvy a id do schránky) a *Ukázat krejčímu* (seznam do chatu hráčům do 8 m, jednou za 10 s). Krejčí si kus otevře příkazem `/satnik <id>`.
- **Bezpečné:** šatník nic nedává ani nebere, inventáře hráče se nedotkne. Ovládání je při otevřeném šatníku vypnuté.
- **Soukromý náhled:** figurínu, její oblečení ani otáčení nevidí nikdo jiný. Figurína vzniká v **soukromém virtuálním světě** hráče (`svet` + id hráče) a hráč se do něj na dobu náhledu přesune; po zavření se vrátí do světa, odkud přišel. Po tu dobu ho ostatní nevidí a on nevidí je. Navíc `setVisibleTo(hráč)` jako druhá pojistka. Figurína zmizí po zavření, odpojení, smrti nebo ráně (`zavritPriZasahu`); po ráně jde šatník otevřít až za `pauzaPoZasahu` s, aby nesloužil k útěku z boje. Po restartu resource nová instance uklidí zbylé figuríny a vrátí hráče ze soukromých světů.

## Ovládání

| | |
|---|---|
| `/satnik` | otevře šatník |
| `/satnik <text nebo id>` | otevře rovnou s hledáním |
| `/satnik zavrit` | zavře (jinak Esc nebo ✕) |
| klik v mřížce | vyzkoušet na figuríně |
| Q / E | otočit figurínu |
| Ctrl+F, Esc | hledat, zavřít |

## Data

Šatník nemá vlastní data. Bere je za běhu z resource **`katalog`** (`Exports.get("katalog", "items")` a `"icon"`), který je generuje z instalace hry (`cd katalog && npm run katalog`). Z katalogu potřebuje pole `pohlavi`, `model`, `popis`, `obrana` a `charisma` (od této verze katalogu). Pohlaví kusu = model s prefixem `f_` je dámský (tabulky hry jiný údaj nemají). Bez katalogu je šatník prázdný a `/satnik` to řekne.

## Nastavení (`satnik_config.js`)

`prikaz`, `opravneni` (`""` = všichni), `figurinaMuz` / `figurinaZena` (role z `Npc.roles()`, výchozí `townsman` / `townswoman`), `mojeTvar`, `panel` (podíl šířky obrazovky pro panel), `dosahUkazat`, `zavritPriZasahu`, `pauzaPoZasahu` (s, výchozí 20; rána = od útočníka nebo bojová, pád a skriptované poškození ne), `svet` (základ soukromých světů, výchozí 900000). Vzor je [config/satnik_config.example.js](config/satnik_config.example.js).

## Vývoj

```powershell
cd satnik
npm install
npm test                     # jádro (data, hledání, figurína, záběr) + server na falešném KCDC (soukromý náhled)
npm run build                # dist/satnik; nasazení: node playground/nasadit.mjs --jen satnik (katalog: --jen katalog)
node tools/ui-dev.mjs        # http://127.0.0.1:5179/?pohlavi=f&klik=1 – stránka bez hry nad ../katalog/gen
```

Logika je čistá v `src/core.ts` (testy bez KCDC), server v `src/server.ts`, klient jen předává zprávy (`src/client.ts`), stránka `ui/` je ES5 se sadou `ui-kit`. Protokol a API jsou v [AGENTS.md](AGENTS.md).

## Ve hře neověřeno

Stav k 31. 10. 2026: nasazeno na playground (KCDC 1.7.3), server šatník načetl (2 467 kusů, role `townsman` / `townswoman`). S hráčem ve hře zatím ne. Ověřit:

1. `/satnik` otevře panel vlevo a kamera ukáže figurínu vpravo vedle panelu, hráč není v záběru.
2. Figurínu nevidí jiný hráč (od 1. 11. 2026 soukromý virtuální svět; se samotným `setVisibleTo` ji ostatní viděli) a nestojí ve zdi (raycast do 8 směrů). Ve dvou: druhý hráč nevidí figurínu ani prvního hráče, po zavření se první hráč zase objeví na stejném místě.
3. `Npc.wear` obleče figurínu; při odmítnutí záloha `Inventory.set`. Na začátku je figurína svlečená (`Inventory.set` s prázdným seznamem hned po vytvoření, jinak by měla šaty měšťana).
4. Dámské kusy na `townswoman`, výměna figuríny při přepnutí pohlaví. Doplňky (prsten, náhrdelník, rukavice) jsou v datech jen pánské; zda je hra oblékne i ženě, se neví.
5. Otáčení `Npc.teleport` s rotací u zmrazené figuríny, záběry Hlava a Nohy.
6. Kopírování do schránky v CEF (`execCommand("copy")`), *Ukázat krejčímu* v chatu.
