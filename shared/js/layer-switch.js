/**
 * Toggle fullscreen layers by name.
 * @param {HTMLElement} root
 * @param {string} activeLayer
 * @param {string[]} layerNames
 */
export function setActiveLayer(root, activeLayer, layerNames) {
  for (const name of layerNames) {
    const el = root.querySelector(`[data-layer="${name}"]`);
    if (!el) continue;
    const on = name === activeLayer;
    el.classList.toggle("is-active", on);
    el.classList.toggle("hidden", !on);
    el.setAttribute("aria-hidden", on ? "false" : "true");
  }
  root.dataset.activeLayer = activeLayer;
}
