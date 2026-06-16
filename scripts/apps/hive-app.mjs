// scripts/apps/hive-app.mjs
import { loadHive, saveHive, subscribe } from "../data/store.mjs";
import { foundryAdapter, MODULE_ID } from "../hive-cartographer.mjs";
import { renderCrossSection } from "./cross-section.mjs";
import { createDiskEditor } from "./disk-editor.mjs";
import * as M from "../data/hive-model.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Render a timestamp as an Imperial date string, e.g. "0 412 026.M41".
function imperialDate(ms) {
  if (!ms) return "0 000 000.M41";
  const d = new Date(ms), y = d.getFullYear();
  const start = new Date(y, 0, 0).getTime();
  const dayOfYear = Math.floor((d.getTime() - start) / 86400000);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const frac = String(Math.min(999, Math.floor((dayOfYear / (leap ? 366 : 365)) * 1000))).padStart(3, "0");
  const yr = String(y % 1000).padStart(3, "0");
  return `0 ${frac} ${yr}.M41`;
}

export class HiveApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hive-cartographer-app",
    classes: ["hive-cartographer-window"],
    window: { title: "HIVECART.Title", resizable: true },
    position: { width: 1080, height: 720 },
  };
  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/hive-app.hbs` } };

  #cur = 0; #curMapId = null; #sel = null; #mode = "select"; #disk = null; #unsub = null; #colorN = 0; #fxTimer = null;

  async _prepareContext() {
    return { roleClass: game.user.isGM ? "gm" : "player" };
  }

  _onRender() {
    this.doc = loadHive(foundryAdapter);
    this.#syncMap();
    const root = this.element;
    // inspector buttons
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener("click", () => this.#setMode(b.dataset.mode)));
    root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener("click", () => this.#action(b.dataset.act)));
    root.querySelector('[data-hc="mapSelect"]').addEventListener("change", (e) => { this.#curMapId = e.target.value; this.#cur = 0; this.#sel = null; this.#renderAll(); });
    root.querySelector('[data-hc="singleLayer"]').addEventListener("change", (e) => { M.setSingleLayer(this.doc, this.#curMapId, e.target.checked); this.#cur = 0; this.#sel = null; this.#persist(); this.#renderAll(); });
    // disk editor (destroy any prior instance's window listeners first)
    this.#disk?.destroy();
    this.#disk = createDiskEditor(root.querySelector('[data-hc="disk"]'), this.#ctx());
    this.#renderAll();
    // live sync: re-render when the world setting changes on any client
    this.#unsub?.();
    this.#unsub = subscribe(() => { this.doc = loadHive(foundryAdapter); this.#syncMap(); this.#renderAll(); });
    this.#startFx();
  }

  _onClose() { this.#unsub?.(); this.#disk?.destroy(); this.#stopFx(); }

  // Cogitator glitch: every 3–6s (random), glitch a random 3–5 labels. Gated by the client setting.
  #startFx() {
    this.#stopFx();
    const tick = () => {
      this.#fxTimer = setTimeout(() => {
        if (this.element?.isConnected && game.settings.get(MODULE_ID, "screenFx")) this.#glitchBurst();
        tick();
      }, 3000 + Math.random() * 3000);
    };
    tick();
  }

  #stopFx() { if (this.#fxTimer) { clearTimeout(this.#fxTimer); this.#fxTimer = null; } }

  #glitchBurst() {
    const labels = [...this.element.querySelectorAll(".hc-rlabel,.hc-clabel,.hc-plabel,.hc-chip b")];
    if (!labels.length) return;
    for (let i = labels.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [labels[i], labels[j]] = [labels[j], labels[i]]; }
    for (const el of labels.slice(0, Math.min(labels.length, 3 + Math.floor(Math.random() * 3)))) {
      el.classList.add("hc-glitching");
      el.addEventListener("animationend", () => el.classList.remove("hc-glitching"), { once: true });
    }
  }

  map() { return M.mapById(this.doc, this.#curMapId) || this.doc.maps[0]; }
  layer() { return this.map().layers[this.#cur]; }

  // Keep the per-user current map valid after load/sync, and clamp the layer index.
  #syncMap() {
    if (!M.mapById(this.doc, this.#curMapId)) this.#curMapId = this.doc.maps[0].id;
    const map = this.map();
    if (map.singleLayer || this.#cur >= map.layers.length || this.#cur < 0) this.#cur = 0;
  }

  #ctx() {
    return {
      getLayer: () => this.layer(),
      getSelection: () => this.#sel,
      getMode: () => this.#mode,
      isGM: () => game.user.isGM,
      select: (id) => { this.#sel = id; this.#renderInfo(); },
      addWedge: (d) => { M.addWedge(this.map(), this.layer().id, d); this.#persist(); this.#renderAll(); },
      addCircle: (d) => { M.addCircle(this.map(), this.layer().id, d); this.#persist(); this.#renderAll(); },
      addPoint: (d) => { M.addPoint(this.map(), this.layer().id, d); this.#persist(); this.#renderAll(); },
      mutateSelected: (fn, { persist = true } = {}) => {
        const e = this.#sel && M.findEntity(this.layer(), this.#sel);
        if (e) fn(e);
        if (persist) this.#persist();
      },
      promptName: (key, dflt) => { const v = prompt(game.i18n.localize(key), dflt); return v && v.trim() ? v.trim() : null; },
      nextColor: () => M.PALETTE[this.#colorN++ % M.PALETTE.length],
    };
  }

  #setMode(m) {
    this.#mode = m; this.#sel = null;
    this.element.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    this.#renderAll();
  }

  // Open the OS colour picker seeded with the entity's current colour; apply on change.
  #pickColour() {
    const L = this.layer(), e = this.#sel && M.findEntity(L, this.#sel);
    if (!e || e.color === undefined) return ui.notifications.warn("Pick a district or zone.");
    const input = document.createElement("input");
    input.type = "color"; input.value = /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : "#7c4a3a";
    input.style.cssText = "position:fixed;left:-9999px;";
    document.body.appendChild(input);
    input.addEventListener("change", () => { M.setColor(L, this.#sel, input.value); this.#persist(); this.#renderAll(); input.remove(); });
    input.addEventListener("cancel", () => input.remove());
    input.click();
  }

  #action(act) {
    const L = this.layer();
    if (act === "mapNew") { const n = prompt(game.i18n.localize("HIVECART.PromptMap"), "New Map"); if (!n) return; this.#curMapId = M.addMap(this.doc, n); this.#cur = 0; this.#sel = null; this.#persist(); this.#renderAll(); return; }
    if (act === "mapRename") { const n = prompt(game.i18n.localize("HIVECART.PromptMap"), this.map().name); if (n) { M.renameMap(this.doc, this.#curMapId, n); this.#persist(); this.#renderAll(); } return; }
    if (act === "mapDelete") { if (M.removeMap(this.doc, this.#curMapId)) { this.#syncMap(); this.#sel = null; this.#persist(); this.#renderAll(); } else ui.notifications.warn("A world needs at least one map."); return; }
    if (act === "rename") { const e = this.#sel && M.findEntity(L, this.#sel); if (!e) return ui.notifications.warn("Select something first."); const n = prompt("Rename:", e.name); if (n) { M.renameEntity(L, this.#sel, n); this.#persist(); this.#renderAll(); } }
    else if (act === "recolour") { this.#pickColour(); }
    else if (act === "front") { if (this.#sel && M.bringToFront(L, this.#sel)) { this.#persist(); this.#renderAll(); } else ui.notifications.warn("Select a district or zone."); }
    else if (act === "back") { if (this.#sel && M.sendToBack(L, this.#sel)) { this.#persist(); this.#renderAll(); } else ui.notifications.warn("Select a district or zone."); }
    else if (act === "delete") { if (!this.#sel || !M.removeEntity(L, this.#sel)) return ui.notifications.warn("Select something first."); this.#sel = null; this.#persist(); this.#renderAll(); }
    else if (act === "addLayer") { const n = prompt(game.i18n.localize("HIVECART.PromptLayer"), "New Layer"); if (!n) return; M.addLayer(this.map(), n, ""); this.#cur = this.map().layers.length - 1; this.#sel = null; this.#persist(); this.#renderAll(); }
    else if (act === "layerUp") { if (M.moveLayer(this.map(), L.id, -1)) { this.#cur = Math.max(0, this.#cur - 1); this.#persist(); this.#renderAll(); } }
    else if (act === "layerDown") { if (M.moveLayer(this.map(), L.id, 1)) { this.#cur = Math.min(this.map().layers.length - 1, this.#cur + 1); this.#persist(); this.#renderAll(); } }
    else if (act === "renameLayer") { const n = prompt(game.i18n.localize("HIVECART.PromptLayer"), L.name); if (n) { L.name = n; this.#persist(); this.#renderAll(); } }
    else if (act === "removeLayer") { if (M.removeLayer(this.map(), L.id)) { this.#cur = Math.max(0, this.#cur - 1); this.#sel = null; this.#persist(); this.#renderAll(); } else ui.notifications.warn("A map needs at least one layer."); }
  }

  #persist() { if (game.user.isGM) this.map().updatedAt = Date.now(); saveHive(foundryAdapter, this.doc); }

  #renderAll() {
    const root = this.element; const map = this.map(), L = this.layer();
    this.#renderMapBar(root, map);
    if (!map.singleLayer) renderCrossSection(root.querySelector('[data-hc="hive"]'), map.layers, this.#cur, (i) => { this.#cur = i; this.#sel = null; this.#renderAll(); });
    root.querySelector('[data-hc="layerName"]').textContent = L.name;
    root.querySelector('[data-hc="layerSub"]').textContent = L.sub || "";
    root.querySelector('[data-hc="layerCount"]').textContent = `LAYER ${map.layers.length - this.#cur} / ${map.layers.length} · ${L.regions.length} REGIONS · ${L.points.length} LANDMARKS`;
    root.querySelector('[data-hc="sync"]').textContent = `Cogitator online · Last sync ${imperialDate(map.updatedAt)} · Praise the Omnissiah!`;
    this.#renderInfo();   // also re-renders the disk (selection highlight)
  }

  #renderMapBar(root, map) {
    const sel = root.querySelector('[data-hc="mapSelect"]');
    sel.innerHTML = this.doc.maps.map((m) => `<option value="${m.id}"${m.id === map.id ? " selected" : ""}>${esc(m.name)}</option>`).join("");
    root.querySelector('[data-hc="singleLayer"]').checked = !!map.singleLayer;
    root.querySelector(".hive-cart").classList.toggle("hc-single", !!map.singleLayer);
  }

  #renderInfo() {
    this.#disk.render();
    const box = this.element.querySelector('[data-hc="info"]'); const e = this.#sel && M.findEntity(this.layer(), this.#sel);
    if (!e) { box.className = "hc-info empty"; box.innerHTML = `<div class="hc-lbl">${game.i18n.localize("HIVECART.Selection")}</div><div class="hc-name">${game.i18n.localize("HIVECART.NothingSelected")}</div>`; return; }
    const kind = e.type === "wedge" ? "District" : e.type === "circle" ? "Zone" : "Landmark";
    const sw = `<span class="hc-swatch" style="background:${e.color || "var(--gold2)"}"></span>`;
    box.className = "hc-info";
    box.innerHTML = `<div class="hc-lbl">${game.i18n.localize("HIVECART.Selection")}</div><div class="hc-name">${sw}${esc(e.name)} <span style="font-family:var(--mono);font-size:9px;color:var(--gold);border:1px solid var(--line2);padding:1px 5px;">${kind}</span></div>`;
  }
}
