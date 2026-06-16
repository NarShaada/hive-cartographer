// scripts/data/hive-model.mjs
// Pure data model. No Foundry, no DOM. Geometry is normalized (positions -1..1, radii 0..1, angles deg).
// Top level is a document: { version, maps:[Map] }. Map: { id, name, singleLayer, updatedAt, layers:[Layer] }.

export const SCHEMA_VERSION = 2;
export const PALETTE = ["#7c4a3a", "#4f6b5e", "#8a7338", "#54637a", "#6e4258", "#5d6b3a", "#7a5a3c", "#436a72"];

let _seq = 0;
export function newId(prefix = "id") {
  _seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${_seq.toString(36)}`;
}

export function defaultLayer(name, sub) {
  return { id: newId("L"), name, sub: sub || "", regions: [], points: [] };
}

export function defaultMap(name) {
  return { id: newId("M"), name: name || "New Map", singleLayer: false, updatedAt: null, layers: [defaultLayer("Surface", "")] };
}

export function defaultHive() {
  return { version: SCHEMA_VERSION, maps: [defaultMap("New Map")] };
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
function fixMap(m) {
  const layers = Array.isArray(m.layers) && m.layers.length ? m.layers.map(fixLayer) : [defaultLayer("Surface", "")];
  return {
    id: m.id || newId("M"), name: m.name || "Map",
    singleLayer: !!m.singleLayer,
    updatedAt: Number.isFinite(m.updatedAt) ? m.updatedAt : null,
    layers,
  };
}

export function migrate(raw) {
  if (!raw || typeof raw !== "object") return defaultHive();
  if (Array.isArray(raw.maps) && raw.maps.length) {
    return { version: SCHEMA_VERSION, maps: raw.maps.map(fixMap) };
  }
  if (Array.isArray(raw.layers) && raw.layers.length) {
    return { version: SCHEMA_VERSION, maps: [fixMap({ name: raw.name || "Hive", updatedAt: raw.updatedAt, layers: raw.layers })] };
  }
  return defaultHive();
}

/* ---- document-scoped (maps) ---- */

export function mapById(doc, id) {
  return doc.maps.find((m) => m.id === id) || null;
}

export function addMap(doc, name, singleLayer = false) {
  const m = defaultMap(name || "New Map");
  m.singleLayer = !!singleLayer;
  doc.maps.push(m);
  return m.id;
}

export function removeMap(doc, id) {
  if (doc.maps.length <= 1) return false;
  const i = doc.maps.findIndex((m) => m.id === id);
  if (i < 0) return false;
  doc.maps.splice(i, 1);
  return true;
}

export function renameMap(doc, id, name) {
  const m = mapById(doc, id); if (!m) return false;
  m.name = name; return true;
}

/* ---- map-scoped (layers). First arg is a Map (has .layers). ---- */

export function layerById(map, id) {
  return map.layers.find((L) => L.id === id) || null;
}

export function addLayer(map, name, sub) {
  const L = defaultLayer(name || "New Layer", sub || "");
  map.layers.push(L);
  return L.id;
}

export function removeLayer(map, id) {
  if (map.layers.length <= 1) return false;
  const i = map.layers.findIndex((L) => L.id === id);
  if (i < 0) return false;
  map.layers.splice(i, 1);
  return true;
}

// dir: -1 = up (towards index 0 / top), +1 = down.
export function moveLayer(map, id, dir) {
  const i = map.layers.findIndex((L) => L.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= map.layers.length) return false;
  const [L] = map.layers.splice(i, 1);
  map.layers.splice(j, 0, L);
  return true;
}

/* ---- entity ops. add* take a Map + layerId; the rest take a Layer. ---- */

export function addWedge(map, layerId, props) {
  const L = layerById(map, layerId); if (!L) return null;
  const w = fixWedge({ ...props });
  L.regions.push(w);
  return w.id;
}

export function addCircle(map, layerId, props) {
  const L = layerById(map, layerId); if (!L) return null;
  const c = fixCircle({ ...props });
  L.regions.push(c);
  return c.id;
}

export function addPoint(map, layerId, props) {
  const L = layerById(map, layerId); if (!L) return null;
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

export function setColor(layer, id, color) {
  const e = findEntity(layer, id);
  if (!e || e.color === undefined) return false;
  e.color = color; return true;
}

export function bringToFront(layer, id) {
  const i = layer.regions.findIndex((r) => r.id === id);
  if (i < 0) return false;
  const [r] = layer.regions.splice(i, 1);
  layer.regions.push(r);
  return true;
}

export function sendToBack(layer, id) {
  const i = layer.regions.findIndex((r) => r.id === id);
  if (i < 0) return false;
  const [r] = layer.regions.splice(i, 1);
  layer.regions.unshift(r);
  return true;
}
