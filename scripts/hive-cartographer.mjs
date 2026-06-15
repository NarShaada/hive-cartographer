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
  console.log(`${MODULE_ID} | initialised`);
});

Hooks.once("ready", async () => {
  const { HiveApp } = await import("./apps/hive-app.mjs");
  const mod = game.modules.get(MODULE_ID);
  mod.api = { open: () => new HiveApp().render(true) };
});
