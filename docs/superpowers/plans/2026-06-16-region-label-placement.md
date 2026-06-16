# Region Label Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each region (district/zone/block) a per-region label placement — **center** (current), **edge** (curved text along the region's edge), or **none** (hidden) — cycled by a GM **Label** button, so overlapping regions' labels can be moved out of the way.

**Architecture:** An additive `labelPos` string on regions (default `"center"`) + a `cycleLabelPos` model op (pure, tested). The disk editor centralises label rendering into a `regionLabel(rg)` helper that emits a centroid `<text>`, a `textPath` along a per-type edge path, or nothing. A `label` inspector action cycles the selected region.

**Tech Stack:** Foundry VTT v13+ (verified v14), JavaScript ESM, SVG (`textPath`), Vitest.

**Working directory:** `/Users/suninrags/GolandProjects/hive_cartographer`. Spec: `docs/specs/2026-06-16-region-label-placement-design.md`.

**Context:** Module is built (v0.1.2). Regions are `wedge`/`circle`/`rect`; landmarks are `point`. The model `scripts/data/hive-model.mjs` has `fixWedge`/`fixCircle`/`fixRect` (each already carries a `description` field) and ops like `setColor`/`setDescription`. The disk editor `scripts/apps/disk-editor.mjs` renders each region's shape then a centred `<text>` label (module-level consts `CXp,CYp,Rp`; `polar` imported; `esc` defined). The app `scripts/apps/hive-app.mjs` `#action(act)` has `describe`/`recolour`/etc. Foundry UI isn't auto-tested — `node --check` + manual; deploy with `bash tools/deploy.sh`.

---

## Task 1: Model — `labelPos` + `cycleLabelPos` (pure, TDD)

**Files:**
- Modify: `scripts/data/hive-model.mjs`
- Modify: `test/hive-model.test.mjs`

- [ ] **Step 1: Append tests**

In `test/hive-model.test.mjs`, add `cycleLabelPos` to the existing entity-ops import (the line with `addWedge, addCircle, …, PALETTE`):
```javascript
import { addWedge, addCircle, addPoint, findEntity, removeEntity, renameEntity, setColor, bringToFront, sendToBack, addRect, setDescription, cycleLabelPos, PALETTE } from "../scripts/data/hive-model.mjs";
```
Then append at the end of the file:
```javascript
describe("label placement", () => {
  it("new regions default labelPos to center", () => {
    const d = defaultHive(); const map = d.maps[0]; const L = map.layers[0];
    const id = addWedge(map, L.id, { name: "W" });
    expect(findEntity(L, id).labelPos).toBe("center");
  });
  it("migrate fills labelPos on regions that lack it", () => {
    const d = migrate({ version: 2, maps: [{ layers: [{ regions: [{ type: "circle", cx: 0, cy: 0, r: 0.2 }], points: [] }] }] });
    expect(d.maps[0].layers[0].regions[0].labelPos).toBe("center");
  });
  it("cycleLabelPos advances center→edge→none→center; false for unknown id and landmarks", () => {
    const d = defaultHive(); const map = d.maps[0]; const L = map.layers[0];
    const rid = addRect(map, L.id, { name: "B", cx: 0, cy: 0, hw: 0.2, hh: 0.2 });
    expect(cycleLabelPos(L, rid)).toBe("edge");
    expect(cycleLabelPos(L, rid)).toBe("none");
    expect(cycleLabelPos(L, rid)).toBe("center");
    expect(cycleLabelPos(L, "nope")).toBe(false);
    const pid = addPoint(map, L.id, { name: "P", x: 0, y: 0 });
    expect(cycleLabelPos(L, pid)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- hive-model`
Expected: FAIL — `cycleLabelPos` not exported; `labelPos` undefined on regions.

- [ ] **Step 3: Edit the model**

(a) Add a `labelPos` field to `fixWedge`, `fixCircle`, and `fixRect` (clamped to the valid set). In each, add this line as the last field inside the returned object (after `description: …`):
```javascript
    labelPos: (r.labelPos === "edge" || r.labelPos === "none") ? r.labelPos : "center",
```
So, e.g., `fixWedge` becomes:
```javascript
function fixWedge(r) {
  return {
    id: r.id || newId("w"), type: "wedge",
    name: r.name || "District", color: r.color || PALETTE[0],
    a0: Number.isFinite(r.a0) ? r.a0 : 0, a1: Number.isFinite(r.a1) ? r.a1 : 90, rOut: Number.isFinite(r.rOut) ? r.rOut : 1,
    description: r.description || "",
    labelPos: (r.labelPos === "edge" || r.labelPos === "none") ? r.labelPos : "center",
  };
}
```
Make the same one-line addition to `fixCircle` and `fixRect`.

(b) Add `cycleLabelPos` immediately after the existing `setDescription` function:
```javascript
const LABEL_POS = ["center", "edge", "none"];
// Advance a region's label placement center→edge→none→center. False for an unknown id or a landmark.
export function cycleLabelPos(layer, id) {
  const e = findEntity(layer, id);
  if (!e || e.type === "point") return false;
  const i = Math.max(0, LABEL_POS.indexOf(e.labelPos));
  e.labelPos = LABEL_POS[(i + 1) % LABEL_POS.length];
  return e.labelPos;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 5: Commit**

```bash
git add scripts/data/hive-model.mjs test/hive-model.test.mjs
git commit -m "feat(model): per-region labelPos field + cycleLabelPos (center/edge/none)"
```

---

## Task 2: Disk editor — render labels by `labelPos`

**Files:**
- Modify: `scripts/apps/disk-editor.mjs`

- [ ] **Step 1: Add the `regionLabel` helper (module level)**

Find the module-level `esc` line near the top:
```javascript
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
```
Add right after it:
```javascript

// Label for a region honouring rg.labelPos ("center" | "edge" | "none"). Edge text follows a per-type
// SVG path via <textPath> (wedge: outer arc; circle: bottom arc; rect: bottom line).
function regionLabel(rg) {
  const pos = rg.labelPos === "edge" || rg.labelPos === "none" ? rg.labelPos : "center";
  if (pos === "none") return "";
  const cls = rg.type === "wedge" ? "hc-rlabel" : "hc-clabel";
  if (pos === "center") {
    let lx, ly;
    if (rg.type === "wedge") { [lx, ly] = polar(CXp, CYp, rg.rOut * Rp * 0.6, (rg.a0 + (rg.a1 < rg.a0 ? rg.a1 + 360 : rg.a1)) / 2); }
    else { lx = CXp + rg.cx * Rp; ly = CYp + rg.cy * Rp; }
    return `<text class="${cls}" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${esc(rg.name)}</text>`;
  }
  // edge — curved text along a per-type edge path
  let d;
  if (rg.type === "wedge") {
    const a0 = rg.a0, a1 = rg.a1 < rg.a0 ? rg.a1 + 360 : rg.a1, rr = rg.rOut * Rp;
    const [sx, sy] = polar(CXp, CYp, rr, a0), [ex, ey] = polar(CXp, CYp, rr, a1);
    d = `M ${sx} ${sy} A ${rr} ${rr} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${ex} ${ey}`;
  } else if (rg.type === "rect") {
    const y = CYp + (rg.cy + rg.hh) * Rp;
    d = `M ${CXp + (rg.cx - rg.hw) * Rp} ${y} L ${CXp + (rg.cx + rg.hw) * Rp} ${y}`;
  } else {
    const cx = CXp + rg.cx * Rp, cy = CYp + rg.cy * Rp, rr = rg.r * Rp;
    d = `M ${cx - rr} ${cy} A ${rr} ${rr} 0 0 1 ${cx + rr} ${cy}`;
  }
  return `<path id="lblpath-${rg.id}" d="${d}" fill="none" stroke="none"/>`
    + `<text class="${cls}"><textPath href="#lblpath-${rg.id}" startOffset="50%" text-anchor="middle">${esc(rg.name)}</textPath></text>`;
}
```

- [ ] **Step 2: Replace the three inline label lines with `regionLabel(rg)`**

In the region loop, the **wedge** branch — find:
```javascript
        const [lx, ly] = polar(CXp, CYp, rg.rOut * Rp * 0.6, (rg.a0 + (rg.a1 < rg.a0 ? rg.a1 + 360 : rg.a1)) / 2);
        s += `<text class="hc-rlabel" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${esc(rg.name)}</text>`;
```
Replace with:
```javascript
        s += regionLabel(rg);
```
The **rect** branch — find:
```javascript
        s += `<text class="hc-clabel" x="${CXp + rg.cx * Rp}" y="${CYp + rg.cy * Rp}" text-anchor="middle" dominant-baseline="middle">${esc(rg.name)}</text>`;
```
Replace with:
```javascript
        s += regionLabel(rg);
```
The **circle** (else) branch — find:
```javascript
        s += `<text class="hc-clabel" x="${px}" y="${py}" text-anchor="middle" dominant-baseline="middle">${esc(rg.name)}</text>`;
```
Replace with:
```javascript
        s += regionLabel(rg);
```
(The shape `<path>`/`<rect>`/`<circle>` lines above each label are unchanged. The `[px, py, pr]` locals in the circle branch are still used by the `<circle>` shape line, so leave them.)

- [ ] **Step 3: Verify**

Run: `node --check scripts/apps/disk-editor.mjs` (Expected: no output) and `npm test` (Expected: all pass — pure modules unaffected).

- [ ] **Step 4: Commit**

```bash
git add scripts/apps/disk-editor.mjs
git commit -m "feat(ui): render region labels by labelPos (center / curved edge textPath / none)"
```

---

## Task 3: App + template + lang — the Label button

**Files:**
- Modify: `scripts/apps/hive-app.mjs`
- Modify: `templates/hive-app.hbs`
- Modify: `lang/en.json`

- [ ] **Step 1: Add the `label` action (`hive-app.mjs`)**

In `#action(act)`, find the `describe` line:
```javascript
    else if (act === "describe") { const e = this.#sel && M.findEntity(L, this.#sel); if (!e) return ui.notifications.warn("Select something first."); const text = await promptDescription(e.description ?? ""); if (text !== null && this.element?.isConnected) { M.setDescription(L, this.#sel, text); this.#persist(); this.#renderAll(); } }
```
Add this line right after it:
```javascript
    else if (act === "label") { if (M.cycleLabelPos(L, this.#sel) === false) return ui.notifications.warn("Pick a district, zone or block."); this.#persist(); this.#renderAll(); }
```

- [ ] **Step 2: Add the Label button (`templates/hive-app.hbs`)**

Find:
```handlebars
              <button class="hc-tool" data-act="describe">{{localize "HIVECART.Describe"}}</button>
              <button class="hc-tool" data-act="delete">{{localize "HIVECART.Delete"}}</button>
```
Replace with:
```handlebars
              <button class="hc-tool" data-act="describe">{{localize "HIVECART.Describe"}}</button>
              <button class="hc-tool" data-act="label">{{localize "HIVECART.Label"}}</button>
              <button class="hc-tool" data-act="delete">{{localize "HIVECART.Delete"}}</button>
```

- [ ] **Step 3: Add the language key (`lang/en.json`)**

Find:
```json
  "HIVECART.Describe": "Description",
```
Replace with:
```json
  "HIVECART.Describe": "Description",
  "HIVECART.Label": "Label",
```

- [ ] **Step 4: Verify**

Run: `node --check scripts/apps/hive-app.mjs` (no output); `node -e "JSON.parse(require('fs').readFileSync('lang/en.json','utf8'));console.log('lang ok')"` (`lang ok`); `npm test` (all pass).

- [ ] **Step 5: Manual check (deploy + reload Foundry)**

Run `bash tools/deploy.sh`, reload. Select a region and click **Label** repeatedly: centroid label → curved edge label (outer arc for a wedge, bottom arc for a circle, bottom line for a block) → hidden → back to centroid. Overlap two regions, move the lower one's label to the edge → it's readable beside the overlap. A player sees the GM's chosen placement and has no Label button. **If any edge label renders upside-down or on the wrong side** (expected for regions near the bottom of the disk), note which; a single arc `sweep` flag flip in `regionLabel` adjusts it — but per the spec this is an accepted limitation, so only change it if it's clearly wrong for the common (top/side) case.

- [ ] **Step 6: Commit**

```bash
git add scripts/apps/hive-app.mjs templates/hive-app.hbs lang/en.json
git commit -m "feat(ui): Label button cycles selected region's label placement"
```

---

## Done criteria

- `npm test` green (`labelPos` default/migrate + `cycleLabelPos`).
- In Foundry: the Label button cycles a selected region's label center → curved edge → hidden → center; landmarks and players are unaffected.

## Out of scope

Landmark label placement, per-region font/size, overlap auto-avoidance, fixing bottom-region upside-down curves (accepted), any data/sync/permission change beyond the additive `labelPos`.
