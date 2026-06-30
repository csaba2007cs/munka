import { formatStateTimestamp } from "/shared/js/state-sync.js";

const $ = (id) => document.getElementById(id);

const MQTT_TOPICS = [
  "bigscreen/video",
  "bigscreen/layer",
  "session/control",
  "bigscreen/video/play",
  "bigscreen/video/pause",
  "bigscreen/video/reset",
];

let appState = {
  status: "IDLE",
  current_step: 1,
  display: {},
  audio: {},
  updated_at: null,
};
let lastAudioKey = null;
let mqttConnected = false;

function asObject(v) {
  return typeof v === "object" && v !== null ? v : {};
}

function isMjpegUrl(url) {
  const u = String(url || "").toLowerCase();
  if (!u) return false;
  return (
    /\.mjpe?g(\?|$|\/)/.test(u) ||
    u.includes("/mjpeg") ||
    u.includes("multipart/x-mixed-replace") ||
    u.includes("videostream.cgi")
  );
}

function resolveAssetOrUrl(value, folder) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.startsWith("http://") || text.startsWith("https://") || text.startsWith("/")) {
    return text;
  }
  return `/shared/assets/${folder}/${encodeURIComponent(text)}`;
}

function playWithSurface(el, label) {
  if (!el || typeof el.play !== "function") return;
  const p = el.play();
  if (p && typeof p.catch === "function") {
    p.catch((err) => {
      setSyncLine(`${label} // ${String(err?.message ?? err)}`);
    });
  }
}

function setSyncLine(text) {
  const el = $("display-sync");
  if (el) el.textContent = text;
}

function ensureCamMjpegEl() {
  let img = $("cam-feed-mjpeg");
  if (img) return img;
  const wrap = document.querySelector(".window-viewport");
  if (!wrap) return null;
  img = document.createElement("img");
  img.id = "cam-feed-mjpeg";
  img.alt = "";
  img.hidden = true;
  img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;";
  wrap.insertBefore(img, wrap.firstChild);
  return img;
}

function render(state) {
  appState = { ...appState, ...state, display: { ...asObject(appState.display), ...asObject(state.display) } };

  const display = asObject(appState.display);
  const bgVideo = String(display.background_video ?? "");
  const bgAudio = String(display.background_audio ?? "");
  const camUrl = String(display.camera_feed_url ?? "");

  const v = $("bg-video");
  if (v) {
    const next = resolveAssetOrUrl(bgVideo, "video");
    if (next) {
      if (v.getAttribute("data-src") !== next) {
        v.setAttribute("data-src", next);
        v.src = next;
        v.poster = "/shared/assets/images/poster_placeholder.svg";
        playWithSurface(v, "VIDEO");
      }
    } else {
      v.pause();
      v.removeAttribute("data-src");
      v.removeAttribute("src");
      v.poster = "/shared/assets/images/poster_placeholder.svg";
    }
  }

  const a = $("bg-audio");
  if (a) {
    const next = resolveAssetOrUrl(bgAudio, "audio");
    if (next) {
      if (a.getAttribute("data-src") !== next) {
        a.setAttribute("data-src", next);
        a.src = next;
        a.loop = true;
        playWithSurface(a, "AUDIO");
      }
    } else {
      a.pause();
      a.removeAttribute("data-src");
      a.removeAttribute("src");
    }
  }

  const cam = $("cam-feed");
  const camMjpeg = ensureCamMjpegEl();
  if (camUrl) {
    if (isMjpegUrl(camUrl)) {
      if (cam) {
        cam.pause();
        cam.hidden = true;
        cam.removeAttribute("src");
        cam.removeAttribute("data-src");
      }
      if (camMjpeg) {
        camMjpeg.hidden = false;
        const bust = camUrl + (camUrl.includes("?") ? "&" : "?") + "_t=" + Date.now();
        if (camMjpeg.getAttribute("data-src") !== camUrl) {
          camMjpeg.setAttribute("data-src", camUrl);
          camMjpeg.src = bust;
        }
      }
    } else if (cam) {
      if (camMjpeg) {
        camMjpeg.hidden = true;
        camMjpeg.removeAttribute("src");
        camMjpeg.removeAttribute("data-src");
      }
      cam.hidden = false;
      if (cam.getAttribute("data-src") !== camUrl) {
        cam.setAttribute("data-src", camUrl);
        cam.srcObject = null;
        cam.src = camUrl;
        playWithSurface(cam, "CAM");
      }
    }
  } else {
    if (cam) {
      cam.pause();
      cam.hidden = false;
      cam.removeAttribute("src");
      cam.removeAttribute("data-src");
    }
    if (camMjpeg) {
      camMjpeg.hidden = true;
      camMjpeg.removeAttribute("src");
      camMjpeg.removeAttribute("data-src");
    }
  }

  const audioState = asObject(appState.audio);
  const triggered = asObject(audioState.last_triggered);
  const key = triggered.at && triggered.clip ? `${triggered.at}::${triggered.clip}` : null;
  if (key && key !== lastAudioKey) {
    lastAudioKey = key;
    const url = typeof triggered.url === "string" ? triggered.url : "";
    if (url) {
      const oneShot = new Audio(url);
      oneShot.play().catch((err) => setSyncLine(`SFX // ${String(err?.message ?? err)}`));
    }
  }

  const hud = $("display-hud");
  if (hud) {
    hud.innerHTML = `
      <div class="tag-pill">ÁLLAPOT · <strong>${String(appState.status ?? "")}</strong></div>
      <div class="tag-pill">LÉPÉS · <strong>${String(appState.current_step ?? "")} / 4</strong></div>
    `;
  }

  const mode = mqttConnected ? "MQTT" : "INIT";
  setSyncLine(`${mode} // ${formatStateTimestamp(appState.updated_at)}`);
}

function applySessionControl(cmd) {
  const c = String(cmd ?? "").trim().toLowerCase();
  if (c === "start") appState.status = "RUNNING";
  else if (c === "pause") appState.status = "PAUSED";
  else if (c === "complete") appState.status = "COMPLETED";
  else if (c === "stop" || c === "reset") {
    appState.status = "IDLE";
    if (c === "reset") appState.current_step = 1;
  }
  appState.updated_at = new Date().toISOString();
  render(appState);
}

function handleMqttTopic(topic, text) {
  const payload = String(text ?? "").trim();
  switch (topic) {
    case "bigscreen/video":
      appState.display = { ...asObject(appState.display), background_video: payload };
      appState.updated_at = new Date().toISOString();
      render(appState);
      break;
    case "bigscreen/layer":
      setSyncLine(`MQTT // layer ${payload}`);
      break;
    case "session/control":
      applySessionControl(payload);
      break;
    case "bigscreen/video/play":
      playWithSurface($("bg-video"), "VIDEO");
      break;
    case "bigscreen/video/pause":
      $("bg-video")?.pause();
      break;
    case "bigscreen/video/reset": {
      const v = $("bg-video");
      if (v) {
        v.pause();
        try {
          v.currentTime = 0;
        } catch (_) {}
      }
      break;
    }
    default:
      break;
  }
}

async function loadInitialState() {
  const res = await fetch("/api/state.php", { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/state.php failed: ${res.status}`);
  appState = await res.json();
  render(appState);
}

const Mqtt = globalThis.NanoportalMqtt;

void loadInitialState().catch((e) => setSyncLine(`ERROR // ${String(e)}`));

if (!Mqtt) {
  setSyncLine("ERROR // mqtt-client.js not loaded");
} else {
  Mqtt.connect({
    topics: MQTT_TOPICS,
    onMessage: handleMqttTopic,
    onStatus(state) {
      mqttConnected = state === "connected";
      if (state === "connected") {
        setSyncLine(`MQTT // ${formatStateTimestamp(appState.updated_at)}`);
      } else if (state === "error") {
        setSyncLine("MQTT // connection error");
      }
    },
  });
}
