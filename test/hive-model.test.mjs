import { describe, it, expect } from "vitest";
import { defaultHive, defaultMap, defaultLayer, serialize, migrate, SCHEMA_VERSION } from "../scripts/data/hive-model.mjs";
import { mapById, addMap, removeMap, renameMap } from "../scripts/data/hive-model.mjs";
import { addLayer, removeLayer, moveLayer, layerById } from "../scripts/data/hive-model.mjs";
import { addWedge, addCircle, addPoint, findEntity, removeEntity, renameEntity, setColor, bringToFront, sendToBack, addRect, setDescription, cycleLabelPos, PALETTE } from "../scripts/data/hive-model.mjs";

describe("defaults", () => {
  it("a default document has one map with one empty layer", () => {
    const d = defaultHive();
    expect(d.version).toBe(SCHEMA_VERSION);
    expect(d.maps).toHaveLength(1);
    expect(d.maps[0].name).toBeTruthy();
    expect(d.maps[0].singleLayer).toBe(false);
    expect(d.maps[0].updatedAt).toBe(null);
    expect(d.maps[0].layers).toHaveLength(1);
    expect(d.maps[0].layers[0].regions).toEqual([]);
  });
  it("maps and layers get unique ids", () => {
    expect(defaultMap("A").id).not.toBe(defaultMap("B").id);
    expect(defaultLayer("X", "").id).not.toBe(defaultLayer("Y", "").id);
  });
});

describe("serialize", () => {
  it("deep-clones (no shared references)", () => {
    const d = defaultHive();
    const s = serialize(d);
    s.maps[0].name = "Changed";
    expect(d.maps[0].name).not.toBe("Changed");
  });
});

describe("migrate", () => {
  it("repairs null/garbage to a valid one-map document", () => {
    expect(migrate(null).maps).toHaveLength(1);
    expect(migrate({}).maps).toHaveLength(1);
    expect(migrate({ maps: [] }).maps).toHaveLength(1);
    expect(migrate({ layers: [] }).maps).toHaveLength(1);
  });
  it("wraps a v1 single-hive (raw.layers) as the first map, carrying name + updatedAt", () => {
    const raw = { version: 1, name: "Hive Primaris", updatedAt: 123, layers: [{ name: "Spire", regions: [{ type: "wedge", a0: 0, a1: 90 }], points: [] }] };
    const d = migrate(raw);
    expect(d.version).toBe(SCHEMA_VERSION);
    expect(d.maps).toHaveLength(1);
    expect(d.maps[0].name).toBe("Hive Primaris");
    expect(d.maps[0].updatedAt).toBe(123);
    expect(d.maps[0].singleLayer).toBe(false);
    expect(d.maps[0].layers[0].regions[0].rOut).toBe(1);
  });
  it("keeps a v2 document and fills missing map fields", () => {
    const raw = { version: 2, maps: [{ name: "M1", layers: [{ name: "L", regions: [], points: [] }] }] };
    const d = migrate(raw);
    expect(d.version).toBe(SCHEMA_VERSION);
    expect(d.maps[0].id).toBeTruthy();
    expect(d.maps[0].singleLayer).toBe(false);
    expect(d.maps[0].updatedAt).toBe(null);
  });
  it("gives a map with no usable layers a default layer", () => {
    const d = migrate({ version: 2, maps: [{ name: "Empty", layers: [] }] });
    expect(d.maps[0].layers).toHaveLength(1);
  });
});

describe("map CRUD", () => {
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
  it("removeMap drops a map but never the last one", () => {
    const d = defaultHive();
    const id = addMap(d, "Second");
    expect(removeMap(d, id)).toBe(true);
    expect(d.maps).toHaveLength(1);
    expect(removeMap(d, d.maps[0].id)).toBe(false);
    expect(d.maps).toHaveLength(1);
  });
  it("renameMap mutates the named map; false for an unknown id", () => {
    const d = defaultHive(); const id = d.maps[0].id;
    expect(renameMap(d, id, "Renamed")).toBe(true);
    expect(mapById(d, id).name).toBe("Renamed");
    expect(renameMap(d, "nope", "X")).toBe(false);
  });
});

describe("layer CRUD (on a map)", () => {
  it("addLayer / removeLayer / moveLayer operate on a map's layers", () => {
    const d = defaultHive(); const map = d.maps[0];
    const b = addLayer(map, "B", "");
    expect(map.layers).toHaveLength(2);
    expect(layerById(map, b).name).toBe("B");
    expect(moveLayer(map, b, -1)).toBe(true);
    expect(map.layers[0].id).toBe(b);
    expect(removeLayer(map, b)).toBe(true);
    expect(removeLayer(map, map.layers[0].id)).toBe(false);
  });
});

describe("entity CRUD (on a map)", () => {
  it("adds districts/zones/landmarks and edits them", () => {
    const d = defaultHive(); const map = d.maps[0]; const L = map.layers[0];
    const wid = addWedge(map, L.id, { name: "Gate 47", color: PALETTE[0], a0: -90, a1: -20, rOut: 0.9 });
    const cid = addCircle(map, L.id, { name: "Market", cx: 0.3, cy: -0.2, r: 0.25 });
    const pid = addPoint(map, L.id, { name: "Cathedral", x: 0.5, y: 0.1 });
    expect(findEntity(L, wid).a1).toBe(-20);
    expect(renameEntity(L, pid, "New")).toBe(true);
    expect(setColor(L, cid, "#abcdef")).toBe(true);
    expect(setColor(L, pid, "#abcdef")).toBe(false);
    expect(bringToFront(L, wid)).toBe(true);
    expect(L.regions[L.regions.length - 1].id).toBe(wid);
    expect(sendToBack(L, wid)).toBe(true);
    expect(L.regions[0].id).toBe(wid);
    expect(removeEntity(L, pid)).toBe(true);
    expect(L.points).toHaveLength(0);
  });
});

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
  it("wedge label cycle adds edgeOut: center→edge→edgeOut→none→center", () => {
    const d = defaultHive(); const map = d.maps[0]; const L = map.layers[0];
    const wid = addWedge(map, L.id, { name: "W" });
    expect(cycleLabelPos(L, wid)).toBe("edge");
    expect(cycleLabelPos(L, wid)).toBe("edgeOut");
    expect(cycleLabelPos(L, wid)).toBe("none");
    expect(cycleLabelPos(L, wid)).toBe("center");
  });
});
