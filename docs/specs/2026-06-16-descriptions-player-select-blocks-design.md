# Descriptions + Player Click-to-Select + Blocks — Design Spec

**Status:** Approved-pending-review
**Date:** 2026-06-16
**Module:** `hive-cartographer` (extends the unreleased multi-map + dialogs build)

---

## 1. Purpose

Three related additions, bundled:

1. **Descriptions** — the GM gives each item (district / zone / landmark / block) a free-text description, shown in the Selection panel and visible to everyone.
2. **Player click-to-select** — players can click a shape to select it and read its description, with **no** editing controls.
3. **Blocks** — a fourth, rectangular region type ("nothing fancy").

---

## 2. Data model

### Descriptions (additive)
Every entity (`wedge`, `circle`, `point`, and the new `rect`) gains a **`description`** string. The `fix*` repair helpers fill `description: r.description || ""`, so existing data upgrades silently — **no `SCHEMA_VERSION` bump**.

New op: **`setDescription(layer, id, text) → boolean`** (false if the id isn't found). It is a sibling of `renameEntity`/`setColor` and works on any entity (regions and points).

### Blocks (new region type `rect`)
```js
{ id, type:"rect", name, color, cx, cy, hw, hh, description }
```
- `cx,cy` ∈ [-1,1] (centre), `hw,hh` ∈ [0,1] (half-width / half-height) — mirrors how a circle stores `cx,cy,r`.
- `fixRect(r)` repairs/defaults the fields (`hw`/`hh` default `0.15`, like a circle's `r`).
- `fixLayer` routing becomes: `r.type === "circle" → fixCircle`, `r.type === "rect" → fixRect`, else `fixWedge` (wedge stays the default fallback, so unknown/legacy region types are treated as wedges as today).
- **`addRect(map, layerId, { name, color, cx, cy, hw, hh }) → id`** (sibling of `addCircle`).
- A `rect` is a region with a `color`, so the generic ops already cover it: `findEntity`, `removeEntity`, `renameEntity`, `setColor`, `bringToFront`, `sendToBack`, `setDescription`.

---

## 3. Dialogs

New helper in `scripts/apps/dialogs.mjs`:
- **`promptDescription(current) → Promise<string|null>`** — a `DialogV2` with a `<textarea name="text">` seeded with `current` (multiline). OK resolves to the textarea value (trimmed, **may be empty** — an empty description is a valid "clear it" result, so this returns `""` rather than `null` on empty-but-confirmed; `null` only on cancel/close). Focus the textarea on render.

(Distinct from `promptText`, which returns `null` on empty — descriptions must be clearable.)

---

## 4. GM editing — the Describe button

A new **`Describe`** button in the inspector's GM tool actions (alongside Rename/Recolour/Front/Back/Delete). Action `describe`:
- Requires a selection (else `ui.notifications.warn`).
- `const text = await promptDescription(entity.description ?? "")`; if `text !== null && this.element?.isConnected` → `M.setDescription(layer, sel, text)` → persist → render.

Because the button lives inside `.hc-grp.gm`, it's hidden from players automatically.

---

## 5. Selection panel (everyone)

`#renderInfo` renders, below the existing name + kind tag, a **description block**:
- If the entity has a non-empty `description`: show it (escaped, white-space preserved for line breaks).
- If empty: the **GM** sees a muted "No description" hint (so they know the Describe button exists); a **player** sees nothing extra.

The Selection panel is already outside the `.hc-grp.gm` group, so players see it. Whether the viewer is GM is read from `game.user.isGM` in `#renderInfo`.

---

## 6. Player click-to-select (read-only)

The disk editor currently gates **all** interaction behind `isGM()`. Changes (in `scripts/apps/disk-editor.mjs`):

- **`clickable`** drops the `gm &&` requirement → `clickable = selectMode`. Players are always in select mode (they have no tool buttons), so their shapes become clickable. (Shapes/landmarks get the `clickable` class → pointer cursor + click handler via the existing `data-id` mechanism.)
- **`onDown`**: remove the top-level `if (!ctx.isGM() …) return`. In select mode, clicking a shape calls `ctx.select(id)` for everyone; **only a GM** then starts a move drag (`selDrag`). A non-GM selects and stops. The draw-mode branch and the handle-drag branch are guarded by `ctx.isGM()` (players never have non-select modes or handles, but guard defensively).
- **Selection handles** render only for the GM: `if (gm && clickable && sel)`.
- **CSS**: the "move" cursor on a selected shape is scoped to the GM — `.hive-cart:not(.player) .hc-disk:not(.draw) .hc-region.sel, … .hc-pmark.sel { cursor:move }`. Players keep the plain pointer.

Net for a player: click any region/landmark → Selection panel shows its name + description; nothing else is interactive.

---

## 7. Blocks — disk editor

- **Render**: a `rect` draws as `<rect class="hc-region…" x="${cx-hw}" y="${cy-hh}" width="${2*hw}" height="${2*hh}" fill="${color}" …/>` (pixels = unit × `Rp`, offset from centre) plus a centre label (`hc-clabel`, like a zone).
- **Draw** (`mode === "rect"`): press = one corner, drag = opposite corner; the gesture stores the two corners; the preview is a dashed `<rect>`. On release (min size guard, e.g. `hw ≥ 0.04 && hh ≥ 0.04`) → name dialog → `ctx.addRect({ name, color, cx, cy, hw, hh })` where `cx,cy` is the box centre and `hw,hh` the half-extents.
- **Move**: translate `cx,cy` (same as circle/point).
- **Resize**: one corner handle at `(cx+hw, cy+hh)`; dragging it sets `hw = |ux-cx|`, `hh = |uy-cy|` (centre fixed). Minimums clamped like other shapes.
- **Tool button**: a new **Block** mode button (`data-mode="rect"`) in the inspector modes grid. Lang adds `HIVECART.Block` + `HIVECART.PromptBlock` ("Name the block:").

---

## 8. Error handling & edge cases

- `setDescription` on a missing id → `false`, no-op.
- `promptDescription` cancel → `null` → no change; confirmed-empty → `""` → clears the description.
- A `rect` drawn below the minimum size is discarded (like a too-small circle).
- Player clicking empty space → `ctx.select(null)` (deselect) — harmless, read-only.
- Mid-dialog window close → the `this.element?.isConnected` guard prevents a stale write (same pattern as the other dialogs).
- Unknown legacy region `type` → `fixLayer` falls through to `fixWedge` (unchanged behaviour).

---

## 9. Testing

**Pure-model (Vitest):**
- `description` defaults to `""` on new entities and survives `migrate`; `setDescription` sets text and returns `false` for an unknown id.
- `addRect` creates a `rect` with the given geometry + `description:""`; `fixLayer` routes a `type:"rect"` through `fixRect`; `findEntity`/`removeEntity`/`setColor`/`bringToFront` work on a rect.

**Manual (Foundry):** GM adds a description via the Describe dialog → it shows in Selection; a player (second client) clicks a shape, sees name + description, has no tools and can't drag; GM draws a Block (drag a box), moves/resizes/recolours/describes/deletes it like a zone; the block z-orders with front/back.

---

## 10. Out of scope

No per-item player-visibility / secret descriptions (descriptions are shared), no rich text (plain multiline), no rotation for blocks (axis-aligned only), no new map/sync/permission changes.
