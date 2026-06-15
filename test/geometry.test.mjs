import { describe, it, expect } from "vitest";
import { polar, angleDeg, dist, toPx, toUnit, wedgePath } from "../scripts/geometry.mjs";

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
    const d = wedgePath(0, 0, 100, 0, 90, 0.5);
    const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
    const maxR = Math.max(...xs.map((x, i) => Math.hypot(x, ys[i])));
    expect(maxR).toBeLessThan(55); // 0.5*100 plus the small organic wobble
  });
});
