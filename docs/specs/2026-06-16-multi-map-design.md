# Multi-Map — Design Spec

**Status:** Approved-pending-review
**Date:** 2026-06-16
**Module:** `hive-cartographer` (extends the v0.1.1 single-hive build)

---

## 1. Purpose

Let a world hold **several named maps** instead of one. The GM can create, rename, and delete maps and pick which are single-layer; every user can browse the maps read-only via a dropdown. Each map keeps the existing layer/region/landmark structure. This implements the deferred §10 item "multiple named maps per world."

Two settled decisions:
- **Map selection is per-user view state** — browsing a map changes only that user's window; map *contents* still sync live.
- **Single-layer is a non-destructive per-map toggle** — flipping it hides the layer controls but never deletes layers.

---

## 2. Data model (v2)

The world setting changes from one hive to a **collection of maps**:

```js
// document (stored in the world setting "hive")
{ version: 2, maps: [ Map, ... ] }

// Map
{ id, name, singleLayer: false, updatedAt: null, layers: [ Layer ] }

// Layer (unchanged)
{ id, name, sub, regions: [ Wedge | Circle ], points: [ Landmark ] }
```

- `updatedAt` moves from the document to **per-map** (each map stamps its own last change; the status bar shows the current map's stamp).
- `singleLayer` is a per-map boolean (default `false`).
- A document always has **≥1 map**; a map always has **≥1 layer** (existing invariant).

### Migration (`migrate`)

`migrate(raw)` handles three shapes, never throws, always returns a valid v2 document:

1. **Garbage / empty** (`null`, `{}`, no usable data) → default document: one map ("New Map") with one empty layer ("Surface").
2. **v1 single-hive** (`raw.layers` is an array, no `raw.maps`) → wrap as the first map: `{ version:2, maps:[ { id, name: raw.name || "Hive", singleLayer:false, updatedAt: raw.updatedAt ?? null, layers: raw.layers (repaired) } ] }`. **Existing worlds upgrade transparently on first load.**
3. **v2** (`raw.maps` is a non-empty array) → repair each map (fill `id/name/singleLayer/updatedAt`, repair `layers`).

`SCHEMA_VERSION` becomes `2`.

### Operations

**Document-scoped (new):**
- `defaultMap(name)` → a map with one empty layer.
- `defaultHive()` → `{ version:2, maps:[ defaultMap("New Map") ] }`.
- `mapById(doc, id)`, `addMap(doc, name)` → id, `removeMap(doc, id)` (refuses the last map → `false`), `renameMap(doc, id, name)`, `setSingleLayer(doc, id, bool)`.

**Map-scoped (existing code, re-pointed):** `layerById`, `addLayer`, `removeLayer`, `moveLayer`, and the entity ops (`addWedge/addCircle/addPoint/findEntity/removeEntity/renameEntity/setColor/bringToFront/sendToBack`) already operate on "a thing with `.layers`"; they now receive the current **Map**. No behaviour change — only the caller passes a map.

`serialize` is unchanged (deep clone of the whole document).

---

## 3. Current map — per-user view state

`HiveApp` holds `#curMapId` (client-side, **not** persisted):
- On open, defaults to `doc.maps[0]`.
- The dropdown sets `#curMapId` and re-renders — for that user only.
- On live sync (setting `onChange` → reload doc), `#curMapId` is kept if that map still exists; otherwise it falls back to `doc.maps[0]` (e.g. the GM deleted the map you were viewing).
- `#cur` (the current **layer** index) resets to 0 when switching maps.

The app's "current map" accessor returns `mapById(this.doc, this.#curMapId) ?? this.doc.maps[0]`, and all layer/entity actions target that map.

---

## 4. UI — map bar + permissions

A new bar across the top of the window (above the existing `hc-main`):

- **Map dropdown** (`<select>`): one option per map (by name), the current selected. Visible to **all** users → browse read-only.
- **GM-only group** (wrapped so the existing `.hive-cart.player … .gm { display:none }` rule hides it for players):
  - **Rename Map** (prompt, renames the current map)
  - **New Map** (prompt for name → `addMap` → switch to it)
  - **Delete Map** (`removeMap`; warns and refuses the last map)
  - **Single-Layer** checkbox bound to the current map's `singleLayer` (`setSingleLayer`)

Persistence (map CRUD + single-layer) is GM-only — enforced by the existing `saveHive` GM guard plus the hidden UI. Selecting a map is never persisted, so players need no write access.

---

## 5. Single-layer behaviour

When the current map's `singleLayer` is true:
- The window root gets a `hc-single` class.
- CSS hides the **cross-section** (`.hc-cross`) and the **layer-management buttons** (Add Layer, Move Up/Down, Rename Layer, Remove Layer — tagged with a shared class, e.g. `hc-layeronly`).
- The view pins to `layers[0]` (`#cur` forced to 0; the cross-section isn't rendered).

Toggling it off restores the cross-section and any extra layers (which were never removed). Toggling on with multiple existing layers simply hides them behind layer 0 until toggled back.

---

## 6. Status bar

Unchanged in form; now reads the **current map's** `updatedAt` for the Imperial sync stamp. `#persist()` stamps the current map's `updatedAt` (GM only) before saving.

---

## 7. Error handling & edge cases

- `migrate` never throws; always ≥1 map, each with ≥1 layer.
- `removeMap` refuses the last map (`false`); `removeLayer` already refuses the last layer.
- Deleting the viewed map → viewer falls back to map 0 on next render.
- A `#curMapId` that no longer resolves → map 0.
- Single-layer map with `#cur > 0` somehow → clamp to 0.

---

## 8. Testing

**Pure-model (Vitest):**
- `migrate`: v1 single-hive → one map wrapping the layers (name + updatedAt carried); v2 preserved; garbage → default one-map document.
- Map CRUD: `addMap` returns id + seeds a layer; `removeMap` drops a map but refuses the last; `renameMap`; `setSingleLayer` flips the flag; `mapById`.
- Re-pointed layer/entity tests operate on `doc.maps[0]`.

**Manual (in Foundry):** dropdown switches maps per-user; rename/new/delete; single-layer toggle hides/shows the cross-section + layer buttons non-destructively; live sync of map contents across two clients; an existing v0.1.1 world upgrades cleanly (its hive becomes map 1).

---

## 9. Out of scope (still deferred)

Per-map player visibility / secret maps, reordering maps, image backgrounds, journal/scene links. (A single-document maps array was chosen over per-map settings to keep live-sync and migration trivial and the data in one place.)
