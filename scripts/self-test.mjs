import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

// Integration: BASE_URL, MQTT_BROKER, INTEGRATION=1 (strict CI)
//   node scripts/dev-server.mjs   # BASE_URL default 8787
//   mosquitto WebSocket :9001     # MQTT_BROKER default

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

function kioskStyleBlock(html) {
  const m = /<style>([\s\S]*?)<\/style>/i.exec(html);
  return m ? m[1] : "";
}

function checkKioskDesignTokens(label, html) {
  if (!html.includes("theme.css") || !html.includes("components.css")) {
    fail(`${label}: theme.css vagy components.css import hiányzik`);
    return;
  }
  ok(`${label}: theme + components import`);

  const style = kioskStyleBlock(html);
  if (/#[0-9a-fA-F]{3,8}\b/.test(style)) {
    fail(`${label}: hardcoded hex szín a style blokkban`);
  } else {
    ok(`${label}: nincs hex szín`);
  }

  if (/font-size:\s*\d+px/.test(style)) {
    fail(`${label}: hardcoded px font-size a style blokkban`);
  } else {
    ok(`${label}: nincs px font-size`);
  }

  if (/rgba\s*\(/.test(style)) {
    fail(`${label}: hardcoded rgba() a style blokkban`);
  } else {
    ok(`${label}: nincs rgba()`);
  }

  if (!html.includes("#mqtt-status.connected") || !html.includes('classList.add("connected")')) {
    fail(`${label}: mqtt-status.connected token stílus hiányzik`);
  } else {
    ok(`${label}: mqtt-status.connected`);
  }
}

const integrationBaseUrl = String(process.env.BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const mqttBrokerUrl = process.env.MQTT_BROKER || "ws://127.0.0.1:9001";
const integrationStrict = ["1", "true", "yes"].includes(
  String(process.env.INTEGRATION || "").toLowerCase(),
);

function printIntegrationLine(label, result) {
  const status = result.pass ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`${label.padEnd(18)}${status}  ${result.detail}`);
  if (!result.pass) failed = 1;
}

function isUnreachableDetail(detail) {
  return /ECONNREFUSED|fetch failed|Timeout|ENOTFOUND|ECONNRESET|Kapcsolódás sikertelen/i.test(
    String(detail),
  );
}

function handleIntegrationResult(label, result) {
  if (!result.pass && isUnreachableDetail(result.detail) && !integrationStrict) {
    console.log(`[WARN] ${label} skip (${result.detail})`);
    return;
  }
  printIntegrationLine(label, result);
}

function testMqttBrokerReachable(brokerUrl = "ws://127.0.0.1:9001") {
  return new Promise((resolve) => {
    const ws = new WebSocket(brokerUrl);
    const timeout = setTimeout(() => {
      ws.close();
      resolve({ pass: false, detail: `Timeout (3s): ${brokerUrl}` });
    }, 3000);
    ws.onopen = () => {
      clearTimeout(timeout);
      ws.close();
      resolve({ pass: true, detail: brokerUrl });
    };
    ws.onerror = () => {
      clearTimeout(timeout);
      resolve({ pass: false, detail: `Kapcsolódás sikertelen: ${brokerUrl}` });
    };
  });
}

async function stateGet(baseUrl) {
  const res = await fetch(`${baseUrl}/api/state.php`);
  if (!res.ok) throw new Error(`GET state HTTP ${res.status}`);
  return res.json();
}

async function statePost(baseUrl, body) {
  const res = await fetch(`${baseUrl}/api/state.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST state HTTP ${res.status}`);
  return res.json();
}

async function testScreensPatch(baseUrl) {
  await statePost(baseUrl, { screens: { big: { layer: "photo" } } });
  const state = await stateGet(baseUrl);
  const actual = state?.screens?.big?.layer;
  return { pass: actual === "photo", detail: `screens.big.layer = "${actual}"` };
}

async function testVisitorsPatch(baseUrl) {
  const testVisitor = [{ id: 999, nickname: "SELF_TEST", photo_path: "/data/test.jpg" }];
  await statePost(baseUrl, { visitors: testVisitor });
  const state = await stateGet(baseUrl);
  const actual = state?.visitors?.[0]?.nickname;
  return { pass: actual === "SELF_TEST", detail: `visitors[0].nickname = "${actual}"` };
}

async function testGroupContactPatch(baseUrl) {
  await statePost(baseUrl, {
    group_contact: { email: "self-test@test.com", phone: "+36000000000" },
  });
  const state = await stateGet(baseUrl);
  const actual = state?.group_contact?.email;
  return { pass: actual === "self-test@test.com", detail: `group_contact.email = "${actual}"` };
}

async function testFullReset(baseUrl) {
  await statePost(baseUrl, { _full_reset: true });
  const state = await stateGet(baseUrl);
  return { pass: state?.status === "IDLE", detail: `status = "${state?.status}"` };
}

async function runIntegrationTest(label, fn) {
  try {
    handleIntegrationResult(label, await fn());
  } catch (e) {
    handleIntegrationResult(label, { pass: false, detail: String(e.message || e) });
  }
}

async function runIntegrationSuite() {
  console.log("\n--- Integration tests ---");
  await runIntegrationTest("MQTT broker:", () => testMqttBrokerReachable(mqttBrokerUrl));
  await runIntegrationTest("screens patch:", () => testScreensPatch(integrationBaseUrl));
  await runIntegrationTest("visitors patch:", () => testVisitorsPatch(integrationBaseUrl));
  await runIntegrationTest("group_contact:", () => testGroupContactPatch(integrationBaseUrl));
  await runIntegrationTest("full reset:", () => testFullReset(integrationBaseUrl));
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
  "shared/js/mqtt-client.js",
  "shared/js/media-layer.js",
  "shared/js/layer-switch.js",
  "shared/js/quiz-panel.js",
  "quiz/quiz.js",
  "admin/admin.js",
  "display/display.js",
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
const stateLibPhp = fs.readFileSync(path.join(root, "api", "state_lib.php"), "utf8");
if (!stateLibPhp.includes("apply_quiz_answer_lock")) {
  fail("api/state_lib.php: apply_quiz_answer_lock hiányzik");
} else ok("api/state.php: válasz-zárolás merge után");

if (!stateLibPhp.includes("default_hardware") || !stateLibPhp.includes("apply_hardware_event_log")) {
  fail("api/state_lib.php: hardware napló logika hiányzik");
} else ok("api/state.php: hardware default + event_log append");

if (!stateLibPhp.includes("default_screens") || !stateLibPhp.includes("ensure_mobilmozi_defaults")) {
  fail("api/state_lib.php: Mobilmozi v2 screens séma hiányzik");
} else ok("api/state.php: screens + visitors default");

if (!statePhp.includes("state_lib.php")) {
  fail("api/state.php: state_lib.php require hiányzik");
}

const stateLib = stateLibPhp;
if (!stateLib.includes("modify_state_locked") || !stateLib.includes("flock")) {
  fail("api/state_lib.php: flock read-modify-write hiányzik");
} else ok("api/state_lib.php: flock read-modify-write");

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

if (!devServer.includes("withStateLock") || !devServer.includes("modifyState")) {
  fail("scripts/dev-server.mjs: state lock hiányzik");
} else ok("dev-server.mjs: state lock tükör");

if (!fs.existsSync(path.join(root, "docs", "roadmap-blaci.md"))) {
  fail("hiányzó fájl: docs/roadmap-blaci.md");
} else ok("létezik: docs/roadmap-blaci.md");

if (!fs.existsSync(path.join(root, "docs", "mqtt-setup.md"))) {
  fail("hiányzó fájl: docs/mqtt-setup.md");
} else ok("létezik: docs/mqtt-setup.md");

const extraPaths = [
  "shared/css/components.css",
  "shared/js/camera-capture.js",
  "shared/js/mqtt-client.js",
  "shared/js/admin-upload.js",
  "shared/js/admin-registrations.js",
  "shared/js/admin-photobooth.js",
  "shared/js/admin-hardware.js",
  "shared/js/admin-status.js",
  "shared/js/admin-audio.js",
  "shared/js/media-url.js",
  "api/state_lib.php",
  "shared/celebration-templates.json",
  "shared/assets/celebration/crowd-europe.png",
  "shared/assets/celebration/crowd-nyc.png",
  "shared/quiz-panel/panel.html",
  "admin/index.html",
  "bigscreen/index.html",
  "smallscreen/index.html",
  "hardware/mosquitto/mosquitto.conf.example",
  "hardware/node-red/mqtt-to-state.flow.json",
  "hardware/esp32/state_patch_http.ino",
  "docs/design-tokens.md",
];
for (const rel of extraPaths) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) fail(`hiányzó fájl: ${rel}`);
  else ok(`létezik: ${rel}`);
}

const themeCss = fs.readFileSync(path.join(root, "shared", "css", "theme.css"), "utf8");
if (!themeCss.includes("--font-ui")) {
  fail("theme.css: --font-ui token hiányzik");
} else ok("theme.css: --font-ui token");

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

const bigscreenHtml = fs.readFileSync(path.join(root, "bigscreen", "index.html"), "utf8");
if (!bigscreenHtml.includes("mqtt.min.js") || !bigscreenHtml.includes("bigscreen/layer")) {
  fail("bigscreen/index.html: MQTT kiosk hiányzik");
} else ok("bigscreen/index.html: MQTT kiosk");

if (!bigscreenHtml.includes("/shared/js/mqtt-client.js") || !bigscreenHtml.includes("NanoportalMqtt")) {
  fail("bigscreen/index.html: közös mqtt-client hiányzik");
} else ok("bigscreen/index.html: mqtt-client.js");

if (!bigscreenHtml.includes("bigscreen/photo") || !bigscreenHtml.includes("bigscreen/players")) {
  fail("bigscreen/index.html: MQTT photo/players topic hiányzik");
} else ok("bigscreen/index.html: MQTT topics");

if (!bigscreenHtml.includes("display: none") || !bigscreenHtml.includes("position: fixed")) {
  fail("bigscreen/index.html: réteg display/fixed váltás hiányzik");
} else ok("bigscreen/index.html: layer display/fixed");

checkKioskDesignTokens("bigscreen/index.html", bigscreenHtml);

for (const removed of ["bigscreen/bigscreen.js", "bigscreen/celebration.js", "bigscreen/bigscreen.css"]) {
  if (fs.existsSync(path.join(root, removed))) {
    fail(`eltávolítandó fájl még létezik: ${removed}`);
  } else ok(`törölve: ${removed}`);
}

const smallscreenHtml = fs.readFileSync(path.join(root, "smallscreen", "index.html"), "utf8");
if (!smallscreenHtml.includes("mqtt.min.js") || !smallscreenHtml.includes("smallscreen/layer")) {
  fail("smallscreen/index.html: MQTT kiosk hiányzik");
} else ok("smallscreen/index.html: MQTT kiosk");

if (!smallscreenHtml.includes("/shared/js/mqtt-client.js") || !smallscreenHtml.includes("NanoportalMqtt")) {
  fail("smallscreen/index.html: közös mqtt-client hiányzik");
} else ok("smallscreen/index.html: mqtt-client.js");

if (
  !smallscreenHtml.includes("smallscreen/quiz") ||
  !smallscreenHtml.includes("smallscreen/quiz/result")
) {
  fail("smallscreen/index.html: MQTT quiz / result topic hiányzik");
} else ok("smallscreen/index.html: MQTT quiz topics");

if (!smallscreenHtml.includes("display: none") || !smallscreenHtml.includes("position: fixed")) {
  fail("smallscreen/index.html: réteg display/fixed váltás hiányzik");
} else ok("smallscreen/index.html: layer display/fixed");

checkKioskDesignTokens("smallscreen/index.html", smallscreenHtml);

if (!smallscreenHtml.includes('id="mqtt-status"')) {
  fail("smallscreen/index.html: mqtt-status elem hiányzik");
} else ok("smallscreen/index.html: mqtt-status elem");

if (!smallscreenHtml.includes('id="quiz-next"') || !smallscreenHtml.includes("Következő")) {
  fail("smallscreen/index.html: kvíz Következő gomb hiányzik");
} else ok("smallscreen/index.html: quiz next button");

if (!smallscreenHtml.includes('id="quiz-retry"') || !smallscreenHtml.includes("Újra")) {
  fail("smallscreen/index.html: kvíz Újra gomb hiányzik");
} else ok("smallscreen/index.html: quiz retry button");

if (!smallscreenHtml.includes(". KÉRDÉS")) {
  fail("smallscreen/index.html: kvíz progress formátum hiányzik");
} else ok("smallscreen/index.html: quiz progress label");

if (!smallscreenHtml.includes("min-height: 60px")) {
  fail("smallscreen/index.html: kvíz válasz gomb min-height 60px hiányzik");
} else ok("smallscreen/index.html: quiz touch targets");

for (const removed of ["smallscreen/smallscreen.js", "smallscreen/smallscreen.css"]) {
  if (fs.existsSync(path.join(root, removed))) {
    fail(`eltávolítandó fájl még létezik: ${removed}`);
  } else ok(`törölve: ${removed}`);
}

const adminHtml = fs.readFileSync(path.join(root, "admin", "index.html"), "utf8");
if (!adminHtml.includes("mqtt.min.js") || !adminHtml.includes("session/control")) {
  fail("admin/index.html: MQTT operátor panel hiányzik");
} else ok("admin/index.html: MQTT operátor panel");

if (
  !adminHtml.includes("bigscreen/layer") ||
  !adminHtml.includes("smallscreen/layer") ||
  !adminHtml.includes("smallscreen/quiz/result")
) {
  fail("admin/index.html: MQTT topicok hiányoznak");
} else ok("admin/index.html: MQTT topics");

if (!adminHtml.includes("grid-template-columns: 1fr 1.5fr 1.5fr")) {
  fail("admin/index.html: háromoszlopos grid hiányzik");
} else ok("admin/index.html: operator grid layout");

if (!adminHtml.includes("quiz-result-bar") || !adminHtml.includes("Kvíz eredmény:")) {
  fail("admin/index.html: kvíz eredmény sáv hiányzik");
} else ok("admin/index.html: quiz result bar");

if (!adminHtml.includes("BROKER?") || !adminHtml.includes("LS_BROKER_KEY")) {
  fail("admin/index.html: MQTT broker felülírás hiányzik");
} else ok("admin/index.html: broker override");

if (!adminHtml.includes("Gratulálás") || !adminHtml.includes('data-layer="celebration"')) {
  fail("admin/index.html: bigscreen gratulálás gomb hiányzik");
} else ok("admin/index.html: celebration layer button");

if (!adminHtml.includes("min-height: 56px")) {
  fail("admin/index.html: érintés cél min-height 56px hiányzik");
} else ok("admin/index.html: touch targets");

if (
  adminHtml.includes('src="/admin/admin.js"') ||
  adminHtml.includes("src='admin/admin.js'") ||
  adminHtml.includes("admin.css")
) {
  fail("admin/index.html: nem lehet legacy admin.js/css betöltés");
} else ok("admin/index.html: self-contained");

if (!adminHtml.includes("/shared/js/mqtt-client.js") || !adminHtml.includes("ADMIN_TOPICS")) {
  fail("admin/index.html: mqtt-client vagy topic feliratkozás hiányzik");
} else ok("admin/index.html: mqtt-client + topics");

if (!adminHtml.includes("session/group_contact")) {
  fail("admin/index.html: session/group_contact hiányzik");
} else ok("admin/index.html: group_contact publish");

if (!adminHtml.includes("bigscreen/players")) {
  fail("admin/index.html: bigscreen/players hiányzik");
} else ok("admin/index.html: bigscreen players publish");

if (
  !adminHtml.includes("visitor-panel") &&
  !adminHtml.includes("Látogatók és kapcsolat")
) {
  fail("admin/index.html: látogatói panel hiányzik");
} else ok("admin/index.html: visitor panel");

if (
  !adminHtml.includes("/api/upload.php") &&
  !adminHtml.includes("admin-upload.js")
) {
  fail("admin/index.html: visitor upload integráció hiányzik");
} else ok("admin/index.html: visitor upload");

if (!adminHtml.includes("camera-section") || !adminHtml.includes("startCamera")) {
  fail("admin/index.html: tablet kamera szekció hiányzik");
} else ok("admin/index.html: camera section");

if (!adminHtml.includes("photo-fallback")) {
  fail("admin/index.html: photo-fallback hiányzik");
} else ok("admin/index.html: photo fallback");

if (!adminHtml.includes("Kvíz szerkesztő") || !adminHtml.includes("smallscreen/quiz")) {
  fail("admin/index.html: kvíz szerkesztő hiányzik");
} else ok("admin/index.html: quiz editor");

if (!adminHtml.includes("validateQuiz")) {
  fail("admin/index.html: validateQuiz hiányzik");
} else ok("admin/index.html: quiz validation");

if (!adminHtml.includes("window-preview") && !adminHtml.includes("Ablakkép")) {
  fail("admin/index.html: ablakkép panel hiányzik");
} else ok("admin/index.html: window panel");

if (
  !adminHtml.includes("bigscreen/photo") ||
  (!adminHtml.includes("btn-window-send") && !adminHtml.includes('uploadBlob(blob, "window")'))
) {
  fail("admin/index.html: ablakkép bigscreen küldés hiányzik");
} else ok("admin/index.html: window bigscreen publish");

const uploadPhp = fs.readFileSync(path.join(root, "api", "upload.php"), "utf8");
if (!uploadPhp.includes("image/heic") || !uploadPhp.includes("10 * 1024 * 1024")) {
  fail("api/upload.php: HEIC vagy max méret hiányzik");
} else ok("api/upload.php: HEIC + 10MB limit");

if (!uploadPhp.includes("'window' => 'window'")) {
  fail("api/upload.php: window upload kind hiányzik");
} else ok("api/upload.php: window upload kind");

const mqttClientJs = fs.readFileSync(path.join(root, "shared", "js", "mqtt-client.js"), "utf8");
if (!mqttClientJs.includes("NanoportalMqtt") || !mqttClientJs.includes("RETAIN_TOPICS")) {
  fail("mqtt-client.js: NanoportalMqtt vagy RETAIN_TOPICS hiányzik");
} else ok("mqtt-client.js: NanoportalMqtt export");

if (!mqttClientJs.includes("retain") || !mqttClientJs.includes("session/control")) {
  fail("mqtt-client.js: retain publish vagy session/control hiányzik");
} else ok("mqtt-client.js: retain policy");

const flowJson = fs.readFileSync(path.join(root, "hardware", "node-red", "mqtt-to-state.flow.json"), "utf8");
if (!flowJson.includes("mobilmozi/#") || !flowJson.includes("raw.screens")) {
  fail("mqtt-to-state.flow.json: mobilmozi topic vagy screens patch hiányzik");
} else ok("Node-RED flow: mobilmozi + screens");

if (!flowJson.includes("session/control") || !flowJson.includes("fn_session_control")) {
  fail("mqtt-to-state.flow.json: session/control → state.php hiányzik");
} else ok("Node-RED flow: session/control bridge");

if (!flowJson.includes("session/group_contact") || !flowJson.includes("fn_group_contact")) {
  fail("mqtt-to-state.flow.json: session/group_contact → state.php hiányzik");
} else ok("Node-RED flow: group_contact bridge");

const displayJs = fs.readFileSync(path.join(root, "display", "display.js"), "utf8");
if (!displayJs.includes(".pause()") || !displayJs.includes("resolveAssetOrUrl")) {
  fail("display/display.js: media clear/URL resolve hiányzik");
} else ok("display.js: pause + asset/URL resolve");

if (!fs.existsSync(path.join(root, "shared", "js", "media-url.js"))) {
  fail("hiányzó: shared/js/media-url.js");
} else ok("létezik: shared/js/media-url.js");

await runIntegrationSuite();

if (failed) {
  process.exit(1);
}
console.log("\nÖnellenőrzés: minden kritérium teljesült.");
process.exit(0);
