# Descriptions + Player Click-to-Select + Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-entity GM **descriptions** (shown in the Selection panel to everyone), **read-only player click-to-select**, and a new **block** (rectangle) region type.

**Architecture:** Additive `description` string on every entity (+ `setDescription`) with a `promptDescription` textarea dialog and a GM **Describe** button. A new `rect` region type (`cx,cy,hw,hh`) reusing the generic region ops. The disk editor lets non-GMs select (but not edit) and gains rect render/draw/move/resize.

**Tech Stack:** Foundry VTT v13+ (verified v14), JavaScript ESM, SVG, `DialogV2`, Vitest.

**Working directory:** `/Users/suninrags/GolandProjects/hive_cartographer`. Spec: `docs/specs/2026-06-16-descriptions-player-select-blocks-design.md`.

**Context:** Module is built (multi-map + dialogs on `main`, deployed, unreleased). Pure model: `scripts/data/hive-model.mjs`. Dialogs: `scripts/apps/dialogs.mjs` (`DialogV2`). App: `scripts/apps/hive-app.mjs` (`#action`, `#ctx`, `#renderInfo`). Draw tools: `scripts/apps/disk-editor.mjs`. Foundry UI isn't auto-tested — `node --check` + manual checklist; deploy with `bash tools/deploy.sh`.

---

## Task 1: Model — `description` + `setDescription` + `rect` type (pure, TDD)

**Files:**
- Modify: `scripts/data/hive-model.mjs`
- Modify: `test/hive-model.test.mjs`

- [ ] **Step 1: Append tests**

In `test/hive-model.test.mjs`, add `addRect` and `setDescription` to the existing entity-ops import (line 5 — the one importing `addWedge, addCircle, …`), so it reads:
```javascript
import { addWedge, addCircle, addPoint, findEntity, removeEntity, renameEntity, setColor, bringToFront, sendToBack, addRect, setDescription, PALETTE } from "../scripts/data/hive-model.mjs";
```
Then append at the end of the file:
```javascript
describe("descriptions", () => {
  it("new entities default description to empty string", () => {
    const d = defaultHive(); const map = d.maps[0]; const L = map.layers[0];
    const wid = addWedge(map, L.id, { name: "W" });
    expect(findEntity(L, wid).description).toBe("");
  });
  it("setDescription sets text; false for an unknown id", () => {
    const d = defaultHive(); const map = d.maps[0]; const L = map.layers[0];
    const cid = addCircle(map, L.id, { name: "Z", cx: 0, cy: 0, r: 0.2 });
    expect(setDescription(L, cid, "A safe house.")).toBe(true);
    expect(findEntity(L, cid).description).toBe("A safe house.");
    expect(setDescription(L, "nope", "x")).toBe(false);
  });
  it("migrate fills description on entities that lack it", () => {
    const raw = { version: 2, maps: [{ name: "M", layers: [{ regions: [{ type: "circle", cx: 0, cy: 0, r: 0.2 }], points: [{ x: 0, y: 0 }] }] }] };
    const d = migrate(raw);
    expect(d.maps[0].layers[0].regions[0].description).toBe("");
    expect(d.maps[0].layers[0].points[0].description).toBe("");
  });
});

describe("blocks (rect)", () => {
  it("addRect creates a rect region with geometry + empty description", () => {
    const d = defaultHive(); const map = d.maps[0]; const L = map.layers[0];
    const id = addRect(map, L.id, { name: "Block A", cx: 0.2, cy: -0.1, hw: 0.3, hh: 0.2 });
    const r = findEntity(L, id);
    expect(r.type).toBe("rect"); expect(r.hw).toBe(0.3); expect(r.hh).toBe(0.2); expect(r.description).toBe("");
  });
  it("migrate routes a type:rect region through fixRect (defaults hw/hh)", () => {
    const d = migrate({ version: 2, maps: [{ layers: [{ regions: [{ type: "rect", cx: 0, cy: 0 }], points: [] }] }] });
    const r = d.maps[0].layers[0].regions[0];
    expect(r.type).toBe("rect"); expect(r.hw).toBe(0.15); expect(r.hh).toBe(0.15);
  });
  it("generic ops work on a rect (setColor, bringToFront, remove)", () => {
    const d = defaultHive(); const map = d.maps[0]; const L = map.layers[0];
    const a = addRect(map, L.id, { name: "A", cx: 0, cy: 0, hw: 0.2, hh: 0.2 });
    addWedge(map, L.id, { name: "B" });
    expect(setColor(L, a, "#123456")).toBe(true);
    expect(bringToFront(L, a)).toBe(true);
    expect(L.regions[L.regions.length - 1].id).toBe(a);
    expect(removeEntity(L, a)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- hive-model`
Expected: FAIL — `addRect`/`setDescription` not exported; `description` undefined on entities.

- [ ] **Step 3: Update the model**

In `scripts/data/hive-model.mjs`:

(a) Add `description: r.description || ""` to `fixWedge` and `fixCircle`, and `description: p.description || ""` to `fixPoint`. The three functions become:
```javascript
function fixWedge(r) {
  return {
    id: r.id || newId("w"), type: "wedge",
    name: r.name || "District", color: r.color || PALETTE[0],
    a0: Number.isFinite(r.a0) ? r.a0 : 0, a1: Number.isFinite(r.a1) ? r.a1 : 90, rOut: Number.isFinite(r.rOut) ? r.rOut : 1,
    description: r.description || "",
  };
}
function fixCircle(r) {
  return {
    id: r.id || newId("c"), type: "circle",
    name: r.name || "Zone", color: r.color || PALETTE[1],
    cx: Number(r.cx) || 0, cy: Number(r.cy) || 0, r: Number.isFinite(r.r) ? r.r : 0.15,
    description: r.description || "",
  };
}
function fixPoint(p) {
  return { id: p.id || newId("p"), type: "point", name: p.name || "Landmark", x: Number(p.x) || 0, y: Number(p.y) || 0, description: p.description || "" };
}
```

(b) Add `fixRect` immediately after `fixPoint`:
```javascript
function fixRect(r) {
  return {
    id: r.id || newId("r"), type: "rect",
    name: r.name || "Block", color: r.color || PALETTE[3],
    cx: Number(r.cx) || 0, cy: Number(r.cy) || 0,
    hw: Number.isFinite(r.hw) ? r.hw : 0.15, hh: Number.isFinite(r.hh) ? r.hh : 0.15,
    description: r.description || "",
  };
}
```

(c) In `fixLayer`, update the regions mapping to route `rect`:
```javascript
  const regions = Array.isArray(L.regions)
    ? L.regions.map((r) => (r.type === "circle" ? fixCircle(r) : r.type === "rect" ? fixRect(r) : fixWedge(r))) : [];
```

(d) Add `addRect` immediately after `addCircle`:
```javascript
export function addRect(map, layerId, props) {
  const L = layerById(map, layerId); if (!L) return null;
  const c = fixRect({ ...props });
  L.regions.push(c);
  return c.id;
}
```

(e) Add `setDescription` immediately after `setColor`:
```javascript
export function setDescription(layer, id, text) {
  const e = findEntity(layer, id); if (!e) return false;
  e.description = text; return true;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 5: Commit**

```bash
git add scripts/data/hive-model.mjs test/hive-model.test.mjs
git commit -m "feat(model): per-entity description + setDescription; rect (block) region type with addRect/fixRect"
```

---

## Task 2: Dialog + language strings

**Files:**
- Modify: `scripts/apps/dialogs.mjs`
- Modify: `lang/en.json`

- [ ] **Step 1: Add `promptDescription` to `dialogs.mjs`**

Append this exported function at the end of `scripts/apps/dialogs.mjs`:
```javascript
// Multi-line description editor. Resolves to the text (may be empty — clears the description), or null on cancel.
export async function promptDescription(current) {
  const res = await DialogV2.prompt({
    window: { title: L("HIVECART.DescribeTitle") },
    content: `<div class="hc-dialog"><label>${L("HIVECART.Describe")}</label><textarea name="text" rows="5">${esc(current)}</textarea></div>`,
    ok: { label: L("HIVECART.OK"), callback: (e, button) => button.form.elements.text.value.trim() },
    rejectClose: false,
    render: (e, dialog) => { const t = dialog.element.querySelector('textarea[name="text"]'); if (t) t.focus(); },
  });
  return res ?? null;
}
```
(`res ?? null` keeps an empty-but-confirmed `""` distinct from a cancelled `null`.)

- [ ] **Step 2: Add language keys to `lang/en.json`**

Find:
```json
  "HIVECART.Hex": "Hex (overrides)"
```
Replace with (comma added):
```json
  "HIVECART.Hex": "Hex (overrides)",
  "HIVECART.Block": "Block",
  "HIVECART.PromptBlock": "Name the block:",
  "HIVECART.Describe": "Description",
  "HIVECART.DescribeTitle": "Edit Description",
  "HIVECART.NoDescription": "No description — use Describe to add one."
```

- [ ] **Step 3: Verify**

Run: `node --check scripts/apps/dialogs.mjs` (no output) and `node -e "JSON.parse(require('fs').readFileSync('lang/en.json','utf8'));console.log('lang ok')"` (`lang ok`).

- [ ] **Step 4: Commit**

```bash
git add scripts/apps/dialogs.mjs lang/en.json
git commit -m "feat(ui): promptDescription dialog + Block/Describe language strings"
```

---

## Task 3: App + template + CSS — Describe action, Selection description, Block tool button, addRect

**Files:**
- Modify: `scripts/apps/hive-app.mjs`
- Modify: `templates/hive-app.hbs`
- Modify: `styles/hive-cartographer.css`

- [ ] **Step 1: Import `promptDescription` in `hive-app.mjs`**

Find:
```javascript
import { promptText, promptNewMap, promptColour } from "./dialogs.mjs";
```
Replace with:
```javascript
import { promptText, promptNewMap, promptColour, promptDescription } from "./dialogs.mjs";
```

- [ ] **Step 2: Add `addRect` to `#ctx()`**

In `#ctx()`, find:
```javascript
      addCircle: (d) => { M.addCircle(this.map(), this.layer().id, d); this.#persist(); this.#renderAll(); },
```
Add right after it:
```javascript
      addRect: (d) => { M.addRect(this.map(), this.layer().id, d); this.#persist(); this.#renderAll(); },
```

- [ ] **Step 3: Add the `describe` action**

In `#action(act)`, find:
```javascript
    else if (act === "delete") { if (!this.#sel || !M.removeEntity(L, this.#sel)) return ui.notifications.warn("Select something first."); this.#sel = null; this.#persist(); this.#renderAll(); }
```
Add right after it:
```javascript
    else if (act === "describe") { const e = this.#sel && M.findEntity(L, this.#sel); if (!e) return ui.notifications.warn("Select something first."); const text = await promptDescription(e.description ?? ""); if (text !== null && this.element?.isConnected) { M.setDescription(L, this.#sel, text); this.#persist(); this.#renderAll(); } }
```

- [ ] **Step 4: Show the description in `#renderInfo`**

Replace the whole `#renderInfo()` method:
```javascript
  #renderInfo() {
    this.#disk.render();
    const box = this.element.querySelector('[data-hc="info"]'); const e = this.#sel && M.findEntity(this.layer(), this.#sel);
    if (!e) { box.className = "hc-info empty"; box.innerHTML = `<div class="hc-lbl">${game.i18n.localize("HIVECART.Selection")}</div><div class="hc-name">${game.i18n.localize("HIVECART.NothingSelected")}</div>`; return; }
    const kind = e.type === "wedge" ? "District" : e.type === "circle" ? "Zone" : "Landmark";
    const sw = `<span class="hc-swatch" style="background:${e.color || "var(--gold2)"}"></span>`;
    box.className = "hc-info";
    box.innerHTML = `<div class="hc-lbl">${game.i18n.localize("HIVECART.Selection")}</div><div class="hc-name">${sw}${esc(e.name)} <span style="font-family:var(--mono);font-size:9px;color:var(--gold);border:1px solid var(--line2);padding:1px 5px;">${kind}</span></div>`;
  }
```
with:
```javascript
  #renderInfo() {
    this.#disk.render();
    const box = this.element.querySelector('[data-hc="info"]'); const e = this.#sel && M.findEntity(this.layer(), this.#sel);
    if (!e) { box.className = "hc-info empty"; box.innerHTML = `<div class="hc-lbl">${game.i18n.localize("HIVECART.Selection")}</div><div class="hc-name">${game.i18n.localize("HIVECART.NothingSelected")}</div>`; return; }
    const kind = e.type === "wedge" ? "District" : e.type === "circle" ? "Zone" : e.type === "rect" ? "Block" : "Landmark";
    const sw = `<span class="hc-swatch" style="background:${e.color || "var(--gold2)"}"></span>`;
    const desc = e.description
      ? `<div class="hc-desc">${esc(e.description)}</div>`
      : (game.user.isGM ? `<div class="hc-desc empty">${game.i18n.localize("HIVECART.NoDescription")}</div>` : "");
    box.className = "hc-info";
    box.innerHTML = `<div class="hc-lbl">${game.i18n.localize("HIVECART.Selection")}</div><div class="hc-name">${sw}${esc(e.name)} <span style="font-family:var(--mono);font-size:9px;color:var(--gold);border:1px solid var(--line2);padding:1px 5px;">${kind}</span></div>${desc}`;
  }
```

- [ ] **Step 5: Add the Block tool button + Describe button (`templates/hive-app.hbs`)**

Find:
```handlebars
              <button class="hc-tool" data-mode="circle">{{localize "HIVECART.Zone"}}</button>
              <button class="hc-tool" data-mode="point">{{localize "HIVECART.Landmark"}}</button>
```
Replace with:
```handlebars
              <button class="hc-tool" data-mode="circle">{{localize "HIVECART.Zone"}}</button>
              <button class="hc-tool" data-mode="rect">{{localize "HIVECART.Block"}}</button>
              <button class="hc-tool" data-mode="point">{{localize "HIVECART.Landmark"}}</button>
```
Then find:
```handlebars
              <button class="hc-tool" data-act="delete">{{localize "HIVECART.Delete"}}</button>
```
Replace with:
```handlebars
              <button class="hc-tool" data-act="describe">{{localize "HIVECART.Describe"}}</button>
              <button class="hc-tool" data-act="delete">{{localize "HIVECART.Delete"}}</button>
```

- [ ] **Step 6: CSS — description block, textarea, player cursor scoping (`styles/hive-cartographer.css`)**

Find:
```css
.hive-cart .hc-disk:not(.draw) .hc-region.sel,.hive-cart .hc-disk:not(.draw) .hc-pmark.sel{cursor:move;}
```
Replace with (scope move-cursor to non-players):
```css
.hive-cart:not(.player) .hc-disk:not(.draw) .hc-region.sel,.hive-cart:not(.player) .hc-disk:not(.draw) .hc-pmark.sel{cursor:move;}
```
Then find:
```css
.hive-cart .hc-info.empty .hc-name{color:var(--faint);font-family:var(--cond);font-style:italic;text-transform:none;}
```
Replace with:
```css
.hive-cart .hc-info.empty .hc-name{color:var(--faint);font-family:var(--cond);font-style:italic;text-transform:none;}
.hive-cart .hc-info .hc-desc{margin-top:8px;font-size:12.5px;line-height:1.5;color:var(--ink);white-space:pre-wrap;word-break:break-word;}
.hive-cart .hc-info .hc-desc.empty{color:var(--faint);font-style:italic;}
```
Then find the dialog text-input rule:
```css
.hc-dialog input[type="text"]{font-family:'Barlow Condensed',sans-serif;font-size:14px;padding:4px 8px;}
```
Replace with (add a textarea rule):
```css
.hc-dialog input[type="text"]{font-family:'Barlow Condensed',sans-serif;font-size:14px;padding:4px 8px;}
.hc-dialog textarea{font-family:'Barlow Condensed',sans-serif;font-size:13px;line-height:1.45;padding:5px 8px;resize:vertical;min-height:90px;width:100%;box-sizing:border-box;}
```

- [ ] **Step 7: Verify**

Run: `node --check scripts/apps/hive-app.mjs` (no output); `node -e "JSON.parse(require('fs').readFileSync('lang/en.json','utf8'));console.log('lang ok')"` (`lang ok`); `npm test` (all pass).

- [ ] **Step 8: Commit**

```bash
git add scripts/apps/hive-app.mjs templates/hive-app.hbs styles/hive-cartographer.css
git commit -m "feat(ui): Describe action + Selection description display; Block tool button + addRect wiring; player-scoped move cursor"
```

---

## Task 4: Disk editor — blocks (render/draw/move/resize) + player click-to-select

**Files:**
- Modify: `scripts/apps/disk-editor.mjs` (full replacement)

- [ ] **Step 1: Replace `scripts/apps/disk-editor.mjs` with EXACTLY this content**

```javascript
// scripts/apps/disk-editor.mjs
import { polar, angleDeg, toUnit, wedgePath } from "../geometry.mjs";

const VB = 420, CXp = 210, CYp = 210, Rp = 192;   // svg viewBox space
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function createDiskEditor(container, ctx) {
  let drag = null;      // active draw gesture
  let selDrag = null;   // active move/resize gesture (GM only)

  function svgEl() { return container.querySelector("svg"); }
  function toViewbox(e) {
    const svg = svgEl(); const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (VB / r.width), y: (e.clientY - r.top) * (VB / r.height) };
  }
  function unit(p) { return toUnit(CXp, CYp, Rp, p.x, p.y); }            // viewbox px -> model unit
  const handle = (x, y, n) => `<circle class="hc-handle" data-handle="${n}" cx="${x}" cy="${y}" r="6"/>`;

  function render() {
    const L = ctx.getLayer(), sel = ctx.getSelection(), gm = ctx.isGM(), selectMode = ctx.getMode() === "select";
    const clickable = selectMode;   // players are always in select mode → shapes selectable for everyone
    let s = `<svg viewBox="0 0 ${VB} ${VB}">`;
    s += `<circle class="hc-ring" cx="${CXp}" cy="${CYp}" r="${Rp + 6}"/><circle class="hc-ring" cx="${CXp}" cy="${CYp}" r="${Rp + 11}" style="stroke:rgba(200,162,74,.35)"/>`;
    for (let t = 0; t < 24; t++) {
      const a = t * 15, [x1, y1] = polar(CXp, CYp, Rp + 6, a), [x2, y2] = polar(CXp, CYp, Rp + (t % 6 === 0 ? 16 : 11), a);
      s += `<line class="hc-tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }
    // regions in array order — later = drawn on top (z-order, controllable via front/back)
    for (const rg of L.regions) {
      const on = rg.id === sel;
      if (rg.type === "wedge") {
        s += `<path class="hc-region${clickable ? " clickable" : ""}${on ? " sel" : ""}" data-id="${rg.id}" d="${wedgePath(CXp, CYp, Rp, rg.a0, rg.a1, rg.rOut)}" fill="${rg.color}" fill-opacity="${on ? .95 : .8}" stroke="rgba(0,0,0,.45)" stroke-width="1"/>`;
        const [lx, ly] = polar(CXp, CYp, rg.rOut * Rp * 0.6, (rg.a0 + (rg.a1 < rg.a0 ? rg.a1 + 360 : rg.a1)) / 2);
        s += `<text class="hc-rlabel" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${esc(rg.name)}</text>`;
      } else if (rg.type === "rect") {
        const rx = CXp + (rg.cx - rg.hw) * Rp, ry = CYp + (rg.cy - rg.hh) * Rp;
        s += `<rect class="hc-region${clickable ? " clickable" : ""}${on ? " sel" : ""}" data-id="${rg.id}" x="${rx}" y="${ry}" width="${2 * rg.hw * Rp}" height="${2 * rg.hh * Rp}" fill="${rg.color}" fill-opacity="${on ? .95 : .82}" stroke="rgba(200,162,74,.5)" stroke-width="1.2"/>`;
        s += `<text class="hc-clabel" x="${CXp + rg.cx * Rp}" y="${CYp + rg.cy * Rp}" text-anchor="middle" dominant-baseline="middle">${esc(rg.name)}</text>`;
      } else {
        const px = CXp + rg.cx * Rp, py = CYp + rg.cy * Rp, pr = rg.r * Rp;
        s += `<circle class="hc-region${clickable ? " clickable" : ""}${on ? " sel" : ""}" data-id="${rg.id}" cx="${px}" cy="${py}" r="${pr}" fill="${rg.color}" fill-opacity="${on ? .95 : .85}" stroke="rgba(200,162,74,.5)" stroke-width="1.2"/>`;
        s += `<text class="hc-clabel" x="${px}" y="${py}" text-anchor="middle" dominant-baseline="middle">${esc(rg.name)}</text>`;
      }
    }
    // landmarks
    for (const p of L.points) {
      const on = p.id === sel, px = CXp + p.x * Rp, py = CYp + p.y * Rp, d = 8;
      s += `<path class="hc-pmark${clickable ? " clickable" : ""}${on ? " sel" : ""}" data-id="${p.id}" d="M ${px} ${py - d} L ${px + d} ${py} L ${px} ${py + d} L ${px - d} ${py} Z"/>`;
      s += `<text class="hc-plabel" x="${px + d + 4}" y="${py + 4}">${esc(p.name)}</text>`;
    }
    // selection handles — GM only
    if (gm && clickable && sel) {
      const e = L.regions.find((r) => r.id === sel);
      if (e && e.type === "circle") s += handle(CXp + e.cx * Rp + e.r * Rp, CYp + e.cy * Rp, "resizeR");
      else if (e && e.type === "rect") s += handle(CXp + (e.cx + e.hw) * Rp, CYp + (e.cy + e.hh) * Rp, "resizeWH");
      else if (e && e.type === "wedge") {
        const mid = (e.a0 + (e.a1 < e.a0 ? e.a1 + 360 : e.a1)) / 2;
        const m = polar(CXp, CYp, e.rOut * Rp, mid), e0 = polar(CXp, CYp, e.rOut * Rp, e.a0), e1 = polar(CXp, CYp, e.rOut * Rp, e.a1);
        s += handle(m[0], m[1], "resizeR") + handle(e0[0], e0[1], "a0") + handle(e1[0], e1[1], "a1");
      }
    }
    // live draw preview
    if (drag) {
      if (drag.kind === "wedge") s += `<path class="hc-preview" d="${wedgePath(CXp, CYp, Rp, drag.a0, drag.a1, drag.rOut)}"/>`;
      if (drag.kind === "circle") s += `<circle class="hc-preview" cx="${CXp + drag.cx * Rp}" cy="${CYp + drag.cy * Rp}" r="${drag.r * Rp}"/>`;
      if (drag.kind === "rect") { const x0 = Math.min(drag.x0, drag.x1), y0 = Math.min(drag.y0, drag.y1); s += `<rect class="hc-preview" x="${CXp + x0 * Rp}" y="${CYp + y0 * Rp}" width="${Math.abs(drag.x1 - drag.x0) * Rp}" height="${Math.abs(drag.y1 - drag.y0) * Rp}"/>`; }
    }
    s += `</svg>`;
    container.innerHTML = s;
    container.classList.toggle("draw", gm && !selectMode);
  }

  async function onDown(e) {
    if (!svgEl()) return;
    const mode = ctx.getMode();
    if (mode !== "select") {
      if (!ctx.isGM()) return;
      const p = toViewbox(e), [ux, uy] = unit(p); e.preventDefault();
      if (mode === "point") { const name = await ctx.promptName("HIVECART.PromptLandmark", "New Landmark"); if (name) ctx.addPoint({ name, x: ux, y: uy }); return; }
      if (mode === "wedge") { const a = angleDeg(0, 0, ux, uy); drag = { kind: "wedge", start: a, a0: a, a1: a + 1, rOut: Math.min(1, Math.max(0.3, Math.hypot(ux, uy))) }; }
      if (mode === "circle") { drag = { kind: "circle", cx: ux, cy: uy, r: 0.03 }; }
      if (mode === "rect") { drag = { kind: "rect", x0: ux, y0: uy, x1: ux, y1: uy }; }
      return;
    }
    const t = e.target, ds = t.dataset || {};
    if (ds.handle && ctx.isGM() && ctx.getSelection()) { selDrag = { kind: ds.handle }; e.preventDefault(); return; }
    if (ds.id) {
      ctx.select(ds.id); render();
      if (ctx.isGM()) {
        const L = ctx.getLayer(), o = L.regions.find((r) => r.id === ds.id) || L.points.find((p) => p.id === ds.id);
        selDrag = { kind: "move", startU: unit(toViewbox(e)), orig: snapshot(o) };
      }
      e.preventDefault(); return;
    }
    ctx.select(null); render();
  }

  function snapshot(o) {
    return o.type === "wedge" ? { a0: o.a0, a1: o.a1 }
      : (o.type === "circle" || o.type === "rect") ? { cx: o.cx, cy: o.cy }
      : { x: o.x, y: o.y };
  }

  function onMove(e) {
    if (drag) {
      const p = toViewbox(e), [ux, uy] = unit(p);
      if (drag.kind === "wedge") { let span = angleDeg(0, 0, ux, uy) - drag.start; if (span < 0) span += 360; drag.a0 = drag.start; drag.a1 = drag.start + Math.max(span, 1); drag.rOut = Math.min(1, Math.max(0.28, Math.hypot(ux, uy))); }
      if (drag.kind === "circle") { drag.r = Math.max(0.04, Math.hypot(ux - drag.cx, uy - drag.cy)); }
      if (drag.kind === "rect") { drag.x1 = ux; drag.y1 = uy; }
      render(); return;
    }
    if (selDrag) {
      const [ux, uy] = unit(toViewbox(e));
      ctx.mutateSelected((o) => {
        if (selDrag.kind === "move") {
          if (o.type === "wedge") { let da = angleDeg(0, 0, ux, uy) - angleDeg(0, 0, selDrag.startU[0], selDrag.startU[1]); da = ((da + 180) % 360 + 360) % 360 - 180; o.a0 = selDrag.orig.a0 + da; o.a1 = selDrag.orig.a1 + da; }
          else if (o.type === "circle" || o.type === "rect") { o.cx = selDrag.orig.cx + (ux - selDrag.startU[0]); o.cy = selDrag.orig.cy + (uy - selDrag.startU[1]); }
          else { o.x = selDrag.orig.x + (ux - selDrag.startU[0]); o.y = selDrag.orig.y + (uy - selDrag.startU[1]); }
        } else if (selDrag.kind === "resizeR") {
          if (o.type === "circle") o.r = Math.max(0.04, Math.hypot(ux - o.cx, uy - o.cy));
          else o.rOut = Math.min(1, Math.max(0.28, Math.hypot(ux, uy)));
        } else if (selDrag.kind === "resizeWH") { o.hw = Math.max(0.04, Math.abs(ux - o.cx)); o.hh = Math.max(0.04, Math.abs(uy - o.cy)); }
        else if (selDrag.kind === "a0") { o.a0 = angleDeg(0, 0, ux, uy); }
        else if (selDrag.kind === "a1") { let a = angleDeg(0, 0, ux, uy); while (a < o.a0) a += 360; o.a1 = a; }
      }, { persist: false });
      render();
    }
  }

  async function onUp() {
    if (selDrag) { selDrag = null; ctx.mutateSelected(() => {}, { persist: true }); return; }
    if (!drag) return;
    const d = drag; drag = null;
    render();   // clear the live preview before the (now modal) name dialog
    if (d.kind === "wedge" && (d.a1 - d.a0) >= 8) { const name = await ctx.promptName("HIVECART.PromptDistrict", "New District"); if (name) ctx.addWedge({ name, color: ctx.nextColor(), a0: d.a0, a1: d.a1, rOut: d.rOut }); }
    if (d.kind === "circle" && d.r >= 0.05) { const name = await ctx.promptName("HIVECART.PromptZone", "New Zone"); if (name) ctx.addCircle({ name, color: ctx.nextColor(), cx: d.cx, cy: d.cy, r: d.r }); }
    if (d.kind === "rect") { const hw = Math.abs(d.x1 - d.x0) / 2, hh = Math.abs(d.y1 - d.y0) / 2; if (hw >= 0.04 && hh >= 0.04) { const name = await ctx.promptName("HIVECART.PromptBlock", "New Block"); if (name) ctx.addRect({ name, color: ctx.nextColor(), cx: (d.x0 + d.x1) / 2, cy: (d.y0 + d.y1) / 2, hw, hh }); } }
  }

  container.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);

  return {
    render,
    destroy() { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); },
  };
}
```

- [ ] **Step 2: Verify**

Run: `node --check scripts/apps/disk-editor.mjs` (no output) and `npm test` (all pass — pure modules unaffected).

- [ ] **Step 3: Manual check (deploy + reload Foundry)**

Run `bash tools/deploy.sh`, reload. As **GM**: a **Block** tool appears; drag a box → name dialog → a rectangle is created; select it → move (drag body), resize (corner handle), Recolour, Front/Back, **Describe** (textarea → shows in Selection), Delete — all work; the block z-orders with Front/Back. As a **player** (second client): click any district/zone/block/landmark → the Selection panel shows its name + description; the cursor is a pointer (not move); no tools are visible and dragging does nothing; an existing GM description is readable; a region with no description shows nothing for the player (the "No description" hint is GM-only).

- [ ] **Step 4: Commit**

```bash
git add scripts/apps/disk-editor.mjs
git commit -m "feat(ui): block (rect) render/draw/move/resize; read-only player click-to-select"
```

---

## Done criteria

- `npm test` green (description default/migrate/setDescription; rect add/route/generic-ops).
- In Foundry: GM sets descriptions shown in Selection to everyone; players can click-select to read but not edit; blocks draw/move/resize/recolour/describe/front-back/delete like zones.

## Out of scope

No per-item secret descriptions, no rich text, no block rotation, no map/sync/permission changes.
