import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

let failed = 0;
function ok(msg) {
  console.log(`[OK] ${msg}`);
}
function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  failed = 1;
}

function isObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

const statePath = path.join(root, "data", "state.json");
let raw;
try {
  raw = fs.readFileSync(statePath, "utf8");
} catch (e) {
  fail(`state.json olvashatatlan: ${statePath}`);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(raw);
} catch {
  fail("state.json nem érvényes JSON");
  process.exit(1);
}

const top = ["status", "current_step", "players", "pending_registrations", "players_confirmed", "quiz_state", "display", "audio"];
for (const k of top) {
  if (!(k in data)) fail(`hiányzó gyökérkulcs: ${k}`);
  else ok(`gyökér: ${k}`);
}

const st = ["IDLE", "RUNNING", "PAUSED", "COMPLETED"];
if (!st.includes(data.status)) fail(`ismeretlen status: ${data.status}`);
else ok(`status érték: ${data.status}`);

if (typeof data.current_step !== "number" || data.current_step < 1 || data.current_step > 4) {
  fail(`current_step 1–4 között legyen, kapott: ${data.current_step}`);
} else ok("current_step tartomány");

if (!Array.isArray(data.players)) fail("players tömb legyen");
else ok("players tömb");

if (!Array.isArray(data.pending_registrations)) fail("pending_registrations tömb legyen");
else ok("pending_registrations tömb");

if (typeof data.players_confirmed !== "boolean") fail("players_confirmed boolean legyen");
else ok("players_confirmed boolean");

if (!isObject(data.quiz_state)) fail("quiz_state objektum legyen");
else {
  const qk = [
    "hero_title",
    "hero_subtitle",
    "task_label",
    "question_text",
    "options",
    "correct_option_id",
    "selected_answer",
    "validation",
    "feedback_visible",
    "sidebar_items",
  ];
  for (const k of qk) {
    if (!(k in data.quiz_state)) fail(`quiz_state hiány: ${k}`);
    else ok(`quiz_state.${k}`);
  }
  if (!Array.isArray(data.quiz_state.options) || data.quiz_state.options.length < 1) {
    fail("quiz_state.options nem üres tömb legyen");
  } else ok("quiz_state.options elemszám");
}

if (!isObject(data.display)) fail("display objektum legyen");
else {
  for (const k of ["background_audio", "background_video", "camera_feed_url"]) {
    if (!(k in data.display)) fail(`display.${k} hiányzik`);
    else ok(`display.${k}`);
  }
}

if (!isObject(data.audio)) fail("audio objektum legyen");
else ok("audio objektum");

if (!isObject(data.hardware)) {
  console.log("[WARN] state.json: hardware kulcs hiányzik (GET után default töltődik)");
} else {
  ok("hardware objektum (state.json)");
  if (!Array.isArray(data.hardware.event_log)) {
    console.log("[WARN] hardware.event_log nem tömb — első POST után rendeződik");
  } else ok("hardware.event_log tömb");
}

if (!isObject(data.screens)) {
  console.log("[WARN] state.json: screens kulcs hiányzik (GET/POST után default töltődik)");
} else {
  ok("screens objektum (state.json)");
  const big = data.screens.big;
  const small = data.screens.small;
  if (!isObject(big) || !isObject(small)) fail("screens.big és screens.small objektum legyen");
  else ok("screens.big + screens.small");
}

if (!Array.isArray(data.visitors)) {
  console.log("[WARN] state.json: visitors tömb hiányzik (GET után default töltődik)");
} else ok("visitors tömb (state.json)");

const apiFiles = ["state.php", "audio.php", "upload.php", "register.php", "photobooth-list.php"].map(
  (f) => path.join(root, "api", f),
);
for (const f of apiFiles) {
  if (!fs.existsSync(f)) fail(`hiányzó fájl: ${f}`);
  else ok(`létezik: ${path.relative(root, f)}`);
}

const phpFiles = ["state.php", "audio.php", "upload.php", "register.php"];
let phpMissing = false;
for (const f of phpFiles) {
  const php = spawnSync("php", ["-l", path.join(root, "api", f)], { encoding: "utf8" });
  if (php.status !== 0) {
    if (php.error && php.error.code === "ENOENT") {
      phpMissing = true;
      break;
    }
    fail(`php -l api/${f}: ${php.stderr || php.stdout}`);
  } else {
    ok(`php -l api/${f}`);
  }
}
if (phpMissing) {
  ok("php CLI nincs a PATH-on — PHP szintaxis ellenőrzés kihagyva");
}

const jsFiles = [
  "shared/js/state-sync.js",
  "shared/js/camera-capture.js",
  "shared/js/media-layer.js",
  "shared/js/layer-switch.js",
  "shared/js/quiz-panel.js",
  "quiz/quiz.js",
  "admin/admin.js",
  "display/display.js",
  "bigscreen/bigscreen.js",
  "bigscreen/celebration.js",
  "smallscreen/smallscreen.js",
  "register/register.js",
];
for (const rel of jsFiles) {
  const p = path.join(root, rel);
  const r = spawnSync("node", ["--check", p], { encoding: "utf8" });
  if (r.status !== 0) {
    fail(`node --check ${rel}: ${r.stderr || r.stdout}`);
  } else {
    ok(`node --check ${rel}`);
  }
}

const quizPanelPath = path.join(root, "shared", "js", "quiz-panel.js");
const quizPanelJs = fs.readFileSync(quizPanelPath, "utf8");
if (!quizPanelJs.includes('btn.disabled = !touchEnabled || status !== "RUNNING" || feedbackVisible')) {
  fail("quiz-panel.js: válaszgombok tiltása feedbackVisible után hiányzik");
} else ok("quiz-panel.js: feedbackVisible + disabled");

if (!quizPanelJs.includes("Boolean(q.feedback_visible)")) {
  fail("quiz-panel.js: onSelectOption feedback_visible guard hiányzik");
} else ok("quiz-panel.js: onSelectOption guard");

if (!quizPanelJs.includes("export function initQuizPanel")) {
  fail("quiz-panel.js: initQuizPanel export hiányzik");
} else ok("quiz-panel.js: initQuizPanel");

const statePhp = fs.readFileSync(path.join(root, "api", "state.php"), "utf8");
if (!statePhp.includes("apply_quiz_answer_lock")) {
  fail("api/state.php: apply_quiz_answer_lock hiányzik");
} else ok("api/state.php: válasz-zárolás merge után");

if (!statePhp.includes("default_hardware") || !statePhp.includes("apply_hardware_event_log")) {
  fail("api/state.php: hardware napló logika hiányzik");
} else ok("api/state.php: hardware default + event_log append");

if (!statePhp.includes("default_screens") || !statePhp.includes("ensure_mobilmozi_defaults")) {
  fail("api/state.php: Mobilmozi v2 screens séma hiányzik");
} else ok("api/state.php: screens + visitors default");

const devServer = fs.readFileSync(path.join(root, "scripts", "dev-server.mjs"), "utf8");
if (!devServer.includes("applyQuizAnswerLock")) {
  fail("scripts/dev-server.mjs: applyQuizAnswerLock hiányzik");
} else ok("dev-server.mjs: válasz-zárolás tükör");

if (!devServer.includes("applyHardwareEventLog")) {
  fail("scripts/dev-server.mjs: applyHardwareEventLog hiányzik");
} else ok("dev-server.mjs: hardware event_log tükör");

if (!devServer.includes("defaultScreensInline") || !devServer.includes("ensureMobilmoziDefaults")) {
  fail("scripts/dev-server.mjs: Mobilmozi v2 screens séma hiányzik");
} else ok("dev-server.mjs: screens tükör");

if (!fs.existsSync(path.join(root, "docs", "roadmap-blaci.md"))) {
  fail("hiányzó fájl: docs/roadmap-blaci.md");
} else ok("létezik: docs/roadmap-blaci.md");

const extraPaths = [
  "shared/css/components.css",
  "shared/js/camera-capture.js",
  "shared/celebration-templates.json",
  "shared/assets/celebration/crowd-europe.png",
  "shared/assets/celebration/crowd-nyc.png",
  "shared/quiz-panel/panel.html",
  "bigscreen/index.html",
  "smallscreen/index.html",
  "hardware/node-red/mqtt-to-state.flow.json",
  "hardware/esp32/state_patch_http.ino",
  "docs/design-tokens.md",
];
for (const rel of extraPaths) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) fail(`hiányzó fájl: ${rel}`);
  else ok(`létezik: ${rel}`);
}

const adminJs = fs.readFileSync(path.join(root, "admin", "admin.js"), "utf8");
if (!adminJs.includes("photobooth-list.php")) {
  fail("admin.js: photobooth lista API hívás hiányzik");
} else ok("admin.js: photobooth lista");

if (!adminJs.includes("tab-hardware") || !adminJs.includes("hardware-event-log")) {
  fail("admin.js: Hardver operátori fül hiányzik");
} else ok("admin.js: Hardver fül");

if (!adminJs.includes("tab-visitors") || !adminJs.includes("setBigLayer")) {
  fail("admin.js: Mobilmozi v2 látogatók / képernyő vezérlés hiányzik");
} else ok("admin.js: Mobilmozi v2 fülek");

if (!adminJs.includes("camera-capture.js") || !adminJs.includes("requestUserCamera")) {
  fail("admin.js: közös camera-capture modul import hiányzik");
} else ok("admin.js: camera-capture import");

const cameraJs = fs.readFileSync(path.join(root, "shared", "js", "camera-capture.js"), "utf8");
if (!cameraJs.includes("OverconstrainedError") || !cameraJs.includes("CAMERA_CONSTRAINT_ATTEMPTS")) {
  fail("camera-capture.js: constraint fallback hiányzik");
} else ok("camera-capture.js: progressive getUserMedia");

if (!cameraJs.includes("enumerateDevices") || !cameraJs.includes("waitForVideoPlaying")) {
  fail("camera-capture.js: tablet / Apache HTTPS kamera segédek hiányoznak");
} else ok("camera-capture.js: device enumeration + playing wait");

const htaccess = path.join(root, ".htaccess");
if (!fs.existsSync(htaccess) || !fs.readFileSync(htaccess, "utf8").includes("Permissions-Policy")) {
  fail(".htaccess: Permissions-Policy camera=(self) hiányzik");
} else ok(".htaccess: Apache kamera engedély");

if (!devServer.includes('process.env.HOST') || !devServer.includes("firstLanIPv4")) {
  fail("scripts/dev-server.mjs: HOST / LAN URL támogatás hiányzik");
} else ok("dev-server.mjs: HOST LAN binding");

const flowJson = fs.readFileSync(path.join(root, "hardware", "node-red", "mqtt-to-state.flow.json"), "utf8");
if (!flowJson.includes("mobilmozi/#") || !flowJson.includes("raw.screens")) {
  fail("mqtt-to-state.flow.json: mobilmozi topic vagy screens patch hiányzik");
} else ok("Node-RED flow: mobilmozi + screens");

if (failed) {
  process.exit(1);
}
console.log("\nÖnellenőrzés: minden kritérium teljesült.");
process.exit(0);
