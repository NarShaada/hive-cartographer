// scripts/data/store.mjs
// Persistence + change broadcast. Foundry-agnostic via an injected `adapter`.
import { migrate, serialize } from "./hive-model.mjs";

const subs = new Set();

export function subscribe(cb) { subs.add(cb); return () => subs.delete(cb); }
export function notify(data) { for (const cb of subs) cb(data); }

export function loadHive(adapter) { return migrate(adapter.read()); }

export function saveHive(adapter, model) {
  if (!adapter.isGM()) return false;
  adapter.write(serialize(model));
  return true;
}
