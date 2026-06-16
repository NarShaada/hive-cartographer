// scripts/apps/cross-section.mjs
import { layerBands } from "../geometry.mjs";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Render the vertical layer stack. layers: model.layers (index 0 = top). onSelect(index).
export function renderCrossSection(container, layers, activeIndex, onSelect) {
  const bands = layerBands(layers.length);
  // grow weights give a subtle organic height variance, peaking in the middle
  const grow = (i, n) => 0.8 + 0.35 * Math.sin((i + 0.5) / n * Math.PI);
  container.innerHTML = "";
  layers.forEach((L, i) => {
    const b = bands[i];
    const tl = (50 - b.top * 100).toFixed(1), tr = (50 + b.top * 100).toFixed(1);
    const bl = (50 - b.bot * 100).toFixed(1), br = (50 + b.bot * 100).toFixed(1);
    const div = document.createElement("div");
    div.className = "hc-tier" + (i === activeIndex ? " active" : "");
    div.style.clipPath = `polygon(${tl}% 0, ${tr}% 0, ${br}% 100%, ${bl}% 100%)`;
    div.style.flexGrow = grow(i, layers.length).toFixed(3);
    div.addEventListener("click", () => onSelect(i));
    const gd = (-((i * 1.618 + 2.5) % 5)).toFixed(2);   // staggered glitch delay (offset from disk labels)
    div.innerHTML = `<div class="hc-chip"><span class="hc-lv">L${layers.length - i}</span><b style="animation-delay:${gd}s">${esc(L.name)}</b></div>`;
    container.appendChild(div);
  });
}
