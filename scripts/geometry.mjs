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
