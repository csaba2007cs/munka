let templates = {};
let carouselTimer = null;
let cheerAudio = null;
let visitorIndex = 0;
let visitors = [];

function asObject(v) {
  return typeof v === "object" && v !== null ? v : {};
}

async function loadTemplates() {
  if (Object.keys(templates).length) return templates;
  const res = await fetch("/shared/celebration-templates.json", { cache: "no-store" });
  templates = await res.json();
  return templates;
}

function stopCarousel() {
  if (carouselTimer != null) {
    window.clearInterval(carouselTimer);
    carouselTimer = null;
  }
  if (cheerAudio) {
    cheerAudio.pause();
    cheerAudio = null;
  }
  visitorIndex = 0;
}

function applyVisitorToDom(root, template, visitor) {
  const photoEl = root.querySelector(".celebration-photo");
  const nameEl = root.querySelector(".celebration-name");
  const bgEl = root.querySelector(".celebration-bg");

  if (bgEl && template.background) {
    bgEl.style.backgroundImage = `url(${template.background})`;
  }

  const photo = asObject(template.photo);
  const name = asObject(template.name);

  if (photoEl) {
    const path = String(visitor.photo_path ?? "").trim();
    photoEl.src = path || "/shared/assets/images/poster_placeholder.svg";
    photoEl.alt = String(visitor.nickname ?? "Látogató");
    photoEl.style.left = String(photo.left ?? "38%");
    photoEl.style.top = String(photo.top ?? "30%");
    photoEl.style.width = String(photo.width ?? "24%");
    photoEl.style.transform = String(photo.transform ?? "none");
  }

  if (nameEl) {
    nameEl.textContent = String(visitor.nickname ?? "");
    nameEl.style.left = String(name.left ?? "36%");
    nameEl.style.top = String(name.top ?? "56%");
    nameEl.style.width = String(name.width ?? "28%");
    nameEl.style.transform = String(name.transform ?? "none");
    nameEl.style.fontSize = String(name.fontSize ?? "clamp(1rem, 3vw, 2rem)");
    if (name.fontWeight) nameEl.style.fontWeight = String(name.fontWeight);
    if (name.color) nameEl.style.color = String(name.color);
  }
}

function startCheer(cheerFile) {
  const file = String(cheerFile ?? "").trim();
  if (!file) return;
  const url = `/shared/assets/audio/${encodeURIComponent(file)}`;
  cheerAudio = new Audio(url);
  cheerAudio.loop = true;
  void cheerAudio.play().catch(() => {});
}

/**
 * @param {HTMLElement} root Celebration layer root
 * @param {Record<string, unknown>} state
 */
export async function renderCelebration(root, state) {
  const big = asObject(asObject(state.screens).big);
  const celebration = asObject(big.celebration);
  const templateId = String(celebration.template ?? "crowd_europe");
  const durationSec = Math.max(1, Number(celebration.duration_sec ?? 9));
  const cheerFile = String(celebration.cheer_audio ?? "");

  const list = Array.isArray(state.visitors) ? state.visitors.filter((v) => v && v.photo_path) : [];
  const sig = `${templateId}|${durationSec}|${list.map((v) => `${v.id}:${v.nickname}`).join(",")}`;

  if (root.dataset.celebrationSig === sig && carouselTimer != null) {
    return;
  }
  root.dataset.celebrationSig = sig;

  stopCarousel();
  visitors = list.length ? list : [{ id: 0, nickname: "VENDÉG", photo_path: "" }];

  const allTemplates = await loadTemplates();
  const template = asObject(allTemplates[templateId] ?? allTemplates.crowd_europe);

  const perVisitorMs = Math.max(1000, Math.floor((durationSec * 1000) / visitors.length));

  const showAt = (idx) => {
    const visitor = visitors[idx % visitors.length];
    applyVisitorToDom(root, template, visitor);
  };

  showAt(0);
  startCheer(cheerFile);

  if (visitors.length > 1) {
    carouselTimer = window.setInterval(() => {
      visitorIndex = (visitorIndex + 1) % visitors.length;
      showAt(visitorIndex);
    }, perVisitorMs);
  }
}

export function teardownCelebration() {
  stopCarousel();
}
