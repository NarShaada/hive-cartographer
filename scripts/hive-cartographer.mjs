// scripts/hive-cartographer.mjs
import { notify } from "./data/store.mjs";

export const MODULE_ID = "hive-cartographer";

// Adapter that binds the store to Foundry's world setting.
export const foundryAdapter = {
  read: () => game.settings.get(MODULE_ID, "hive"),
  write: (data) => game.settings.set(MODULE_ID, "hive", data),
  isGM: () => game.user.isGM,
};

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "hive", {
    scope: "world",
    config: false,
    type: Object,
    default: {},                       // migrate() upgrades {} to a valid default hive on load
    onChange: (value) => notify(value), // fires on every client → open windows re-render
  });
  // Per-user toggle for the subtle "cogitator screen" animation (purely cosmetic).
  game.settings.register(MODULE_ID, "screenFx", {
    name: "HIVECART.Setting.ScreenFx",
    hint: "HIVECART.Setting.ScreenFxHint",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: (v) => document.querySelectorAll(".hive-cart").forEach((el) => el.classList.toggle("hc-fx", v)),
  });

  // Preload the window template so the first open renders immediately (not a blank frame).
  const tpl = `modules/${MODULE_ID}/templates/hive-app.hbs`;
  (foundry.applications?.handlebars?.loadTemplates ?? globalThis.loadTemplates)?.([tpl]);
  console.log(`${MODULE_ID} | initialised`);
});

Hooks.once("ready", async () => {
  const { HiveApp } = await import("./apps/hive-app.mjs");
  const mod = game.modules.get(MODULE_ID);
  mod.api = { open: () => new HiveApp().render(true) };
});

// Scene-controls launcher. The control/tool API shape varies across Foundry versions; this targets
// v13/v14 record-style controls. If the button does not appear, the reliable fallback is
// game.modules.get("hive-cartographer").api.open() — verify and adjust property names per version.
Hooks.on("getSceneControlButtons", (controls) => {
  const open = () => game.modules.get(MODULE_ID).api?.open();
  const group = controls.tokens ?? Object.values(controls)[0];
  if (!group?.tools) return;
  group.tools.hiveMap = {
    name: "hiveMap",
    title: game.i18n.localize("HIVECART.OpenMap"),
    icon: "fa-solid fa-city",
    button: true,
    onChange: () => open(),
    onClick: () => open(),
  };
});
