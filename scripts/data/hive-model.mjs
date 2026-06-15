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
    a0: Number.isFinite(r.a0) ? r.a0 : 0, a1: Number.isFinite(r.a1) ? r.a1 : 90, rOut: Number.isFinite(r.rOut) ? r.rOut : 1,
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

export function addWedge(model, layerId, props) {
  const L = layerById(model, layerId); if (!L) return null;
  const w = fixWedge({ ...props });   // fills id, type, defaults, coerces numbers
  L.regions.push(w);
  return w.id;
}

export function addCircle(model, layerId, props) {
  const L = layerById(model, layerId); if (!L) return null;
  const c = fixCircle({ ...props });
  L.regions.push(c);
  return c.id;
}

export function addPoint(model, layerId, props) {
  const L = layerById(model, layerId); if (!L) return null;
  const p = fixPoint({ ...props });
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
