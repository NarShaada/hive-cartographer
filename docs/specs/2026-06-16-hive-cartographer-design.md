# Hive Cartographer — Design Spec

**Status:** Approved-pending-review
**Date:** 2026-06-16
**Type:** New standalone Foundry VTT **module** (system-agnostic), companion to `better-dh2e`.

---

## 1. Purpose

A GM-curated **visual aid** for navigating a hive city — *not* a battlemap. It answers "what's where, and on which level?" with atmosphere, not tokens or grids.

The defining trait of a hive is **vertical stacking**: levels piled atop one another. The module renders a generic vertical **cross-section** of the hive; clicking a level opens that level as a **circular floor** divided into named **districts**, **zones**, and **landmarks**. The GM draws and labels these; players navigate and read them.

It ships **content-free** and **system-agnostic** (declares no system dependency), so it works in any world. It is distributed and developed **separately** from `better-dh2e`.

### Non-goals (v1, YAGNI)
- No tokens, grid, distances, line-of-sight, or combat — it is a reference picture, not a scene.
- No uploaded images / photo backgrounds — the hive silhouette and floors are drawn as vectors, fully generic.
- No per-region player-visibility/fog, no GM-secret notes, no journal/scene linking — listed as **Future** (§10).
- A single hive per world (one map). The data model is wrapped so a multi-map list can be added later without migration pain.

---

## 2. Architecture Overview

A Foundry **module** (`module.json`, no system tie), Foundry **v13+** (verified target v14), pure ESM + SVG, **no build step** (mirrors the `better-dh2e` toolchain).

```
┌──────────────────────────────────────────────────────────┐
│ Scene-controls button  ──►  HiveApp (ApplicationV2)        │
│                                                            │
│   ┌─────────────┬───────────────────────┬──────────────┐  │
│   │ CrossSection │   DiskEditor (SVG)     │  Inspector   │  │
│   │ (layer stack)│  districts/zones/      │  GM tools /  │  │
│   │  click=layer │  landmarks + handles   │  selection   │  │
│   └─────────────┴───────────────────────┴──────────────┘  │
│            ▲                    │                          │
│      render│            model changes                     │
│            │                    ▼                          │
│        HiveModel (pure) ◄──► Store (world setting + sync)  │
└──────────────────────────────────────────────────────────┘
```

**Data flow (GM edit → player sees it):**
1. GM interaction (draw / move / resize / rename) mutates the in-memory `HiveModel`.
2. `HiveApp` re-renders immediately and asks `Store` to persist (debounced).
3. `Store.save()` writes the whole hive JSON to a **world-scoped game setting** (GM-only writable).
4. Foundry fires the setting's `onChange` on **every** connected client.
5. Each client's open `HiveApp` reloads the model from the setting and re-renders. → live sync, no custom sockets.

**Permissions:** world-scoped settings are writable only by GMs and readable by all. The Inspector's draw/edit tools render only for `game.user.isGM`; `Store.save()` additionally no-ops for non-GMs as a guard.

---

## 3. Data Model

Stored as one JSON object in the world setting. Geometry is **normalized** (resolution-independent) so the floor can render at any size and a window resize never corrupts data.

```js
// hive
{
  version: 1,
  name: "Hive Primaris",
  layers: [ Layer, ... ]            // index 0 = topmost (Spire); last = bottom (Sump)
}

// Layer
{
  id, name, sub,                    // sub = short descriptor under the title
  regions: [ Wedge | Circle, ... ],
  points:  [ Landmark, ... ]
}

// Wedge  — a pie-sector district anchored at the floor centre
{ id, type:"wedge",  name, color, a0, a1, rOut }
//   a0,a1 : degrees, a0<a1 (clockwise sweep); rOut : 0..1 fraction of floor radius

// Circle — a free-floating zone (the central transit hub is just the default one)
{ id, type:"circle", name, color, cx, cy, r }
//   cx,cy : −1..1 disk coords (0,0 = centre); r : 0..1 fraction of floor radius

// Landmark — a named point marker ("Cathedral of …")
{ id, type:"point",  name, x, y }
//   x,y : −1..1 disk coords
```

**Defaults / new entities:** a fresh world seeds one empty layer containing a single central `circle` named "Spinal Transit". A new layer seeds the same. IDs are short unique strings (`foundry.utils.randomID()`).

**Normalization:** `Geometry` converts between stored units and pixels using the live floor radius `R_px`: `px = centre + unit * R_px`; angle math in degrees. The disk always renders centred in its container at the largest radius that fits.

---

## 4. Components (files & responsibilities)

Each unit is small and single-purpose; pure logic is separated from Foundry/DOM so it is unit-testable.

| File | Responsibility |
|------|----------------|
| `module.json` | Manifest: id `hive-cartographer`, no `system`, ESM entry, styles, compatibility v13+. |
| `scripts/hive-cartographer.mjs` | Entry. `init`: register the world setting + its `onChange`. `getSceneControlButtons`: add a "Hive Map" tool that opens `HiveApp`. |
| `scripts/data/hive-model.mjs` | **Pure.** Schema/defaults, factory helpers, CRUD ops (`addLayer`, `removeLayer`, `moveLayer`, `addRegion`, `addPoint`, `updateEntity`, `removeEntity`, `renameEntity`, `recolour`), serialize/deserialize, `migrate(raw)`. No Foundry imports. |
| `scripts/geometry.mjs` | **Pure.** `wedgePath`, angle/point/distance math, unit↔pixel mapping, `hitTest(model, px)`, layer-stack band widths for N layers. No DOM. |
| `scripts/data/store.mjs` | Persistence: `load()` (read setting → `migrate` → model), `save(model)` (GM-only, debounced write), `subscribe(cb)` (fires on setting `onChange`). |
| `scripts/apps/hive-app.mjs` | `ApplicationV2` (+ HandlebarsApplicationMixin). Owns current layer index + selection + tool mode + role gating. Composes the three panels; routes model changes → `Store.save` + re-render. |
| `scripts/apps/cross-section.mjs` | Renders the tapering layer stack from `model.layers` (computed bands, no fixed table), highlights the active layer, emits `selectLayer(i)`. |
| `scripts/apps/disk-editor.mjs` | The SVG floor: renders wedges/circles/points + selection handles; pointer-driven **draw** (drag-to-size), **move** (rotate wedge / translate zone+point), **resize** (handles); emits model mutations. |
| `templates/hive-app.hbs` | Window shell (header, three-panel layout, inspector controls). SVG is injected into containers by the panels. |
| `styles/hive-cartographer.css` | Grimdark "cogitator" theme (scanlines, vignette, Cinzel/Barlow Condensed/IBM Plex Mono, gold-on-near-black) — ported from the approved mockup. |
| `lang/en.json` | All user-facing strings. |
| `test/*.test.mjs` | Vitest unit tests for `geometry` + `hive-model`. |

The approved interactive mockup at `BetterDH2-mockups/hive-map-mockup.html` is the visual + interaction reference for `disk-editor`, `cross-section`, and the CSS.

---

## 5. Interaction Model (GM)

Tool modes in the Inspector: **Select · District · Zone · Landmark**.

- **District / Zone (draw):** press-drag on the floor. District = sweep sets angular width, distance sets radius; Zone = press at centre, drag out for radius. Release → prompt name → create. Ignore sub-threshold drags.
- **Landmark:** click a spot → prompt name → drop a marker.
- **Select:** click to select. Drag the **body** to move — districts **rotate** about the centre (they are centre-anchored), zones & landmarks **translate**. Drag the gold **handles** to resize: zones have a rim handle; districts have two edge handles (angular width) + one radius handle. Landmarks are move-only.
- **Selected entity:** Rename, Recolour (cycle palette), Delete.
- **Layers:** Add, Rename, Remove, and **reorder up/down** (vertical order is meaningful).

**Players:** read-only. Tools hidden; they may switch layers and select/read entities only.

---

## 6. Foundry Integration Details

- **Launcher:** `getSceneControlButtons` adds a tool (own group or under an existing group) with a hive icon → `new HiveApp().render(true)`. Visible to all users.
- **Setting:** `game.settings.register("hive-cartographer", "hive", { scope:"world", config:false, type:Object, default:<seed>, onChange })`. `onChange` → `Store` notifies subscribers → open app reloads + re-renders.
- **Save cadence:** mutations mark the model dirty; a short debounce (~300 ms) coalesces drag streams into one write to avoid setting-write spam during a drag. A final write fires on pointer-up.
- **App:** `ApplicationV2` + `HandlebarsApplicationMixin`, resizable window; panels render SVG strings into their containers and (re)bind pointer handlers after each render — same pattern as the mockup.

---

## 7. Rendering

SVG throughout (crisp at any zoom, trivially hit-testable, no canvas state):
- **Cross-section:** stacked clip-path/`polygon` bands whose widths are computed to taper from a narrow top to a wide base across `N` layers (generalized from the mockup's fixed table). Active layer glows gold.
- **Floor:** outer ring + cogitator ticks, then wedges, then circles, then landmark markers + labels, then selection handles, then live draw-preview (z-order). Re-rendered on every change; cheap at this element count.

---

## 8. Error Handling & Edge Cases

- **Missing/corrupt setting:** `migrate` returns a valid default hive (one seeded layer); never throws into the UI.
- **Versioning:** `version` field; `migrate(raw)` upgrades older shapes. v1 just validates and fills defaults.
- **Non-GM write attempt:** `Store.save` no-ops (defence in depth beyond hidden UI).
- **Degenerate draws:** drags below a minimum span/radius are discarded; radii clamp to the floor; wedge `a1` normalized to exceed `a0`.
- **Empty layer / empty hive:** render the bare floor (ring + hub); cross-section always shows at least one band.
- **Concurrent GMs:** single-GM-editing assumption; last write wins (acceptable for a reference aid).

---

## 9. Testing

**Automated (Vitest, pure units):**
- `geometry`: unit↔pixel round-trip; angle/distance helpers; `wedgePath` well-formed; `hitTest` picks the right entity (wedge by angle+radius, circle by distance, point by proximity); layer-band widths monotonic & within bounds for N = 1…12.
- `hive-model`: serialize→deserialize round-trip; `addLayer`/`removeLayer`/`moveLayer` reorder correctly; `addRegion`/`addPoint`/`removeEntity`/`renameEntity`/`recolour`; `migrate` repairs missing/corrupt input to a valid hive.

**Manual:** the editor interactions (draw/move/resize), live GM→player sync across two clients, scene-control launch, theme look. (DOM/pointer UI is not unit-tested — same stance as the system.)

---

## 10. Future Enhancements (out of v1 scope)

- Multiple named maps per world (hive + other locations) via a top-level map list.
- GM-only description/notes per entity, and per-entity player visibility (reveal-as-you-go).
- Link an entity to a JournalEntry or Scene (click-through).
- Import/export a hive as JSON; a small library of preset hive silhouettes.
- Snap/grid aids for tidy district edges.

---

## 11. Module Identity & Location

- **Name:** Hive Cartographer · **id:** `hive-cartographer` · **License:** GPL-3.0 (matches the system).
- **Repo:** new standalone public GitHub repo, its own release/manifest flow (same pattern as `better-dh2e`).
- **Dev location:** a sibling project directory (decided at plan time), independent of the `better-dh2e` working tree.
