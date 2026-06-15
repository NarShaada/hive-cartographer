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
