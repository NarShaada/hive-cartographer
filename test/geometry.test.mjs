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
