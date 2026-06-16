# In-Foundry Dialogs + Single-Layer-at-Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every browser-native popup (`prompt()` ×5, the `promptName` draw prompt, and the OS colour picker) with themed `DialogV2` dialogs, and make a map's single-layer flag a creation-time choice (set in the New Map dialog, immutable after).

**Architecture:** A new `scripts/apps/dialogs.mjs` exposes promise-returning `DialogV2` helpers (`promptText`, `promptNewMap`, `promptColour`). The app and the disk editor `await` them (becoming async). `addMap` gains a `singleLayer` argument; `setSingleLayer` and the map-bar toggle are removed.

**Tech Stack:** Foundry VTT v13+ (verified v14), JavaScript ESM, `foundry.applications.api.DialogV2`, Vitest.

**Working directory:** `/Users/suninrags/GolandProjects/hive_cartographer`. Design spec: `docs/specs/2026-06-16-foundry-dialogs-design.md`.

**Context:** The module is built (multi-map work is on `main`, deployed, unreleased). `scripts/apps/hive-app.mjs` is an `ApplicationV2` holding `this.doc` + `#curMapId`, with `map()/layer()/#syncMap()/#renderAll()/#renderMapBar()/#action()/#pickColour()/#ctx()`. The draw tools live in `scripts/apps/disk-editor.mjs` (`createDiskEditor(container, ctx)` whose `onDown/onUp` call `ctx.promptName`). Model is `scripts/data/hive-model.mjs` (pure, unit-tested). Foundry-facing code can't be auto-tested — `node --check` + the manual checklist; the in-Foundry checks are for the user. Deploy with `bash tools/deploy.sh`.

---

## Task 1: Model — `addMap(singleLayer)` + drop `setSingleLayer` (pure, TDD)

**Files:**
- Modify: `scripts/data/hive-model.mjs`
- Modify: `test/hive-model.test.mjs`

- [ ] **Step 1: Update the tests**

In `test/hive-model.test.mjs`, change the import on line 3 from:
```javascript
import { mapById, addMap, removeMap, renameMap, setSingleLayer } from "../scripts/data/hive-model.mjs";
```
to:
```javascript
import { mapById, addMap, removeMap, renameMap } from "../scripts/data/hive-model.mjs";
```
Then replace the `addMap` test:
```javascript
  it("addMap appends a map (with one layer) and returns its id", () => {
    const d = defaultHive();
    const id = addMap(d, "Underhive");
    expect(d.maps).toHaveLength(2);
    expect(mapById(d, id).name).toBe("Underhive");
    expect(mapById(d, id).layers).toHaveLength(1);
  });
```
with:
```javascript
  it("addMap appends a map (with one layer), defaults singleLayer false, returns its id", () => {
    const d = defaultHive();
    const id = addMap(d, "Underhive");
    expect(d.maps).toHaveLength(2);
    expect(mapById(d, id).name).toBe("Underhive");
    expect(mapById(d, id).layers).toHaveLength(1);
    expect(mapById(d, id).singleLayer).toBe(false);
  });
  it("addMap stores the singleLayer flag passed at creation", () => {
    const d = defaultHive();
    const id = addMap(d, "Flat", true);
    expect(mapById(d, id).singleLayer).toBe(true);
  });
```
Then replace the `renameMap and setSingleLayer` test:
```javascript
  it("renameMap and setSingleLayer mutate the named map", () => {
    const d = defaultHive(); const id = d.maps[0].id;
    expect(renameMap(d, id, "Renamed")).toBe(true);
    expect(mapById(d, id).name).toBe("Renamed");
    expect(setSingleLayer(d, id, true)).toBe(true);
    expect(mapById(d, id).singleLayer).toBe(true);
    expect(setSingleLayer(d, "nope", true)).toBe(false);
  });
```
with:
```javascript
  it("renameMap mutates the named map; false for an unknown id", () => {
    const d = defaultHive(); const id = d.maps[0].id;
    expect(renameMap(d, id, "Renamed")).toBe(true);
    expect(mapById(d, id).name).toBe("Renamed");
    expect(renameMap(d, "nope", "X")).toBe(false);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- hive-model`
Expected: FAIL — `setSingleLayer` import is now gone but still defined (no fail there); the real failure is `addMap(d, "Flat", true)` → `singleLayer` is `false` (third arg ignored). Expect the "stores the singleLayer flag" test to FAIL.

- [ ] **Step 3: Update the model**

In `scripts/data/hive-model.mjs`, replace:
```javascript
export function addMap(doc, name) {
  const m = defaultMap(name || "New Map");
  doc.maps.push(m);
  return m.id;
}
```
with:
```javascript
export function addMap(doc, name, singleLayer = false) {
  const m = defaultMap(name || "New Map");
  m.singleLayer = !!singleLayer;
  doc.maps.push(m);
  return m.id;
}
```
Then delete the `setSingleLayer` function entirely:
```javascript
export function setSingleLayer(doc, id, flag) {
  const m = mapById(doc, id); if (!m) return false;
  m.singleLayer = !!flag; return true;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 5: Commit**

```bash
git add scripts/data/hive-model.mjs test/hive-model.test.mjs
git commit -m "feat(model): addMap takes a creation-time singleLayer flag; drop setSingleLayer"
```

---

## Task 2: Dialogs module (`DialogV2` helpers)

**Files:**
- Create: `scripts/apps/dialogs.mjs`

- [ ] **Step 1: Create `scripts/apps/dialogs.mjs` with EXACTLY this content**

```javascript
// scripts/apps/dialogs.mjs
// Themed in-Foundry dialogs (DialogV2). Every helper resolves to null on cancel/close (rejectClose:false).
import { PALETTE } from "../data/hive-model.mjs";

const { DialogV2 } = foundry.applications.api;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const L = (k) => game.i18n.localize(k);

// Single text field. Resolves to the trimmed value, or null if empty / cancelled.
export async function promptText({ title, label, value = "" }) {
  const v = await DialogV2.prompt({
    window: { title },
    content: `<div class="hc-dialog"><label>${esc(label)}</label><input type="text" name="value" value="${esc(value)}" autofocus/></div>`,
    ok: { label: L("HIVECART.OK"), callback: (e, button) => button.form.elements.value.value.trim() },
    rejectClose: false,
  });
  return v || null;
}

// New-map dialog: name + single-layer checkbox. Resolves to { name, singleLayer } or null.
export async function promptNewMap() {
  const res = await DialogV2.prompt({
    window: { title: L("HIVECART.NewMapTitle") },
    content: `<div class="hc-dialog">`
      + `<label>${L("HIVECART.Map")}</label>`
      + `<input type="text" name="name" value="New Map" autofocus/>`
      + `<label class="hc-check"><input type="checkbox" name="single"/> ${L("HIVECART.SingleLayer")}</label>`
      + `</div>`,
    ok: { label: L("HIVECART.OK"), callback: (e, button) => {
      const f = button.form.elements, name = f.name.value.trim();
      return name ? { name, singleLayer: f.single.checked } : null;
    } },
    rejectClose: false,
  });
  return res || null;
}

// Colour dialog: palette swatches (radio, current pre-selected) + a hex field that overrides.
// Resolves to "#rrggbb" or null.
export async function promptColour(current) {
  const cur = /^#[0-9a-f]{6}$/i.test(current) ? current.toLowerCase() : PALETTE[0];
  const swatches = PALETTE.map((c) =>
    `<label class="hc-swatch-btn" style="background:${c}"><input type="radio" name="sw" value="${c}"${c === cur ? " checked" : ""}/></label>`).join("");
  const res = await DialogV2.prompt({
    window: { title: L("HIVECART.ColourTitle") },
    content: `<div class="hc-dialog hc-colourdlg"><div class="hc-swatches">${swatches}</div>`
      + `<label>${L("HIVECART.Hex")}</label><input type="text" name="hex" value="" placeholder="#rrggbb" maxlength="7"/></div>`,
    ok: { label: L("HIVECART.OK"), callback: (e, button) => {
      const f = button.form.elements;
      const hex = (f.hex.value || "").trim().toLowerCase();
      if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
      const sw = f.sw && f.sw.value;
      return /^#[0-9a-f]{6}$/.test(sw) ? sw : null;
    } },
    rejectClose: false,
  });
  return res || null;
}
```

- [ ] **Step 2: Verify**

Run: `node --check scripts/apps/dialogs.mjs`
Expected: no output (valid).

- [ ] **Step 3: Commit**

```bash
git add scripts/apps/dialogs.mjs
git commit -m "feat(ui): DialogV2 helpers — text prompt, new-map (name + single-layer), colour picker"
```

---

## Task 3: Dialog styling + language strings

**Files:**
- Modify: `styles/hive-cartographer.css`
- Modify: `lang/en.json`

- [ ] **Step 1: Add the language keys**

In `lang/en.json`, find:
```json
  "HIVECART.PromptLayer": "Name the layer:"
```
Replace with (note the comma added to the line above):
```json
  "HIVECART.PromptLayer": "Name the layer:",
  "HIVECART.PromptRename": "New name:",
  "HIVECART.OK": "Confirm",
  "HIVECART.NewMapTitle": "New Map",
  "HIVECART.ColourTitle": "District / Zone Colour",
  "HIVECART.Hex": "Hex (overrides)"
```

- [ ] **Step 2: Style the dialogs**

In `styles/hive-cartographer.css`, find:
```css
.hive-cart.hc-single .hc-cross{display:none;}
.hive-cart.hc-single .hc-layeronly{display:none;}
```
Replace with (drops the now-unused `.hc-singletoggle` rule if present nearby — leave other rules untouched — and adds dialog styling):
```css
.hive-cart.hc-single .hc-cross{display:none;}
.hive-cart.hc-single .hc-layeronly{display:none;}

/* In-Foundry dialog content (DialogV2 injects these inside its own themed frame) */
.hc-dialog{display:flex;flex-direction:column;gap:7px;padding:4px 2px;min-width:300px;}
.hc-dialog label{font-family:'Barlow Condensed',sans-serif;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#7d8896;}
.hc-dialog input[type="text"]{font-family:'Barlow Condensed',sans-serif;font-size:14px;padding:4px 8px;}
.hc-dialog label.hc-check{display:flex;align-items:center;gap:7px;text-transform:none;letter-spacing:.5px;color:inherit;cursor:pointer;margin-top:2px;}
.hc-dialog label.hc-check input{width:auto;}
.hc-colourdlg .hc-swatches{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px;}
.hc-colourdlg .hc-swatch-btn{width:28px;height:28px;border:1px solid rgba(255,255,255,.3);cursor:pointer;display:inline-block;position:relative;}
.hc-colourdlg .hc-swatch-btn input{position:absolute;opacity:0;width:0;height:0;}
.hc-colourdlg .hc-swatch-btn:has(input:checked){outline:2px solid #e6c878;outline-offset:1px;}
```
(The `.hc-dialog` rules are NOT scoped to `.hive-cart` because DialogV2 renders the dialog as a separate top-level application, not inside the Hive window. Use literal font-family strings since the `--cond`/`--gold2` CSS vars are defined only inside `.hive-cart`.)

If a `.hive-cart .hc-singletoggle{…}` rule exists in the file (added by the multi-map work), delete that single line — the toggle is removed in Task 4.

- [ ] **Step 3: Verify**

Run: `node -e "JSON.parse(require('fs').readFileSync('lang/en.json','utf8'));console.log('lang ok')"`
Expected: `lang ok`.

- [ ] **Step 4: Commit**

```bash
git add styles/hive-cartographer.css lang/en.json
git commit -m "feat(ui): dialog content styling + dialog language strings"
```

---

## Task 4: Wire dialogs into the app + draw tools; remove the single-layer toggle

**Files:**
- Modify: `scripts/apps/hive-app.mjs`
- Modify: `scripts/apps/disk-editor.mjs`
- Modify: `templates/hive-app.hbs`

Read each file first to confirm exact current text.

- [ ] **Step 1: Import the dialog helpers in `hive-app.mjs`**

Find:
```javascript
import * as M from "../data/hive-model.mjs";
```
Replace with:
```javascript
import * as M from "../data/hive-model.mjs";
import { promptText, promptNewMap, promptColour } from "./dialogs.mjs";
```

- [ ] **Step 2: `#ctx().promptName` → async dialog**

Find:
```javascript
      promptName: (key, dflt) => { const v = prompt(game.i18n.localize(key), dflt); return v && v.trim() ? v.trim() : null; },
```
Replace with:
```javascript
      promptName: (key, dflt) => promptText({ title: game.i18n.localize("HIVECART.Title"), label: game.i18n.localize(key), value: dflt }),
```

- [ ] **Step 3: `#pickColour` → async colour dialog**

Find the whole method:
```javascript
  #pickColour() {
    const L = this.layer(), e = this.#sel && M.findEntity(L, this.#sel);
    if (!e || e.color === undefined) return ui.notifications.warn("Pick a district or zone.");
    const input = document.createElement("input");
    input.type = "color"; input.value = /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : "#7c4a3a";
    input.style.cssText = "position:fixed;left:-9999px;";
    document.body.appendChild(input);
    input.addEventListener("change", () => { M.setColor(L, this.#sel, input.value); this.#persist(); this.#renderAll(); input.remove(); });
    input.addEventListener("cancel", () => input.remove());
    input.click();
  }
```
Replace with:
```javascript
  async #pickColour() {
    const L = this.layer(), e = this.#sel && M.findEntity(L, this.#sel);
    if (!e || e.color === undefined) return ui.notifications.warn("Pick a district or zone.");
    const picked = await promptColour(e.color);
    if (picked && this.element?.isConnected) { M.setColor(L, this.#sel, picked); this.#persist(); this.#renderAll(); }
  }
```

- [ ] **Step 4: `#action` → async + dialog-based map/rename/layer actions**

Find the method signature and the map/entity/layer action chain. Replace the entire `#action(act) { … }` method with:
```javascript
  async #action(act) {
    const L = this.layer();
    if (act === "mapNew") { const r = await promptNewMap(); if (!r || !this.element?.isConnected) return; this.#curMapId = M.addMap(this.doc, r.name, r.singleLayer); this.#cur = 0; this.#sel = null; this.#persist(); this.#renderAll(); return; }
    if (act === "mapRename") { const n = await promptText({ title: game.i18n.localize("HIVECART.RenameMap"), label: game.i18n.localize("HIVECART.PromptMap"), value: this.map().name }); if (n && this.element?.isConnected) { M.renameMap(this.doc, this.#curMapId, n); this.#persist(); this.#renderAll(); } return; }
    if (act === "mapDelete") { if (M.removeMap(this.doc, this.#curMapId)) { this.#syncMap(); this.#sel = null; this.#persist(); this.#renderAll(); } else ui.notifications.warn("A world needs at least one map."); return; }
    if (act === "rename") { const e = this.#sel && M.findEntity(L, this.#sel); if (!e) return ui.notifications.warn("Select something first."); const n = await promptText({ title: game.i18n.localize("HIVECART.Rename"), label: game.i18n.localize("HIVECART.PromptRename"), value: e.name }); if (n && this.element?.isConnected) { M.renameEntity(L, this.#sel, n); this.#persist(); this.#renderAll(); } }
    else if (act === "recolour") { this.#pickColour(); }
    else if (act === "front") { if (this.#sel && M.bringToFront(L, this.#sel)) { this.#persist(); this.#renderAll(); } else ui.notifications.warn("Select a district or zone."); }
    else if (act === "back") { if (this.#sel && M.sendToBack(L, this.#sel)) { this.#persist(); this.#renderAll(); } else ui.notifications.warn("Select a district or zone."); }
    else if (act === "delete") { if (!this.#sel || !M.removeEntity(L, this.#sel)) return ui.notifications.warn("Select something first."); this.#sel = null; this.#persist(); this.#renderAll(); }
    else if (act === "addLayer") { const n = await promptText({ title: game.i18n.localize("HIVECART.AddLayer"), label: game.i18n.localize("HIVECART.PromptLayer"), value: "New Layer" }); if (!n || !this.element?.isConnected) return; M.addLayer(this.map(), n, ""); this.#cur = this.map().layers.length - 1; this.#sel = null; this.#persist(); this.#renderAll(); }
    else if (act === "layerUp") { if (M.moveLayer(this.map(), L.id, -1)) { this.#cur = Math.max(0, this.#cur - 1); this.#persist(); this.#renderAll(); } }
    else if (act === "layerDown") { if (M.moveLayer(this.map(), L.id, 1)) { this.#cur = Math.min(this.map().layers.length - 1, this.#cur + 1); this.#persist(); this.#renderAll(); } }
    else if (act === "renameLayer") { const n = await promptText({ title: game.i18n.localize("HIVECART.RenameLayer"), label: game.i18n.localize("HIVECART.PromptLayer"), value: L.name }); if (n && this.element?.isConnected) { L.name = n; this.#persist(); this.#renderAll(); } }
    else if (act === "removeLayer") { if (M.removeLayer(this.map(), L.id)) { this.#cur = Math.max(0, this.#cur - 1); this.#sel = null; this.#persist(); this.#renderAll(); } else ui.notifications.warn("A map needs at least one layer."); }
  }
```

- [ ] **Step 5: Remove the single-layer toggle wiring in `hive-app.mjs`**

In `_onRender`, find and DELETE this line (the single-layer checkbox listener):
```javascript
    root.querySelector('[data-hc="singleLayer"]').addEventListener("change", (e) => { M.setSingleLayer(this.doc, this.#curMapId, e.target.checked); this.#cur = 0; this.#sel = null; this.#persist(); this.#renderAll(); });
```
Then in `#renderMapBar`, find:
```javascript
  #renderMapBar(root, map) {
    const sel = root.querySelector('[data-hc="mapSelect"]');
    sel.innerHTML = this.doc.maps.map((m) => `<option value="${m.id}"${m.id === map.id ? " selected" : ""}>${esc(m.name)}</option>`).join("");
    root.querySelector('[data-hc="singleLayer"]').checked = !!map.singleLayer;
    root.querySelector(".hive-cart").classList.toggle("hc-single", !!map.singleLayer);
  }
```
Replace with:
```javascript
  #renderMapBar(root, map) {
    const sel = root.querySelector('[data-hc="mapSelect"]');
    sel.innerHTML = this.doc.maps.map((m) => `<option value="${m.id}"${m.id === map.id ? " selected" : ""}>${esc(m.name)}</option>`).join("");
    root.querySelector(".hive-cart").classList.toggle("hc-single", !!map.singleLayer);
  }
```

- [ ] **Step 6: Remove the single-layer checkbox from the template**

In `templates/hive-app.hbs`, find:
```handlebars
      <button class="hc-tool" data-act="mapDelete">{{localize "HIVECART.DeleteMap"}}</button>
      <label class="hc-singletoggle"><input type="checkbox" data-hc="singleLayer"/>{{localize "HIVECART.SingleLayer"}}</label>
    </span>
```
Replace with:
```handlebars
      <button class="hc-tool" data-act="mapDelete">{{localize "HIVECART.DeleteMap"}}</button>
    </span>
```

- [ ] **Step 7: Make the draw tools await the name dialog (`disk-editor.mjs`)**

Find `onDown`'s point branch:
```javascript
  function onDown(e) {
    if (!ctx.isGM() || !svgEl()) return;
    const mode = ctx.getMode();
    if (mode !== "select") {
      const p = toViewbox(e), [ux, uy] = unit(p); e.preventDefault();
      if (mode === "point") { const name = ctx.promptName("HIVECART.PromptLandmark", "New Landmark"); if (name) ctx.addPoint({ name, x: ux, y: uy }); return; }
```
Replace those lines with (add `async`, await the prompt):
```javascript
  async function onDown(e) {
    if (!ctx.isGM() || !svgEl()) return;
    const mode = ctx.getMode();
    if (mode !== "select") {
      const p = toViewbox(e), [ux, uy] = unit(p); e.preventDefault();
      if (mode === "point") { const name = await ctx.promptName("HIVECART.PromptLandmark", "New Landmark"); if (name) ctx.addPoint({ name, x: ux, y: uy }); return; }
```
Then replace the whole `onUp` function:
```javascript
  function onUp() {
    if (selDrag) { selDrag = null; ctx.mutateSelected(() => {}, { persist: true }); return; }
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === "wedge" && (d.a1 - d.a0) >= 8) { const name = ctx.promptName("HIVECART.PromptDistrict", "New District"); if (name) ctx.addWedge({ name, color: ctx.nextColor(), a0: d.a0, a1: d.a1, rOut: d.rOut }); }
    if (d.kind === "circle" && d.r >= 0.05) { const name = ctx.promptName("HIVECART.PromptZone", "New Zone"); if (name) ctx.addCircle({ name, color: ctx.nextColor(), cx: d.cx, cy: d.cy, r: d.r }); }
    render();
  }
```
with:
```javascript
  async function onUp() {
    if (selDrag) { selDrag = null; ctx.mutateSelected(() => {}, { persist: true }); return; }
    if (!drag) return;
    const d = drag; drag = null;
    render();   // clear the live preview before the (now modal) name dialog
    if (d.kind === "wedge" && (d.a1 - d.a0) >= 8) { const name = await ctx.promptName("HIVECART.PromptDistrict", "New District"); if (name) ctx.addWedge({ name, color: ctx.nextColor(), a0: d.a0, a1: d.a1, rOut: d.rOut }); }
    if (d.kind === "circle" && d.r >= 0.05) { const name = await ctx.promptName("HIVECART.PromptZone", "New Zone"); if (name) ctx.addCircle({ name, color: ctx.nextColor(), cx: d.cx, cy: d.cy, r: d.r }); }
  }
```
(The `render()` now fires right after clearing `drag` so the dashed preview disappears immediately; `ctx.addWedge/addCircle` re-render after the name is entered.)

- [ ] **Step 8: Verify**

Run: `node --check scripts/apps/hive-app.mjs && node --check scripts/apps/disk-editor.mjs` (Expected: no output) and `npm test` (Expected: all pass). Confirm no `prompt(` calls remain: `grep -n "prompt(" scripts/apps/hive-app.mjs scripts/apps/disk-editor.mjs` — every match must be a `promptText`/`promptNewMap`/`promptColour`/`ctx.promptName`/`promptName:` reference, NOT a bare `prompt(`. Also confirm no `type = "color"` or `setSingleLayer` remain: `grep -rn "type = .color.\|setSingleLayer" scripts/` prints nothing.

- [ ] **Step 9: Manual check (deploy + reload Foundry)**

Run `bash tools/deploy.sh`, reload. Verify: every prompt (district/zone/landmark on draw, entity Rename, Add Layer, Rename Layer, New Map, Rename Map) now appears as an on-theme **Foundry dialog**, not a browser popup; cancelling any leaves state untouched. **New Map** shows a name field + a Single-layer checkbox; ticking it creates a single-layer map (cross-section + layer buttons hidden). The map bar **no longer has a single-layer checkbox**. Recolour opens the in-Foundry colour dialog (palette swatches + hex); picking a swatch or typing a hex applies it. Existing single-layer maps still render single-layer.

- [ ] **Step 10: Commit**

```bash
git add scripts/apps/hive-app.mjs scripts/apps/disk-editor.mjs templates/hive-app.hbs
git commit -m "feat(ui): use DialogV2 for all prompts + colour; single-layer set at map creation (toggle removed)"
```

---

## Done criteria

- `npm test` green (model `addMap` flag; `setSingleLayer` gone).
- In Foundry: no browser-native popups remain — every prompt and the colour picker are themed Foundry dialogs; New Map carries the single-layer choice; the map bar has no single-layer toggle; cancelling dialogs is a clean no-op.

## Out of scope

No new confirm dialogs (Delete map/layer keep their current immediate behaviour), no change to map browsing/sync/permissions, no new dependencies.
