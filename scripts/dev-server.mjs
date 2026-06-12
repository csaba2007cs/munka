import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const stateFile = path.join(root, "data", "state.json");
const dataDir = path.join(root, "data");
const audioDir = path.join(root, "shared", "assets", "audio");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function isPlainObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function arrayReplaceRecursive(base, patch) {
  if (Array.isArray(base) && Array.isArray(patch)) {
    const out = [...base];
    for (let i = 0; i < patch.length; i++) {
      const pv = patch[i];
      const bv = out[i];
      if (Array.isArray(pv) && Array.isArray(bv)) {
        out[i] = arrayReplaceRecursive(bv, pv);
      } else if (isPlainObject(pv) && isPlainObject(bv)) {
        out[i] = arrayReplaceRecursive(bv, pv);
      } else {
        out[i] = pv;
      }
    }
    return out;
  }
  if (isPlainObject(base) && isPlainObject(patch)) {
    const out = { ...base };
    for (const k of Object.keys(patch)) {
      const pv = patch[k];
      const bv = out[k];
      if (Array.isArray(pv) && Array.isArray(bv)) {
        out[k] = arrayReplaceRecursive(bv, pv);
      } else if (isPlainObject(pv) && isPlainObject(bv)) {
        out[k] = arrayReplaceRecursive(bv, pv);
      } else {
        out[k] = pv;
      }
    }
    return out;
  }
  return patch;
}

function defaultStateInline() {
  return {
    status: "IDLE",
    current_step: 1,
    players: [],
    quiz_state: {
      hero_title: "KIKÉPZÉSI MODUL LEZÁRVA",
      hero_subtitle: "Kutatói alkalmassági ellenőrzés folyamatban",
      header_status: "Kutatói alkalmassági ellenőrzés folyamatban",
      task_label: "1. FELADAT",
      question_text: "Melyik faj tojásából kell mintát szereznetek?",
      current_question_id: 1,
      question_title: "1. FELADAT: Melyik faj tojásából kell mintát szereznetek?",
      options: [
        { id: "a", label: "Tyrannotitan" },
        { id: "b", label: "Patagotitan" },
        { id: "c", label: "ismeretlen kisragadozó" },
      ],
      correct_option_id: "b",
      selected_answer: null,
      validation: "idle",
      feedback_visible: false,
      feedback_instruction:
        "UV-fénnyel vizsgáljátok meg a tojásrakó helyhez kapcsolódó képet.",
      sidebar_title: "VIZSGA FOLYAMAT",
      sidebar_items: [
        { id: "celpont", label: "célpont", done: true },
        { id: "fenyegetes", label: "fenyegetés", done: false },
        { id: "mintavetel", label: "mintavétel", done: false },
        { id: "mozgasi", label: "mozgási korlát", done: false },
      ],
      hud_scan_percent: 97,
      hud_footer: "NP-SYS // MISSION MODULE",
      footer_left: "A múltban nincs második esély.",
    },
    display: {
      background_audio: "ambient_loop_placeholder.mp3",
      background_video: "phase_01_placeholder.mp4",
      camera_feed_url: "",
    },
    audio: {
      last_triggered: null,
      last_placeholder: null,
      queue: [],
    },
    pending_registrations: [],
    players_confirmed: false,
    hardware: defaultHardwareInline(),
    screens: defaultScreensInline(),
    visitors: [],
    group_contact: defaultGroupContactInline(),
    updated_at: null,
  };
}

function defaultScreensInline() {
  return {
    big: {
      layer: "window",
      window_image: "",
      media: {
        video: "phase_01_placeholder.mp4",
        audio: "ambient_loop_placeholder.mp3",
      },
      celebration: {
        template: "crowd_europe",
        duration_sec: 9,
        cheer_audio: "ambient_loop_placeholder.mp3",
      },
    },
    small: {
      layer: "idle",
      idle_image: "/shared/assets/images/small-idle.svg",
      media: { video: "", audio: "" },
      touch_enabled: false,
    },
  };
}

function defaultGroupContactInline() {
  return { email: "", phone: "" };
}

function ensureMobilmoziDefaults(state) {
  let base = ensureHardwareDefaults(state);
  if (!isPlainObject(base.screens)) {
    base = { ...base, screens: defaultScreensInline() };
  } else {
    base = { ...base, screens: arrayReplaceRecursive(defaultScreensInline(), base.screens) };
  }
  if (!Array.isArray(base.visitors)) {
    base = { ...base, visitors: [] };
  }
  if (!isPlainObject(base.group_contact)) {
    base = { ...base, group_contact: defaultGroupContactInline() };
  } else {
    base = {
      ...base,
      group_contact: arrayReplaceRecursive(defaultGroupContactInline(), base.group_contact),
    };
  }
  return base;
}

function defaultHardwareInline() {
  return {
    last_sensor_event: null,
    event_log: [],
    zones: {
      zone_a: { label: "Zóna A", led: "unknown" },
      zone_b: { label: "Zóna B", led: "unknown" },
    },
  };
}

function ensureHardwareDefaults(state) {
  const base = { ...state };
  if (!isPlainObject(base.hardware)) {
    base.hardware = defaultHardwareInline();
    return base;
  }
  base.hardware = arrayReplaceRecursive(defaultHardwareInline(), base.hardware);
  return base;
}

function normalizeSensorEvent(event) {
  if (!isPlainObject(event)) return null;
  const device = String(event.device ?? "").trim();
  const type = String(event.type ?? "").trim();
  const at = String(event.at ?? "").trim();
  if (!device || !type || !at) return null;
  const out = { device, type, at };
  if (event.message != null && String(event.message) !== "") {
    out.message = String(event.message);
  }
  return out;
}

function eventLogKey(event) {
  return `${event.device}|${event.type}|${event.at}`;
}

function applyHardwareEventLog(merged, patch) {
  if (!isPlainObject(patch.hardware) || !Object.prototype.hasOwnProperty.call(patch.hardware, "last_sensor_event")) {
    return ensureHardwareDefaults(merged);
  }
  let next = ensureHardwareDefaults(merged);
  const event = normalizeSensorEvent(patch.hardware.last_sensor_event);
  if (!event) return next;

  const hw = { ...next.hardware };
  hw.last_sensor_event = event;
  const key = eventLogKey(event);
  const log = [event];
  for (const row of hw.event_log ?? []) {
    const norm = normalizeSensorEvent(row);
    if (!norm || eventLogKey(norm) === key) continue;
    log.push(norm);
    if (log.length >= 50) break;
  }
  hw.event_log = log.slice(0, 50);
  next = { ...next, hardware: hw };
  return next;
}

function loadState() {
  try {
    const raw = fs.readFileSync(stateFile, "utf8");
    if (!raw.trim()) return defaultStateInline();
    const d = JSON.parse(raw);
    return ensureMobilmoziDefaults(isPlainObject(d) ? d : defaultStateInline());
  } catch {
    return ensureMobilmoziDefaults(defaultStateInline());
  }
}

function saveState(state) {
  state.updated_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const json = JSON.stringify(state, null, 2);
  const tmp = stateFile + ".tmp";
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(tmp, json, "utf8");
  fs.renameSync(tmp, stateFile);
}

function mergeState(current, patch) {
  const nested = ["quiz_state", "display", "audio", "hardware", "screens", "group_contact"];
  const base = { ...current };
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (
      nested.includes(key) &&
      isPlainObject(value) &&
      base[key] != null &&
      isPlainObject(base[key])
    ) {
      base[key] = arrayReplaceRecursive(base[key], value);
    } else {
      base[key] = value;
    }
  }
  return base;
}

/** Ha a helyes válasz már megjelent, ne lehessen POST-tal felülírni a válasz-hármasot (kivételes: status / current_step változik, vagy _full_reset). */
function applyQuizAnswerLock(current, patch, merged) {
  const qs = current.quiz_state;
  if (!isPlainObject(qs)) return merged;
  const lock = Boolean(qs.feedback_visible) && String(qs.validation ?? "") === "correct";
  if (!lock) return merged;
  if (patch._full_reset) return merged;
  if (Object.prototype.hasOwnProperty.call(patch, "status") && patch.status !== current.status) {
    return merged;
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, "current_step") &&
    Number(patch.current_step) !== Number(current.current_step ?? 1)
  ) {
    return merged;
  }
  const prevQs = isPlainObject(merged.quiz_state) ? merged.quiz_state : {};
  const next = { ...merged, quiz_state: { ...prevQs } };
  next.quiz_state.selected_answer = qs.selected_answer ?? null;
  next.quiz_state.validation = qs.validation ?? "idle";
  next.quiz_state.feedback_visible = Boolean(qs.feedback_visible);
  return next;
}

function listAudioFiles() {
  if (!fs.existsSync(audioDir)) return [];
  return fs
    .readdirSync(audioDir)
    .filter((n) => /\.(mp3|wav|ogg|m4a)$/i.test(n))
    .sort();
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipart(buffer, boundary) {
  const sep = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = 0;
  while (true) {
    const idx = buffer.indexOf(sep, start);
    if (idx === -1) break;
    start = idx + sep.length;
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;
    const next = buffer.indexOf(sep, start);
    const part = next === -1 ? buffer.subarray(start) : buffer.subarray(start, next);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;
    const headers = part.subarray(0, headerEnd).toString("utf8");
    const content = part.subarray(headerEnd + 4);
    const body = content.subarray(0, content.length - 2);
    const m = /name="([^"]+)"/.exec(headers);
    const fn = /filename="([^"]*)"/.exec(headers);
    const ct = /Content-Type:\s*([^\r\n]+)/i.exec(headers);
    if (m) {
      parts.push({
        name: m[1],
        filename: fn ? fn[1] : "",
        contentType: ct ? ct[1].trim() : "application/octet-stream",
        data: body,
      });
    }
  }
  return parts;
}

async function handleUpload(req, res) {
  const ct = req.headers["content-type"] || "";
  const m = /boundary=([^;]+)/i.exec(ct);
  if (!m) {
    sendJson(res, 400, { error: "Expected multipart boundary" });
    return;
  }
  const boundary = m[1].trim().replace(/^"|"$/g, "");
  const buf = await readBody(req);
  const parts = parseMultipart(buf, boundary);
  const photo = parts.find((p) => p.name === "photo");
  if (!photo || !photo.data.length) {
    sendJson(res, 400, { error: 'Missing file field "photo"' });
    return;
  }
  const kindPart = parts.find((p) => p.name === "kind");
  const kindRaw = kindPart ? kindPart.data.toString("utf8").trim() : "photobooth";
  const prefixMap = { photobooth: "photobooth", visitor: "visitor", window: "window" };
  const prefix = prefixMap[kindRaw] || "photobooth";
  const mimeMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const ext = mimeMap[photo.contentType];
  if (!ext) {
    sendJson(res, 415, { error: "Unsupported image type" });
    return;
  }
  const rand = [...crypto.getRandomValues(new Uint8Array(4))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  const safeName = `${prefix}_${stamp}_${rand}.${ext}`;
  fs.mkdirSync(dataDir, { recursive: true });
  const dest = path.join(dataDir, safeName);
  fs.writeFileSync(dest, photo.data);
  const publicPath = "/data/" + encodeURIComponent(safeName);
  const mtimeUnix = fs.statSync(dest).mtimeMs;
  sendJson(res, 200, {
    ok: true,
    path: publicPath,
    filename: safeName,
    mtime: new Date(mtimeUnix).toISOString().replace(/\.\d{3}Z$/, "Z"),
  });
}

function handlePhotoboothList(_req, res) {
  const allowed = new Set(["jpg", "jpeg", "png", "webp"]);
  const entries = [];
  if (fs.existsSync(dataDir)) {
    for (const name of fs.readdirSync(dataDir)) {
      if (!name.startsWith("photobooth_")) continue;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (!allowed.has(ext)) continue;
      const full = path.join(dataDir, name);
      if (!fs.statSync(full).isFile()) continue;
      const mtimeUnix = fs.statSync(full).mtimeMs;
      entries.push({
        filename: name,
        path: "/data/" + encodeURIComponent(name),
        mtime: new Date(mtimeUnix).toISOString().replace(/\.\d{3}Z$/, "Z"),
        mtime_unix: mtimeUnix,
      });
    }
  }
  entries.sort((a, b) => (b.mtime_unix ?? 0) - (a.mtime_unix ?? 0));
  const limited = entries.slice(0, 12).map(({ mtime_unix: _u, ...rest }) => rest);
  sendJson(res, 200, { files: limited });
}

function resolveUnderRoot(relUrlPath) {
  const trimmed = relUrlPath.replace(/^\/+/, "");
  const norm = path.normalize(trimmed).replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = path.resolve(root, norm);
  const rootRes = path.resolve(root);
  const rel = path.relative(rootRes, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  return abs;
}

function serveStatic(req, res, pathname) {
  const rel = pathname.replace(/^\/+/, "");
  let abs = resolveUnderRoot(rel);
  if (!abs) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    abs = path.join(abs, "index.html");
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    res.writeHead(404).end("Not found");
    return;
  }
  const ext = path.extname(abs).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
  });
  fs.createReadStream(abs).pipe(res);
}

async function handleState(req, res) {
  if (req.method === "GET") {
    sendJson(res, 200, loadState());
    return;
  }
  if (req.method === "POST") {
    const raw = (await readBody(req)).toString("utf8");
    if (!raw.trim()) {
      sendJson(res, 400, { error: "Empty body" });
      return;
    }
    let patch;
    try {
      patch = JSON.parse(raw);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON payload" });
      return;
    }
    if (!isPlainObject(patch)) {
      sendJson(res, 400, { error: "Invalid JSON payload" });
      return;
    }
    if (patch._full_reset) {
      const fresh = defaultStateInline();
      saveState(fresh);
      sendJson(res, 200, fresh);
      return;
    }
    const current = loadState();
    const merged = ensureMobilmoziDefaults(
      applyHardwareEventLog(
        applyQuizAnswerLock(current, patch, mergeState(current, patch)),
        patch,
      ),
    );
    saveState(merged);
    sendJson(res, 200, merged);
    return;
  }
  sendJson(res, 405, { error: "Method not allowed" });
}

async function handleAudio(req, res) {
  if (req.method === "GET") {
    const clips = listAudioFiles().map((f) => ({
      file: f,
      url: "/shared/assets/audio/" + encodeURIComponent(f),
    }));
    sendJson(res, 200, {
      clips,
      placeholder: "Add .mp3/.wav files under shared/assets/audio/",
    });
    return;
  }
  if (req.method === "POST") {
    const raw = (await readBody(req)).toString("utf8");
    let payload;
    try {
      payload = JSON.parse(raw || "{}");
    } catch {
      sendJson(res, 400, { error: "Expected JSON: {\"clip\":\"filename.mp3\"}" });
      return;
    }
    if (!payload || typeof payload.clip !== "string") {
      sendJson(res, 400, { error: 'Expected JSON: {"clip":"filename.mp3"}' });
      return;
    }
    const clip = path.basename(payload.clip);
    const full = path.join(audioDir, clip);
    if (!fs.existsSync(full)) {
      sendJson(res, 404, { error: "Unknown clip" });
      return;
    }
    const state = loadState();
    if (!isPlainObject(state.audio)) state.audio = {};
    const entry = {
      clip,
      url: "/shared/assets/audio/" + encodeURIComponent(clip),
      at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    };
    state.audio.last_triggered = entry;
    if (!Array.isArray(state.audio.queue)) state.audio.queue = [];
    state.audio.queue.push(entry);
    saveState(state);
    sendJson(res, 200, {
      ok: true,
      playUrl: entry.url,
      state,
    });
    return;
  }
  sendJson(res, 405, { error: "Method not allowed" });
}

async function handleRegister(req, res) {
  if (req.method === "GET") {
    const state = loadState();
    const pending = Array.isArray(state.pending_registrations) ? state.pending_registrations : [];
    sendJson(res, 200, { pending_registrations: pending });
    return;
  }
  if (req.method === "POST") {
    const raw = (await readBody(req)).toString("utf8");
    let payload;
    try {
      payload = JSON.parse(raw || "{}");
    } catch {
      sendJson(res, 400, { error: "Expected JSON: {\"name\":\"...\"}" });
      return;
    }
    if (!payload || typeof payload.name !== "string") {
      sendJson(res, 400, { error: "Expected JSON: {\"name\":\"...\"}" });
      return;
    }
    const name = payload.name.trim();
    if (!name) {
      sendJson(res, 400, { error: "Name must not be empty" });
      return;
    }
    if (name.length > 120) {
      sendJson(res, 400, { error: "Name too long (max 120)" });
      return;
    }
    const state = loadState();
    if (!Array.isArray(state.pending_registrations)) state.pending_registrations = [];
    let maxId = 0;
    for (const row of state.pending_registrations) {
      if (row && row.id != null) {
        const n = Number(row.id);
        if (!Number.isNaN(n)) maxId = Math.max(maxId, n);
      }
    }
    const entry = {
      id: maxId + 1,
      name,
      at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    };
    state.pending_registrations.push(entry);
    saveState(state);
    sendJson(res, 200, {
      ok: true,
      entry,
      pending_registrations: state.pending_registrations,
    });
    return;
  }
  sendJson(res, 405, { error: "Method not allowed" });
}

const port = Number(process.env.PORT) || 8787;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  const p = decodeURIComponent(url.pathname);

  try {
    if (p === "/api/state.php") {
      await handleState(req, res);
      return;
    }
    if (p === "/api/audio.php") {
      await handleAudio(req, res);
      return;
    }
    if (p === "/api/upload.php" && req.method === "POST") {
      await handleUpload(req, res);
      return;
    }
    if (p === "/api/photobooth-list.php" && req.method === "GET") {
      handlePhotoboothList(req, res);
      return;
    }
    if (p === "/api/register.php") {
      await handleRegister(req, res);
      return;
    }
    if (p === "/" || p === "") {
      res.writeHead(302, { Location: "/admin/" });
      res.end();
      return;
    }
    serveStatic(req, res, p);
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: String(e.message || e) });
  }
});

server.listen(port, "127.0.0.1", () => {
  const base = `http://127.0.0.1:${port}`;
  console.log(`
Nanoportal dev server (Node) — mirrors /api/*.php for local preview without PHP.

  Admin:      ${base}/admin/
  Bigscreen:  ${base}/bigscreen/
  Smallscreen:${base}/smallscreen/
  Quiz:       ${base}/quiz/
  Display:    ${base}/display/
  Register:   ${base}/register/

  State API: ${base}/api/state.php
  Register API: ${base}/api/register.php
  Stop: Ctrl+C
`);
});
