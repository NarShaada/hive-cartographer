# Hive Cartographer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, system-agnostic Foundry VTT module that gives the GM a vertical hive-city map — a clickable cross-section of stacked layers, each a circular floor the GM divides into named districts/zones/landmarks — as an atmospheric visual aid (not a battlemap), with live read-only viewing for players.

**Architecture:** Pure ESM + SVG, no build step. Pure logic (`geometry`, `hive-model`, `store`) is unit-tested with Vitest. Foundry-facing UI (`ApplicationV2` window + three SVG panels) is complete-coded and manually verified. The whole hive is persisted as one JSON object in a world-scoped game setting; the setting's `onChange` re-renders every open window, giving GM→player sync for free.

**Tech Stack:** Foundry VTT v13+ (verified v14), JavaScript ESM, SVG, Handlebars (Foundry-bundled), Vitest.

**Working directory:** `/Users/suninrags/GolandProjects/hive_cartographer` (the module repo, separate from the `better-dh2e` system). The design spec is at `docs/specs/2026-06-16-hive-cartographer-design.md` and the approved interactive reference mockup is at `docs/mockups/hive-map-mockup.html`.

**Conventions used throughout:**
- Coordinates in the **model** are normalized: disk positions are `cx,cy,x,y ∈ [-1,1]` (0,0 = floor centre); radii `r,rOut ∈ [0,1]` as a fraction of the floor radius; wedge angles `a0,a1` in degrees with `a0 < a1` (clockwise sweep).
- Geometry helpers convert normalized↔pixel using the live floor radius `R` and centre `cx,cy` **in pixels** (named `CXp,CYp,Rp` in UI code to avoid clashing with model `cx,cy`).
- Module id is `hive-cartographer`; setting key is `hive`.

---

## Task 1: Project scaffold + test runner

**Files:**
- Create: `package.json`, `module.json`, `.gitignore`, `README.md`
- Create: `test/sanity.test.mjs`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "hive-cartographer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `module.json` (Foundry manifest)**

```json
{
  "id": "hive-cartographer",
  "title": "Hive Cartographer",
  "description": "A GM-curated vertical hive-city map — a visual aid, not a battlemap. System-agnostic.",
  "version": "0.1.0",
  "compatibility": { "minimum": "13", "verified": "14" },
  "authors": [{ "name": "NarShaada", "url": "https://github.com/NarShaada" }],
  "esmodules": ["scripts/hive-cartographer.mjs"],
  "styles": ["styles/hive-cartographer.css"],
  "languages": [{ "lang": "en", "name": "English", "path": "lang/en.json" }],
  "url": "https://github.com/NarShaada/hive-cartographer",
  "manifest": "https://github.com/NarShaada/hive-cartographer/releases/latest/download/module.json",
  "download": "https://github.com/NarShaada/hive-cartographer/releases/latest/download/hive-cartographer.zip",
  "license": "GPL-3.0"
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
hive-cartographer.zip
.DS_Store
```

- [ ] **Step 4: Create `README.md`**

```markdown
# Hive Cartographer

A standalone, system-agnostic Foundry VTT module: a vertical hive-city map. The GM draws and names
the layers of a hive and the districts, zones and landmarks on each level; players navigate it
read-only. It is a visual aid for "what's where, on which level" — not a battlemap (no tokens, grid,
or distances).

Open it from the **Hive Map** button in the scene controls (or `game.modules.get("hive-cartographer").api.open()`).

Foundry v13+ (verified v14). GPL-3.0.
```

- [ ] **Step 5: Create `test/sanity.test.mjs`**

```javascript
import { describe, it, expect } from "vitest";

describe("test runner", () => {
  it("runs", () => { expect(1 + 1).toBe(2); });
});
```

- [ ] **Step 6: Install deps and run the sanity test**

Run: `cd /Users/suninrags/GolandProjects/hive_cartographer && npm install && npm test`
Expected: PASS — `1 passed` (the sanity test).

- [ ] **Step 7: Initialise git and commit**

```bash
cd /Users/suninrags/GolandProjects/hive_cartographer
git init
git add -A
git commit -m "chore: scaffold hive-cartographer module + vitest"
```

---

## Task 2: Geometry — coordinate, angle & distance helpers

**Files:**
- Create: `scripts/geometry.mjs`
- Test: `test/geometry.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// test/geometry.test.mjs
import { describe, it, expect } from "vitest";
import { polar, angleDeg, dist, toPx, toUnit } from "../scripts/geometry.mjs";

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

describe("polar", () => {
  it("0deg points +x, 90deg points +y (screen coords)", () => {
    const [x0, y0] = polar(100, 100, 50, 0);
    expect(near(x0, 150) && near(y0, 100)).toBe(true);
    const [x9, y9] = polar(100, 100, 50, 90);
    expect(near(x9, 100) && near(y9, 150)).toBe(true);
  });
});

describe("angleDeg / dist", () => {
  it("angleDeg is the inverse of polar direction", () => {
    expect(near(angleDeg(0, 0, 1, 0), 0)).toBe(true);
    expect(near(angleDeg(0, 0, 0, 1), 90)).toBe(true);
  });
  it("dist is euclidean", () => { expect(dist(0, 0, 3, 4)).toBe(5); });
});

describe("toPx / toUnit round-trip", () => {
  it("unit (0,0) maps to centre; round-trips", () => {
    const [px, py] = toPx(200, 200, 180, 0, 0);
    expect(px).toBe(200); expect(py).toBe(200);
    const [ux, uy] = toUnit(200, 200, 180, 290, 200);
    expect(near(ux, 0.5)).toBe(true); expect(near(uy, 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- geometry`
Expected: FAIL — cannot find module `../scripts/geometry.mjs`.

- [ ] **Step 3: Implement the helpers**

```javascript
// scripts/geometry.mjs
// Pure geometry. No Foundry, no DOM. Angles in degrees; screen coords (y grows downward).

const RAD = Math.PI / 180;

export function polar(cx, cy, r, deg) {
  const a = deg * RAD;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

export function angleDeg(cx, cy, px, py) {
  return Math.atan2(py - cy, px - cx) / RAD;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

// Normalized unit-disk coords (-1..1) -> pixels, given pixel centre (cx,cy) and pixel radius R.
export function toPx(cx, cy, R, ux, uy) {
  return [cx + ux * R, cy + uy * R];
}

// Pixels -> normalized unit-disk coords.
export function toUnit(cx, cy, R, px, py) {
  return [(px - cx) / R, (py - cy) / R];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- geometry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/geometry.mjs test/geometry.test.mjs
git commit -m "feat(geometry): coordinate, angle and distance helpers"
```

---

## Task 3: Geometry — wedge path generation

**Files:**
- Modify: `scripts/geometry.mjs`
- Test: `test/geometry.test.mjs` (append)

(Selection in the editor uses native SVG element hit-detection — clicking the actual shape element — so no `hitTest` helper is needed.)

- [ ] **Step 1: Append failing tests**

```javascript
// test/geometry.test.mjs  (append)
import { wedgePath } from "../scripts/geometry.mjs";

describe("wedgePath", () => {
  it("returns a closed SVG path starting at the centre", () => {
    const d = wedgePath(200, 200, 180, -90, -20, 1);
    expect(d.startsWith("M 200 200")).toBe(true);
    expect(d.trim().endsWith("Z")).toBe(true);
  });
  it("normalizes a1 below a0 by adding 360", () => {
    const d = wedgePath(0, 0, 100, 350, 10, 1); // sweeps through 360
    expect(typeof d).toBe("string");
    expect(d.length).toBeGreaterThan(10);
  });
  it("scales the outer radius by rOutUnit (a fraction of R)", () => {
    // a wedge at rOutUnit=0.5 should stay within ~half of R from the centre
    const d = wedgePath(0, 0, 100, 0, 90, 0.5);
    const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
    const maxR = Math.max(...xs.map((x, i) => Math.hypot(x, ys[i])));
    expect(maxR).toBeLessThan(55); // 0.5*100 plus the small organic wobble
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- geometry`
Expected: FAIL — `wedgePath` not exported.

- [ ] **Step 3: Implement wedgePath**

```javascript
// scripts/geometry.mjs  (append)

// SVG path for a pie sector from a0->a1 (deg) out to rOutUnit (0..1) of R, with a faint organic edge.
export function wedgePath(cx, cy, R, a0, a1, rOutUnit) {
  if (a1 < a0) a1 += 360;
  const rOut = rOutUnit * R;
  const steps = Math.max(6, Math.round((a1 - a0) / 8));
  const [sx, sy] = polar(cx, cy, rOut, a0);
  let d = `M ${cx} ${cy} L ${sx.toFixed(1)} ${sy.toFixed(1)} `;
  for (let s = 1; s <= steps; s++) {
    const a = a0 + (a1 - a0) * s / steps;
    const wob = rOut * (0.97 + 0.03 * Math.sin(a * 4.7 + a0));
    const [x, y] = polar(cx, cy, wob, a);
    d += `L ${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return d + "Z";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- geometry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/geometry.mjs test/geometry.test.mjs
git commit -m "feat(geometry): wedge path generation"
```

---

## Task 4: Geometry — layer cross-section band widths

**Files:**
- Modify: `scripts/geometry.mjs`
- Test: `test/geometry.test.mjs` (append)

- [ ] **Step 1: Append failing test**

```javascript
// test/geometry.test.mjs  (append)
import { layerBands } from "../scripts/geometry.mjs";

describe("layerBands", () => {
  it("returns one band per layer", () => {
    expect(layerBands(7)).toHaveLength(7);
  });
  it("each band's top is narrower than its bottom (taper)", () => {
    for (const b of layerBands(5)) expect(b.top).toBeLessThan(b.bot);
  });
  it("bands are continuous: a band's bottom equals the next band's top", () => {
    const bands = layerBands(6);
    for (let i = 0; i < bands.length - 1; i++) {
      expect(bands[i].bot).toBeCloseTo(bands[i + 1].top, 6);
    }
  });
  it("all half-widths stay within [minHalf, maxHalf]", () => {
    const bands = layerBands(9, 0.12, 0.46);
    for (const b of bands) {
      expect(b.top).toBeGreaterThanOrEqual(0.12 - 1e-9);
      expect(b.bot).toBeLessThanOrEqual(0.46 + 1e-9);
    }
  });
  it("handles a single layer", () => {
    expect(layerBands(1)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- geometry`
Expected: FAIL — `layerBands` not exported.

- [ ] **Step 3: Implement layerBands**

```javascript
// scripts/geometry.mjs  (append)

// Half-widths (fraction of total width, 0..0.5) for a tapering vertical stack of n layers.
// Edge k sits at lerp(minHalf, maxHalf, k/n); band i spans edge i (top) -> edge i+1 (bottom).
export function layerBands(n, minHalf = 0.12, maxHalf = 0.46) {
  const edge = (k) => minHalf + (maxHalf - minHalf) * (k / n);
  const bands = [];
  for (let i = 0; i < n; i++) bands.push({ top: edge(i), bot: edge(i + 1) });
  return bands;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- geometry`
Expected: PASS (all geometry tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/geometry.mjs test/geometry.test.mjs
git commit -m "feat(geometry): tapering cross-section band widths for N layers"
```

---

## Task 5: Hive model — defaults, factory, serialize, migrate

**Files:**
- Create: `scripts/data/hive-model.mjs`
- Test: `test/hive-model.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// test/hive-model.test.mjs
import { describe, it, expect } from "vitest";
import { defaultHive, defaultLayer, centralHub, serialize, migrate, SCHEMA_VERSION } from "../scripts/data/hive-model.mjs";

describe("defaults", () => {
  it("a default hive has one layer holding a central Spinal Transit circle", () => {
    const h = defaultHive();
    expect(h.version).toBe(SCHEMA_VERSION);
    expect(h.layers).toHaveLength(1);
    const regs = h.layers[0].regions;
    expect(regs).toHaveLength(1);
    expect(regs[0].type).toBe("circle");
    expect(regs[0].name).toBe("Spinal Transit");
    expect(h.layers[0].points).toEqual([]);
  });
  it("centralHub is centred", () => {
    const c = centralHub();
    expect(c.cx).toBe(0); expect(c.cy).toBe(0);
  });
  it("layers and entities get unique ids", () => {
    const a = defaultLayer("A", ""), b = defaultLayer("B", "");
    expect(a.id).not.toBe(b.id);
    expect(a.regions[0].id).not.toBe(b.regions[0].id);
  });
});

describe("serialize", () => {
  it("deep-clones (no shared references)", () => {
    const h = defaultHive();
    const s = serialize(h);
    s.layers[0].name = "Changed";
    expect(h.layers[0].name).not.toBe("Changed");
  });
});

describe("migrate", () => {
  it("repairs null/garbage to a valid default hive", () => {
    expect(migrate(null).layers).toHaveLength(1);
    expect(migrate({}).layers).toHaveLength(1);
    expect(migrate({ layers: [] }).layers).toHaveLength(1);
  });
  it("keeps a valid hive and fills missing fields", () => {
    const raw = { layers: [{ name: "Spire", regions: [{ type: "wedge", a0: 0, a1: 90 }], points: [] }] };
    const m = migrate(raw);
    expect(m.version).toBe(SCHEMA_VERSION);
    expect(m.layers[0].id).toBeTruthy();
    expect(m.layers[0].sub).toBe("");
    const w = m.layers[0].regions[0];
    expect(w.id).toBeTruthy();
    expect(w.rOut).toBe(1);          // default radius filled
    expect(w.color).toBeTruthy();
    expect(w.name).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- hive-model`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement defaults/factory/serialize/migrate**

```javascript
// scripts/data/hive-model.mjs
// Pure data model for a hive. No Foundry, no DOM. Geometry is normalized (see plan conventions).

export const SCHEMA_VERSION = 1;
export const PALETTE = ["#7c4a3a", "#4f6b5e", "#8a7338", "#54637a", "#6e4258", "#5d6b3a", "#7a5a3c", "#436a72"];

let _seq = 0;
export function newId(prefix = "id") {
  _seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${_seq.toString(36)}`;
}

export function centralHub() {
  return { id: newId("c"), type: "circle", name: "Spinal Transit", color: "#27323d", cx: 0, cy: 0, r: 0.15 };
}

export function defaultLayer(name, sub) {
  return { id: newId("L"), name, sub: sub || "", regions: [centralHub()], points: [] };
}

export function defaultHive() {
  return { version: SCHEMA_VERSION, name: "New Hive", layers: [defaultLayer("Surface", "")] };
}

export function serialize(model) {
  return JSON.parse(JSON.stringify(model));
}

function fixWedge(r) {
  return {
    id: r.id || newId("w"), type: "wedge",
    name: r.name || "District", color: r.color || PALETTE[0],
    a0: Number(r.a0) || 0, a1: Number.isFinite(r.a1) ? r.a1 : 90, rOut: Number.isFinite(r.rOut) ? r.rOut : 1,
  };
}
function fixCircle(r) {
  return {
    id: r.id || newId("c"), type: "circle",
    name: r.name || "Zone", color: r.color || PALETTE[1],
    cx: Number(r.cx) || 0, cy: Number(r.cy) || 0, r: Number.isFinite(r.r) ? r.r : 0.15,
  };
}
function fixPoint(p) {
  return { id: p.id || newId("p"), type: "point", name: p.name || "Landmark", x: Number(p.x) || 0, y: Number(p.y) || 0 };
}
function fixLayer(L) {
  const regions = Array.isArray(L.regions)
    ? L.regions.map((r) => (r.type === "circle" ? fixCircle(r) : fixWedge(r))) : [];
  const points = Array.isArray(L.points) ? L.points.map(fixPoint) : [];
  return { id: L.id || newId("L"), name: L.name || "Layer", sub: L.sub || "", regions, points };
}

export function migrate(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.layers) || raw.layers.length === 0) {
    return defaultHive();
  }
  return { version: SCHEMA_VERSION, name: raw.name || "Hive", layers: raw.layers.map(fixLayer) };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- hive-model`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/data/hive-model.mjs test/hive-model.test.mjs
git commit -m "feat(model): hive defaults, serialize and migrate"
```

---

## Task 6: Hive model — layer CRUD

**Files:**
- Modify: `scripts/data/hive-model.mjs`
- Test: `test/hive-model.test.mjs` (append)

- [ ] **Step 1: Append failing tests**

```javascript
// test/hive-model.test.mjs  (append)
import { addLayer, removeLayer, moveLayer, layerById } from "../scripts/data/hive-model.mjs";

describe("layer CRUD", () => {
  it("addLayer appends a layer with a central hub and returns its id", () => {
    const h = defaultHive();
    const id = addLayer(h, "Underhive", "Depths");
    expect(h.layers).toHaveLength(2);
    expect(layerById(h, id).name).toBe("Underhive");
    expect(layerById(h, id).regions[0].name).toBe("Spinal Transit");
  });
  it("removeLayer drops a layer but never the last one", () => {
    const h = defaultHive();
    const id = addLayer(h, "Second", "");
    expect(removeLayer(h, id)).toBe(true);
    expect(h.layers).toHaveLength(1);
    expect(removeLayer(h, h.layers[0].id)).toBe(false); // refuses to empty the hive
    expect(h.layers).toHaveLength(1);
  });
  it("moveLayer reorders up/down within bounds", () => {
    const h = defaultHive();
    const a = h.layers[0].id;
    const b = addLayer(h, "B", "");
    expect(moveLayer(h, b, -1)).toBe(true);    // B moves up
    expect(h.layers[0].id).toBe(b);
    expect(h.layers[1].id).toBe(a);
    expect(moveLayer(h, b, -1)).toBe(false);   // already at top
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- hive-model`
Expected: FAIL — `addLayer` etc. not exported.

- [ ] **Step 3: Implement layer CRUD**

```javascript
// scripts/data/hive-model.mjs  (append)

export function layerById(model, id) {
  return model.layers.find((L) => L.id === id) || null;
}

export function addLayer(model, name, sub) {
  const L = defaultLayer(name || "New Layer", sub || "");
  model.layers.push(L);
  return L.id;
}

export function removeLayer(model, id) {
  if (model.layers.length <= 1) return false;
  const i = model.layers.findIndex((L) => L.id === id);
  if (i < 0) return false;
  model.layers.splice(i, 1);
  return true;
}

// dir: -1 = up (towards index 0 / top of hive), +1 = down.
export function moveLayer(model, id, dir) {
  const i = model.layers.findIndex((L) => L.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= model.layers.length) return false;
  const [L] = model.layers.splice(i, 1);
  model.layers.splice(j, 0, L);
  return true;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- hive-model`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/data/hive-model.mjs test/hive-model.test.mjs
git commit -m "feat(model): layer add/remove/reorder"
```

---

## Task 7: Hive model — entity CRUD (districts, zones, landmarks)

**Files:**
- Modify: `scripts/data/hive-model.mjs`
- Test: `test/hive-model.test.mjs` (append)

- [ ] **Step 1: Append failing tests**

```javascript
// test/hive-model.test.mjs  (append)
import { addWedge, addCircle, addPoint, findEntity, removeEntity, renameEntity, recolour, PALETTE } from "../scripts/data/hive-model.mjs";

describe("entity CRUD", () => {
  it("adds a wedge district and finds it", () => {
    const h = defaultHive(); const L = h.layers[0];
    const id = addWedge(h, L.id, { name: "Gate 47", color: PALETTE[0], a0: -90, a1: -20, rOut: 0.9 });
    const w = findEntity(L, id);
    expect(w.type).toBe("wedge"); expect(w.name).toBe("Gate 47"); expect(w.a1).toBe(-20);
  });
  it("adds a zone circle and a landmark point", () => {
    const h = defaultHive(); const L = h.layers[0];
    const cid = addCircle(h, L.id, { name: "Market", color: PALETTE[1], cx: 0.3, cy: -0.2, r: 0.25 });
    const pid = addPoint(h, L.id, { name: "Cathedral", x: 0.5, y: 0.1 });
    expect(findEntity(L, cid).type).toBe("circle");
    expect(findEntity(L, pid).type).toBe("point");
    expect(L.points).toHaveLength(1);
  });
  it("rename, recolour and remove operate on regions or points", () => {
    const h = defaultHive(); const L = h.layers[0];
    const pid = addPoint(h, L.id, { name: "Old", x: 0, y: 0 });
    expect(renameEntity(L, pid, "New")).toBe(true);
    expect(findEntity(L, pid).name).toBe("New");
    const hub = L.regions[0];
    const before = hub.color;
    expect(recolour(L, hub.id)).not.toBe(before);   // cycles palette
    expect(removeEntity(L, pid)).toBe(true);
    expect(L.points).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- hive-model`
Expected: FAIL — entity functions not exported.

- [ ] **Step 3: Implement entity CRUD**

```javascript
// scripts/data/hive-model.mjs  (append)

export function addWedge(model, layerId, { name, color, a0, a1, rOut }) {
  const L = layerById(model, layerId); if (!L) return null;
  const w = { id: newId("w"), type: "wedge", name: name || "District", color: color || PALETTE[0], a0, a1, rOut };
  L.regions.push(w);
  return w.id;
}

export function addCircle(model, layerId, { name, color, cx, cy, r }) {
  const L = layerById(model, layerId); if (!L) return null;
  const c = { id: newId("c"), type: "circle", name: name || "Zone", color: color || PALETTE[1], cx, cy, r };
  L.regions.push(c);
  return c.id;
}

export function addPoint(model, layerId, { name, x, y }) {
  const L = layerById(model, layerId); if (!L) return null;
  const p = { id: newId("p"), type: "point", name: name || "Landmark", x, y };
  L.points.push(p);
  return p.id;
}

export function findEntity(layer, id) {
  return layer.regions.find((r) => r.id === id) || layer.points.find((p) => p.id === id) || null;
}

export function removeEntity(layer, id) {
  const r0 = layer.regions.length, p0 = layer.points.length;
  layer.regions = layer.regions.filter((r) => r.id !== id);
  layer.points = layer.points.filter((p) => p.id !== id);
  return layer.regions.length < r0 || layer.points.length < p0;
}

export function renameEntity(layer, id, name) {
  const e = findEntity(layer, id); if (!e) return false;
  e.name = name; return true;
}

// Cycle a region's colour through the palette. Points have no colour (returns null).
export function recolour(layer, id) {
  const e = findEntity(layer, id);
  if (!e || e.color === undefined) return null;
  e.color = PALETTE[(PALETTE.indexOf(e.color) + 1) % PALETTE.length];
  return e.color;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- hive-model`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/data/hive-model.mjs test/hive-model.test.mjs
git commit -m "feat(model): district/zone/landmark add, find, rename, recolour, remove"
```

---

## Task 8: Store — persistence adapter (load / save / subscribe)

**Files:**
- Create: `scripts/data/store.mjs`
- Test: `test/store.test.mjs`

The store wraps a small `adapter` so it is testable without Foundry. The adapter shape:
`{ read(): object|null, write(data): void, isGM(): boolean }`.

- [ ] **Step 1: Write the failing test**

```javascript
// test/store.test.mjs
import { describe, it, expect, vi } from "vitest";
import { loadHive, saveHive, subscribe, notify } from "../scripts/data/store.mjs";
import { defaultHive, SCHEMA_VERSION } from "../scripts/data/hive-model.mjs";

function fakeAdapter({ stored = null, gm = true } = {}) {
  let data = stored;
  return { read: () => data, write: (d) => { data = d; }, isGM: () => gm, _peek: () => data };
}

describe("loadHive", () => {
  it("migrates whatever is stored into a valid hive", () => {
    expect(loadHive(fakeAdapter({ stored: null })).layers).toHaveLength(1);
    const h = loadHive(fakeAdapter({ stored: { layers: [{ name: "X", regions: [], points: [] }] } }));
    expect(h.version).toBe(SCHEMA_VERSION);
  });
});

describe("saveHive", () => {
  it("writes serialized model when the user is GM", () => {
    const a = fakeAdapter({ gm: true });
    expect(saveHive(a, defaultHive())).toBe(true);
    expect(a._peek().layers).toHaveLength(1);
  });
  it("no-ops for non-GM users", () => {
    const a = fakeAdapter({ gm: false });
    expect(saveHive(a, defaultHive())).toBe(false);
    expect(a._peek()).toBe(null);
  });
});

describe("subscribe / notify", () => {
  it("invokes subscribers and supports unsubscribe", () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    notify({ ping: 1 });
    expect(cb).toHaveBeenCalledWith({ ping: 1 });
    off();
    notify({ ping: 2 });
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- store`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the store**

```javascript
// scripts/data/store.mjs
// Persistence + change broadcast. Foundry-agnostic via an injected `adapter`.
import { migrate, serialize } from "./hive-model.mjs";

const subs = new Set();

export function subscribe(cb) { subs.add(cb); return () => subs.delete(cb); }
export function notify(data) { for (const cb of subs) cb(data); }

export function loadHive(adapter) { return migrate(adapter.read()); }

export function saveHive(adapter, model) {
  if (!adapter.isGM()) return false;
  adapter.write(serialize(model));
  return true;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- store`
Expected: PASS. Then run the full suite: `npm test` — Expected: all geometry, hive-model, store and sanity tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/data/store.mjs test/store.test.mjs
git commit -m "feat(store): GM-guarded load/save + change subscription"
```

---

## Task 9: Module entry — register setting + Foundry settings adapter

**Files:**
- Create: `scripts/hive-cartographer.mjs`

This is Foundry-facing (manual verification). It registers the world setting, wires its `onChange` into `store.notify`, exposes the `foundryAdapter`, and exposes a module API (`open`) that later tasks fill in. The scene-control launcher is added in Task 14.

- [ ] **Step 1: Create the entry module**

```javascript
// scripts/hive-cartographer.mjs
import { notify } from "./data/store.mjs";

export const MODULE_ID = "hive-cartographer";

// Adapter that binds the store to Foundry's world setting.
export const foundryAdapter = {
  read: () => game.settings.get(MODULE_ID, "hive"),
  write: (data) => game.settings.set(MODULE_ID, "hive", data),
  isGM: () => game.user.isGM,
};

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "hive", {
    scope: "world",
    config: false,
    type: Object,
    default: {},                       // migrate() upgrades {} to a valid default hive on load
    onChange: (value) => notify(value), // fires on every client → open windows re-render
  });
  console.log(`${MODULE_ID} | initialised`);
});

// Module API (filled in by later tasks: open() renders the HiveApp).
Hooks.once("ready", () => {
  const mod = game.modules.get(MODULE_ID);
  mod.api = mod.api || {};
});
```

- [ ] **Step 2: Manual verification**

1. Symlink or copy the module folder into your Foundry `Data/modules/` (e.g. `ln -s /Users/suninrags/GolandProjects/hive_cartographer <FoundryData>/Data/modules/hive-cartographer`).
2. Launch a world, enable **Hive Cartographer** in *Manage Modules*, reload.
3. Open the browser console (F12). Expected: `hive-cartographer | initialised` logged, no errors.
4. In console run `game.settings.get("hive-cartographer","hive")` → returns `{}` (the raw default).

- [ ] **Step 3: Commit**

```bash
git add scripts/hive-cartographer.mjs
git commit -m "feat(entry): register world setting, settings adapter and change broadcast"
```

---

## Task 10: Styles, language strings, and the window template

**Files:**
- Create: `styles/hive-cartographer.css`
- Create: `lang/en.json`
- Create: `templates/hive-app.hbs`

The CSS is the atmosphere deliverable, ported from the approved mockup's `<style>` block at `docs/mockups/hive-map-mockup.html` with the panel/handle classes the panels will emit. Use the exact rules below.

- [ ] **Step 1: Create `styles/hive-cartographer.css`**

```css
/* Hive Cartographer — grimdark cogitator theme. Scoped to .hive-cart so it never leaks into Foundry. */
.hive-cart{
  --bg:#0a0c0f; --bg2:#0e1116; --panel:#13181e; --panel2:#191f27;
  --ink:#cdd6df; --ink2:#eef3f8; --muted:#7d8896; --faint:#566170;
  --gold:#c8a24a; --gold2:#e6c878; --glow:rgba(200,162,74,.45);
  --line:#2a333d; --line2:#384451; --teal:#5fae9a;
  --display:'Cinzel',serif; --cond:'Barlow Condensed',sans-serif; --mono:'IBM Plex Mono',monospace;
  color:var(--ink); font-family:var(--cond); letter-spacing:.3px;
  background:radial-gradient(120% 80% at 50% -10%, #16202b 0%, var(--bg) 55%), var(--bg);
  height:100%; display:flex; flex-direction:column; position:relative; overflow:hidden;
}
.hive-cart::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:5;
  background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px);mix-blend-mode:overlay;opacity:.5;}
.hive-cart::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:4;box-shadow:inset 0 0 180px 30px rgba(0,0,0,.8);}
.hive-cart .hc-main{flex:1;display:flex;min-height:0;position:relative;z-index:1;}

/* cross-section */
.hive-cart .hc-cross{width:240px;flex:0 0 240px;border-right:1px solid var(--line);padding:12px 8px;display:flex;flex-direction:column;background:linear-gradient(180deg,var(--bg2),var(--bg));}
.hive-cart .hc-collabel{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--faint);text-align:center;margin-bottom:6px;}
.hive-cart .hc-hive{position:relative;flex:1;display:flex;flex-direction:column;gap:2px;padding:0 6px;}
.hive-cart .hc-tier{position:relative;flex:1;cursor:pointer;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(180deg,var(--panel2),#0d1117);transition:filter .15s,background .15s;}
.hive-cart .hc-tier:hover{filter:brightness(1.35);}
.hive-cart .hc-tier .hc-chip{position:relative;z-index:2;padding:3px 10px;background:rgba(7,9,12,.72);border:1px solid var(--line2);
  font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--ink);white-space:nowrap;display:flex;gap:8px;align-items:center;}
.hive-cart .hc-tier .hc-chip b{font-weight:600;color:var(--ink2);}
.hive-cart .hc-tier .hc-chip .hc-lv{font-family:var(--mono);font-size:9px;color:var(--gold);}
.hive-cart .hc-tier.active{background:linear-gradient(180deg,#2c2410,#171307);}
.hive-cart .hc-tier.active .hc-chip{border-color:var(--gold);box-shadow:0 0 14px var(--glow);color:var(--gold2);}

/* layer view */
.hive-cart .hc-layer{flex:1;display:flex;flex-direction:column;min-width:0;}
.hive-cart .hc-head{padding:12px 18px 8px;border-bottom:1px solid var(--line);display:flex;align-items:baseline;gap:12px;}
.hive-cart .hc-head h2{margin:0;font-family:var(--display);font-size:20px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--ink2);}
.hive-cart .hc-head .hc-sub{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);}
.hive-cart .hc-head .hc-count{margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--faint);}
.hive-cart .hc-body{flex:1;display:flex;min-height:0;}
.hive-cart .hc-disk{flex:1;display:flex;align-items:center;justify-content:center;padding:14px;min-width:0;}
.hive-cart .hc-disk.draw{cursor:crosshair;}
.hive-cart .hc-disk svg{user-select:none;width:min(520px,100%);height:auto;}

/* svg entities */
.hive-cart .hc-region.clickable{cursor:pointer;}
.hive-cart .hc-region.clickable:hover{filter:brightness(1.3);}
.hive-cart .hc-region.sel{stroke:var(--gold2);stroke-width:2.5;filter:drop-shadow(0 0 8px var(--glow));}
.hive-cart .hc-disk:not(.draw) .hc-region.sel,.hive-cart .hc-disk:not(.draw) .hc-pmark.sel{cursor:move;}
.hive-cart .hc-rlabel{font-family:var(--cond);font-size:11px;letter-spacing:.5px;fill:#0c0f13;pointer-events:none;text-transform:uppercase;font-weight:600;}
.hive-cart .hc-clabel{font-family:var(--mono);font-size:8px;fill:var(--gold);letter-spacing:1px;text-transform:uppercase;pointer-events:none;}
.hive-cart .hc-ring{fill:none;stroke:rgba(200,162,74,.18);}
.hive-cart .hc-tick{stroke:rgba(200,162,74,.3);}
.hive-cart .hc-pmark{fill:var(--gold2);stroke:#0a0c0f;stroke-width:1.5;}
.hive-cart .hc-pmark.clickable{cursor:pointer;}
.hive-cart .hc-pmark.sel{fill:#fff;filter:drop-shadow(0 0 6px var(--glow));}
.hive-cart .hc-plabel{font-family:var(--cond);font-size:11px;font-weight:600;letter-spacing:.5px;fill:var(--gold2);
  paint-order:stroke;stroke:#06080b;stroke-width:3px;text-transform:uppercase;pointer-events:none;}
.hive-cart .hc-preview{fill:rgba(200,162,74,.18);stroke:var(--gold2);stroke-width:2;stroke-dasharray:5 4;}
.hive-cart .hc-handle{fill:var(--gold2);stroke:#06080b;stroke-width:1.5;cursor:pointer;}
.hive-cart .hc-handle:hover{fill:#fff;}

/* inspector */
.hive-cart .hc-insp{width:250px;flex:0 0 250px;border-left:1px solid var(--line);background:var(--bg2);display:flex;flex-direction:column;padding:12px 14px;gap:10px;overflow:auto;}
.hive-cart .hc-grp .hc-lbl{font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:var(--gold);border-bottom:1px solid var(--line);padding-bottom:5px;margin-bottom:8px;}
.hive-cart .hc-modes{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
.hive-cart .hc-tool{display:flex;align-items:center;gap:8px;font-family:var(--cond);font-size:12.5px;letter-spacing:1px;text-transform:uppercase;
  background:var(--panel);color:var(--ink);border:1px solid var(--line2);padding:6px 9px;cursor:pointer;transition:all .12s;}
.hive-cart .hc-tool:hover{border-color:var(--gold);color:var(--gold2);}
.hive-cart .hc-tool.active{background:#2a2110;border-color:var(--gold);color:var(--gold2);}
.hive-cart .hc-actions{display:flex;flex-direction:column;gap:6px;margin-top:8px;}
.hive-cart .hc-hint{font-size:11px;color:var(--faint);font-style:italic;line-height:1.45;margin-top:6px;}
.hive-cart .hc-info{border-top:1px solid var(--line);padding-top:10px;margin-top:6px;}
.hive-cart .hc-info .hc-lbl{font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:var(--faint);margin-bottom:8px;}
.hive-cart .hc-info .hc-name{display:flex;align-items:center;gap:9px;font-family:var(--display);font-size:15px;color:var(--ink2);text-transform:uppercase;letter-spacing:1px;}
.hive-cart .hc-info .hc-swatch{width:14px;height:14px;border:1px solid rgba(255,255,255,.3);}
.hive-cart .hc-info.empty .hc-name{color:var(--faint);font-family:var(--cond);font-style:italic;text-transform:none;}
.hive-cart.player .hc-grp.gm{display:none;}
```

- [ ] **Step 2: Create `lang/en.json`**

```json
{
  "HIVECART.Title": "Hive Cartographer",
  "HIVECART.OpenMap": "Hive Map",
  "HIVECART.CrossSection": "Vertical Cross-Section",
  "HIVECART.Tools": "Draw Tools",
  "HIVECART.Select": "Select",
  "HIVECART.District": "District",
  "HIVECART.Zone": "Zone",
  "HIVECART.Landmark": "Landmark",
  "HIVECART.Rename": "Rename Selected",
  "HIVECART.Recolour": "Recolour Selected",
  "HIVECART.Delete": "Delete Selected",
  "HIVECART.AddLayer": "Add Layer",
  "HIVECART.LayerUp": "Move Layer Up",
  "HIVECART.LayerDown": "Move Layer Down",
  "HIVECART.RenameLayer": "Rename Layer",
  "HIVECART.RemoveLayer": "Remove Layer",
  "HIVECART.Selection": "Selection",
  "HIVECART.NothingSelected": "Nothing selected",
  "HIVECART.PromptDistrict": "Name the district:",
  "HIVECART.PromptZone": "Name the zone:",
  "HIVECART.PromptLandmark": "Name the landmark:",
  "HIVECART.PromptLayer": "Name the layer:",
  "HIVECART.HintSelect": "Click to select. Drag the body to move (districts rotate; zones/landmarks slide). Drag the gold handles to resize.",
  "HIVECART.HintDistrict": "Press near the centre and drag around — sweep sets the width, distance sets the radius. Release to name it.",
  "HIVECART.HintZone": "Press where you want the centre and drag outward to set the radius.",
  "HIVECART.HintLandmark": "Click any spot to drop a named marker."
}
```

- [ ] **Step 3: Create `templates/hive-app.hbs`**

```handlebars
<div class="hive-cart {{roleClass}}">
  <div class="hc-main">
    <section class="hc-cross">
      <div class="hc-collabel">{{localize "HIVECART.CrossSection"}}</div>
      <div class="hc-hive" data-hc="hive"></div>
    </section>
    <section class="hc-layer">
      <div class="hc-head">
        <h2 data-hc="layerName">—</h2>
        <span class="hc-sub" data-hc="layerSub"></span>
        <span class="hc-count" data-hc="layerCount"></span>
      </div>
      <div class="hc-body">
        <div class="hc-disk" data-hc="disk"></div>
        <aside class="hc-insp">
          <div class="hc-grp gm">
            <div class="hc-lbl">{{localize "HIVECART.Tools"}}</div>
            <div class="hc-modes" data-hc="modes">
              <button class="hc-tool active" data-mode="select">{{localize "HIVECART.Select"}}</button>
              <button class="hc-tool" data-mode="wedge">{{localize "HIVECART.District"}}</button>
              <button class="hc-tool" data-mode="circle">{{localize "HIVECART.Zone"}}</button>
              <button class="hc-tool" data-mode="point">{{localize "HIVECART.Landmark"}}</button>
            </div>
            <div class="hc-actions">
              <button class="hc-tool" data-act="rename">{{localize "HIVECART.Rename"}}</button>
              <button class="hc-tool" data-act="recolour">{{localize "HIVECART.Recolour"}}</button>
              <button class="hc-tool" data-act="delete">{{localize "HIVECART.Delete"}}</button>
              <button class="hc-tool" data-act="addLayer">{{localize "HIVECART.AddLayer"}}</button>
              <button class="hc-tool" data-act="layerUp">{{localize "HIVECART.LayerUp"}}</button>
              <button class="hc-tool" data-act="layerDown">{{localize "HIVECART.LayerDown"}}</button>
              <button class="hc-tool" data-act="renameLayer">{{localize "HIVECART.RenameLayer"}}</button>
              <button class="hc-tool" data-act="removeLayer">{{localize "HIVECART.RemoveLayer"}}</button>
            </div>
            <div class="hc-hint" data-hc="hint"></div>
          </div>
          <div class="hc-info empty" data-hc="info">
            <div class="hc-lbl">{{localize "HIVECART.Selection"}}</div>
            <div class="hc-name">{{localize "HIVECART.NothingSelected"}}</div>
          </div>
        </aside>
      </div>
    </section>
  </div>
</div>
```

- [ ] **Step 4: Manual verification**

CSS/template have no runtime yet. Verify only that the JSON files parse:
Run: `node -e "JSON.parse(require('fs').readFileSync('lang/en.json','utf8')); console.log('lang ok')"`
Expected: `lang ok`.

- [ ] **Step 5: Commit**

```bash
git add styles/hive-cartographer.css lang/en.json templates/hive-app.hbs
git commit -m "feat(ui): grimdark theme, language strings and window template"
```

---

## Task 11: Cross-section panel

**Files:**
- Create: `scripts/apps/cross-section.mjs`

Renders the tapering layer stack into a container and calls back on layer click. Pure-ish: takes a container element + data + callback; uses `layerBands` from geometry. Manual verification (DOM).

- [ ] **Step 1: Create the panel**

```javascript
// scripts/apps/cross-section.mjs
import { layerBands } from "../geometry.mjs";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Render the vertical layer stack. layers: model.layers (index 0 = top). onSelect(index).
export function renderCrossSection(container, layers, activeIndex, onSelect) {
  const bands = layerBands(layers.length);
  // grow weights give a subtle organic height variance, peaking in the middle
  const grow = (i, n) => 0.8 + 0.35 * Math.sin((i + 0.5) / n * Math.PI);
  container.innerHTML = "";
  layers.forEach((L, i) => {
    const b = bands[i];
    const tl = (50 - b.top * 100).toFixed(1), tr = (50 + b.top * 100).toFixed(1);
    const bl = (50 - b.bot * 100).toFixed(1), br = (50 + b.bot * 100).toFixed(1);
    const div = document.createElement("div");
    div.className = "hc-tier" + (i === activeIndex ? " active" : "");
    div.style.clipPath = `polygon(${tl}% 0, ${tr}% 0, ${br}% 100%, ${bl}% 100%)`;
    div.style.flexGrow = grow(i, layers.length).toFixed(3);
    div.addEventListener("click", () => onSelect(i));
    div.innerHTML = `<div class="hc-chip"><span class="hc-lv">L${layers.length - i}</span><b>${esc(L.name)}</b></div>`;
    container.appendChild(div);
  });
}
```

- [ ] **Step 2: Manual verification**

Deferred — verified end-to-end once `HiveApp` mounts it in Task 13. Confirm the file has no syntax errors:
Run: `node --check scripts/apps/cross-section.mjs`
Expected: no output (valid).

- [ ] **Step 3: Commit**

```bash
git add scripts/apps/cross-section.mjs
git commit -m "feat(ui): cross-section layer-stack panel"
```

---

## Task 12: Disk editor panel (SVG render + draw/move/resize)

**Files:**
- Create: `scripts/apps/disk-editor.mjs`

The interactive floor. It owns no model state — the host (`HiveApp`) passes a `ctx` of getters and action callbacks. The editor renders the current layer to SVG and translates pointer gestures into `ctx` calls. Adapted from the approved mockup, converted to the normalized model via `geometry`. Manual verification (Task 13).

`ctx` interface (provided by HiveApp in Task 13):
```
{
  getLayer(): layer,            getSelection(): id|null,
  getMode(): 'select'|'wedge'|'circle'|'point',   isGM(): boolean,
  select(id|null),
  addWedge({name,color,a0,a1,rOut}),  addCircle({name,color,cx,cy,r}),  addPoint({name,x,y}),
  mutateSelected(fn(entity)),   // apply a geometry edit to the selected entity, then persist+rerender
  promptName(messageKey, dflt): string|null,
  nextColor(): string,          // palette colour for a new region
}
```

- [ ] **Step 1: Create the disk editor**

```javascript
// scripts/apps/disk-editor.mjs
import { polar, angleDeg, toUnit, wedgePath } from "../geometry.mjs";

const VB = 420, CXp = 210, CYp = 210, Rp = 192;   // svg viewBox space
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function createDiskEditor(container, ctx) {
  let drag = null;      // active draw gesture
  let selDrag = null;   // active move/resize gesture

  function svgEl() { return container.querySelector("svg"); }
  function toViewbox(e) {
    const svg = svgEl(); const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (VB / r.width), y: (e.clientY - r.top) * (VB / r.height) };
  }
  function unit(p) { return toUnit(CXp, CYp, Rp, p.x, p.y); }            // viewbox px -> model unit
  const handle = (x, y, n) => `<circle class="hc-handle" data-handle="${n}" cx="${x}" cy="${y}" r="6"/>`;

  function render() {
    const L = ctx.getLayer(), sel = ctx.getSelection(), gm = ctx.isGM(), selectMode = ctx.getMode() === "select";
    const clickable = gm && selectMode;
    let s = `<svg viewBox="0 0 ${VB} ${VB}">`;
    s += `<circle class="hc-ring" cx="${CXp}" cy="${CYp}" r="${Rp + 6}"/><circle class="hc-ring" cx="${CXp}" cy="${CYp}" r="${Rp + 11}" style="stroke:rgba(200,162,74,.35)"/>`;
    for (let t = 0; t < 24; t++) {
      const a = t * 15, [x1, y1] = polar(CXp, CYp, Rp + 6, a), [x2, y2] = polar(CXp, CYp, Rp + (t % 6 === 0 ? 16 : 11), a);
      s += `<line class="hc-tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }
    // wedges
    for (const w of L.regions.filter((r) => r.type === "wedge")) {
      const on = w.id === sel;
      s += `<path class="hc-region${clickable ? " clickable" : ""}${on ? " sel" : ""}" data-id="${w.id}" d="${wedgePath(CXp, CYp, Rp, w.a0, w.a1, w.rOut)}" fill="${w.color}" fill-opacity="${on ? .95 : .8}" stroke="rgba(0,0,0,.45)" stroke-width="1"/>`;
      const [lx, ly] = polar(CXp, CYp, w.rOut * Rp * 0.6, (w.a0 + (w.a1 < w.a0 ? w.a1 + 360 : w.a1)) / 2);
      s += `<text class="hc-rlabel" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${esc(w.name)}</text>`;
    }
    // circles
    for (const c of L.regions.filter((r) => r.type === "circle")) {
      const on = c.id === sel, [px, py] = [CXp + c.cx * Rp, CYp + c.cy * Rp], pr = c.r * Rp;
      s += `<circle class="hc-region${clickable ? " clickable" : ""}${on ? " sel" : ""}" data-id="${c.id}" cx="${px}" cy="${py}" r="${pr}" fill="${c.color}" fill-opacity="${on ? .95 : .85}" stroke="rgba(200,162,74,.5)" stroke-width="1.2"/>`;
      s += `<text class="hc-clabel" x="${px}" y="${py}" text-anchor="middle" dominant-baseline="middle">${esc(c.name)}</text>`;
    }
    // landmarks
    for (const p of L.points) {
      const on = p.id === sel, [px, py] = [CXp + p.x * Rp, CYp + p.y * Rp], d = 8;
      s += `<path class="hc-pmark${clickable ? " clickable" : ""}${on ? " sel" : ""}" data-id="${p.id}" d="M ${px} ${py - d} L ${px + d} ${py} L ${px} ${py + d} L ${px - d} ${py} Z"/>`;
      s += `<text class="hc-plabel" x="${px + d + 4}" y="${py + 4}">${esc(p.name)}</text>`;
    }
    // selection handles
    if (clickable && sel) {
      const e = L.regions.find((r) => r.id === sel);
      if (e && e.type === "circle") s += handle(CXp + e.cx * Rp + e.r * Rp, CYp + e.cy * Rp, "resizeR");
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
    }
    s += `</svg>`;
    container.innerHTML = s;
    container.classList.toggle("draw", gm && !selectMode);
  }

  function onDown(e) {
    if (!ctx.isGM() || !svgEl()) return;
    const mode = ctx.getMode();
    if (mode !== "select") {
      const p = toViewbox(e), [ux, uy] = unit(p); e.preventDefault();
      if (mode === "point") { const name = ctx.promptName("HIVECART.PromptLandmark", "New Landmark"); if (name) ctx.addPoint({ name, x: ux, y: uy }); return; }
      if (mode === "wedge") { const a = angleDeg(0, 0, ux, uy); drag = { kind: "wedge", start: a, a0: a, a1: a + 1, rOut: Math.min(1, Math.max(0.3, Math.hypot(ux, uy))) }; }
      if (mode === "circle") { drag = { kind: "circle", cx: ux, cy: uy, r: 0.03 }; }
      return;
    }
    const t = e.target, ds = t.dataset || {};
    if (ds.handle && ctx.getSelection()) { selDrag = { kind: ds.handle }; e.preventDefault(); return; }
    if (ds.id) {
      ctx.select(ds.id); render();
      const L = ctx.getLayer(), o = L.regions.find((r) => r.id === ds.id) || L.points.find((p) => p.id === ds.id);
      const sp = unit(toViewbox(e));
      selDrag = { kind: "move", startU: sp, orig: snapshot(o) };
      e.preventDefault(); return;
    }
    ctx.select(null); render();
  }

  function snapshot(o) {
    return o.type === "wedge" ? { a0: o.a0, a1: o.a1 } : o.type === "circle" ? { cx: o.cx, cy: o.cy } : { x: o.x, y: o.y };
  }

  function onMove(e) {
    if (drag) {
      const p = toViewbox(e), [ux, uy] = unit(p);
      if (drag.kind === "wedge") { let span = angleDeg(0, 0, ux, uy) - drag.start; if (span < 0) span += 360; drag.a0 = drag.start; drag.a1 = drag.start + Math.max(span, 1); drag.rOut = Math.min(1, Math.max(0.28, Math.hypot(ux, uy))); }
      if (drag.kind === "circle") { drag.r = Math.max(0.04, Math.hypot(ux - drag.cx, uy - drag.cy)); }
      render(); return;
    }
    if (selDrag) {
      const [ux, uy] = unit(toViewbox(e));
      ctx.mutateSelected((o) => {
        if (selDrag.kind === "move") {
          if (o.type === "wedge") { const da = angleDeg(0, 0, ux, uy) - angleDeg(0, 0, selDrag.startU[0], selDrag.startU[1]); o.a0 = selDrag.orig.a0 + da; o.a1 = selDrag.orig.a1 + da; }
          else if (o.type === "circle") { o.cx = selDrag.orig.cx + (ux - selDrag.startU[0]); o.cy = selDrag.orig.cy + (uy - selDrag.startU[1]); }
          else { o.x = selDrag.orig.x + (ux - selDrag.startU[0]); o.y = selDrag.orig.y + (uy - selDrag.startU[1]); }
        } else if (selDrag.kind === "resizeR") {
          if (o.type === "circle") o.r = Math.max(0.04, Math.hypot(ux - o.cx, uy - o.cy));
          else o.rOut = Math.min(1, Math.max(0.28, Math.hypot(ux, uy)));
        } else if (selDrag.kind === "a0") { o.a0 = angleDeg(0, 0, ux, uy); }
        else if (selDrag.kind === "a1") { let a = angleDeg(0, 0, ux, uy); while (a < o.a0) a += 360; o.a1 = a; }
      }, { persist: false });
      render();
    }
  }

  function onUp() {
    if (selDrag) { selDrag = null; ctx.mutateSelected(() => {}, { persist: true }); return; }
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === "wedge" && (d.a1 - d.a0) >= 8) { const name = ctx.promptName("HIVECART.PromptDistrict", "New District"); if (name) ctx.addWedge({ name, color: ctx.nextColor(), a0: d.a0, a1: d.a1, rOut: d.rOut }); }
    if (d.kind === "circle" && d.r >= 0.05) { const name = ctx.promptName("HIVECART.PromptZone", "New Zone"); if (name) ctx.addCircle({ name, color: ctx.nextColor(), cx: d.cx, cy: d.cy, r: d.r }); }
    render();
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

- [ ] **Step 2: Manual verification**

Deferred to Task 13 (needs HiveApp). Confirm no syntax errors:
Run: `node --check scripts/apps/disk-editor.mjs`
Expected: no output (valid).

- [ ] **Step 3: Commit**

```bash
git add scripts/apps/disk-editor.mjs
git commit -m "feat(ui): SVG disk editor — draw, move and resize districts/zones/landmarks"
```

---

## Task 13: HiveApp — compose panels, own state, persist + sync

**Files:**
- Create: `scripts/apps/hive-app.mjs`
- Modify: `scripts/hive-cartographer.mjs` (wire `api.open`)

`HiveApp` is the `ApplicationV2` window. It owns: the loaded model, current layer index, selection id, tool mode. It renders the template, mounts the cross-section and disk editor, wires the inspector buttons, persists via `store.saveHive` (debounced during drags), and re-renders on `store.subscribe` so players see GM edits live.

- [ ] **Step 1: Create the app**

```javascript
// scripts/apps/hive-app.mjs
import { loadHive, saveHive, subscribe } from "../data/store.mjs";
import { foundryAdapter, MODULE_ID } from "../hive-cartographer.mjs";
import { renderCrossSection } from "./cross-section.mjs";
import { createDiskEditor } from "./disk-editor.mjs";
import * as M from "../data/hive-model.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const HINT = { select: "HIVECART.HintSelect", wedge: "HIVECART.HintDistrict", circle: "HIVECART.HintZone", point: "HIVECART.HintLandmark" };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export class HiveApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hive-cartographer-app",
    classes: ["hive-cartographer-window"],
    window: { title: "HIVECART.Title", resizable: true },
    position: { width: 1080, height: 720 },
  };
  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/hive-app.hbs` } };

  #cur = 0; #sel = null; #mode = "select"; #disk = null; #unsub = null; #colorN = 0;

  async _prepareContext() {
    return { roleClass: game.user.isGM ? "gm" : "player" };
  }

  _onRender() {
    this.model = loadHive(foundryAdapter);
    if (this.#cur >= this.model.layers.length) this.#cur = 0;
    const root = this.element;
    // inspector buttons
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener("click", () => this.#setMode(b.dataset.mode)));
    root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener("click", () => this.#action(b.dataset.act)));
    // disk editor (destroy any prior instance's window listeners first)
    this.#disk?.destroy();
    this.#disk = createDiskEditor(root.querySelector('[data-hc="disk"]'), this.#ctx());
    this.#renderAll();
    // live sync: re-render when the world setting changes on any client
    this.#unsub?.();
    this.#unsub = subscribe(() => { this.model = loadHive(foundryAdapter); this.#renderAll(); });
  }

  _onClose() { this.#unsub?.(); this.#disk?.destroy(); }

  layer() { return this.model.layers[this.#cur]; }

  #ctx() {
    return {
      getLayer: () => this.layer(),
      getSelection: () => this.#sel,
      getMode: () => this.#mode,
      isGM: () => game.user.isGM,
      select: (id) => { this.#sel = id; this.#renderInfo(); },
      addWedge: (d) => { M.addWedge(this.model, this.layer().id, d); this.#persist(); this.#renderAll(); },
      addCircle: (d) => { M.addCircle(this.model, this.layer().id, d); this.#persist(); this.#renderAll(); },
      addPoint: (d) => { M.addPoint(this.model, this.layer().id, d); this.#persist(); this.#renderAll(); },
      mutateSelected: (fn, { persist = true } = {}) => {
        const e = this.#sel && M.findEntity(this.layer(), this.#sel);
        if (e) fn(e);
        if (persist) this.#persist();
      },
      promptName: (key, dflt) => { const v = prompt(game.i18n.localize(key), dflt); return v && v.trim() ? v.trim() : null; },
      nextColor: () => M.PALETTE[this.#colorN++ % M.PALETTE.length],
    };
  }

  #setMode(m) {
    this.#mode = m; this.#sel = null;
    this.element.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    this.element.querySelector('[data-hc="hint"]').textContent = game.i18n.localize(HINT[m]);
    this.#renderAll();
  }

  #action(act) {
    const L = this.layer();
    if (act === "rename") { const e = this.#sel && M.findEntity(L, this.#sel); if (!e) return ui.notifications.warn("Select something first."); const n = prompt("Rename:", e.name); if (n) { M.renameEntity(L, this.#sel, n); this.#persist(); this.#renderAll(); } }
    else if (act === "recolour") { if (!this.#sel || !M.recolour(L, this.#sel)) return ui.notifications.warn("Pick a district or zone."); this.#persist(); this.#renderAll(); }
    else if (act === "delete") { if (!this.#sel || !M.removeEntity(L, this.#sel)) return ui.notifications.warn("Select something first."); this.#sel = null; this.#persist(); this.#renderAll(); }
    else if (act === "addLayer") { const n = prompt(game.i18n.localize("HIVECART.PromptLayer"), "New Layer"); if (!n) return; M.addLayer(this.model, n, ""); this.#cur = this.model.layers.length - 1; this.#sel = null; this.#persist(); this.#renderAll(); }
    else if (act === "layerUp") { if (M.moveLayer(this.model, L.id, -1)) { this.#cur = Math.max(0, this.#cur - 1); this.#persist(); this.#renderAll(); } }
    else if (act === "layerDown") { if (M.moveLayer(this.model, L.id, 1)) { this.#cur = Math.min(this.model.layers.length - 1, this.#cur + 1); this.#persist(); this.#renderAll(); } }
    else if (act === "renameLayer") { const n = prompt(game.i18n.localize("HIVECART.PromptLayer"), L.name); if (n) { L.name = n; this.#persist(); this.#renderAll(); } }
    else if (act === "removeLayer") { if (M.removeLayer(this.model, L.id)) { this.#cur = Math.max(0, this.#cur - 1); this.#sel = null; this.#persist(); this.#renderAll(); } else ui.notifications.warn("A hive needs at least one layer."); }
  }

  #persist() { saveHive(foundryAdapter, this.model); }

  #renderAll() {
    const root = this.element; const L = this.layer();
    renderCrossSection(root.querySelector('[data-hc="hive"]'), this.model.layers, this.#cur, (i) => { this.#cur = i; this.#sel = null; this.#renderAll(); });
    root.querySelector('[data-hc="layerName"]').textContent = L.name;
    root.querySelector('[data-hc="layerSub"]').textContent = L.sub || "";
    root.querySelector('[data-hc="layerCount"]').textContent = `LAYER ${this.model.layers.length - this.#cur} / ${this.model.layers.length} · ${L.regions.length} REGIONS · ${L.points.length} LANDMARKS`;
    this.#renderInfo();   // also re-renders the disk (selection highlight)
  }

  #renderInfo() {
    this.#disk.render();
    const box = this.element.querySelector('[data-hc="info"]'); const e = this.#sel && M.findEntity(this.layer(), this.#sel);
    if (!e) { box.className = "hc-info empty"; box.innerHTML = `<div class="hc-lbl">${game.i18n.localize("HIVECART.Selection")}</div><div class="hc-name">${game.i18n.localize("HIVECART.NothingSelected")}</div>`; return; }
    const kind = e.type === "wedge" ? "District" : e.type === "circle" ? "Zone" : "Landmark";
    const sw = `<span class="hc-swatch" style="background:${e.color || "var(--gold2)"}"></span>`;
    box.className = "hc-info";
    box.innerHTML = `<div class="hc-lbl">${game.i18n.localize("HIVECART.Selection")}</div><div class="hc-name">${sw}${esc(e.name)} <span style="font-family:var(--mono);font-size:9px;color:var(--gold);border:1px solid var(--line2);padding:1px 5px;">${kind}</span></div>`;
  }
}
```

- [ ] **Step 2: Wire `api.open` in the entry module**

Replace the `ready` hook in `scripts/hive-cartographer.mjs` with:

```javascript
// scripts/hive-cartographer.mjs  (replace the ready hook)
Hooks.once("ready", async () => {
  const { HiveApp } = await import("./apps/hive-app.mjs");
  const mod = game.modules.get(MODULE_ID);
  mod.api = { open: () => new HiveApp().render(true) };
});
```

- [ ] **Step 3: Manual verification (the big one)**

1. Reload Foundry with the module enabled.
2. In console: `game.modules.get("hive-cartographer").api.open()` → the window opens with one layer ("Surface") showing the central Spinal Transit hub.
3. **Draw:** click **District**, drag around the centre → release → name it → a wedge appears. Click **Zone**, drag out a circle → name it. Click **Landmark**, click a spot → name it.
4. **Select/move/resize:** click **Select**, click the wedge → drag its body (rotates), drag the edge/radius handles (resizes). Drag the hub zone off-centre and resize it.
5. **Rename/Recolour/Delete** the selected entity from the buttons.
6. **Layers:** Add Layer, switch layers in the cross-section, Move Layer Up/Down, Rename Layer, Remove Layer (refuses the last one).
7. **Persistence:** close and reopen the window → your edits are still there. Reload the world → still there.
8. **Sync + permissions:** open the same world as a player (second browser/incognito). The player sees the map with **no draw tools** (read-only) and can switch layers. Make a GM edit → the player's open window updates within a moment.

Fix any issues found before committing.

- [ ] **Step 4: Commit**

```bash
git add scripts/apps/hive-app.mjs scripts/hive-cartographer.mjs
git commit -m "feat(ui): HiveApp window — compose panels, persist edits, live GM->player sync"
```

---

## Task 14: Scene-control launcher, README polish, release flow

**Files:**
- Modify: `scripts/hive-cartographer.mjs` (add launcher)
- Create: `tools/package.sh`
- Modify: `README.md`

- [ ] **Step 1: Add the scene-control launcher**

Append to `scripts/hive-cartographer.mjs`:

```javascript
// scripts/hive-cartographer.mjs  (append)
// Scene-controls launcher. The control/tool API shape varies across Foundry versions; this targets
// v13/v14 record-style controls. If the button does not appear, the reliable fallback is
// game.modules.get("hive-cartographer").api.open() — verify and adjust property names per version.
Hooks.on("getSceneControlButtons", (controls) => {
  const open = () => game.modules.get(MODULE_ID).api?.open();
  const group = controls.tokens ?? Object.values(controls)[0];
  if (!group?.tools) return;
  group.tools.hiveMap = {
    name: "hiveMap",
    title: game.i18n.localize("HIVECART.OpenMap"),
    icon: "fa-solid fa-city",
    button: true,
    onChange: () => open(),
    onClick: () => open(),
  };
});
```

- [ ] **Step 2: Manual verification**

Reload Foundry. Expected: a **city** icon appears in the Token scene-controls group; clicking it opens the Hive Cartographer window. (If absent on your version, confirm `api.open()` still works and adjust the hook per the running version's scene-control docs.)

- [ ] **Step 3: Create `tools/package.sh` (release zip)**

```bash
#!/usr/bin/env bash
# Build the distributable module zip (runtime files only).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f hive-cartographer.zip
zip -r hive-cartographer.zip \
  module.json scripts styles templates lang \
  -x '*/.DS_Store'
echo "Built hive-cartographer.zip"
```

Make it executable and test it:
Run: `chmod +x tools/package.sh && bash tools/package.sh && unzip -l hive-cartographer.zip | grep -E "module.json|scripts/hive-cartographer.mjs"`
Expected: both files listed; no `node_modules`, no `test`, no `docs`.

- [ ] **Step 4: Append release instructions to `README.md`**

```markdown

## Releasing

1. Bump `version` in `module.json`; commit.
2. `bash tools/package.sh` → builds `hive-cartographer.zip`.
3. Create a GitHub release tagged `vX.Y.Z` with **both** `hive-cartographer.zip` and `module.json` attached,
   so the `releases/latest/download/...` URLs in the manifest resolve.

Install URL (Foundry → Install Module → Manifest URL):
`https://github.com/NarShaada/hive-cartographer/releases/latest/download/module.json`
```

- [ ] **Step 5: Commit**

```bash
git add scripts/hive-cartographer.mjs tools/package.sh README.md
git commit -m "feat(entry): scene-control launcher + release packaging"
```

- [ ] **Step 6: Final full-suite check**

Run: `npm test`
Expected: all `geometry`, `hive-model`, `store`, and sanity tests PASS.

---

## Done criteria

- `npm test` green (geometry, model, store).
- In Foundry: GM can open the map, draw/move/resize districts/zones/landmarks, manage layers; edits persist across reloads; players see a live, read-only view.
- The release zip contains only runtime files.

## Out of scope (deferred — see spec §10)

Multiple maps per world, GM-only notes / per-entity player visibility, journal/scene links, image backgrounds, snap aids. Do **not** build these now.
