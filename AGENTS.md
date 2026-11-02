# Guidelines for AI agents working in this repository

You are in **kcdc-satnik**, the Wardrobe resource for Kingdoms Connected (KCDC, Kingdom Come: Deliverance II
multiplayer). Read this file first, then [satnik/AGENTS.md](satnik/AGENTS.md) (API, page protocol, mannequin) and
[satnik/README.md](satnik/README.md) (full description). Code identifiers, comments and the module docs are Czech;
this file and the root README are English.

## This repository is a mirror

- Generated from the monorepo [gingygames/gingy-kcdc](https://github.com/gingygames/gingy-kcdc) by
  `tools/zrcadlo.mjs` (commit in [ZDROJ.md](ZDROJ.md)). Changes made here get overwritten by the next mirror.
- If you work for someone **adapting the wardrobe to their server**: use `satnik_config.js` and the exports
  (`open`, `close`, `get`, `search`, `outfit`) from *their own* resource. Then upgrading to a newer mirror is a drop-in
  replacement.
- If you **change the wardrobe itself**: make the change in gingy-kcdc (`satnik/`), run its tests, regenerate the
  mirror. A pull request here is welcome as a proposal; it will be ported by hand.
- `ui-kit/` is **shared code copied from the monorepo** (the look of the page). Do not edit it here. It keeps the
  monorepo layout so relative paths work unchanged.

## Layout

| Path | What |
|---|---|
| `satnik/src/core.ts` | game-free core: catalogue groups and variants, search, which pieces replace each other, camera shot math |
| `satnik/src/server.ts` | server: `/satnik`, mannequin NPC in the player's private virtual world, dressing, camera, exports |
| `satnik/src/client.ts` | client: opens the web view, forwards messages, disables controls while open |
| `satnik/src/shared.ts` | event names and message types between server, client and page |
| `satnik/ui/` | the page (ES5, `ui-kit`) |
| `satnik/test/` | `satnik.test.ts` (core), `server.test.ts` on the fake KCDC `fake-kcdc.ts` (vitest) |
| `satnik/tools/build.mjs` | builds `dist/satnik` (`--out <server>/resources/satnik` deploys) |
| `satnik/tools/ui-dev.mjs` | page preview without the game; needs generated `katalog` data next to `satnik/` |
| `katalog/` | resource `katalog`: item data and icons generated from the user's own game install (`npm run katalog -- <game dir>` → `katalog/gen/`, gitignored), admin item browser; API in [katalog/AGENTS.md](katalog/AGENTS.md) |

## Commands

```
cd satnik
npm ci
npm test                  # must pass before you finish (also in katalog/)
node tools/build.mjs      # typechecks server and client (tsc) and builds dist/satnik
```

## Rules

1. **The wardrobe never changes a player's inventory** and never gives items. It only dresses the mannequin.
2. **The preview stays private.** The mannequin is created directly in the private world `svet + playerId`
   (`Npc.create({ virtualWorld })`), the player is moved there while browsing and back on close. `setVisibleTo` alone
   is not enough: `Npc.create` replicates the NPC to nearby clients before it applies. Anything new that the mannequin
   does must keep `server.test.ts` green (`npc.videli` = who ever received the mannequin must be only its owner).
3. **Clean up on every exit:** close, disconnect, death, hit, resource stop, and a restart without stop (the new
   instance removes leftover mannequins and returns players from private worlds).
4. **Logic goes into `src/core.ts` with a test.** The server only connects KCDC APIs. A new KCDC call needs the matching
   behaviour in `test/fake-kcdc.ts`, written from the docs in `@kingdomsconnected/types`.
5. **No game data in this repository.** Item data and icons come from the `katalog` resource at runtime, generated
   locally into `katalog/gen/` (gitignored). Do not commit anything extracted from the game (icons, tables, models).
6. **No global keys.** KCDC modules open menus with chat commands (`/satnik`), not `Key.bind` on random keys. Q / E
   work only inside the open page.
7. Keep every event under the KCDC limit (~64 KB): result pages of 120 rows, icons in batches up to 40 000 characters.
8. Player-facing texts are Czech in the code; keep them short and keep log lines prefixed `[satnik]`.

## Before you finish

- `npm test` passes and `node tools/build.mjs` typechecks.
- New config keys are in `config/satnik_config.example.js` and `satnik/README.md`.
- In-game behaviour you could not verify is listed for the human (the tests use a fake KCDC).
