// scripts/apps/dialogs.mjs
// Themed in-Foundry dialogs (DialogV2). Every helper resolves to null on cancel/close (rejectClose:false).
import { PALETTE } from "../data/hive-model.mjs";

const { DialogV2 } = foundry.applications.api;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const L = (k) => game.i18n.localize(k);

// Single text field. Resolves to the trimmed value, or null if empty / cancelled.
export async function promptText({ title, label, value = "" }) {
  const v = await DialogV2.prompt({
    window: { title },
    content: `<div class="hc-dialog"><label>${esc(label)}</label><input type="text" name="value" value="${esc(value)}"/></div>`,
    ok: { label: L("HIVECART.OK"), callback: (e, button) => button.form.elements.value.value.trim() },
    rejectClose: false,
    render: (e, dialog) => { const i = dialog.element.querySelector('input[name="value"]'); if (i) { i.focus(); i.select(); } },
  });
  return v || null;
}

// New-map dialog: name + single-layer checkbox. Resolves to { name, singleLayer } or null.
export async function promptNewMap() {
  const res = await DialogV2.prompt({
    window: { title: L("HIVECART.NewMapTitle") },
    content: `<div class="hc-dialog">`
      + `<label>${L("HIVECART.Map")}</label>`
      + `<input type="text" name="name" value="New Map"/>`
      + `<label class="hc-check"><input type="checkbox" name="single"/> ${L("HIVECART.SingleLayer")}</label>`
      + `</div>`,
    ok: { label: L("HIVECART.OK"), callback: (e, button) => {
      const f = button.form.elements, name = f.name.value.trim();
      return name ? { name, singleLayer: f.single.checked } : null;
    } },
    rejectClose: false,
    render: (e, dialog) => { const i = dialog.element.querySelector('input[name="name"]'); if (i) { i.focus(); i.select(); } },
  });
  return res || null;
}

// Colour dialog: palette swatches (radio, current pre-selected) + a hex field that overrides.
// Resolves to "#rrggbb" or null.
export async function promptColour(current) {
  const cur = /^#[0-9a-f]{6}$/i.test(current) ? current.toLowerCase() : PALETTE[0];
  const swatches = PALETTE.map((c) =>
    `<label class="hc-swatch-btn" style="background:${c}"><input type="radio" name="sw" value="${c}"${c === cur ? " checked" : ""}/></label>`).join("");
  const res = await DialogV2.prompt({
    window: { title: L("HIVECART.ColourTitle") },
    content: `<div class="hc-dialog hc-colourdlg"><div class="hc-swatches">${swatches}</div>`
      + `<label>${L("HIVECART.Hex")}</label><input type="text" name="hex" value="" placeholder="#rrggbb" maxlength="7"/></div>`,
    ok: { label: L("HIVECART.OK"), callback: (e, button) => {
      const f = button.form.elements;
      const hex = (f.hex.value || "").trim().toLowerCase();
      if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
      const sw = f.sw && f.sw.value;
      return /^#[0-9a-f]{6}$/.test(sw) ? sw : null;
    } },
    rejectClose: false,
  });
  return res || null;
}

// Multi-line description editor. Resolves to the text (may be empty — clears the description), or null on cancel.
export async function promptDescription(current) {
  const res = await DialogV2.prompt({
    window: { title: L("HIVECART.DescribeTitle") },
    content: `<div class="hc-dialog"><label>${L("HIVECART.Describe")}</label><textarea name="text" rows="5">${esc(current)}</textarea></div>`,
    ok: { label: L("HIVECART.OK"), callback: (e, button) => button.form.elements.text.value.trim() },
    rejectClose: false,
    render: (e, dialog) => { const t = dialog.element.querySelector('textarea[name="text"]'); if (t) t.focus(); },
  });
  return res ?? null;
}
