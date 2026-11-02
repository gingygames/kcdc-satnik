# katalog – předměty KCD2 s ikonami (Kingdoms Connected)

Resource `katalog` pro KCDC. Admin prochází **všechny předměty hry s ikonou** (oblečení, zbraně, jídlo, knihy…), filtruje, hledá a přímo je **dává hráčům**, **spawnuje u sebe** nebo **přidává do startovních sad příchodu**. Ostatní moduly z něj berou výběr předmětu s ikonou (API v [AGENTS.md](AGENTS.md)).

## Data a licence

Ikony a texty jsou majetek Warhorse Studios, **v repu nejsou**. Generují se lokálně z vaší instalace hry:

```powershell
cd katalog
npm install
npm run katalog                 # cesta ke hře z playground/playground.json (gameDir), nebo:
npm run katalog -- "D:\...\KingdomComeDeliverance2"
npm run build                   # dist/katalog (+ gen/), nasazení: playground\nasadit.ps1 -Jen katalog
```

| Zdroj ve hře | Co se z něj bere |
|---|---|
| `Data/Tables.pak` → `Libs/Tables/item/item*.xml` (bez `__test`, `__autotests`, `__deprecated`) | id (`Name`), GUID, typ, cena, váha, max. kvalita, questový, `IconId`, `UIName`, model (`Clothing`); u oblečení navíc pohlaví (model `f_…` = dámské), popis (`UIInfo`), obrana a charisma |
| `Localization/Czech_xml.pak`, `English_xml.pak` → `text_ui_items.xml` | názvy cs/en |
| `Data/IPL_GameData.pak` → `Libs/UI/Textures/Icons/Items/<IconId>_icon.dds` | ikony 64×64 (BC7 → PNG přes `dds-ktx-parser`, MIT) |

Výstup `katalog/gen/` (v `.gitignore`): `katalog.json` (5 390 předmětů, 2 MB; 2 490 kusů oblečení a zbroje na tělo, z toho 328 dámských) a `ikony/*.png` (3 537 ikon). Ikony se ukládají jako PNG s paletou 256 barev (`tools/png.mjs`: median cut + k-means, okem k nerozeznání, PSNR medián 46,8 dB): 11,8 MB, medián 3,4 KB místo 23,4 MB RGBA (medián 6,6 KB). Plné RGBA dá `--bezztratove` (jen bezztrátově zmenšené, 21,2 MB). Už vygenerované ikony bez instalace hry zmenší `npm run ikony` (přepíše jen ty, které vyjdou menší; pak `npm run build`). Generování trvá asi 11 s, s paletou zhruba 1,5 minuty. Slot a vrstvu oblečení tabulky nemají, odvozují se z prefixu modelu (`src/sloty.ts`, pravidla jsou kód, ne data hry).

Datová sada `warpuppies/wardogs-data` (Unlicense), kterou používá web Wardogs, je pro hru WARDOGS a pro KCD2 se nehodí. Z ní se převzal jen postup (data + ikony → katalog).

## Jak to běží

- **Server** načte `gen/katalog.json`, při startu zjistí, co zná (`Inventory.getItemPrice(id) !== null`) a co jde obléct (`Inventory.classes()`). Hledání, filtry a řazení běží na serveru (5 390 předmětů: index 12 ms, dotaz 0,2–3,6 ms).
- **Klient** nestahuje nic navíc: v balíčku resource je jen `ui/`. Výsledky chodí po stránkách (120 řádků ≈ 13 KB) a ikony jen pro viditelné buňky, po dávkách do 40 000 znaků (asi 4 ikony na zprávu). Limit KCDC je asi 64 KB na událost.
- **Stránka** (`ui/`) má mřížku s virtuálním scrollem: buňky se při posunu recyklují (žádné mazání a stavění DOM) a ikona je jednou převedená na `blob:` URL místo dlouhé `data:` URL v CSS. Snímek posunu na 1080p (182 buněk) trvá ~1 ms místo ~13 ms. Ikon drží stránka nejvýš 800 (nejdéle nepoužité uvolní). Dále má filtry (kategorie s počty, podkategorie, slot, zná server, jde obléct, řazení, i systémové), detail a akce.
- Bez `gen/` běží nouzově: jen předměty z `Inventory.classes()`, bez ikon.

## Ovládání

- `/katalog` otevře prohlížeč, `/katalog <text>` vypíše prvních 8 výsledků do chatu.
- F10 → Správa → **Katalog**: *Otevřít prohlížeč*, *Hledat* (tabulka).
- Esc zavře, Ctrl+F hledání, dvojklik v režimu výběru vybere.
- Záložka **Kolekce ikon**: nahrát obrázek (ořez tažením a přiblížením, uloží se 64×64 PNG), nebo vzít ikonu vybraného předmětu. Ukládá se do `data/kolekce.json` a `data/kolekce/*.png` (deploy je nemaže).
- Oprávnění: `admin.items` (Správa `has`/`isAdmin`, jinak `most`), viz `katalog_config.js`.

## Vývoj

- `npm test`: hledání, filtry, stránkování, chybějící ikona, dávky, zařazení.
- `node tools/ui-dev.mjs` → http://127.0.0.1:5178/ je stránka bez hry nad `gen/` (`?q=mec&klik=2` vybere 2. výsledek, `?vyber=prichod` režim výběru, `?tab=ikony`).
- Vzhled je ze sady `ui-kit` (`body.k`, třídy `k-*`, tokeny `--k-*`, `Kit.init` a `Kit.toast`). Build ji kopíruje do `ui/kit`, `style.css` řeší jen rozložení.
