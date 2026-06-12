import { createStateSync, formatStateTimestamp } from "/shared/js/state-sync.js";
import { applyScreenMedia } from "/shared/js/media-layer.js";
import { setActiveLayer } from "/shared/js/layer-switch.js";
import { renderCelebration, teardownCelebration } from "/bigscreen/celebration.js";

const LAYERS = ["window", "media", "celebration"];
const root = document.getElementById("bigscreen-root");

function asObject(v) {
  return typeof v === "object" && v !== null ? v : {};
}

function render(state) {
  const screens = asObject(state.screens);
  const big = asObject(screens.big);
  const layer = String(big.layer ?? "window");

  if (root) {
    setActiveLayer(root, layer, LAYERS);
  }

  const windowImg = document.getElementById("layer-window-img");
  const path = String(big.window_image ?? "").trim();
  if (windowImg) {
    if (path) {
      windowImg.src = path;
      windowImg.alt = "Ablakfotó";
    } else {
      windowImg.removeAttribute("src");
      windowImg.alt = "";
    }
  }

  const media = asObject(big.media);
  applyScreenMedia(media, {
    videoEl: document.getElementById("layer-media-video"),
    audioEl: document.getElementById("layer-media-audio"),
  });

  const celebrationEl = document.getElementById("layer-celebration");
  if (layer === "celebration" && celebrationEl) {
    void renderCelebration(celebrationEl, state);
  } else {
    teardownCelebration();
    if (celebrationEl) celebrationEl.dataset.celebrationSig = "";
  }

  const syncEl = document.getElementById("bigscreen-sync");
  if (syncEl) {
    syncEl.textContent = `BIG // ${layer.toUpperCase()} // ${formatStateTimestamp(state.updated_at)}`;
  }
}

const sync = createStateSync({
  onState: render,
  onError: (e) => {
    const el = document.getElementById("bigscreen-sync");
    if (el) el.textContent = `BIG ERROR // ${String(e)}`;
  },
});

sync.startPolling();
