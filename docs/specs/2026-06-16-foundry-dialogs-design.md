# In-Foundry Dialogs + Single-Layer-at-Creation — Design Spec

**Status:** Approved-pending-review
**Date:** 2026-06-16
**Module:** `hive-cartographer` (extends the unreleased multi-map build)

---

## 1. Purpose

Replace every browser-native popup in the module with **themed in-Foundry dialogs** (`DialogV2`), and change **single-layer** from a post-creation toggle to a **creation-time choice** (set once in the New Map dialog, not changeable afterward).

Native popups to replace (all in `scripts/apps/hive-app.mjs`):
- 5 text `prompt()` calls: New Map name, Rename Map, rename entity, Add Layer name, Rename Layer name.
- The `promptName` ctx helper (used by `disk-editor` for district/zone/landmark names on draw).
- The OS colour popup (`<input type="color">` in `#pickColour`).

Foundry toasts (`ui.notifications.warn`) and the global mouse listeners (`window.addEventListener` in `disk-editor`) are not dialogs and stay as-is.

---

## 2. Dialogs module

New file `scripts/apps/dialogs.mjs` — promise-returning helpers built on `foundry.applications.api.DialogV2`. Each uses `rejectClose: false` so closing/cancel resolves to `null` (never throws), and wraps content in a `.hc-dialog` element for theming.

- **`promptText({ title, label, value }) → Promise<string|null>`**
  Single text field (autofocused). OK resolves to the trimmed value, or `null` if empty/cancelled. Replaces all five name/rename prompts.

- **`promptNewMap() → Promise<{ name, singleLayer }|null>`**
  Name field + a **Single layer** checkbox. OK resolves to `{ name, singleLayer }` if the name is non-empty, else `null`; cancel → `null`.

- **`promptColour(current) → Promise<string|null>`**
  Shows the module `PALETTE` as a row of clickable swatches (the current colour marked) plus a hex `<input>` for a custom value. Resolves to the chosen `#rrggbb` string, or `null` on cancel. (Clicking a swatch selects it; OK confirms. Fully in-Foundry — no OS colour popup.)

Dialog text uses existing/added `HIVECART.*` i18n keys.

---

## 3. Single-layer at creation (behaviour change)

- `Map.singleLayer` is decided **only** in `promptNewMap()` and is **immutable** thereafter.
- The map-bar **Single-Layer checkbox and its change handler are removed**; the `data-hc="singleLayer"` element is deleted from the template.
- The model's `setSingleLayer` and its unit test are **removed** (no longer used). `addMap` gains the flag: **`addMap(doc, name, singleLayer) → id`** (seeds `singleLayer` from the argument, default `false`).
- The `hc-single` window class, the `hc-layeronly` hiding, and `#renderAll` skipping the cross-section for single-layer maps are **unchanged** — they read `map.singleLayer`, which is now creation-set. Existing single-layer maps keep working (they just can't be flipped). No migration needed.

---

## 4. Async ripple

`DialogV2` resolves asynchronously, so the call sites become `await`-based:

- **`#ctx().promptName`** becomes `async` (returns a `Promise<string|null>` via `promptText`).
- **`disk-editor`**: `onDown` (point placement) and `onUp` (wedge/circle finalize) currently do `const name = ctx.promptName(...); if (name) ctx.addX(...)`. They become `async` and `await ctx.promptName(...)` before committing the shape. The drag gesture state (`drag`/`selDrag`) is already cleared before the prompt in `onUp`; awaiting the name after clearing is safe (no further pointer math depends on it).
- **`#action(act)`** becomes `async`; map/layer/rename actions `await` their dialog, then mutate + persist + render. `#pickColour` becomes `async` and `await`s `promptColour`.

No behaviour change beyond the popup being a Foundry dialog instead of a blocking browser prompt.

---

## 5. Components touched

| File | Change |
|------|--------|
| `scripts/apps/dialogs.mjs` | **New** — `promptText`, `promptNewMap`, `promptColour`. |
| `scripts/data/hive-model.mjs` | `addMap(doc, name, singleLayer)`; remove `setSingleLayer`. |
| `scripts/apps/hive-app.mjs` | Use the dialog helpers; `#action`/`#pickColour`/`promptName` async; drop the single-layer toggle wiring; `mapNew` uses `promptNewMap`. |
| `scripts/apps/disk-editor.mjs` | `onDown`/`onUp` await `ctx.promptName`. |
| `templates/hive-app.hbs` | Remove the single-layer checkbox from the map bar. |
| `styles/hive-cartographer.css` | Add `.hc-dialog` (+ swatch) styling; keep `hc-single`/`hc-layeronly` rules. |
| `lang/en.json` | Add dialog labels/keys; the `SingleLayer` key is reused in the New Map dialog. |
| `test/hive-model.test.mjs` | Update `addMap` test for the new arg; remove the `setSingleLayer` assertion. |

---

## 6. Error handling & edge cases

- Cancel/close any dialog → `null`/`undefined` → the action no-ops (same as today's "empty prompt" path).
- `promptNewMap` with an empty name → `null` → no map created.
- `promptColour` returning a non-hex custom value → validated to `#rrggbb`; invalid input falls back to leaving the colour unchanged (treated as cancel).
- Awaiting a dialog while the app is open: if the user closes the window mid-dialog, the resolved callback guards with `this.element?.isConnected` before mutating/persisting.

---

## 7. Testing

**Pure-model (Vitest):** `addMap` accepts and stores `singleLayer` (true/false, default false); `setSingleLayer` no longer exported (test removed). All other model tests unchanged.

**Manual (Foundry):** every former prompt now appears as an on-theme Foundry dialog; New Map asks name + single-layer (and the bar no longer has the toggle); draw/rename flows still work via the dialogs; colour dialog shows palette swatches + hex and applies the pick; cancelling any dialog leaves state untouched.

---

## 8. Out of scope

No change to map browsing, sync, permissions, or the multi-map data model beyond the `addMap` signature and the removed `setSingleLayer`. No new dependencies.
