import fs from "fs";
import path from "path";
import http from "http";
import os from "os";
import crypto from "crypto";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] != null) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
loadEnvFile(path.join(root, ".env"));

const API_TOKEN = String(process.env.NANOPORTAL_API_TOKEN ?? "").trim();

function envInt(key, defaultVal) {
  const raw = process.env[key];
  if (raw == null || raw === "") return defaultVal;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : defaultVal;
}

function maxPhotoboothFiles() {
  return envInt("MAX_PHOTOBOOTH_FILES", 100);
}
function maxVisitorFiles() {
  return envInt("MAX_VISITOR_FILES", 50);
}
function maxWindowFiles() {
  return envInt("MAX_WINDOW_FILES", 30);
}
function maxTtsFiles() {
  return envInt("MAX_TTS_FILES", 20);
}
function maxUploadFilesForKind(kind) {
  if (kind === "visitor") return maxVisitorFiles();
  if (kind === "window") return maxWindowFiles();
  return maxPhotoboothFiles();
}

function humanBytes(bytes) {
  if (bytes < 0) bytes = 0;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return (i > 0 ? v.toFixed(1) : String(Math.round(v))) + " " + units[i];
}

function pruneOldUploads(dir, prefix, maxKeep) {
  if (maxKeep < 1 || !fs.existsSync(dir)) return;
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(prefix + "_"))
    .map((name) => path.join(dir, name))
    .filter((full) => fs.statSync(full).isFile())
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  if (files.length <= maxKeep) return;
  for (const f of files.slice(0, files.length - maxKeep)) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
}

function pruneTtsFiles(dir, maxKeep) {
  if (maxKeep < 1 || !fs.existsSync(dir)) return;
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith("tts_") && name.toLowerCase().endsWith(".mp3"))
    .map((name) => path.join(dir, name))
    .filter((full) => fs.statSync(full).isFile())
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  if (files.length <= maxKeep) return;
  for (const f of files.slice(0, files.length - maxKeep)) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
}

function countDataFiles(dir) {
  const counts = { photobooth: 0, visitor: 0, window: 0, tts: 0 };
  if (!fs.existsSync(dir)) return counts;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (!fs.statSync(full).isFile()) continue;
    if (name.startsWith("photobooth_")) counts.photobooth += 1;
    else if (name.startsWith("visitor_")) counts.visitor += 1;
    else if (name.startsWith("window_")) counts.window += 1;
    else if (name.startsWith("tts_") && name.toLowerCase().endsWith(".mp3")) counts.tts += 1;
  }
  return counts;
}

function dirSizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isFile()) total += fs.statSync(full).size;
  }
  return total;
}

function storageSummary() {
  fs.mkdirSync(dataDir, { recursive: true });
  const dataBytes = dirSizeBytes(dataDir);
  let diskFree = 0;
  try {
    if (typeof fs.statfsSync === "function") {
      const st = fs.statfsSync(dataDir);
      diskFree = Number(st.bfree) * Number(st.bsize);
    }
  } catch {
    diskFree = 0;
  }
  return {
    data_dir_bytes: dataBytes,
    data_dir_human: humanBytes(dataBytes),
    file_counts: countDataFiles(dataDir),
    disk_free_bytes: diskFree,
    disk_free_human: humanBytes(diskFree),
  };
}

function mqttPublishJson(topic, payload, retain = true) {
  const host = String(process.env.MQTT_BROKER_HOST ?? "127.0.0.1");
  const port = String(process.env.MQTT_BROKER_PORT ?? "1883");
  const user = String(process.env.MQTT_BROKER_USER ?? "").trim();
  const pass = String(process.env.MQTT_BROKER_PASS ?? "");
  const args = ["-h", host, "-p", port, "-t", topic, "-m", JSON.stringify(payload)];
  if (retain) args.push("-r");
  if (user) {
    args.push("-u", user, "-P", pass);
  }
  try {
    spawnSync("mosquitto_pub", args, { stdio: "ignore" });
  } catch {
    /* optional — admin falls back to HTTP poll */
  }
}

const stateFile = path.join(root, "data", "state.json");
const stateLockFile = stateFile + ".lock";
const dataDir = path.join(root, "data");
const appLogFile = path.join(dataDir, "app.log");
const bootMarkerFile = path.join(dataDir, ".health_boot");
const audioDir = path.join(root, "shared", "assets", "audio");
const LOG_MAX_BYTES = 5 * 1024 * 1024;

if (!fs.existsSync(bootMarkerFile)) {
  fs.mkdirSync(dataDir, { recursive: true });
  try {
    fs.writeFileSync(bootMarkerFile, new Date().toISOString(), "utf8");
  } catch {
    /* ignore */
  }
}

function nanoportalLog(level, message, context = {}) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const entry = { ts: new Date().toISOString(), level, msg: message, context };
    fs.appendFileSync(appLogFile, JSON.stringify(entry) + "\n", "utf8");
    if (fs.existsSync(appLogFile) && fs.statSync(appLogFile).size > LOG_MAX_BYTES) {
      const rotated = appLogFile + "." + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
      fs.renameSync(appLogFile, rotated);
    }
  } catch {
    console.error("[nanoportal]", level, message);
  }
}

function readAppLogLines(limit = 50) {
  if (!fs.existsSync(appLogFile)) return [];
  const raw = fs.readFileSync(appLogFile, "utf8").trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function lastAppLogError() {
  const lines = readAppLogLines(200);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].level === "error") {
      return { msg: String(lines[i].msg ?? ""), at: String(lines[i].ts ?? "") };
    }
  }
  return null;
}

function uptimeSeconds() {
  try {
    if (fs.existsSync(bootMarkerFile)) {
      const t = Date.parse(fs.readFileSync(bootMarkerFile, "utf8"));
      if (!Number.isNaN(t)) return Math.max(0, Math.floor((Date.now() - t) / 1000));
    }
  } catch {
    /* ignore */
  }
  return 0;
}

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

const STATE_PATCH_SCHEMA = {
  status: "string",
  current_step: "integer",
  players: "array",
  pending_registrations: "array",
  players_confirmed: "boolean",
  quiz_state: "array",
  display: "array",
  audio: "array",
  hardware: "array",
  screens: "array",
  visitors: "array",
  group_contact: "array",
  updated_at: "string",
  _full_reset: "boolean",
  _restore_state: "boolean",
  _rev: "integer",
};

const STATE_STATUS_VALUES = new Set(["IDLE", "RUNNING", "PAUSED", "COMPLETED"]);

const MAX_STATE_BODY_BYTES = 512 * 1024;

function patchValueMatchesType(value, type) {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value) || isPlainObject(value);
    default:
      return false;
  }
}

function validatePatchTypes(patch) {
  const errors = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.prototype.hasOwnProperty.call(STATE_PATCH_SCHEMA, key)) {
      errors.push(`unknown key: ${key}`);
      continue;
    }
    const expected = STATE_PATCH_SCHEMA[key];
    if (!patchValueMatchesType(value, expected)) {
      errors.push(`invalid type for key ${key}: expected ${expected}`);
      continue;
    }
    if (key === "status" && !STATE_STATUS_VALUES.has(value)) {
      errors.push("invalid status value");
    }
  }
  return errors;
}

function validatePatchMaxDepth(value, maxDepth = 12, depth = 0) {
  if (depth > maxDepth) return "patch exceeds maximum nesting depth";
  if (!Array.isArray(value) && !isPlainObject(value)) return null;
  if (Array.isArray(value)) {
    for (const child of value) {
      if (Array.isArray(child) || isPlainObject(child)) {
        const err = validatePatchMaxDepth(child, maxDepth, depth + 1);
        if (err) return err;
      }
    }
    return null;
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child) || isPlainObject(child)) {
      const err = validatePatchMaxDepth(child, maxDepth, depth + 1);
      if (err) return err;
    }
  }
  return null;
}

function sanitizePersonName(raw, maxLen = 120) {
  let name = String(raw ?? "").replace(/<[^>]*>/g, "");
  name = name.trim();
  name = name.replace(/[^\p{L}\p{N}\s\-.'']/gu, "");
  if (name.length > maxLen) {
    name = [...name].slice(0, maxLen).join("");
  }
  return name;
}

function utf8Len(s) {
  return [...String(s)].length;
}

function sniffImageMime(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { mime: "image/png", ext: "png" };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  const head = buf.subarray(0, 6).toString("ascii");
  if (head === "GIF87a" || head === "GIF89a") {
    return { mime: "image/gif", ext: "gif" };
  }
  return null;
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
      last_triggered: { clip: null, url: null, at: null },
      last_placeholder: {
        type: null,
        names: [],
        status: "idle",
        generated_url: null,
        fallback_clip: "cheer_crowd.mp3",
      },
      queue: [],
    },
    pending_registrations: [],
    players_confirmed: false,
    hardware: defaultHardwareInline(),
    screens: defaultScreensInline(),
    visitors: [],
    group_contact: defaultGroupContactInline(),
    updated_at: null,
    _rev: 0,
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

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* ponytail: busy-wait ok for local dev file lock */
  }
}

function withStateLock(fn) {
  const maxWait = 5000;
  const start = Date.now();
  let fd = null;
  while (Date.now() - start < maxWait) {
    try {
      fd = fs.openSync(stateLockFile, "wx");
      break;
    } catch {
      sleepSync(25);
    }
  }
  if (fd === null) {
    throw new Error("state lock timeout");
  }
  try {
    return fn();
  } finally {
    try {
      fs.closeSync(fd);
      fs.unlinkSync(stateLockFile);
    } catch {
      /* ignore */
    }
  }
}

function readStateDisk() {
  try {
    const raw = fs.readFileSync(stateFile, "utf8");
    if (!raw.trim()) return defaultStateInline();
    const d = JSON.parse(raw);
    if (!isPlainObject(d)) {
      console.error("state.json corrupt, resetting to default");
      nanoportalLog("error", "state.json corrupt, resetting to default");
      return ensureMobilmoziDefaults(defaultStateInline());
    }
    return ensureMobilmoziDefaults(d);
  } catch (e) {
    console.error("state.json corrupt, resetting to default:", e.message || e);
    nanoportalLog("error", "state.json corrupt, resetting to default", {
      detail: String(e.message || e),
    });
    return ensureMobilmoziDefaults(defaultStateInline());
  }
}

function stripRevFromPatch(patch) {
  const clean = { ...patch };
  delete clean._rev;
  return clean;
}

function checkPatchRev(current, patch) {
  if (!Object.prototype.hasOwnProperty.call(patch, "_rev")) return null;
  const currentRev = Number(current._rev ?? 0);
  if (Number(patch._rev) !== currentRev) {
    return { conflict: true, current_rev: currentRev };
  }
  return null;
}

function bumpStateRev(state, current) {
  return { ...state, _rev: Number(current._rev ?? 0) + 1 };
}

function loadState() {
  return readStateDisk();
}

function snapshotRetentionDays() {
  return envInt("SNAPSHOT_RETENTION_DAYS", 30);
}

function snapshotsDir() {
  return path.join(dataDir, "snapshots");
}

const SNAPSHOT_FILENAME_RE =
  /^state_(IDLE|RUNNING|COMPLETED|PRERESET)_(\d{8})_(\d{6})\.json$/;

function parseSnapshotFilename(name) {
  const base = path.basename(name);
  const m = SNAPSHOT_FILENAME_RE.exec(base);
  if (!m) return null;
  const date = m[2];
  const time = m[3];
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}Z`;
  const unix = Date.parse(iso);
  if (Number.isNaN(unix)) return null;
  return { label: m[1], date, time, unix, filename: base };
}

function saveStateSnapshot(label, state) {
  const safeLabel = String(label).toUpperCase().replace(/[^A-Z0-9_]/g, "");
  if (!safeLabel) return null;
  const dir = snapshotsDir();
  fs.mkdirSync(dir, { recursive: true });
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const ts = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  const filename = `state_${safeLabel}_${ts}.json`;
  const full = path.join(dir, filename);
  try {
    fs.writeFileSync(full, JSON.stringify(state, null, 2), "utf8");
    return filename;
  } catch {
    return null;
  }
}

function pruneOldSnapshots(dir, days) {
  if (days < 1 || !fs.existsSync(dir)) return;
  const cutoff = Date.now() - days * 86400000;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const full = path.join(dir, name);
    try {
      if (fs.statSync(full).isFile() && fs.statSync(full).mtimeMs < cutoff) {
        fs.unlinkSync(full);
      }
    } catch {
      /* ignore */
    }
  }
}

function maybeSnapshotOnStatusChange(current, next) {
  const prev = String(current.status ?? "");
  const neu = String(next.status ?? "");
  const triggers = ["IDLE", "RUNNING", "COMPLETED"];
  if (prev === neu || !triggers.includes(neu)) return;
  saveStateSnapshot(neu, next);
  pruneOldSnapshots(snapshotsDir(), snapshotRetentionDays());
}

function listSnapshotFiles() {
  const dir = snapshotsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => parseSnapshotFilename(name))
    .sort((a, b) => {
      const pa = parseSnapshotFilename(a);
      const pb = parseSnapshotFilename(b);
      return (pb?.unix ?? 0) - (pa?.unix ?? 0);
    });
}

function snapshotFilePath(filename) {
  const parsed = parseSnapshotFilename(filename);
  if (!parsed) return null;
  const dir = snapshotsDir();
  const full = path.join(dir, parsed.filename);
  const realDir = fs.realpathSync(dir);
  const realFull = fs.realpathSync(full);
  if (!realFull.startsWith(realDir + path.sep)) return null;
  return realFull;
}

function extractPlayerNames(state) {
  const players = state.players;
  if (!Array.isArray(players)) return [];
  const names = [];
  for (const p of players) {
    if (isPlainObject(p)) {
      const name = String(p.name ?? "").trim();
      if (name) names.push(name);
    } else if (typeof p === "string" && p.trim()) {
      names.push(p.trim());
    }
  }
  return names;
}

function findRunningBefore(completedUnix) {
  const dir = snapshotsDir();
  if (!fs.existsSync(dir)) return null;
  let best = null;
  for (const name of fs.readdirSync(dir)) {
    const parsed = parseSnapshotFilename(name);
    if (!parsed || parsed.label !== "RUNNING" || parsed.unix > completedUnix) continue;
    if (best === null || parsed.unix > best) best = parsed.unix;
  }
  return best;
}

function listCompletedSessions(limit = 10) {
  const sessions = [];
  for (const filename of listSnapshotFiles()) {
    const parsed = parseSnapshotFilename(filename);
    if (!parsed || parsed.label !== "COMPLETED") continue;
    const full = snapshotFilePath(filename);
    if (!full || !fs.existsSync(full)) continue;
    let state;
    try {
      state = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch {
      continue;
    }
    if (!isPlainObject(state)) continue;
    const runningUnix = findRunningBefore(parsed.unix);
    let durationMinutes = null;
    if (runningUnix != null) {
      durationMinutes = Math.max(0, Math.round((parsed.unix - runningUnix) / 60000));
    }
    const iso = `${parsed.date.slice(0, 4)}-${parsed.date.slice(4, 6)}-${parsed.date.slice(6, 8)}T${parsed.time.slice(0, 2)}:${parsed.time.slice(2, 4)}:${parsed.time.slice(4, 6)}Z`;
    sessions.push({
      filename: parsed.filename,
      completed_at: iso,
      players: extractPlayerNames(state),
      steps_completed: Number(state.current_step ?? 0),
      duration_minutes: durationMinutes,
    });
    if (sessions.length >= limit) break;
  }
  return sessions;
}

function saveState(state) {
  try {
    state.updated_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const json = JSON.stringify(state, null, 2);
    const tmp = stateFile + ".tmp." + process.pid;
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(tmp, json, "utf8");
    fs.renameSync(tmp, stateFile);
    return true;
  } catch {
    return false;
  }
}

function modifyState(mutator) {
  return withStateLock(() => {
    const current = readStateDisk();
    const next = mutator(current);
    if (next && next.conflict) {
      return next;
    }
    if (!next) return null;
    const bumped = bumpStateRev(ensureMobilmoziDefaults(next), current);
    maybeSnapshotOnStatusChange(current, bumped);
    if (!saveState(bumped)) return null;
    return bumped;
  });
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

function checkWriteToken(req, res) {
  if (!API_TOKEN) return true;
  const header = String(req.headers["x-nanoportal-token"] ?? "");
  let ok = false;
  try {
    const a = Buffer.from(header);
    const b = Buffer.from(API_TOKEN);
    ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    ok = false;
  }
  if (!ok) {
    sendJson(res, 401, { error: "unauthorized" });
    return false;
  }
  return true;
}

function checkAdminHeader(req, res) {
  if (String(req.headers["x-nanoportal-admin"] ?? "") !== "1") {
    sendJson(res, 403, { error: "admin_required" });
    return false;
  }
  return true;
}

function readBody(req, maxBytes = Infinity) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let rejected = false;
    req.on("data", (c) => {
      if (rejected) return;
      total += c.length;
      if (total > maxBytes) {
        rejected = true;
        const err = new Error("body too large");
        err.code = "BODY_TOO_LARGE";
        reject(err);
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!rejected) resolve(Buffer.concat(chunks));
    });
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
  if (!checkWriteToken(req, res)) return;
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
  const sniffed = sniffImageMime(photo.data);
  if (!sniffed) {
    sendJson(res, 415, { error: "unsupported image type: unknown" });
    return;
  }
  const ext = sniffed.ext;
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
  const kindKey = Object.prototype.hasOwnProperty.call(prefixMap, kindRaw) ? kindRaw : "photobooth";
  pruneOldUploads(dataDir, prefix, maxUploadFilesForKind(kindKey));
  const publicPath = "/data/" + encodeURIComponent(safeName);
  const mtimeUnix = fs.statSync(dest).mtimeMs;
  sendJson(res, 200, {
    ok: true,
    path: publicPath,
    filename: safeName,
    mtime: new Date(mtimeUnix).toISOString().replace(/\.\d{3}Z$/, "Z"),
  });
}

function handleStorage(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  sendJson(res, 200, storageSummary());
}

function handleHealth(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const stateReadable =
    !fs.existsSync(stateFile) || (fs.existsSync(stateFile) && fs.statSync(stateFile).isFile());
  const state = loadState();
  let dataDirWritable = false;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const probe = path.join(dataDir, ".write_probe_" + process.pid);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    dataDirWritable = true;
  } catch {
    dataDirWritable = false;
  }
  let stateWritable = dataDirWritable;
  if (fs.existsSync(stateFile)) {
    try {
      fs.accessSync(stateFile, fs.constants.W_OK);
      stateWritable = true;
    } catch {
      stateWritable = false;
    }
  }
  const lastError = lastAppLogError();
  const ttsStatus = String(state?.audio?.last_placeholder?.status ?? "idle");
  const checks = {
    state_readable: stateReadable,
    state_writable: Boolean(stateWritable),
    state_rev: Number(state._rev ?? 0),
    data_dir_writable: dataDirWritable,
    elevenlabs_key_set: Boolean(String(process.env.ELEVENLABS_API_KEY ?? "").trim()),
    tts_status: ttsStatus,
    last_error: lastError?.msg ?? null,
    last_error_at: lastError?.at ?? null,
    uptime_seconds: uptimeSeconds(),
  };
  const ok = checks.state_readable && checks.data_dir_writable;
  sendJson(res, ok ? 200 : 503, { ok, checks });
}

function handleLogs(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  if (!checkAdminHeader(req, res)) return;
  sendJson(res, 200, { lines: readAppLogLines(50) });
}

function handleSessions(req, res, url) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  if (!checkAdminHeader(req, res)) return;
  const file = String(url.searchParams.get("file") ?? "").trim();
  if (file) {
    const full = snapshotFilePath(file);
    if (!full || !fs.existsSync(full)) {
      sendJson(res, 404, { error: "Snapshot not found" });
      return;
    }
    try {
      const state = JSON.parse(fs.readFileSync(full, "utf8"));
      if (!isPlainObject(state)) {
        sendJson(res, 500, { error: "Invalid snapshot JSON" });
        return;
      }
      sendJson(res, 200, state);
    } catch {
      sendJson(res, 500, { error: "Failed to read snapshot" });
    }
    return;
  }
  sendJson(res, 200, { sessions: listCompletedSessions(10) });
}

function handlePhotoboothList(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw != null ? Math.min(50, Math.max(1, Number(limitRaw) || 12)) : 12;
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
  const limited = entries.slice(0, limit).map(({ mtime_unix: _u, ...rest }) => rest);
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

function stateEtag(state) {
  const rev = Number(state._rev ?? 0);
  if (rev > 0) return `"${rev}"`;
  return `"${crypto.createHash("md5").update(JSON.stringify(state)).digest("hex")}"`;
}

async function handleState(req, res) {
  if (req.method === "GET") {
    const state = loadState();
    const etag = stateEtag(state);
    res.setHeader("ETag", etag);
    const updated = state.updated_at;
    if (updated) {
      const d = new Date(updated);
      if (!Number.isNaN(d.getTime())) {
        res.setHeader("Last-Modified", d.toUTCString());
      }
    }
    if (String(req.headers["if-none-match"] ?? "") === etag) {
      res.writeHead(304, { "Cache-Control": "no-store" });
      res.end();
      return;
    }
    sendJson(res, 200, state);
    return;
  }
  if (req.method === "POST") {
    if (!checkWriteToken(req, res)) return;
    let rawBuf;
    try {
      rawBuf = await readBody(req, MAX_STATE_BODY_BYTES + 1);
    } catch (e) {
      if (e && e.code === "BODY_TOO_LARGE") {
        sendJson(res, 413, { error: "request body too large" });
        return;
      }
      throw e;
    }
    if (rawBuf.length > MAX_STATE_BODY_BYTES) {
      sendJson(res, 413, { error: "request body too large" });
      return;
    }
    const raw = rawBuf.toString("utf8");
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
    const typeErrors = validatePatchTypes(patch);
    if (typeErrors.length) {
      sendJson(res, 400, { error: "validation_failed", details: typeErrors });
      return;
    }
    const depthError = validatePatchMaxDepth(patch);
    if (depthError) {
      sendJson(res, 400, { error: "validation_failed", details: [depthError] });
      return;
    }
    if (patch._full_reset) {
      if (!checkAdminHeader(req, res)) return;
      const fresh = modifyState((current) => {
        const conflict = checkPatchRev(current, patch);
        if (conflict) return conflict;
        saveStateSnapshot("PRERESET", current);
        return defaultStateInline();
      });
      if (fresh && fresh.conflict) {
        sendJson(res, 409, { error: "conflict", current_rev: fresh.current_rev });
        return;
      }
      if (!fresh) {
        sendJson(res, 500, { error: "Failed to persist state" });
        return;
      }
      sendJson(res, 200, fresh);
      return;
    }
    if (patch._restore_state) {
      if (!checkAdminHeader(req, res)) return;
      const restored = modifyState((current) => {
        const conflict = checkPatchRev(current, patch);
        if (conflict) return conflict;
        const clean = stripRevFromPatch(patch);
        delete clean._restore_state;
        delete clean._full_reset;
        return clean;
      });
      if (restored && restored.conflict) {
        sendJson(res, 409, { error: "conflict", current_rev: restored.current_rev });
        return;
      }
      if (!restored) {
        sendJson(res, 500, { error: "Failed to persist state" });
        return;
      }
      sendJson(res, 200, restored);
      return;
    }
    const merged = modifyState((current) => {
      const conflict = checkPatchRev(current, patch);
      if (conflict) return conflict;
      const clean = stripRevFromPatch(patch);
      return ensureMobilmoziDefaults(
        applyHardwareEventLog(
          applyQuizAnswerLock(current, clean, mergeState(current, clean)),
          clean,
        ),
      );
    });
    if (merged && merged.conflict) {
      sendJson(res, 409, { error: "conflict", current_rev: merged.current_rev });
      return;
    }
    if (!merged) {
      sendJson(res, 500, { error: "Failed to persist state" });
      return;
    }
    sendJson(res, 200, merged);
    return;
  }
  sendJson(res, 405, { error: "Method not allowed" });
}

function handleEvents(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const url = new URL(req.url || "/", "http://127.0.0.1");
  const lastEventId = String(req.headers["last-event-id"] ?? "").trim();
  let lastRev = lastEventId !== "" ? Number(lastEventId) : Number(url.searchParams.get("rev") ?? 0);
  if (Number.isNaN(lastRev)) lastRev = 0;

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let keepaliveTicks = 0;
  const tickMs = 200;

  const interval = setInterval(() => {
    if (req.socket.destroyed) {
      clearInterval(interval);
      return;
    }
    const state = loadState();
    const rev = Number(state._rev ?? 0);
    if (rev > lastRev) {
      lastRev = rev;
      keepaliveTicks = 0;
      res.write(`id: ${rev}\n`);
      res.write(`data: ${JSON.stringify(state)}\n\n`);
    } else {
      keepaliveTicks += 1;
      if (keepaliveTicks >= 25) {
        res.write(": keepalive\n\n");
        keepaliveTicks = 0;
      }
    }
  }, tickMs);

  req.on("close", () => clearInterval(interval));
}

const TTS_FALLBACK_CLIP = "cheer_crowd.mp3";
const ELEVENLABS_DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB";

function sanitizeTtsName(raw) {
  let name = String(raw ?? "").replace(/<[^>]*>/g, "");
  name = name.trim();
  name = name.replace(/[^\p{L}\p{N}\s\-.]/gu, "");
  if (name.length > 60) {
    name = [...name].slice(0, 60).join("");
  }
  return name;
}

function normalizeTtsNames(raw) {
  if (!Array.isArray(raw)) return [];
  const names = [];
  for (const n of raw) {
    const clean = sanitizeTtsName(n);
    if (clean) names.push(clean);
    if (names.length >= 20) break;
  }
  return names;
}

function patchAudioPlaceholder(state, placeholder) {
  if (!isPlainObject(state.audio)) {
    state.audio = defaultStateInline().audio;
  }
  const cur = isPlainObject(state.audio.last_placeholder) ? state.audio.last_placeholder : {};
  state.audio.last_placeholder = { ...cur, ...placeholder };
  return state;
}

function ttsOutputFilename() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  return `tts_${stamp}.mp3`;
}

async function handleTtsNames(names) {
  modifyState((current) =>
    patchAudioPlaceholder(current, {
      type: "elevenlabs_names",
      names,
      status: "pending",
      generated_url: null,
      fallback_clip: TTS_FALLBACK_CLIP,
    }),
  );

  const apiKey = String(process.env.ELEVENLABS_API_KEY ?? "").trim();
  if (!apiKey) {
    fs.mkdirSync(audioDir, { recursive: true });
    const fallbackPath = path.join(audioDir, TTS_FALLBACK_CLIP);
    if (!fs.existsSync(fallbackPath)) fs.writeFileSync(fallbackPath, "");
    modifyState((current) =>
      patchAudioPlaceholder(current, { status: "fallback", fallback_clip: TTS_FALLBACK_CLIP }),
    );
    return { ok: true, fallback: true, fallback_clip: TTS_FALLBACK_CLIP };
  }

  const voiceId = String(process.env.ELEVENLABS_VOICE_ID ?? ELEVENLABS_DEFAULT_VOICE_ID).trim();
  const text = names.join(", ") + "!";
  const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
  });
  if (!res.ok) {
    modifyState((current) => patchAudioPlaceholder(current, { status: "error" }));
    return { error: `ElevenLabs HTTP ${res.status}`, status: 502 };
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(dataDir, { recursive: true });
  const filename = ttsOutputFilename();
  fs.writeFileSync(path.join(dataDir, filename), bytes);
  pruneTtsFiles(dataDir, maxTtsFiles());
  const generatedUrl = "/data/" + encodeURIComponent(filename);
  modifyState((current) =>
    patchAudioPlaceholder(current, { status: "ready", generated_url: generatedUrl }),
  );
  return { ok: true, url: generatedUrl };
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
    if (!checkWriteToken(req, res)) return;
    const raw = (await readBody(req)).toString("utf8");
    let payload;
    try {
      payload = JSON.parse(raw || "{}");
    } catch {
      sendJson(res, 400, { error: "Invalid JSON payload" });
      return;
    }
    if (!payload || typeof payload !== "object") {
      sendJson(res, 400, { error: "Invalid JSON payload" });
      return;
    }

    if (payload.action === "tts_names") {
      const names = normalizeTtsNames(payload.names);
      if (names.length === 0) {
        sendJson(res, 400, { error: "At least one name required" });
        return;
      }
      try {
        const result = await handleTtsNames(names);
        if (result.error) {
          sendJson(res, result.status || 502, { error: result.error });
          return;
        }
        sendJson(res, 200, result);
      } catch (e) {
        modifyState((current) => patchAudioPlaceholder(current, { status: "error" }));
        sendJson(res, 502, { error: String(e.message || e) });
      }
      return;
    }

    if (typeof payload.clip !== "string") {
      sendJson(res, 400, {
        error: 'Expected JSON: {"clip":"filename.mp3"} or {"action":"tts_names","names":[]}',
      });
      return;
    }
    const clip = path.basename(payload.clip);
    const full = path.join(audioDir, clip);
    if (!fs.existsSync(full)) {
      sendJson(res, 404, { error: "Unknown clip" });
      return;
    }
    const trigger = {
      clip,
      url: "/shared/assets/audio/" + encodeURIComponent(clip),
      at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    };
    const state = modifyState((current) => {
      if (!isPlainObject(current.audio)) current.audio = {};
      current.audio.last_triggered = trigger;
      if (!Array.isArray(current.audio.queue)) current.audio.queue = [];
      current.audio.queue.push(trigger);
      return current;
    });
    if (!state) {
      sendJson(res, 500, { error: "Persist failed" });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      playUrl: trigger.url,
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
    const name = sanitizePersonName(payload.name);
    if (utf8Len(name) < 1 || utf8Len(name) > 120) {
      sendJson(res, 400, { error: "name must be 1–120 chars" });
      return;
    }
    let entry = null;
    const state = modifyState((current) => {
      if (!Array.isArray(current.pending_registrations)) current.pending_registrations = [];
      let maxId = 0;
      for (const row of current.pending_registrations) {
        if (row && row.id != null) {
          const n = Number(row.id);
          if (!Number.isNaN(n)) maxId = Math.max(maxId, n);
        }
      }
      entry = {
        id: maxId + 1,
        name,
        at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      };
      current.pending_registrations.push(entry);
      return current;
    });
    if (!state || !entry) {
      sendJson(res, 500, { error: "Persist failed" });
      return;
    }
    mqttPublishJson("session/registrations", {
      pending_registrations: state.pending_registrations,
    });
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
const host = process.env.HOST || "127.0.0.1";

function firstLanIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  const p = decodeURIComponent(url.pathname);

  try {
    if (p === "/api/state.php") {
      await handleState(req, res);
      return;
    }
    if (p === "/api/events.php") {
      handleEvents(req, res);
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
    if (p === "/api/storage.php" && req.method === "GET") {
      handleStorage(req, res);
      return;
    }
    if (p === "/api/health.php" && req.method === "GET") {
      handleHealth(req, res);
      return;
    }
    if (p === "/api/logs.php" && req.method === "GET") {
      handleLogs(req, res);
      return;
    }
    if (p === "/api/sessions.php" && req.method === "GET") {
      handleSessions(req, res, url);
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

server.listen(port, host, () => {
  const localBase = `http://127.0.0.1:${port}`;
  const lanIp = firstLanIPv4();
  const lanLine =
    host === "0.0.0.0" && lanIp
      ? `\n  LAN (tablet): http://${lanIp}:${port}/admin/\n  (Élő kamera HTTP-n nem működik — használd a Fájl / galéria gombot, vagy HTTPS.)`
      : host === "0.0.0.0"
        ? "\n  LAN: figyel 0.0.0.0-on (nézd meg a gép IP-címét a tableten)"
        : "";
  console.log(`
Nanoportal dev server (Node) — mirrors /api/*.php for local preview without PHP.

  Admin:      ${localBase}/admin/
  Bigscreen:  ${localBase}/bigscreen/
  Smallscreen:${localBase}/smallscreen/
  Quiz:       ${localBase}/quiz/
  Display:    ${localBase}/display/
  Register:   ${localBase}/register/

  State API: ${localBase}/api/state.php
  SSE:       ${localBase}/api/events.php
  Register API: ${localBase}/api/register.php${lanLine}

  HOST=${host} PORT=${port} (HOST=0.0.0.0 for LAN tablet access)
  Stop: Ctrl+C
`);
});
