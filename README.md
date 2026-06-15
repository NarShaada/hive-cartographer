# Hive Cartographer

A standalone, system-agnostic Foundry VTT module: a vertical hive-city map. The GM draws and names
the layers of a hive and the districts, zones and landmarks on each level; players navigate it
read-only. It is a visual aid for "what's where, on which level" — not a battlemap (no tokens, grid,
or distances).

Open it from the **Hive Map** button in the scene controls (or `game.modules.get("hive-cartographer").api.open()`).

Foundry v13+ (verified v14). GPL-3.0.

## Releasing

1. Bump `version` in `module.json`; commit.
2. `bash tools/package.sh` → builds `hive-cartographer.zip`.
3. Create a GitHub release tagged `vX.Y.Z` with **both** `hive-cartographer.zip` and `module.json` attached,
   so the `releases/latest/download/...` URLs in the manifest resolve.

Install URL (Foundry → Install Module → Manifest URL):
`https://github.com/NarShaada/hive-cartographer/releases/latest/download/module.json`
