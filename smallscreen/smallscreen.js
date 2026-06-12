import { createStateSync, formatStateTimestamp } from "/shared/js/state-sync.js";
import { applyScreenMedia } from "/shared/js/media-layer.js";
import { setActiveLayer } from "/shared/js/layer-switch.js";
import { initQuizPanel } from "/shared/js/quiz-panel.js";

const LAYERS = ["idle", "media", "quiz"];
const root = document.getElementById("smallscreen-root");

let quizPanel = null;
let quizLoadPromise = null;

function asObject(v) {
  return typeof v === "object" && v !== null ? v : {};
}

async function ensureQuizPanel() {
  if (quizPanel) return quizPanel;
  if (!quizLoadPromise) {
    quizLoadPromise = (async () => {
      const layer = document.getElementById("layer-quiz");
      if (!layer) return null;
      if (!layer.dataset.loaded) {
        const res = await fetch("/shared/quiz-panel/panel.html", { cache: "no-store" });
        layer.innerHTML = await res.text();
        layer.dataset.loaded = "1";
      }
      const innerRoot = layer.querySelector(".quiz-root") || layer;
      quizPanel = initQuizPanel({
        root: innerRoot,
        sync,
        touchEnabled: true,
      });
      return quizPanel;
    })();
  }
  return quizLoadPromise;
}

function render(state) {
  const screens = asObject(state.screens);
  const small = asObject(screens.small);
  const layer = String(small.layer ?? "idle");

  if (root) {
    setActiveLayer(root, layer, LAYERS);
    root.style.pointerEvents = layer === "quiz" ? "auto" : "none";
  }

  const idleImg = document.getElementById("layer-idle-img");
  const idlePath = String(small.idle_image ?? "").trim();
  if (idleImg) {
    idleImg.src = idlePath || "/shared/assets/images/small-idle.svg";
    idleImg.alt = "Várakozás";
  }

  applyScreenMedia(asObject(small.media), {
    videoEl: document.getElementById("layer-media-video"),
    audioEl: document.getElementById("layer-media-audio"),
  });

  if (layer === "quiz") {
    void ensureQuizPanel().then((panel) => {
      panel?.render(state);
    });
  }

  const syncEl = document.getElementById("smallscreen-sync");
  if (syncEl) {
    syncEl.textContent = `SMALL // ${layer.toUpperCase()} // ${formatStateTimestamp(state.updated_at)}`;
  }
}

const sync = createStateSync({
  onState: render,
  onError: (e) => {
    const el = document.getElementById("smallscreen-sync");
    if (el) el.textContent = `SMALL ERROR // ${String(e)}`;
  },
});

sync.startPolling();
