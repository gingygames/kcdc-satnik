# Wardrobe (Šatník) for Kingdoms Connected

A clothing catalogue for **Kingdoms Connected** (KCDC, the Kingdom Come: Deliverance II multiplayer platform). Any
player types **`/satnik`** and browses every piece of clothing and armour in the game, with inventory icons and exact
names (Czech, English and the item id). Next to the catalogue stands a **mannequin that only this player sees**, and
they try pieces on it, men's and women's. The main use on roleplay servers: a player picks an outfit and **shows it to
a tailor** (exact names and ids, so the tailor knows what to make).

- Catalogue grouped by kind with colour variants inside, filters (men's / women's, body part, kind, clothing / armour),
  sort by body or price, search without diacritics in names and ids.
- Detail with icon, in-game description, names and id (copy buttons), variants, price, weight, layer, defence, charisma.
- Mannequin: click a piece to put it on; pieces on the same body slot replace each other, layers stack. Camera shots
  (full body, torso, head, legs) and rotation (Q / E). "My clothes" dresses the mannequin in what the player wears.
- For the tailor: *Copy list* (names and ids to the clipboard) and *Show to tailor* (the list in chat to players nearby).
- **Private preview:** the mannequin is spawned in a private virtual world of the player, and the player is moved
  there for the duration of the preview, so nobody else sees the mannequin, its clothes or the player browsing. The
  player returns to their own world on close, disconnect, death or a hit. It cannot be used to escape a fight (no
  opening for 20 s after a hit).
- Safe: never gives or takes items, never touches the player's inventory.

## Requirements

| Resource | | |
|---|---|---|
| `satnik` | this repository | catalogue page, mannequin, commands, exports |
| `katalog` | this repository, **required at runtime** | the item data and icons: satnik reads `Exports.get("katalog", "items")` and `Exports.get("katalog", "icon")` while running. Also an admin item browser of its own (`/katalog`, F10) |
| `most`, `sprava` | optional | permissions (`opravneni`) and command help in the F10 admin panel, from [gingy-kcdc](https://github.com/gingygames/gingy-kcdc) |

**No game data is published here.** `katalog` generates its data from **your own game installation** (item tables,
Czech/English names and inventory icons from the game's `.pak` files) into `katalog/gen/`, which is gitignored:

```
cd katalog
npm ci
npm run katalog -- "D:\Games\KingdomComeDeliverance2"   # path to your KCD2 install, ~1.5 min
node tools/build.mjs --out <server>/resources/katalog    # builds dist/katalog with gen/ and deploys it
```

Any other resource named `katalog` with these two exports works too:

- `items(categories: string[]) => KatalogPredmet[]` (called with `["obleceni", "zbroj"]`), the shape is
  `KatalogPredmet` in [satnik/src/core.ts](satnik/src/core.ts): `id` (item class name), `guid` (item class GUID),
  `cs` / `en` names, `kat`, `pod`, `slot`, `vrstva`, `cena`, `vaha`, `ikona`, `kval`, `quest`, `typ`, plus
  `zna`, `oblect`, `pohlavi`, `model`, `popis`, `obrana`, `charisma`.
- `icon(key: string) => string | null`: base64 PNG of the inventory icon for `ikona`.

Without `katalog` the server logs it and `/satnik` tells the player the wardrobe is empty.

## Build and install

```
cd satnik
npm ci
npm test                                                # core + server on a fake KCDC
node tools/build.mjs --out <server>/resources/satnik    # builds dist/satnik and deploys it
```

Settings: `resources/satnik/satnik_config.js` (created from
[satnik/config/satnik_config.example.js](satnik/config/satnik_config.example.js) and never overwritten): command name,
permission, mannequin roles, panel width, "show to tailor" range, close on hit, pause after a hit, private world base.

## Commands

| | |
|---|---|
| `/satnik` | open the wardrobe |
| `/satnik <text or id>` | open with a search |
| `/satnik zavrit` | close (or Esc / ✕) |
| Q / E | rotate the mannequin |

Other resources can open it for a player (e.g. a tailor's shop): `Exports.get("satnik", "open")(playerId, query?)`.
The full API and the page protocol are in [satnik/AGENTS.md](satnik/AGENTS.md) (Czech).

## Documentation

- [satnik/README.md](satnik/README.md): full module description and what is still to verify in game (Czech).
- [satnik/AGENTS.md](satnik/AGENTS.md): exports, page protocol, mannequin internals, rules (Czech).

## For AI agents

See [AGENTS.md](AGENTS.md): layout, commands and rules for agents working in this repository.

## Source

This repository is generated from the monorepo [gingygames/gingy-kcdc](https://github.com/gingygames/gingy-kcdc)
(`satnik`) together with the shared code it uses (same folder layout). Details in [ZDROJ.md](ZDROJ.md).
Report issues here; changes are made in gingy-kcdc and mirrored.

## License

MIT, see [LICENSE](LICENSE).
