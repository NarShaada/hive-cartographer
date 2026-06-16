# Region Label Placement — Design Spec

**Status:** Approved-pending-review
**Date:** 2026-06-16
**Module:** `hive-cartographer` (extends v0.1.2)

---

## 1. Purpose

When regions overlap (z-order stacking), a centred label can be hidden under another region. Give each region a per-region **label placement** the GM can cycle through three states so the text can be moved out of the way or hidden:

- **center** — the current behaviour (label at the region's centroid).
- **edge** — the label runs along the region's edge (curved, via SVG `textPath`): the **outer arc** for a wedge, the **bottom arc** for a circle, the **bottom line** for a rectangle.
- **none** — no label drawn.

---

## 2. Data model

Every region (`wedge`, `circle`, `rect`) gains a **`labelPos`** string ∈ `{"center","edge","none"}`, default `"center"`. Additive — the `fix*` helpers fill the default, so existing maps upgrade silently (**no `SCHEMA_VERSION` bump**). Landmarks (`point`) do **not** get `labelPos`.

New op: **`cycleLabelPos(layer, id) → string | false`**. Finds the entity; if it isn't a region (missing id, or a `point`) returns `false`; otherwise advances its `labelPos` `center → edge → none → center` and returns the new value. It is a sibling of `setColor`/`setDescription`.

---

## 3. UI — the Label button

A new **`Label`** button in the GM inspector tool actions (alongside Rename / Recolour / Front / Back / Describe / Delete). Action `label`:
- Requires a selection that is a region: `const v = M.cycleLabelPos(layer, sel)`; if `v === false` → `ui.notifications.warn` ("Pick a district, zone or block."); otherwise persist + re-render so the new placement shows immediately.

The button lives inside `.hc-grp.gm`, so it's hidden from players (players can't change placement; they see whatever the GM set).

---

## 4. Rendering (disk editor)

In the region loop, the label for each region depends on `rg.labelPos` (defaulting to `"center"` if absent):

- **`none`** → emit no label.
- **`center`** → the existing centroid label (wedge: at `polar(rOut·0.6, midAngle)` with `hc-rlabel`; circle/rect: at centre with `hc-clabel`).
- **`edge`** → emit an invisible edge path plus a `textPath` label:
  ```
  <path id="lblpath-<id>" d="<edge path>" fill="none" stroke="none"/>
  <text class="<hc-rlabel|hc-clabel>"><textPath href="#lblpath-<id>" startOffset="50%" text-anchor="middle">name</textPath></text>
  ```
  Edge paths (pixel space; `Rp` = floor radius, `CXp,CYp` = centre):
  - **wedge** — outer arc at `rOut`: `M <pt(a0,rOut·Rp)> A <rOut·Rp> <rOut·Rp> 0 <largeArc> 1 <pt(a1,rOut·Rp)>` where `largeArc = (a1−a0) > 180 ? 1 : 0`.
  - **circle** — bottom arc: `M <cx−r> <cy> A <r> <r> 0 0 1 <cx+r> <cy>` (in px; `r = circle.r·Rp`).
  - **rect** — bottom line: `M <cx−hw> <cy+hh> L <cx+hw> <cy+hh>` (in px).

Path ids are unique per region (`lblpath-<region.id>`). The `textPath` inherits the existing label font/colour (`hc-rlabel`/`hc-clabel`). The path itself is non-rendering (`fill:none; stroke:none`).

**Known limitation (accepted):** because the text follows the geometry, a region near the **bottom** of the disk renders its edge text upside-down — inherent to curved edge labels. No auto-flip. (If a specific arc reads wrong in Foundry, the fix is flipping that arc's sweep flag during manual verification.)

---

## 5. Error handling & edge cases

- `cycleLabelPos` on a missing id or a landmark → `false`, the action warns, nothing changes.
- A region whose `labelPos` is absent (legacy/in-memory) renders as `center` (the render reads `rg.labelPos` with a `center` fallback; `migrate`/`fix*` set it on load).
- `edge` on a zero-or-tiny region still emits a path; the text just has little room (harmless).
- Selection is unaffected — clicking a region with a hidden (`none`) label still selects it (the shape is clickable independent of its label).

---

## 6. Components / files

| File | Change |
|------|--------|
| `scripts/data/hive-model.mjs` | `labelPos` in `fixWedge`/`fixCircle`/`fixRect`; `cycleLabelPos` op. |
| `scripts/apps/disk-editor.mjs` | Per-region label rendering by `labelPos` (center / edge `textPath` / none). |
| `scripts/apps/hive-app.mjs` | `label` action calling `M.cycleLabelPos`. |
| `templates/hive-app.hbs` | The `Label` GM button. |
| `lang/en.json` | `HIVECART.Label`. |
| `test/hive-model.test.mjs` | Tests for `labelPos` default + `cycleLabelPos`. |

---

## 7. Testing

**Pure-model (Vitest):** new regions default `labelPos` to `"center"`; `migrate` fills it on regions that lack it; `cycleLabelPos` advances `center→edge→none→center` and wraps, and returns `false` for an unknown id and for a landmark.

**Manual (Foundry):** select a region, click **Label** repeatedly → centroid → curved edge label (outer arc / bottom arc / bottom line for wedge / circle / rect) → hidden → back; overlap two regions and move the lower one's label to the edge so it's readable; players see the GM's chosen placement and have no Label button.

---

## 8. Out of scope

Landmark label placement, per-region font/size, auto-avoidance of overlaps, fixing the bottom-region upside-down curve (accepted limitation), and any data/sync/permission change beyond the additive `labelPos` field.
