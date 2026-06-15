import { describe, it, expect } from "vitest";
import { defaultHive, defaultLayer, serialize, migrate, SCHEMA_VERSION } from "../scripts/data/hive-model.mjs";
import { addLayer, removeLayer, moveLayer, layerById } from "../scripts/data/hive-model.mjs";
import { addWedge, addCircle, addPoint, findEntity, removeEntity, renameEntity, setColor, bringToFront, sendToBack, PALETTE } from "../scripts/data/hive-model.mjs";

describe("defaults", () => {
  it("a default hive has one empty layer (no seeded regions)", () => {
    const h = defaultHive();
    expect(h.version).toBe(SCHEMA_VERSION);
    expect(h.updatedAt).toBe(null);
    expect(h.layers).toHaveLength(1);
    expect(h.layers[0].regions).toEqual([]);
    expect(h.layers[0].points).toEqual([]);
  });
  it("layers and entities get unique ids", () => {
    expect(defaultLayer("X", "").id).not.toBe(defaultLayer("Y", "").id);
    const h = defaultHive(); const L = h.layers[0];
    const a = addWedge(h, L.id, { name: "A" });
    const b = addWedge(h, L.id, { name: "B" });
    expect(a).not.toBe(b);
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
    expect(w.rOut).toBe(1);
    expect(w.color).toBeTruthy();
    expect(w.name).toBeTruthy();
  });
  it("preserves a finite updatedAt and defaults it to null", () => {
    expect(migrate({ layers: [{ regions: [], points: [] }], updatedAt: 123 }).updatedAt).toBe(123);
    expect(migrate({ layers: [{ regions: [], points: [] }] }).updatedAt).toBe(null);
  });
});

describe("layer CRUD", () => {
  it("addLayer appends an empty layer and returns its id", () => {
    const h = defaultHive();
    const id = addLayer(h, "Underhive", "Depths");
    expect(h.layers).toHaveLength(2);
    expect(layerById(h, id).name).toBe("Underhive");
    expect(layerById(h, id).regions).toEqual([]);
  });
  it("removeLayer drops a layer but never the last one", () => {
    const h = defaultHive();
    const id = addLayer(h, "Second", "");
    expect(removeLayer(h, id)).toBe(true);
    expect(h.layers).toHaveLength(1);
    expect(removeLayer(h, h.layers[0].id)).toBe(false);
    expect(h.layers).toHaveLength(1);
  });
  it("moveLayer reorders up/down within bounds", () => {
    const h = defaultHive();
    const a = h.layers[0].id;
    const b = addLayer(h, "B", "");
    expect(moveLayer(h, b, -1)).toBe(true);
    expect(h.layers[0].id).toBe(b);
    expect(h.layers[1].id).toBe(a);
    expect(moveLayer(h, b, -1)).toBe(false);
  });
});

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
  it("rename, setColor and remove operate on regions or points", () => {
    const h = defaultHive(); const L = h.layers[0];
    const cid = addCircle(h, L.id, { name: "Zone", cx: 0, cy: 0, r: 0.2 });
    const pid = addPoint(h, L.id, { name: "Old", x: 0, y: 0 });
    expect(renameEntity(L, pid, "New")).toBe(true);
    expect(findEntity(L, pid).name).toBe("New");
    expect(setColor(L, cid, "#abcdef")).toBe(true);
    expect(findEntity(L, cid).color).toBe("#abcdef");
    expect(setColor(L, pid, "#abcdef")).toBe(false);   // points have no colour
    expect(removeEntity(L, pid)).toBe(true);
    expect(L.points).toHaveLength(0);
  });
});

describe("z-order", () => {
  it("bringToFront moves a region to the end (top) of the array", () => {
    const h = defaultHive(); const L = h.layers[0];
    const a = addWedge(h, L.id, { name: "A" });
    const b = addWedge(h, L.id, { name: "B" });
    expect(L.regions[L.regions.length - 1].id).toBe(b);
    expect(bringToFront(L, a)).toBe(true);
    expect(L.regions[L.regions.length - 1].id).toBe(a);
  });
  it("sendToBack moves a region to the start (bottom) of the array", () => {
    const h = defaultHive(); const L = h.layers[0];
    const a = addWedge(h, L.id, { name: "A" });
    const b = addWedge(h, L.id, { name: "B" });
    expect(sendToBack(L, b)).toBe(true);
    expect(L.regions[0].id).toBe(b);
  });
});

describe("invariants and edge cases", () => {
  it("moveLayer returns false at the bottom bound", () => {
    const h = defaultHive();
    const b = addLayer(h, "B", "");
    expect(moveLayer(h, b, 1)).toBe(false);   // already last
  });
  it("addWedge fills safe defaults when geometry is omitted", () => {
    const h = defaultHive(); const L = h.layers[0];
    const id = addWedge(h, L.id, { name: "Bare" });
    const w = findEntity(L, id);
    expect(Number.isFinite(w.a0)).toBe(true);
    expect(Number.isFinite(w.a1)).toBe(true);
    expect(w.rOut).toBe(1);
  });
});
