// Superseded by admin/index.html + shared/js/admin-*.js modules (MQTT operátor UI).
import { createStateSync, formatStateTimestamp } from "/shared/js/state-sync.js";
import {
  applyInsecureCameraUx,
  attachCameraStream,
  cameraErrorMessage,
  captureVideoFrame,
  isCoarsePointer,
  requestUserCamera,
  stopMediaStream,
  waitForVideoFrame,
} from "/shared/js/camera-capture.js";

const $ = (id) => document.getElementById(id);

const STATUS_LABELS = {
  IDLE: "Várakozás",
  RUNNING: "Élmény fut",
  PAUSED: "Szünet",
  COMPLETED: "Lezárva",
};

const HARDWARE_TYPE_LABELS = {
  motion: "Mozgás",
  door_open: "Ajtó nyitva",
  door: "Ajtó",
  button: "Gomb",
  ping: "Ping",
};

const HARDWARE_ACTIVE_MS = 2 * 60 * 1000;

let toastTimer = null;

function showToast(message, type = "info") {
  const el = $("admin-toast");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("is-success", "is-error");
  if (type === "success") el.classList.add("is-success");
  if (type === "error") el.classList.add("is-error");
  el.hidden = false;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 4000);
}

function confirmAction(message) {
  return window.confirm(message);
}

const sync = createStateSync({
  onState: renderAdmin,
  onError: (e) => {
    const banner = $("status-banner");
    if (banner) {
      banner.className = "status-banner is-error";
      const label = banner.querySelector(".status-banner__label");
      if (label) label.textContent = "Szinkronizálási hiba";
      const meta = banner.querySelector(".status-banner__meta");
      if (meta) meta.textContent = String(e);
    }
    showToast(`Nem sikerült frissíteni az állapotot: ${String(e)}`, "error");
  },
});

let view = "control";
let refreshPhotoboothList = () => {};
let stopPhotoboothStream = () => {};
let startPhotoboothCamera = async () => {};
let stopVisitorStream = () => {};

function asObject(v) {
  return typeof v === "object" && v !== null ? v : {};
}

function statusClass(status) {
  const s = String(status ?? "IDLE");
  if (s === "RUNNING") return "is-running";
  if (s === "PAUSED") return "is-paused";
  if (s === "COMPLETED") return "is-completed";
  return "is-idle";
}

function updateControlButtons(status) {
  const s = String(status ?? "IDLE");
  const start = $("btn-start");
  const pause = $("btn-pause");
  const resume = $("btn-resume");
  if (start) start.disabled = s === "RUNNING" || s === "PAUSED";
  if (pause) pause.disabled = s !== "RUNNING";
  if (resume) resume.disabled = s !== "PAUSED";
}

function hardwareTypeLabel(type) {
  const key = String(type ?? "").toLowerCase();
  return HARDWARE_TYPE_LABELS[key] ?? String(type ?? "—");
}

function isHardwareActive(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() < HARDWARE_ACTIVE_MS;
}

function newSensorEvent(device, type, message) {
  const at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const event = { device, type, at };
  if (message) event.message = message;
  return event;
}

function updateTabs() {
  const views = [
    { id: "control", tab: "tab-control", panel: "view-control" },
    { id: "photobooth", tab: "tab-photobooth", panel: "view-photobooth" },
    { id: "visitors", tab: "tab-visitors", panel: "view-visitors" },
    { id: "screens", tab: "tab-screens", panel: "view-screens" },
    { id: "hardware", tab: "tab-hardware", panel: "view-hardware" },
  ];
  for (const v of views) {
    const active = view === v.id;
    $(v.tab)?.classList.toggle("is-active", active);
    $(v.tab)?.setAttribute("aria-selected", active ? "true" : "false");
    const panel = $(v.panel);
    if (panel) {
      panel.classList.toggle("hidden", !active);
      panel.hidden = !active;
    }
  }
}

function renderHardware(state) {
  const hw = asObject(state.hardware);
  const last = asObject(hw.last_sensor_event);
  const at = last.at ? String(last.at) : "";
  const active = isHardwareActive(at);

  const conn = $("hardware-connection");
  if (conn) {
    conn.textContent = active ? "Aktív — friss jel érkezett" : "Nincs friss jel (2 percen belül)";
    conn.className = `hardware-status ${active ? "hardware-status--active" : "hardware-status--idle"}`;
  }

  const devEl = $("hardware-last-device");
  const typeEl = $("hardware-last-type");
  const atEl = $("hardware-last-at");
  if (devEl) devEl.textContent = last.device ? String(last.device) : "—";
  if (typeEl) typeEl.textContent = last.type ? hardwareTypeLabel(last.type) : "—";
  if (atEl) atEl.textContent = at ? formatStateTimestamp(at) : "—";

  const zonesWrap = $("hardware-zones");
  if (zonesWrap) {
    zonesWrap.innerHTML = "";
    const zones = asObject(hw.zones);
    const keys = Object.keys(zones);
    if (!keys.length) {
      const p = document.createElement("p");
      p.className = "section-lead";
      p.textContent = "Nincs zóna definiálva.";
      zonesWrap.appendChild(p);
    } else {
      for (const key of keys) {
        const z = asObject(zones[key]);
        const led = String(z.led ?? "unknown").toLowerCase();
        const card = document.createElement("div");
        card.className = "hardware-zone-card";
        const title = document.createElement("strong");
        title.textContent = String(z.label ?? key);
        const badge = document.createElement("span");
        badge.className = `hardware-led-badge ${led === "on" ? "is-on" : led === "off" ? "is-off" : "is-unknown"}`;
        badge.textContent =
          led === "on" ? "LED be" : led === "off" ? "LED ki" : "Ismeretlen";
        card.append(title, badge);
        zonesWrap.appendChild(card);
      }
    }
  }

  const logEl = $("hardware-event-log");
  if (logEl) {
    logEl.innerHTML = "";
    const log = Array.isArray(hw.event_log) ? hw.event_log : [];
    if (!log.length) {
      const li = document.createElement("li");
      li.className = "hardware-log-empty";
      li.textContent = "Még nincs esemény a naplóban.";
      logEl.appendChild(li);
    } else {
      for (const row of log) {
        const ev = asObject(row);
        const li = document.createElement("li");
        const main = document.createElement("span");
        main.textContent = `${String(ev.device ?? "?")} · ${hardwareTypeLabel(ev.type)}`;
        const meta = document.createElement("span");
        meta.className = "hardware-log-meta";
        meta.textContent = formatStateTimestamp(ev.at);
        li.append(main, meta);
        logEl.appendChild(li);
      }
    }
  }
}

function renderAdmin(state) {
  const status = String(state.status ?? "IDLE");
  const step = Number(state.current_step ?? 1);
  const namesOk = Boolean(state.players_confirmed);

  const banner = $("status-banner");
  if (banner) {
    banner.className = `status-banner ${statusClass(status)}`;
    const label = banner.querySelector(".status-banner__label");
    if (label) {
      label.textContent = STATUS_LABELS[status] ?? status;
    }
    const meta = $("status-banner-meta");
    if (meta) {
      const parts = [`${step}. lépés`];
      parts.push(namesOk ? "Névsor: rendben" : "Névsor: ellenőrizendő");
      meta.textContent = parts.join(" · ");
    }
  }

  const syncLine = $("admin-sync");
  if (syncLine) {
    syncLine.textContent = `Utolsó frissítés: ${formatStateTimestamp(state.updated_at)}`;
  }

  updateControlButtons(status);

  const players = Array.isArray(state.players) ? state.players : [];
  const ta = $("players-input");
  if (ta && document.activeElement !== ta) {
    ta.value = players.map((p) => (asObject(p).name ?? "").toString()).join("\n");
  }

  const cam = $("camera-feed-url");
  if (cam && document.activeElement !== cam) {
    cam.value = String(asObject(state.display).camera_feed_url ?? "");
  }

  const pendingList = $("pending-list");
  if (pendingList) {
    const pending = Array.isArray(state.pending_registrations) ? state.pending_registrations : [];
    pendingList.innerHTML = "";
    if (!pending.length) {
      const li = document.createElement("li");
      li.textContent = "Nincs várakozó regisztráció.";
      pendingList.appendChild(li);
    } else {
      for (const row of pending) {
        const r = asObject(row);
        const li = document.createElement("li");
        const nm = document.createElement("span");
        nm.textContent = String(r.name ?? "");
        const metaEl = document.createElement("span");
        metaEl.className = "meta";
        metaEl.textContent = formatPhotoboothTime(r.at) || String(r.at ?? "");
        li.append(nm, metaEl);
        pendingList.appendChild(li);
      }
    }
  }

  const hint = $("players-confirmed-hint");
  if (hint) {
    hint.textContent = namesOk
      ? "A névsor véglegesítve — az Indítás gomb azonnal használható."
      : "Mentsd a neveket, majd nyomd meg: Névsor rendben — vagy erősítsd meg indításkor.";
  }

  const controlHint = $("control-hint");
  if (controlHint) {
    if (status === "RUNNING") {
      controlHint.textContent = "Az élmény fut. Szüneteltetéshez használd a Szünet gombot.";
    } else if (status === "PAUSED") {
      controlHint.textContent = "Szünetel — a Folytatás gombbal mehet tovább az élmény.";
    } else if (status === "COMPLETED") {
      controlHint.textContent = "A kör lezárult. Új élményhez használd a Teljes reset gombot (veszélyes zóna).";
    } else {
      controlHint.textContent =
        "Ellenőrizd a névsort, majd indítsd az élményt. Szünet és folytatás futás közben.";
    }
  }

  const lastAudio = asObject(asObject(state.audio).last_triggered);
  const clip = $("last-audio");
  if (clip) {
    clip.textContent = lastAudio.clip ? `Utolsó hang: ${lastAudio.clip}` : "Utolsó hang: —";
  }

  renderHardware(state);
  renderVisitors(state);
  renderScreens(state);
}

function renderVisitors(state) {
  const listEl = $("visitor-list");
  const visitors = Array.isArray(state.visitors) ? state.visitors : [];
  if (listEl) {
    listEl.innerHTML = "";
    if (!visitors.length) {
      const li = document.createElement("li");
      li.textContent = "Még nincs látogató — adj hozzá 2–6 főt a gratulációhoz.";
      listEl.appendChild(li);
    } else {
      for (const row of visitors) {
        const v = asObject(row);
        const li = document.createElement("li");
        const img = document.createElement("img");
        img.src = String(v.photo_path ?? "");
        img.alt = String(v.nickname ?? "");
        const meta = document.createElement("span");
        meta.className = "visitor-meta";
        meta.textContent = String(v.nickname ?? "");
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn-neon btn-danger";
        del.textContent = "Törlés";
        del.addEventListener("click", () => void removeVisitor(Number(v.id)));
        li.append(img, meta, del);
        listEl.appendChild(li);
      }
    }
  }

  const gc = asObject(state.group_contact);
  const emailEl = $("group-email");
  const phoneEl = $("group-phone");
  if (emailEl && document.activeElement !== emailEl) {
    emailEl.value = String(gc.email ?? "");
  }
  if (phoneEl && document.activeElement !== phoneEl) {
    phoneEl.value = String(gc.phone ?? "");
  }
}

function renderScreens(state) {
  const screens = asObject(state.screens);
  const big = asObject(screens.big);
  const small = asObject(screens.small);
  const bigLayer = String(big.layer ?? "window");
  const smallLayer = String(small.layer ?? "idle");
  const bigStatus = $("big-layer-status");
  const smallStatus = $("small-layer-status");
  if (bigStatus) bigStatus.textContent = `Réteg: ${bigLayer}`;
  if (smallStatus) smallStatus.textContent = `Réteg: ${smallLayer}`;

  document.querySelectorAll("[data-big-layer]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-big-layer") === bigLayer);
  });
  document.querySelectorAll("[data-small-layer]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-small-layer") === smallLayer);
  });

  const winPreview = $("window-preview");
  const winPath = String(big.window_image ?? "").trim();
  if (winPreview) {
    if (winPath) {
      winPreview.src = winPath;
      winPreview.hidden = false;
    } else {
      winPreview.hidden = true;
    }
  }
}

async function setBigLayer(layer) {
  await sync.patch({ screens: { big: { layer } } });
  showToast(`Nagy kijelző: ${layer}`, "success");
}

async function setSmallLayer(layer) {
  await sync.patch({ screens: { small: { layer, touch_enabled: layer === "quiz" } } });
  showToast(`Érintőképernyő: ${layer}`, "success");
}

async function removeVisitor(id) {
  const snap = await sync.get();
  const visitors = (Array.isArray(snap.visitors) ? snap.visitors : []).filter(
    (v) => Number(asObject(v).id) !== id,
  );
  await sync.patch({ visitors });
  showToast("Látogató törölve.", "success");
}

async function saveGroupContact() {
  const email = ($("group-email")?.value ?? "").trim();
  const phone = ($("group-phone")?.value ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast("Érvénytelen e-mail cím.", "error");
    return;
  }
  await sync.patch({ group_contact: { email, phone } });
  showToast("Elérhetőség mentve.", "success");
}

async function uploadImageBlob(blob, kind) {
  const fd = new FormData();
  fd.append("photo", blob, "capture.jpg");
  fd.append("kind", kind);
  const res = await fetch("/api/upload.php", { method: "POST", body: fd });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Feltöltés sikertelen");
  return String(json.path ?? "");
}

function setView(next) {
  if (view === "photobooth" && next !== "photobooth") {
    stopPhotoboothStream();
  }
  if (view === "visitors" && next !== "visitors") {
    stopVisitorStream();
  }
  view = next;
  updateTabs();
  if (view === "photobooth") {
    void refreshPhotoboothList();
  }
  const focusMap = {
    control: "btn-start",
    photobooth: "cam-start",
    visitors: "visitor-nickname",
    screens: "[data-big-layer]",
    hardware: "btn-hw-test-motion",
  };
  const focusId = focusMap[view];
  if (focusId?.startsWith("[")) {
    document.querySelector(focusId)?.focus();
  } else {
    $(focusId)?.focus();
  }
}

async function postSensorEvent(device, type, message) {
  await sync.patch({
    hardware: { last_sensor_event: newSensorEvent(device, type, message) },
  });
  showToast("Hardver esemény elküldve.", "success");
}

async function setZoneLed(zoneKey, led) {
  await sync.patch({ hardware: { zones: { [zoneKey]: { led } } } });
  showToast(`Zóna LED állapot frissítve: ${led}`, "success");
}

async function clearHardwareLog() {
  if (!confirmAction("Törlöd a hardver eseménynaplót és az utolsó eseményt?")) {
    return;
  }
  await sync.patch({ hardware: { event_log: [], last_sensor_event: null } });
  showToast("Hardver napló törölve.", "success");
}

async function patchStatus(status) {
  await sync.patch({ status });
  showToast(
    status === "RUNNING" ? "Élmény elindítva." : status === "PAUSED" ? "Szünet." : "Állapot frissítve.",
    "success",
  );
}

async function stopToIdle() {
  if (
    !confirmAction(
      "Megszakítod az élményt? A kvíz zárolva lesz, de később újra indítható.",
    )
  ) {
    return;
  }
  await sync.patch({
    status: "IDLE",
    quiz_state: {
      selected_answer: null,
      validation: "idle",
      feedback_visible: false,
    },
  });
  showToast("Élmény megszakítva.", "success");
}

async function endSessionCompleted() {
  if (!confirmAction("Lezárod a kört? A terminál „Lezárva” állapotba kerül.")) {
    return;
  }
  await sync.patch({ status: "COMPLETED" });
  showToast("Kör lezárva.", "success");
}

async function resetAll() {
  if (
    !confirmAction(
      "Teljes reset? Minden állapot visszaáll az alapértelmezettre. Ez nem vonható vissza.",
    )
  ) {
    return;
  }
  await sync.patch({ _full_reset: true });
  showToast("Rendszer visszaállítva.", "success");
}

async function confirmPlayers() {
  const raw = ($("players-input")?.value ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const players = raw.map((name, idx) => ({ id: idx + 1, name }));
  await sync.patch({ players, players_confirmed: false });
  showToast("Névsor mentve.", "success");
}

async function markPlayersConfirmed() {
  await sync.patch({ players_confirmed: true });
  showToast("Névsor véglegesítve.", "success");
}

async function importAllPending() {
  const s = await sync.get();
  const pending = Array.isArray(s.pending_registrations) ? s.pending_registrations : [];
  if (!pending.length) {
    showToast("Nincs importálandó regisztráció.", "info");
    return;
  }
  const players = Array.isArray(s.players) ? s.players.map((p) => ({ ...asObject(p) })) : [];
  let maxId = players.reduce((m, p) => Math.max(m, Number(asObject(p).id) || 0), 0);
  for (const row of pending) {
    const name = String(asObject(row).name ?? "").trim();
    if (!name) continue;
    maxId += 1;
    players.push({ id: maxId, name });
  }
  await sync.patch({ players, pending_registrations: [], players_confirmed: false });
  showToast(`${pending.length} név hozzáadva a névsorhoz.`, "success");
}

async function clearPendingOnly() {
  if (!confirmAction("Törlöd a várólistát? A regisztrációk elvesznek.")) {
    return;
  }
  await sync.patch({ pending_registrations: [] });
  showToast("Várólista törölve.", "success");
}

async function saveCameraFeedUrl() {
  const url = ($("camera-feed-url")?.value ?? "").trim();
  await sync.patch({ display: { camera_feed_url: url } });
  showToast("Kamera URL mentve.", "success");
}

async function startExperience() {
  const s = await sync.get();
  if (!s.players_confirmed) {
    if (!confirmAction('A „Névsor rendben” nincs megnyomva. Biztosan indítod az élményt?')) {
      return;
    }
  }
  await patchStatus("RUNNING");
}

async function loadAudioClips() {
  const grid = $("audio-grid");
  if (!grid) return;
  grid.innerHTML = "";
  try {
    const res = await fetch("/api/audio.php", { cache: "no-store" });
    const data = await res.json();
    const clips = Array.isArray(data.clips) ? data.clips : [];
    for (const c of clips) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-neon";
      btn.textContent = c.file;
      btn.addEventListener("click", async () => {
        await fetch("/api/audio.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clip: c.file }),
        });
        await sync.get().then(renderAdmin);
        showToast(`Hang lejátszva: ${c.file}`, "success");
      });
      grid.appendChild(btn);
    }
    if (!clips.length) {
      const p = document.createElement("p");
      p.className = "section-lead";
      p.textContent = "Nincs hangfájl a shared/assets/audio mappában.";
      grid.appendChild(p);
    }
  } catch {
    grid.textContent = "Hanglista betöltése sikertelen.";
    showToast("Hanglista betöltése sikertelen.", "error");
  }
}

function wireTtsPlaceholder() {
  $("tts-send")?.addEventListener("click", async () => {
    const text = ($("tts-text")?.value ?? "").trim();
    if (!text) {
      showToast("Írj be szöveget a TTS mezőbe.", "error");
      return;
    }
    const note = {
      audio: {
        last_placeholder: {
          text,
          at: new Date().toISOString(),
        },
      },
    };
    await sync.patch(note);
    showToast("TTS jelölés mentve (helyőrző).", "success");
  });
}

function formatPhotoboothTime(iso) {
  return formatStateTimestamp(iso);
}

function bootPhotobooth() {
  const video = $("cam-preview");
  const canvas = $("cam-canvas");
  const cd = $("countdown");
  const liveWrap = $("cam-live-wrap");
  const previewPanel = $("preview-panel");
  const previewShot = $("preview-shot");
  const uploadedPanel = $("uploaded-panel");
  const lastShot = $("last-shot");
  const recentList = $("upload-recent-list");
  let stream = null;
  let pendingBlob = null;
  let previewObjectUrl = null;

  function revokePreviewUrl() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
  }

  function clearPending() {
    pendingBlob = null;
    revokePreviewUrl();
    if (previewShot) {
      previewShot.removeAttribute("src");
    }
  }

  function showLive() {
    previewPanel?.classList.add("hidden");
    uploadedPanel?.classList.add("hidden");
    liveWrap?.classList.remove("hidden");
    $("cam-capture")?.classList.remove("hidden");
    $("cam-start")?.classList.remove("hidden");
    $("cam-stop")?.classList.remove("hidden");
  }

  function showPreview() {
    liveWrap?.classList.add("hidden");
    uploadedPanel?.classList.add("hidden");
    previewPanel?.classList.remove("hidden");
    $("cam-capture")?.classList.add("hidden");
  }

  function showUploaded(path) {
    previewPanel?.classList.add("hidden");
    liveWrap?.classList.add("hidden");
    uploadedPanel?.classList.remove("hidden");
    if (lastShot && path) lastShot.src = path;
  }

  async function loadRecentUploads() {
    if (!recentList) return;
    recentList.innerHTML = "";
    try {
      const res = await fetch("/api/photobooth-list.php?limit=12", { cache: "no-store" });
      const data = await res.json();
      const files = Array.isArray(data.files) ? data.files : [];
      if (!files.length) {
        const li = document.createElement("li");
        li.className = "upload-grid-empty";
        li.textContent = "Még nincs feltöltött fotó.";
        recentList.appendChild(li);
        return;
      }
      for (const file of files) {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.href = String(file.path ?? "#");
        link.target = "_blank";
        link.rel = "noopener";
        const img = document.createElement("img");
        img.src = String(file.path ?? "");
        img.alt = String(file.filename ?? "Fotó");
        img.loading = "lazy";
        const cap = document.createElement("span");
        cap.className = "upload-grid-meta";
        cap.textContent = formatPhotoboothTime(file.mtime);
        link.append(img, cap);
        li.appendChild(link);
        recentList.appendChild(li);
      }
    } catch (e) {
      const li = document.createElement("li");
      li.className = "upload-grid-empty";
      li.textContent = `Lista betöltése sikertelen: ${String(e)}`;
      recentList.appendChild(li);
    }
  }

  const secureHint = $("cam-secure-hint");
  applyInsecureCameraUx({
    startButton: $("cam-start"),
    hintEl: secureHint,
    filePickButton: $("cam-file-pick"),
  });

  function stopStream() {
    stopMediaStream(stream);
    stream = null;
    if (video) video.srcObject = null;
  }

  stopPhotoboothStream = stopStream;

  function showCameraError(message) {
    if (secureHint) {
      secureHint.hidden = false;
      secureHint.textContent = message;
      secureHint.classList.add("camera-hint--warn");
    }
    showToast(message, "error");
  }

  async function clearCameraHint() {
    if (secureHint && window.isSecureContext) {
      secureHint.hidden = true;
      secureHint.textContent = "";
      secureHint.classList.remove("camera-hint--warn");
    }
  }

  async function resumeLivePreview() {
    if (!video || !stream) return;
    try {
      await attachCameraStream(video, stream);
    } catch (e) {
      showCameraError(cameraErrorMessage(e));
    }
  }

  async function beginPhotoboothCamera({ toastOnSuccess = true } = {}) {
    try {
      stopStream();
      await clearCameraHint();
      stream = await requestUserCamera();
      await attachCameraStream(video, stream);
      if (toastOnSuccess) showToast("Kamera bekapcsolva.", "success");
      return true;
    } catch (e) {
      showCameraError(cameraErrorMessage(e));
      return false;
    }
  }

  startPhotoboothCamera = beginPhotoboothCamera;

  $("cam-start")?.addEventListener("click", () => {
    void beginPhotoboothCamera();
  });

  $("cam-file-pick")?.addEventListener("click", () => $("cam-file-fallback")?.click());
  $("cam-file-fallback")?.addEventListener("change", () => {
    const input = $("cam-file-fallback");
    const file = input?.files?.[0];
    if (!file) return;
    clearPending();
    pendingBlob = file;
    previewObjectUrl = URL.createObjectURL(file);
    if (previewShot) previewShot.src = previewObjectUrl;
    showPreview();
    showToast("Kép betöltve fájlból — ellenőrizd az előnézetet.", "success");
    if (input) input.value = "";
  });

  $("cam-stop")?.addEventListener("click", () => {
    stopStream();
    showToast("Kamera kikapcsolva.", "success");
  });

  $("cam-capture")?.addEventListener("click", async () => {
    if (!video || !canvas || !stream) {
      showToast("Előbb indítsd be a kamerát, vagy válassz fájlt.", "error");
      return;
    }
    try {
      await waitForVideoFrame(video);
    } catch (e) {
      showToast(cameraErrorMessage(e), "error");
      return;
    }
    let n = 3;
    if (cd) cd.textContent = String(n);
    await new Promise((r) => {
      const id = window.setInterval(() => {
        n -= 1;
        if (cd) cd.textContent = String(Math.max(0, n));
        if (n <= 0) {
          window.clearInterval(id);
          r(null);
        }
      }, 1000);
    });
    if (cd) cd.textContent = "";

    try {
      const blob = await captureVideoFrame(video, canvas);
      clearPending();
      pendingBlob = blob;
      previewObjectUrl = URL.createObjectURL(blob);
      if (previewShot) previewShot.src = previewObjectUrl;
      showPreview();
      showToast("Ellenőrizd az előnézetet, majd töltsd fel vagy készíts újat.", "success");
    } catch (e) {
      showToast(cameraErrorMessage(e), "error");
    }
  });

  $("cam-retake")?.addEventListener("click", () => {
    clearPending();
    showLive();
    void resumeLivePreview();
  });

  $("cam-cancel-preview")?.addEventListener("click", () => {
    clearPending();
    showLive();
    void resumeLivePreview();
  });

  $("cam-upload")?.addEventListener("click", async () => {
    if (!pendingBlob) {
      showToast("Nincs kép az előnézetben.", "error");
      return;
    }
    const fd = new FormData();
    fd.append("photo", pendingBlob, "capture.jpg");
    try {
      const res = await fetch("/api/upload.php", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) {
        showToast("Feltöltés sikertelen.", "error");
        return;
      }
      clearPending();
      showUploaded(json.path);
      await loadRecentUploads();
      showToast("Fotó feltöltve.", "success");
    } catch (e) {
      showToast(`Feltöltés hiba: ${String(e)}`, "error");
    }
  });

  $("cam-new-shot")?.addEventListener("click", () => {
    clearPending();
    showLive();
    void resumeLivePreview();
  });

  refreshPhotoboothList = loadRecentUploads;
  void loadRecentUploads();
}

function bootVisitors() {
  const video = $("visitor-cam-preview");
  const preview = $("visitor-preview-shot");
  const hint = $("visitor-camera-hint");
  let stream = null;
  let pendingBlob = null;

  applyInsecureCameraUx({
    startButton: $("visitor-cam-start"),
    hintEl: hint,
    filePickButton: $("visitor-file-pick"),
  });

  function stopStream() {
    stopMediaStream(stream);
    stream = null;
    if (video) video.srcObject = null;
  }

  stopVisitorStream = stopStream;

  $("visitor-cam-start")?.addEventListener("click", async () => {
    try {
      stopStream();
      if (hint && window.isSecureContext) {
        hint.textContent = "";
        hint.classList.remove("camera-hint--warn");
      }
      stream = await requestUserCamera();
      await attachCameraStream(video, stream);
      showToast("Látogatói kamera bekapcsolva.", "success");
    } catch (e) {
      const msg = cameraErrorMessage(e);
      if (hint) {
        hint.textContent = msg;
        hint.classList.add("camera-hint--warn");
      }
      showToast(msg, "error");
    }
  });

  $("visitor-cam-capture")?.addEventListener("click", async () => {
    if (!video || !stream) {
      showToast("Előbb indítsd be a kamerát, vagy válassz fájlt.", "error");
      return;
    }
    const canvas = document.createElement("canvas");
    try {
      const blob = await captureVideoFrame(video, canvas);
      pendingBlob = blob;
      if (preview) {
        preview.src = URL.createObjectURL(blob);
        preview.classList.remove("hidden");
      }
      showToast("Felvétel kész — add meg a becenevet és mentsd.", "success");
    } catch (e) {
      showToast(cameraErrorMessage(e), "error");
    }
  });

  $("visitor-file-pick")?.addEventListener("click", () => $("visitor-file-fallback")?.click());
  $("visitor-file-fallback")?.addEventListener("change", () => {
    const file = $("visitor-file-fallback")?.files?.[0];
    if (!file) return;
    pendingBlob = file;
    if (preview) {
      preview.src = URL.createObjectURL(file);
      preview.classList.remove("hidden");
    }
    showToast("Kép betöltve — add meg a becenevet és mentsd.", "success");
  });

  $("visitor-save")?.addEventListener("click", async () => {
    const nickname = ($("visitor-nickname")?.value ?? "").trim();
    if (!nickname) {
      showToast("Add meg a becenevet.", "error");
      return;
    }
    if (!pendingBlob) {
      showToast("Készíts vagy válassz fotót előbb.", "error");
      return;
    }
    const snap = await sync.get();
    const visitors = Array.isArray(snap.visitors) ? [...snap.visitors] : [];
    if (visitors.length >= 6) {
      showToast("Legfeljebb 6 látogató adható meg.", "error");
      return;
    }
    try {
      const path = await uploadImageBlob(pendingBlob, "visitor");
      const nextId = visitors.reduce((m, v) => Math.max(m, Number(asObject(v).id) || 0), 0) + 1;
      visitors.push({ id: nextId, nickname, photo_path: path });
      await sync.patch({ visitors });
      pendingBlob = null;
      if (preview) {
        preview.classList.add("hidden");
        preview.removeAttribute("src");
      }
      const nick = $("visitor-nickname");
      if (nick) nick.value = "";
      showToast("Látogató mentve.", "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  });
}

function bootScreens() {
  document.querySelectorAll("[data-big-layer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const layer = btn.getAttribute("data-big-layer");
      if (layer) void setBigLayer(layer);
    });
  });
  document.querySelectorAll("[data-small-layer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const layer = btn.getAttribute("data-small-layer");
      if (layer) void setSmallLayer(layer);
    });
  });

  $("btn-window-upload")?.addEventListener("click", async () => {
    const file = $("window-photo-input")?.files?.[0];
    if (!file) {
      showToast("Válassz képet az ablakfotóhoz.", "error");
      return;
    }
    try {
      const path = await uploadImageBlob(file, "window");
      await sync.patch({ screens: { big: { window_image: path, layer: "window" } } });
      showToast("Ablakfotó mentve.", "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  });
}

function boot() {
  $("tab-control")?.addEventListener("click", () => setView("control"));
  $("tab-photobooth")?.addEventListener("click", () => {
    setView("photobooth");
    if (window.isSecureContext && isCoarsePointer()) {
      void startPhotoboothCamera({ toastOnSuccess: false });
    }
  });
  $("tab-visitors")?.addEventListener("click", () => setView("visitors"));
  $("tab-screens")?.addEventListener("click", () => setView("screens"));
  $("tab-hardware")?.addEventListener("click", () => setView("hardware"));

  $("btn-hw-test-motion")?.addEventListener("click", () =>
    void postSensorEvent("esp32-zone-a", "motion", "Operátori teszt"),
  );
  $("btn-hw-test-door")?.addEventListener("click", () =>
    void postSensorEvent("esp32-zone-a", "door_open", "Operátori teszt"),
  );
  $("btn-hw-led-a-on")?.addEventListener("click", () => void setZoneLed("zone_a", "on"));
  $("btn-hw-led-a-off")?.addEventListener("click", () => void setZoneLed("zone_a", "off"));
  $("btn-hardware-clear-log")?.addEventListener("click", () => void clearHardwareLog());

  $("btn-start")?.addEventListener("click", () => void startExperience());
  $("btn-pause")?.addEventListener("click", () => void patchStatus("PAUSED"));
  $("btn-resume")?.addEventListener("click", () => void patchStatus("RUNNING"));
  $("btn-stop")?.addEventListener("click", () => void stopToIdle());
  $("btn-end-session")?.addEventListener("click", () => void endSessionCompleted());
  $("btn-reset")?.addEventListener("click", () => void resetAll());

  $("btn-players-save")?.addEventListener("click", () => void confirmPlayers());
  $("btn-players-confirmed")?.addEventListener("click", () => void markPlayersConfirmed());
  $("btn-pending-import")?.addEventListener("click", () => void importAllPending());
  $("btn-pending-clear")?.addEventListener("click", () => void clearPendingOnly());
  $("btn-camera-save")?.addEventListener("click", () => void saveCameraFeedUrl());

  wireTtsPlaceholder();
  bootPhotobooth();
  bootVisitors();
  bootScreens();
  $("btn-group-contact-save")?.addEventListener("click", () => void saveGroupContact());
  void loadAudioClips();

  updateTabs();
  sync.startPolling();
}

boot();
