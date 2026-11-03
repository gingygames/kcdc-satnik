# satnik – pro agenty a moduly

## Závislosti

- **`katalog`** (povinná v manifestu): export `items(kats)` (celé předměty s `pohlavi`, `model`, `popis`, `obrana`, `charisma`) a `icon(klic)`. Šatník čte exporty při každém volání. Katalog je povinná závislost, takže jeho restart kaskádou restartuje i šatník a data si načte nová instance při startu; větev `resourceStart` katalogu v serveru zůstává jen jako neškodná pojistka. Když katalog na serveru nemá export `items` (starší verze), šatník je prázdný. KCDC drží exporty od startu serveru, takže po přidání exportu je potřeba `node playground/konzole.mjs refreshall` nebo restart.
- `most`, `sprava` (volitelné): jen pro `opravneni`, když není prázdné. Správa dostane popis příkazu přes `registerChatCommands`.

## API (`Exports.get("satnik", jméno)`)

| Export | Podpis | Poznámka |
|---|---|---|
| `version` | `1` | |
| `open` | `(playerId, q?) => Promise<string>` | otevře šatník (např. krejčí z obchodu), `q` = hledání nebo id |
| `close` | `(playerId) => void` | |
| `get` | `(id) => Kus \| null` | kus podle jména třídy |
| `search` | `(dotaz) => Vysledek` | `{ q, pohlavi: "m"\|"f", druh: "obleceni"\|"zbroj", slot, pod, varianty, razeni: "nazev"\|"cena", od, pocet<=200 }`; řádek `[klic, nazev, pod, slot, ikona, pohlavi, variant, cena, idPrvni]` |
| `outfit` | `(playerId) => string[] \| null` | id kusů na hráčově figuríně (např. zakázka u krejčího), null = šatník zavřený |

## Protokol stránky

- stránka → klient → server: `satnik:zadost` `{ rid, op, ... }`, op `info | hledat | detail | ikony | oblect | svlect | pohlavi | otocit | zoom | moje | ukazat | obrazovka`;
- server → stránka: `satnik:vysledek` `{ rid, ok, chyba?, zprava?, ... }` (ikony ve více odpovědích se stejným `rid` a `dalsi`), `satnik:figurina` (co má figurína na sobě, po každé změně), `satnik:otevrit` `{ info, q, figurina }`, `satnik:zavrit`;
- stránka → klient: `satnik:ready`, `satnik:konec` (klient zavře panel, vrátí ovládání a řekne serveru).

Typy v `src/shared.ts`. Klient po otevření pošle `obrazovka` (poměr stran, podíl panelu), aby server postavil záběr tak, že figurína vyjde do volné části obrazovky (`zaber()` v `src/core.ts`).

## Figurína

- **Soukromí:** figurína vzniká rovnou v soukromém virtuálním světě `CFG.svet + playerId` (`Npc.create({ virtualWorld })`) a hráč se do něj přesune (`setVirtualWorld`); původní svět si pamatuje stav hráče `satnik.svet` (scope `server`). Samotné `setVisibleTo` po `Npc.create` nestačí: NPC se rozešle klientům poblíž hned při vytvoření. Zavření vrátí hráče do původního světa, jen když je pořád v soukromém (jinak ho mezitím přesunul jiný modul). Po ráně v boji (od útočníka, nebo `playerDamage` s důvodem `combat` / `gunshot`; pád, hlad a skriptované poškození se nepočítají) nejde šatník otevřít `pauzaPoZasahu` s.
- `Npc.create` (role `townsman` / `townswoman`, `frozen`, `invulnerable`, `interactable: false`, bez jmenovky) → `setVisibleTo(hráč)` (druhá pojistka) → `pin(hráč)` → `state.satnik = playerId` (scope `server`). Nová instance po restartu odstraní figuríny se `state.satnik` nebo v soukromém světě a vrátí hráče se `satnik.svet` nebo v soukromém světě.
- *Ukázat krejčímu* jde hráčům v okolí v **původním** světě hráče, ne v soukromém.
- Místo: `World.raycast` z hráče do 8 směrů (`ODSTUP` = 3,5 m), `World.resolveGround` pro výšku. Kamera stojí na spojnici 0,7 m před hráčem, takže hráč je za ní.
- Oblékání: `npc.wear(guidy)`, při odmítnutí `Inventory.set(npc, { items: [{ item: guid, equipped: 1 }] })`. Rychlé kliky se slijí (120 ms).
- Kusy na stejném místě (`misto()`: slot + vrstva, u doplňků + podkategorie) se nahrazují; druhý klik na stejný kus ho svlékne.

## Pravidla

- Šatník nesmí měnit inventář hráče ani dávat předměty. Na to je `katalog` (admini).
- Logika patří do `src/core.ts` s testem. Server jen spojuje KCDC API; jeho chování (soukromí, úklid) testuje `test/server.test.ts` na falešném KCDC `test/fake-kcdc.ts`, které modeluje replikaci NPC (`npc.videli` = kdo kdy figurínu dostal). Nové volání KCDC API = doplnit ho do fake podle dokumentace v `@kingdomsconnected/types`.
- Zprávy drž pod limitem KCDC (~64 KB na událost): stránky po 120 řádcích, ikony po dávkách do 40 000 znaků.
