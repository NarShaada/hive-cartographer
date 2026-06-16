// scripts/apps/disk-editor.mjs
import { polar, angleDeg, toUnit, wedgePath } from "../geometry.mjs";

const VB = 420, CXp = 210, CYp = 210, Rp = 192;   // svg viewBox space
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Staggered (golden-ratio) negative delay so labels glitch out of sync across the 5s FX cycle.
const gdelay = (n) => `animation-delay:${(-((n * 1.618) % 5)).toFixed(2)}s`;

export function createDiskEditor(container, ctx) {
  let drag = null;      // active draw gesture
  let selDrag = null;   // active move/resize gesture

  function svgEl() { return container.querySelector("svg"); }
  function toViewbox(e) {
    const svg = svgEl(); const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (VB / r.width), y: (e.clientY - r.top) * (VB / r.height) };
  }
  function unit(p) { return toUnit(CXp, CYp, Rp, p.x, p.y); }            // viewbox px -> model unit
  const handle = (x, y, n) => `<circle class="hc-handle" data-handle="${n}" cx="${x}" cy="${y}" r="6"/>`;

  function render() {
    const L = ctx.getLayer(), sel = ctx.getSelection(), gm = ctx.isGM(), selectMode = ctx.getMode() === "select";
    const clickable = gm && selectMode;
    let s = `<svg viewBox="0 0 ${VB} ${VB}">`;
    s += `<circle class="hc-ring" cx="${CXp}" cy="${CYp}" r="${Rp + 6}"/><circle class="hc-ring" cx="${CXp}" cy="${CYp}" r="${Rp + 11}" style="stroke:rgba(200,162,74,.35)"/>`;
    for (let t = 0; t < 24; t++) {
      const a = t * 15, [x1, y1] = polar(CXp, CYp, Rp + 6, a), [x2, y2] = polar(CXp, CYp, Rp + (t % 6 === 0 ? 16 : 11), a);
      s += `<line class="hc-tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }
    let li = 0;   // running label index → staggered glitch delay
    // regions in array order — later in the array = drawn on top (z-order, controllable via front/back)
    for (const rg of L.regions) {
      const on = rg.id === sel;
      if (rg.type === "wedge") {
        s += `<path class="hc-region${clickable ? " clickable" : ""}${on ? " sel" : ""}" data-id="${rg.id}" d="${wedgePath(CXp, CYp, Rp, rg.a0, rg.a1, rg.rOut)}" fill="${rg.color}" fill-opacity="${on ? .95 : .8}" stroke="rgba(0,0,0,.45)" stroke-width="1"/>`;
        const [lx, ly] = polar(CXp, CYp, rg.rOut * Rp * 0.6, (rg.a0 + (rg.a1 < rg.a0 ? rg.a1 + 360 : rg.a1)) / 2);
        s += `<text class="hc-rlabel" style="${gdelay(li++)}" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${esc(rg.name)}</text>`;
      } else {
        const [px, py] = [CXp + rg.cx * Rp, CYp + rg.cy * Rp], pr = rg.r * Rp;
        s += `<circle class="hc-region${clickable ? " clickable" : ""}${on ? " sel" : ""}" data-id="${rg.id}" cx="${px}" cy="${py}" r="${pr}" fill="${rg.color}" fill-opacity="${on ? .95 : .85}" stroke="rgba(200,162,74,.5)" stroke-width="1.2"/>`;
        s += `<text class="hc-clabel" style="${gdelay(li++)}" x="${px}" y="${py}" text-anchor="middle" dominant-baseline="middle">${esc(rg.name)}</text>`;
      }
    }
    // landmarks
    for (const p of L.points) {
      const on = p.id === sel, [px, py] = [CXp + p.x * Rp, CYp + p.y * Rp], d = 8;
      s += `<path class="hc-pmark${clickable ? " clickable" : ""}${on ? " sel" : ""}" data-id="${p.id}" d="M ${px} ${py - d} L ${px + d} ${py} L ${px} ${py + d} L ${px - d} ${py} Z"/>`;
      s += `<text class="hc-plabel" style="${gdelay(li++)}" x="${px + d + 4}" y="${py + 4}">${esc(p.name)}</text>`;
    }
    // selection handles
    if (clickable && sel) {
      const e = L.regions.find((r) => r.id === sel);
      if (e && e.type === "circle") s += handle(CXp + e.cx * Rp + e.r * Rp, CYp + e.cy * Rp, "resizeR");
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
    }
    s += `</svg>`;
    container.innerHTML = s;
    container.classList.toggle("draw", gm && !selectMode);
  }

  function onDown(e) {
    if (!ctx.isGM() || !svgEl()) return;
    const mode = ctx.getMode();
    if (mode !== "select") {
      const p = toViewbox(e), [ux, uy] = unit(p); e.preventDefault();
      if (mode === "point") { const name = ctx.promptName("HIVECART.PromptLandmark", "New Landmark"); if (name) ctx.addPoint({ name, x: ux, y: uy }); return; }
      if (mode === "wedge") { const a = angleDeg(0, 0, ux, uy); drag = { kind: "wedge", start: a, a0: a, a1: a + 1, rOut: Math.min(1, Math.max(0.3, Math.hypot(ux, uy))) }; }
      if (mode === "circle") { drag = { kind: "circle", cx: ux, cy: uy, r: 0.03 }; }
      return;
    }
    const t = e.target, ds = t.dataset || {};
    if (ds.handle && ctx.getSelection()) { selDrag = { kind: ds.handle }; e.preventDefault(); return; }
    if (ds.id) {
      ctx.select(ds.id); render();
      const L = ctx.getLayer(), o = L.regions.find((r) => r.id === ds.id) || L.points.find((p) => p.id === ds.id);
      const sp = unit(toViewbox(e));
      selDrag = { kind: "move", startU: sp, orig: snapshot(o) };
      e.preventDefault(); return;
    }
    ctx.select(null); render();
  }

  function snapshot(o) {
    return o.type === "wedge" ? { a0: o.a0, a1: o.a1 } : o.type === "circle" ? { cx: o.cx, cy: o.cy } : { x: o.x, y: o.y };
  }

  function onMove(e) {
    if (drag) {
      const p = toViewbox(e), [ux, uy] = unit(p);
      if (drag.kind === "wedge") { let span = angleDeg(0, 0, ux, uy) - drag.start; if (span < 0) span += 360; drag.a0 = drag.start; drag.a1 = drag.start + Math.max(span, 1); drag.rOut = Math.min(1, Math.max(0.28, Math.hypot(ux, uy))); }
      if (drag.kind === "circle") { drag.r = Math.max(0.04, Math.hypot(ux - drag.cx, uy - drag.cy)); }
      render(); return;
    }
    if (selDrag) {
      const [ux, uy] = unit(toViewbox(e));
      ctx.mutateSelected((o) => {
        if (selDrag.kind === "move") {
          if (o.type === "wedge") { let da = angleDeg(0, 0, ux, uy) - angleDeg(0, 0, selDrag.startU[0], selDrag.startU[1]); da = ((da + 180) % 360 + 360) % 360 - 180; o.a0 = selDrag.orig.a0 + da; o.a1 = selDrag.orig.a1 + da; }
          else if (o.type === "circle") { o.cx = selDrag.orig.cx + (ux - selDrag.startU[0]); o.cy = selDrag.orig.cy + (uy - selDrag.startU[1]); }
          else { o.x = selDrag.orig.x + (ux - selDrag.startU[0]); o.y = selDrag.orig.y + (uy - selDrag.startU[1]); }
        } else if (selDrag.kind === "resizeR") {
          if (o.type === "circle") o.r = Math.max(0.04, Math.hypot(ux - o.cx, uy - o.cy));
          else o.rOut = Math.min(1, Math.max(0.28, Math.hypot(ux, uy)));
        } else if (selDrag.kind === "a0") { o.a0 = angleDeg(0, 0, ux, uy); }
        else if (selDrag.kind === "a1") { let a = angleDeg(0, 0, ux, uy); while (a < o.a0) a += 360; o.a1 = a; }
      }, { persist: false });
      render();
    }
  }

  function onUp() {
    if (selDrag) { selDrag = null; ctx.mutateSelected(() => {}, { persist: true }); return; }
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === "wedge" && (d.a1 - d.a0) >= 8) { const name = ctx.promptName("HIVECART.PromptDistrict", "New District"); if (name) ctx.addWedge({ name, color: ctx.nextColor(), a0: d.a0, a1: d.a1, rOut: d.rOut }); }
    if (d.kind === "circle" && d.r >= 0.05) { const name = ctx.promptName("HIVECART.PromptZone", "New Zone"); if (name) ctx.addCircle({ name, color: ctx.nextColor(), cx: d.cx, cy: d.cy, r: d.r }); }
    render();
  }

  container.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);

  return {
    render,
    destroy() { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); },
  };
}
