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
    expect(w.rOut).toBe(1);
    expect(w.color).toBeTruthy();
    expect(w.name).toBeTruthy();
  });
});
