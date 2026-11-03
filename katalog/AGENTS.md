# katalog – pro agenty a moduly

## API (`Exports.get("katalog", jméno)`)

Katalog zjišťuj za běhu: `try { Exports.get("katalog", jméno) } catch { /* neběží */ }` při každém volání (ne jednou při startu; `Exports.get` hází, dokud resource neběží). Do `resourceDependencies` manifestu ho dávej jen v modulu, který bez něj nemůže běžet (šatník): i `optional: true` závislost znamená, že restart katalogu restartuje i tvůj modul.

| Export | Podpis | Poznámka |
|---|---|---|
| `version` | `1` | |
| `get` | `(id) => Predmet \| null` | id = jméno třídy z tabulek (to, co bere `Inventory.add`) |
| `search` | `(dotaz) => { celkem, od, radky, kategorie }` | dotaz `{ q, kat, pod, slot, zna, oblect, vse, razeni: "nazev"\|"cena"\|"vaha"\|"id", od, pocet<=200 }`; řádek `[id, nazev, kat, pod, slot, cena, vaha, ikona, zna, oblect]` |
| `find` | `(q, { kat?, oblect?, pocet? }) => [{ id, nazev, kat, pod, slot, ikona, zna, oblect }]` | zkratka pro našeptávač (výchozí 20) |
| `icon` | `(klic) => string \| null` | base64 PNG 64×64; `klic` = `ikona` z výsledku, nebo `kolekce:<id>` |
| `iconPath` | `(klic) => string` | cesta k PNG na serveru (relativně k pracovní složce serveru) |
| `categories` | `() => { kategorie, sloty, podkategorie }` | id → český název |
| `items` | `(kats?: string[]) => PredmetZ[]` | celé předměty v kategoriích (bez systémových), i s poli oblečení níže; bere je `satnik` |
| `open` | `(playerId, vyber?) => Promise<string>` | otevře prohlížeč; `vyber = { pro, kat?, oblect? }` = režim výběru |
| `onSelect` | `(pro, fn(playerId, itemId))` | handler výběru z prohlížeče pro `pro` |
| `collection` | `() => [{ id, nazev, zdroj: "soubor"\|"hra", ikona }]` | kolekce ikon (původy příchodu…) |
| `collectionAdd` | `(nazev, { png?: base64 64×64, hra?: klicIkony }) => položka` | PNG max 48 KB, přesně 64×64 |
| `collectionRemove` | `(id) => boolean` | |
| `spravaPanels` | `() => [panel]` | panel „Katalog“ pro Správu (registruje se i sám přes `registerPanel`) |

Oblečení a zbroj na tělo (element `Armor`, `Helmet`, `Hood`) mají navíc `pohlavi` (`"f"` = model s prefixem `f_`, jinak `"m"`), `model` (`Clothing`), `popis` (text `UIInfo`), `obrana` `[bod, sek, drcení]` a `charisma`. Dotaz `search` bere i `pohlavi`.

Kategorie: `zbrane, strelne, obleceni, zbroj, kun, jidlo, alchymie, dokumenty, kostky, suroviny, ostatni, system`. Sloty: `hlava, krk, trup, kabat, paze, ruce, nohy, boty, pas, kun, zbran, stit, strela`.

### Co čeká katalog od jiných modulů

- **Příchod** (startovní sady), oba exporty jsou volitelné:
  - `katalogSady(): string[]`: názvy sad pro výběr v katalogu;
  - `katalogPridat(sada: string, itemId: string, pocet: number): boolean | string | { ok, error }`: přidá předmět do sady.
- **Správa**, pole `item` v editoru nastavení: pro výběr s ikonou volá `find(q, { kat, oblect })` a `icon(klic)`, nebo `open(playerId, { pro: "<pole>" })` s `onSelect`. Nový filtr pole: `category` = id kategorie.

## Protokol stránky

Jedna dvojice událostí, každá zpráva je malá (pod limitem KCDC ~64 KB):
- stránka → klient → server: `katalog:zadost` `{ rid, op, ... }`, op `info | hledat | detail | ikony | akce | hraci | kolekce | kolekcePridat | kolekceSmazat`;
- server → klient → stránka: `katalog:vysledek` `{ rid, ok, chyba?, ... }`. Ikony chodí ve více odpovědích se stejným `rid` (`dalsi: true` znamená, že přijdou další).
- Dále `katalog:otevrit` (server → stránka), `katalog:ready`, `katalog:zavrit` a `katalog:vybrano { pro, id }`.

Typy jsou v `src/shared.ts`, logika (hledání, stránky, dávky) je čistá v `src/core.ts` a testuje se bez KCDC.

## Pravidla

- Data hry (`gen/`) ani snímky s ikonami (`.snimky/`) **necommitovat**.
- Nová pravidla slotů patří do `src/sloty.ts` (nejdelší prefix vyhrává) a doplní se test.
- Neověřeno ve hře: Web view katalogu, `GroundItem.spawn` u hráče (poloha `position` a `lookDirection`), `Inventory.add` se `metadata.condition`.
