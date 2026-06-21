import { createStateSync, formatStateTimestamp } from "/shared/js/state-sync.js";

const $ = (id) => document.getElementById(id);

let lastAudioKey = null;

function asObject(v) {
  return typeof v === "object" && v !== null ? v : {};
}

function playWithSurface(el, label) {
  if (!el || typeof el.play !== "function") return;
  const p = el.play();
  if (p && typeof p.catch === "function") {
    p.catch((err) => {
      const syncEl = $("display-sync");
      if (syncEl) syncEl.textContent = `${label} // ${String(err?.message ?? err)}`;
    });
  }
}

function render(state) {
  const display = asObject(state.display);
  const bgVideo = String(display.background_video ?? "");
  const bgAudio = String(display.background_audio ?? "");
  const camUrl = String(display.camera_feed_url ?? "");

  const v = $("bg-video");
  if (v) {
    const next = bgVideo ? `/shared/assets/video/${encodeURIComponent(bgVideo)}` : "";
    if (next) {
      if (v.getAttribute("data-src") !== next) {
        v.setAttribute("data-src", next);
        v.src = next;
        v.poster = "/shared/assets/images/poster_placeholder.svg";
        playWithSurface(v, "VIDEO");
      }
    } else {
      v.removeAttribute("data-src");
      v.removeAttribute("src");
      v.poster = "/shared/assets/images/poster_placeholder.svg";
    }
  }

  const a = $("bg-audio");
  if (a) {
    const next = bgAudio ? `/shared/assets/audio/${encodeURIComponent(bgAudio)}` : "";
    if (next) {
      if (a.getAttribute("data-src") !== next) {
        a.setAttribute("data-src", next);
        a.src = next;
        a.loop = true;
        playWithSurface(a, "AUDIO");
      }
    } else {
      a.removeAttribute("data-src");
      a.removeAttribute("src");
    }
  }

  const cam = $("cam-feed");
  if (cam) {
    if (camUrl && cam.getAttribute("data-src") !== camUrl) {
      cam.setAttribute("data-src", camUrl);
      cam.srcObject = null;
      cam.src = camUrl;
      playWithSurface(cam, "CAM");
    }
    if (!camUrl) {
      cam.removeAttribute("src");
      cam.removeAttribute("data-src");
    }
  }

  const audioState = asObject(state.audio);
  const triggered = asObject(audioState.last_triggered);
  const key = triggered.at && triggered.clip ? `${triggered.at}::${triggered.clip}` : null;
  if (key && key !== lastAudioKey) {
    lastAudioKey = key;
    const url = typeof triggered.url === "string" ? triggered.url : "";
    if (url) {
      const oneShot = new Audio(url);
      oneShot.play().catch((err) => {
        const syncEl = $("display-sync");
        if (syncEl) syncEl.textContent = `SFX // ${String(err?.message ?? err)}`;
      });
    }
  }

  const hud = $("display-hud");
  if (hud) {
    hud.innerHTML = `
      <div class="tag-pill">ÁLLAPOT · <strong>${String(state.status ?? "")}</strong></div>
      <div class="tag-pill">LÉPÉS · <strong>${String(state.current_step ?? "")} / 4</strong></div>
    `;
  }

  const el = $("display-sync");
  if (el) el.textContent = `UPDATED // ${formatStateTimestamp(state.updated_at)}`;
}

const sync = createStateSync({
  onState: render,
  onError: (e) => {
    const el = $("display-sync");
    if (el) el.textContent = `ERROR // ${String(e)}`;
  },
});

sync.startPolling();
