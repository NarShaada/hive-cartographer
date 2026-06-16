// scripts/apps/disk-editor.mjs
import { polar, angleDeg, toUnit, wedgePath } from "../geometry.mjs";

const VB = 420, CXp = 210, CYp = 210, Rp = 192;   // svg viewBox space
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Label for a region honouring rg.labelPos ("center" | "edge" | "none"). Edge text follows a per-type
// SVG path via <textPath> (wedge: outer arc; circle: bottom arc; rect: bottom line).
function regionLabel(rg) {
  const pos = rg.labelPos === "edge" || rg.labelPos === "none" ? rg.labelPos : "center";
  if (pos === "none") return "";
  const cls = rg.type === "wedge" ? "hc-rlabel" : "hc-clabel";
  if (pos === "center") {
    let lx, ly;
    if (rg.type === "wedge") { [lx, ly] = polar(CXp, CYp, rg.rOut * Rp * 0.6, (rg.a0 + (rg.a1 < rg.a0 ? rg.a1 + 360 : rg.a1)) / 2); }
    else { lx = CXp + rg.cx * Rp; ly = CYp + rg.cy * Rp; }
    return `<text class="${cls}" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${esc(rg.name)}</text>`;
  }
  // edge — curved text along a per-type edge path
  let d;
  if (rg.type === "wedge") {
    // Arc pulled in to 0.85·rOut so the outward-extending glyphs sit ON the coloured slice (not past the rim).
    const a0 = rg.a0, a1 = rg.a1 < rg.a0 ? rg.a1 + 360 : rg.a1, rr = rg.rOut * Rp * 0.85;
    const [sx, sy] = polar(CXp, CYp, rr, a0), [ex, ey] = polar(CXp, CYp, rr, a1);
    d = `M ${sx} ${sy} A ${rr} ${rr} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${ex} ${ey}`;
  } else if (rg.type === "rect") {
    // Inset to 0.82·hh so the text clears the bottom stroke rather than blending into it.
    const y = CYp + (rg.cy + rg.hh * 0.82) * Rp;
    d = `M ${CXp + (rg.cx - rg.hw) * Rp} ${y} L ${CXp + (rg.cx + rg.hw) * Rp} ${y}`;
  } else {
    // Bottom arc (sweep 0) at 0.82·r so glyphs sit inside, upright, clear of the rim stroke.
    const cx = CXp + rg.cx * Rp, cy = CYp + rg.cy * Rp, rr = rg.r * Rp * 0.82;
    d = `M ${cx - rr} ${cy} A ${rr} ${rr} 0 0 0 ${cx + rr} ${cy}`;
  }
  // Wedge text faces outward (toward the rim) — `side="right"` flips the glyph side without reversing reading order.
  const side = rg.type === "wedge" ? ` side="right"` : "";
  return `<path id="lblpath-${rg.id}" d="${d}" fill="none" stroke="none"/>`
    + `<text class="${cls}"><textPath href="#lblpath-${rg.id}"${side} startOffset="50%" text-anchor="middle">${esc(rg.name)}</textPath></text>`;
}

export function createDiskEditor(container, ctx) {
  let drag = null;      // active draw gesture
  let selDrag = null;   // active move/resize gesture (GM only)

  function svgEl() { return container.querySelector("svg"); }
  function toViewbox(e) {
    const svg = svgEl(); const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (VB / r.width), y: (e.clientY - r.top) * (VB / r.height) };
  }
  function unit(p) { return toUnit(CXp, CYp, Rp, p.x, p.y); }            // viewbox px -> model unit
  const handle = (x, y, n) => `<circle class="hc-handle" data-handle="${n}" cx="${x}" cy="${y}" r="6"/>`;

  function render() {
    const L = ctx.getLayer(), sel = ctx.getSelection(), gm = ctx.isGM(), selectMode = ctx.getMode() === "select";
    const clickable = selectMode;   // players are always in select mode → shapes selectable for everyone
    let s = `<svg viewBox="0 0 ${VB} ${VB}">`;
    s += `<circle class="hc-ring" cx="${CXp}" cy="${CYp}" r="${Rp + 6}"/><circle class="hc-ring" cx="${CXp}" cy="${CYp}" r="${Rp + 11}" style="stroke:rgba(200,162,74,.35)"/>`;
    for (let t = 0; t < 24; t++) {
      const a = t * 15, [x1, y1] = polar(CXp, CYp, Rp + 6, a), [x2, y2] = polar(CXp, CYp, Rp + (t % 6 === 0 ? 16 : 11), a);
      s += `<line class="hc-tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }
    // regions in array order — later = drawn on top (z-order, controllable via front/back)
    for (const rg of L.regions) {
      const on = rg.id === sel;
      if (rg.type === "wedge") {
        s += `<path class="hc-region${clickable ? " clickable" : ""}${on ? " sel" : ""}" data-id="${rg.id}" d="${wedgePath(CXp, CYp, Rp, rg.a0, rg.a1, rg.rOut)}" fill="${rg.color}" fill-opacity="${on ? .95 : .8}" stroke="rgba(0,0,0,.45)" stroke-width="1"/>`;
        s += regionLabel(rg);
      } else if (rg.type === "rect") {
        const rx = CXp + (rg.cx - rg.hw) * Rp, ry = CYp + (rg.cy - rg.hh) * Rp;
        s += `<rect class="hc-region${clickable ? " clickable" : ""}${on ? " sel" : ""}" data-id="${rg.id}" x="${rx}" y="${ry}" width="${2 * rg.hw * Rp}" height="${2 * rg.hh * Rp}" fill="${rg.color}" fill-opacity="${on ? .95 : .82}" stroke="rgba(200,162,74,.5)" stroke-width="1.2"/>`;
        s += regionLabel(rg);
      } else {
        const px = CXp + rg.cx * Rp, py = CYp + rg.cy * Rp, pr = rg.r * Rp;
        s += `<circle class="hc-region${clickable ? " clickable" : ""}${on ? " sel" : ""}" data-id="${rg.id}" cx="${px}" cy="${py}" r="${pr}" fill="${rg.color}" fill-opacity="${on ? .95 : .85}" stroke="rgba(200,162,74,.5)" stroke-width="1.2"/>`;
        s += regionLabel(rg);
      }
    }
    // landmarks
    for (const p of L.points) {
      const on = p.id === sel, px = CXp + p.x * Rp, py = CYp + p.y * Rp, d = 8;
      s += `<path class="hc-pmark${clickable ? " clickable" : ""}${on ? " sel" : ""}" data-id="${p.id}" d="M ${px} ${py - d} L ${px + d} ${py} L ${px} ${py + d} L ${px - d} ${py} Z"/>`;
      s += `<text class="hc-plabel" x="${px + d + 4}" y="${py + 4}">${esc(p.name)}</text>`;
    }
    // selection handles — GM only
    if (gm && clickable && sel) {
      const e = L.regions.find((r) => r.id === sel);
      if (e && e.type === "circle") s += handle(CXp + e.cx * Rp + e.r * Rp, CYp + e.cy * Rp, "resizeR");
      else if (e && e.type === "rect") s += handle(CXp + (e.cx + e.hw) * Rp, CYp + (e.cy + e.hh) * Rp, "resizeWH");
      else if (e && e.type === "wedge") {
        const mid = (e.a0 + (e.a1 < e.a0 ? e.a1 + 360 : e.a1)) / 2;
        const m = polar(CXp, CYp, e.rOut * Rp, mid), e0 = polar(CXp, CYp, e.rOut * Rp, e.a0), e1 = polar(CXp, CYp, e.rOut * Rp, e.a1);
        s += handle(m[0], m[1], "resizeR") + handle(e0[0], e0[1], "a0") + handle(e1[0], e1[1], "a1");
      }
    }
    // live draw preview
    if (drag) {
      if (drag.kind === "wedge") s += `<path class="hc-preview" d="${wedgePath(CXp, CYp, Rp, drag.a0, drag.a1, drag.rOut)}"/>`;
      if (drag.kind === "circle") s += `<circle class="hc-preview" cx="${CXp + drag.cx * Rp}" cy="${CYp + drag.cy * Rp}" r="${drag.r * Rp}"/>`;
      if (drag.kind === "rect") { const x0 = Math.min(drag.x0, drag.x1), y0 = Math.min(drag.y0, drag.y1); s += `<rect class="hc-preview" x="${CXp + x0 * Rp}" y="${CYp + y0 * Rp}" width="${Math.abs(drag.x1 - drag.x0) * Rp}" height="${Math.abs(drag.y1 - drag.y0) * Rp}"/>`; }
    }
    s += `</svg>`;
    container.innerHTML = s;
    container.classList.toggle("draw", gm && !selectMode);
  }

  async function onDown(e) {
    if (!svgEl()) return;
    const mode = ctx.getMode();
    if (mode !== "select") {
      if (!ctx.isGM()) return;
      const p = toViewbox(e), [ux, uy] = unit(p); e.preventDefault();
      if (mode === "point") { const name = await ctx.promptName("HIVECART.PromptLandmark", "New Landmark"); if (name) ctx.addPoint({ name, x: ux, y: uy }); return; }
      if (mode === "wedge") { const a = angleDeg(0, 0, ux, uy); drag = { kind: "wedge", start: a, a0: a, a1: a + 1, rOut: Math.min(1, Math.max(0.3, Math.hypot(ux, uy))) }; }
      if (mode === "circle") { drag = { kind: "circle", cx: ux, cy: uy, r: 0.03 }; }
      if (mode === "rect") { drag = { kind: "rect", x0: ux, y0: uy, x1: ux, y1: uy }; }
      return;
    }
    const t = e.target, ds = t.dataset || {};
    if (ds.handle && ctx.isGM() && ctx.getSelection()) { selDrag = { kind: ds.handle }; e.preventDefault(); return; }
    if (ds.id) {
      ctx.select(ds.id); render();
      if (ctx.isGM()) {
        const L = ctx.getLayer(), o = L.regions.find((r) => r.id === ds.id) || L.points.find((p) => p.id === ds.id);
        selDrag = { kind: "move", startU: unit(toViewbox(e)), orig: snapshot(o) };
      }
      e.preventDefault(); return;
    }
    ctx.select(null); render();
  }

  function snapshot(o) {
    return o.type === "wedge" ? { a0: o.a0, a1: o.a1 }
      : (o.type === "circle" || o.type === "rect") ? { cx: o.cx, cy: o.cy }
      : { x: o.x, y: o.y };
  }

  function onMove(e) {
    if (drag) {
      const p = toViewbox(e), [ux, uy] = unit(p);
      if (drag.kind === "wedge") { let span = angleDeg(0, 0, ux, uy) - drag.start; if (span < 0) span += 360; drag.a0 = drag.start; drag.a1 = drag.start + Math.max(span, 1); drag.rOut = Math.min(1, Math.max(0.28, Math.hypot(ux, uy))); }
      if (drag.kind === "circle") { drag.r = Math.max(0.04, Math.hypot(ux - drag.cx, uy - drag.cy)); }
      if (drag.kind === "rect") { drag.x1 = ux; drag.y1 = uy; }
      render(); return;
    }
    if (selDrag) {
      const [ux, uy] = unit(toViewbox(e));
      ctx.mutateSelected((o) => {
        if (selDrag.kind === "move") {
          if (o.type === "wedge") { let da = angleDeg(0, 0, ux, uy) - angleDeg(0, 0, selDrag.startU[0], selDrag.startU[1]); da = ((da + 180) % 360 + 360) % 360 - 180; o.a0 = selDrag.orig.a0 + da; o.a1 = selDrag.orig.a1 + da; }
          else if (o.type === "circle" || o.type === "rect") { o.cx = selDrag.orig.cx + (ux - selDrag.startU[0]); o.cy = selDrag.orig.cy + (uy - selDrag.startU[1]); }
          else { o.x = selDrag.orig.x + (ux - selDrag.startU[0]); o.y = selDrag.orig.y + (uy - selDrag.startU[1]); }
        } else if (selDrag.kind === "resizeR") {
          if (o.type === "circle") o.r = Math.max(0.04, Math.hypot(ux - o.cx, uy - o.cy));
          else o.rOut = Math.min(1, Math.max(0.28, Math.hypot(ux, uy)));
        } else if (selDrag.kind === "resizeWH") { o.hw = Math.max(0.04, Math.abs(ux - o.cx)); o.hh = Math.max(0.04, Math.abs(uy - o.cy)); }
        else if (selDrag.kind === "a0") { o.a0 = angleDeg(0, 0, ux, uy); }
        else if (selDrag.kind === "a1") { let a = angleDeg(0, 0, ux, uy); while (a < o.a0) a += 360; o.a1 = a; }
      }, { persist: false });
      render();
    }
  }

  async function onUp() {
    if (selDrag) { selDrag = null; ctx.mutateSelected(() => {}, { persist: true }); return; }
    if (!drag) return;
    const d = drag; drag = null;
    render();   // clear the live preview before the (now modal) name dialog
    if (d.kind === "wedge" && (d.a1 - d.a0) >= 8) { const name = await ctx.promptName("HIVECART.PromptDistrict", "New District"); if (name) ctx.addWedge({ name, color: ctx.nextColor(), a0: d.a0, a1: d.a1, rOut: d.rOut }); }
    if (d.kind === "circle" && d.r >= 0.05) { const name = await ctx.promptName("HIVECART.PromptZone", "New Zone"); if (name) ctx.addCircle({ name, color: ctx.nextColor(), cx: d.cx, cy: d.cy, r: d.r }); }
    if (d.kind === "rect") { const hw = Math.abs(d.x1 - d.x0) / 2, hh = Math.abs(d.y1 - d.y0) / 2; if (hw >= 0.04 && hh >= 0.04) { const name = await ctx.promptName("HIVECART.PromptBlock", "New Block"); if (name) ctx.addRect({ name, color: ctx.nextColor(), cx: (d.x0 + d.x1) / 2, cy: (d.y0 + d.y1) / 2, hw, hh }); } }
  }

  container.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);

  return {
    render,
    destroy() { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); },
  };
}
