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

  #cur = 0; #sel = null; #mode = "select"; #disk = null; #unsub = null; #colorN = 0;

  async _prepareContext() {
    return {
      roleClass: game.user.isGM ? "gm" : "player",
      fxClass: game.settings.get(MODULE_ID, "screenFx") ? "hc-fx" : "",
    };
  }

  _onRender() {
    this.model = loadHive(foundryAdapter);
    if (this.#cur >= this.model.layers.length) this.#cur = 0;
    const root = this.element;
    // inspector buttons
    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener("click", () => this.#setMode(b.dataset.mode)));
    root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener("click", () => this.#action(b.dataset.act)));
    // disk editor (destroy any prior instance's window listeners first)
    this.#disk?.destroy();
    this.#disk = createDiskEditor(root.querySelector('[data-hc="disk"]'), this.#ctx());
    this.#renderAll();
    // live sync: re-render when the world setting changes on any client
    this.#unsub?.();
    this.#unsub = subscribe(() => { this.model = loadHive(foundryAdapter); this.#renderAll(); });
  }

  _onClose() { this.#unsub?.(); this.#disk?.destroy(); }

  layer() { return this.model.layers[this.#cur]; }

  #ctx() {
    return {
      getLayer: () => this.layer(),
      getSelection: () => this.#sel,
      getMode: () => this.#mode,
      isGM: () => game.user.isGM,
      select: (id) => { this.#sel = id; this.#renderInfo(); },
      addWedge: (d) => { M.addWedge(this.model, this.layer().id, d); this.#persist(); this.#renderAll(); },
      addCircle: (d) => { M.addCircle(this.model, this.layer().id, d); this.#persist(); this.#renderAll(); },
      addPoint: (d) => { M.addPoint(this.model, this.layer().id, d); this.#persist(); this.#renderAll(); },
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
    if (act === "rename") { const e = this.#sel && M.findEntity(L, this.#sel); if (!e) return ui.notifications.warn("Select something first."); const n = prompt("Rename:", e.name); if (n) { M.renameEntity(L, this.#sel, n); this.#persist(); this.#renderAll(); } }
    else if (act === "recolour") { this.#pickColour(); }
    else if (act === "front") { if (this.#sel && M.bringToFront(L, this.#sel)) { this.#persist(); this.#renderAll(); } else ui.notifications.warn("Select a district or zone."); }
    else if (act === "back") { if (this.#sel && M.sendToBack(L, this.#sel)) { this.#persist(); this.#renderAll(); } else ui.notifications.warn("Select a district or zone."); }
    else if (act === "delete") { if (!this.#sel || !M.removeEntity(L, this.#sel)) return ui.notifications.warn("Select something first."); this.#sel = null; this.#persist(); this.#renderAll(); }
    else if (act === "addLayer") { const n = prompt(game.i18n.localize("HIVECART.PromptLayer"), "New Layer"); if (!n) return; M.addLayer(this.model, n, ""); this.#cur = this.model.layers.length - 1; this.#sel = null; this.#persist(); this.#renderAll(); }
    else if (act === "layerUp") { if (M.moveLayer(this.model, L.id, -1)) { this.#cur = Math.max(0, this.#cur - 1); this.#persist(); this.#renderAll(); } }
    else if (act === "layerDown") { if (M.moveLayer(this.model, L.id, 1)) { this.#cur = Math.min(this.model.layers.length - 1, this.#cur + 1); this.#persist(); this.#renderAll(); } }
    else if (act === "renameLayer") { const n = prompt(game.i18n.localize("HIVECART.PromptLayer"), L.name); if (n) { L.name = n; this.#persist(); this.#renderAll(); } }
    else if (act === "removeLayer") { if (M.removeLayer(this.model, L.id)) { this.#cur = Math.max(0, this.#cur - 1); this.#sel = null; this.#persist(); this.#renderAll(); } else ui.notifications.warn("A hive needs at least one layer."); }
  }

  #persist() { if (game.user.isGM) this.model.updatedAt = Date.now(); saveHive(foundryAdapter, this.model); }

  #renderAll() {
    const root = this.element; const L = this.layer();
    renderCrossSection(root.querySelector('[data-hc="hive"]'), this.model.layers, this.#cur, (i) => { this.#cur = i; this.#sel = null; this.#renderAll(); });
    root.querySelector('[data-hc="layerName"]').textContent = L.name;
    root.querySelector('[data-hc="layerSub"]').textContent = L.sub || "";
    root.querySelector('[data-hc="layerCount"]').textContent = `LAYER ${this.model.layers.length - this.#cur} / ${this.model.layers.length} · ${L.regions.length} REGIONS · ${L.points.length} LANDMARKS`;
    root.querySelector('[data-hc="sync"]').textContent = `Cogitator online · Last sync ${imperialDate(this.model.updatedAt)} · Praise the Omnissiah!`;
    this.#renderInfo();   // also re-renders the disk (selection highlight)
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
