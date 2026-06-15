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
