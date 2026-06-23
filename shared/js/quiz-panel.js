import { formatStateTimestamp } from "/shared/js/state-sync.js";

export const QUIZ_STEPS = [
  {
    question_text: "Melyik faj tojásából kell mintát szereznetek?",
    question_title: "1. FELADAT: Melyik faj tojásából kell mintát szereznetek?",
    options: [
      { id: "a", label: "Tyrannotitan" },
      { id: "b", label: "Patagotitan" },
      { id: "c", label: "ismeretlen kisragadozó" },
    ],
    correct_option_id: "b",
    feedback_instruction:
      "UV-fénnyel vizsgáljátok meg a tojásrakó helyhez kapcsolódó képet.",
    sidebar_items: [
      { id: "celpont", label: "célpont", done: true },
      { id: "fenyegetes", label: "fenyegetés", done: false },
      { id: "mintavetel", label: "mintavétel", done: false },
      { id: "mozgasi", label: "mozgási korlát", done: false },
    ],
    hud_scan_percent: 97,
  },
  {
    question_text: "Hol a legnagyobb kockázat a minták keresztszennyeződésére?",
    question_title: "2. FELADAT: Hol a legnagyobb kockázat a minták keresztszennyeződésére?",
    options: [
      { id: "a", label: "Szellőzőrács és átmenő folyosó metszése" },
      { id: "b", label: "Mintaőrző kamra, zárt rendszerben" },
      { id: "c", label: "Fogadótér, látogatói zóna" },
    ],
    correct_option_id: "a",
    feedback_instruction: "Jelöljétek be a térképen a tilos átkelési pontokat.",
    sidebar_items: [
      { id: "celpont", label: "célpont", done: true },
      { id: "fenyegetes", label: "fenyegetés", done: true },
      { id: "mintavetel", label: "mintavétel", done: false },
      { id: "mozgasi", label: "mozgási korlát", done: false },
    ],
    hud_scan_percent: 98,
  },
  {
    question_text: "Milyen eszközt használtok először a mintavételnél?",
    question_title: "3. FELADAT: Milyen eszközt használtok először a mintavételnél?",
    options: [
      { id: "a", label: "Steril mintavevő + egyszer használatos kesztyű" },
      { id: "b", label: "Kézi fényképezőgép" },
      { id: "c", label: "Háztartási törlőkendő" },
    ],
    correct_option_id: "a",
    feedback_instruction: "A sorrendet rögzítsétek a naplóban — először védőfelszerelés, utána eszköz.",
    sidebar_items: [
      { id: "celpont", label: "célpont", done: true },
      { id: "fenyegetes", label: "fenyegetés", done: true },
      { id: "mintavetel", label: "mintavétel", done: true },
      { id: "mozgasi", label: "mozgási korlát", done: false },
    ],
    hud_scan_percent: 99,
  },
  {
    question_text: "Mi a teendő, ha mozgási korlát lép életbe a zónában?",
    question_title: "4. FELADAT: Mi a teendő, ha mozgási korlát lép életbe a zónában?",
    options: [
      { id: "a", label: "Azonnali evakuáció a kijelölt útvonalon" },
      { id: "b", label: "Folytatás — idő nyerése" },
      { id: "c", label: "Visszavonulás a legközelebbi fedél alá, jelentés nélkül" },
    ],
    correct_option_id: "a",
    feedback_instruction: "A protokoll szerint jelentés az operátornak, majd evakuáció.",
    sidebar_items: [
      { id: "celpont", label: "célpont", done: true },
      { id: "fenyegetes", label: "fenyegetés", done: true },
      { id: "mintavetel", label: "mintavétel", done: true },
      { id: "mozgasi", label: "mozgási korlát", done: true },
    ],
    hud_scan_percent: 100,
  },
];

function asObject(v) {
  return typeof v === "object" && v !== null ? v : {};
}

function resolveQuestionText(quiz) {
  const direct = quiz.question_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const title = String(quiz.question_title ?? "");
  const idx = title.indexOf(":");
  if (idx !== -1) return title.slice(idx + 1).trim();
  return title.trim();
}

function resolveTaskLabel(quiz, step) {
  const tl = quiz.task_label;
  if (typeof tl === "string" && tl.trim()) return tl.trim();
  const title = String(quiz.question_title ?? "");
  const m = title.match(/^(\d+\.\s*FELADAT)/i);
  if (m) return m[1].replace(/feladat/i, "FELADAT");
  return `${step}. FELADAT`;
}

function choiceSignature(quiz, status) {
  const options = Array.isArray(quiz.options) ? quiz.options : [];
  const selected = quiz.selected_answer == null ? "" : String(quiz.selected_answer);
  const feedback = Boolean(quiz.feedback_visible);
  const correct = String(quiz.correct_option_id ?? "");
  const validation = String(quiz.validation ?? "idle");
  const optPart = options.map((o) => `${o.id}:${o.label}`).join("|");
  return [status, selected, feedback, correct, validation, optPart].join("§");
}

function sidebarSignature(quiz) {
  const items = Array.isArray(quiz.sidebar_items) ? quiz.sidebar_items : [];
  return items.map((i) => `${i.id}:${i.done ? 1 : 0}:${i.label}`).join("|");
}

/**
 * @param {{ root: ParentNode, sync: import("/shared/js/state-sync.js").StateSync, touchEnabled?: boolean }} opts
 */
export function initQuizPanel({ root, sync, touchEnabled = true }) {
  const $ = (id) => root.querySelector(`#${id}`);

  let lastChoiceSig = "";
  let lastSidebarSig = "";

  function render(state) {
  const quiz = asObject(state.quiz_state);
  const step = Number(state.current_step ?? 1);
  const status = String(state.status ?? "IDLE");

  const heroTitle = String(quiz.hero_title ?? "KIKÉPZÉSI MODUL LEZÁRVA");
  const heroSubtitle = String(
    quiz.hero_subtitle ?? quiz.header_status ?? "Kutatói alkalmassági ellenőrzés folyamatban",
  );
  const taskLabel = resolveTaskLabel(quiz, step);
  const questionText = resolveQuestionText(quiz);
  const options = Array.isArray(quiz.options) ? quiz.options : [];
  const selected = quiz.selected_answer == null ? null : String(quiz.selected_answer);
  const correctId = String(quiz.correct_option_id ?? "");
  const feedbackVisible = Boolean(quiz.feedback_visible);
  const validation = String(quiz.validation ?? "idle");
  const feedbackInstruction = String(quiz.feedback_instruction ?? "");
  const sidebarTitle = String(quiz.sidebar_title ?? "VIZSGA FOLYAMAT");
  const sidebarItems = Array.isArray(quiz.sidebar_items) ? quiz.sidebar_items : [];
  const scanPct = Math.max(0, Math.min(100, Number(quiz.hud_scan_percent ?? 0)));
  const footerLeft = String(quiz.footer_left ?? "");
  const hudFooter = String(quiz.hud_footer ?? "NP-SYS // MISSION MODULE");

  const elHeroTitle = $("hero-title");
  const elHeroSub = $("hero-subtitle");
  const elTask = $("task-label");
  const elQuestion = $("question-text");
  const elChoices = $("choice-grid");
  const elFeedback = $("feedback");
  const elFeedbackHint = $("feedback-hint");
  const elSidebarTitle = $("sidebar-title");
  const elSidebarList = $("sidebar-list");
  const elScanFill = $("scan-fill");
  const elScanLabel = $("scan-label");
  const elFooterLeft = $("footer-left");
  const elHudFooter = $("hud-footer");
  const elStepLabel = $("step-label");
  const elSync = $("sync-status");
  const elFooterActions = $("footer-actions");
  const elBtnHint = $("btn-next-hint");

  if (elHeroTitle) elHeroTitle.textContent = heroTitle;
  if (elHeroSub) elHeroSub.textContent = heroSubtitle;
  if (elTask) elTask.textContent = taskLabel;
  if (elQuestion) elQuestion.textContent = questionText;
  if (elSidebarTitle) elSidebarTitle.textContent = sidebarTitle;
  if (elFooterLeft) elFooterLeft.textContent = footerLeft;
  if (elHudFooter) elHudFooter.textContent = hudFooter;
  if (elStepLabel) elStepLabel.textContent = `${step} / 4`;
  if (elScanFill) elScanFill.style.width = `${scanPct}%`;
  if (elScanLabel) elScanLabel.textContent = `SZKENNELÉS ${Math.round(scanPct)}%`;

  for (let i = 1; i <= 4; i += 1) {
    const node = $(`node-${i}`);
    if (!node) continue;
    node.classList.toggle("is-active", i === step);
    node.classList.toggle("is-past", i < step);
  }

  const nextSig = choiceSignature(quiz, status);
  if (elChoices && nextSig !== lastChoiceSig) {
    lastChoiceSig = nextSig;
    elChoices.innerHTML = "";
    for (const opt of options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.dataset.id = opt.id;
      const ind = document.createElement("span");
      ind.className = "choice-indicator";
      ind.setAttribute("aria-hidden", "true");
      const lab = document.createElement("span");
      lab.className = "choice-label";
      lab.textContent = opt.label;
      btn.append(ind, lab);
      if (selected && opt.id === selected) btn.classList.add("is-selected");
      if (feedbackVisible && opt.id === correctId) btn.classList.add("is-correct-glow");
      if (
        selected &&
        opt.id === selected &&
        validation === "incorrect" &&
        !feedbackVisible
      ) {
        btn.classList.add("is-wrong");
      }
      btn.addEventListener("click", () => void onSelectOption(opt.id, correctId, btn));
      btn.disabled = !touchEnabled || status !== "RUNNING" || feedbackVisible;
      elChoices.appendChild(btn);
    }
  }

  const sideSig = sidebarSignature(quiz);
  if (elSidebarList && sideSig !== lastSidebarSig) {
    lastSidebarSig = sideSig;
    elSidebarList.innerHTML = "";
    for (const item of sidebarItems) {
      const li = document.createElement("li");
      li.className = item.done ? "is-done" : "is-pending";
      const dot = document.createElement("span");
      dot.className = "rail-dot";
      dot.setAttribute("aria-hidden", "true");
      const span = document.createElement("span");
      span.textContent = item.label;
      li.append(dot, span);
      elSidebarList.appendChild(li);
    }
  }

  if (elFeedback) {
    elFeedback.classList.toggle("is-visible", feedbackVisible);
  }
  if (elFeedbackHint) {
    elFeedbackHint.textContent = feedbackInstruction;
  }

  const canAdvance = status === "RUNNING" && feedbackVisible;
  const btnNext = $("btn-next");
  if (btnNext) {
    const blocked = status === "IDLE" || status === "PAUSED" || status === "COMPLETED";
    btnNext.disabled = blocked || !feedbackVisible;
  }
  if (elFooterActions) {
    elFooterActions.dataset.primed = canAdvance ? "1" : "0";
  }
  if (elBtnHint) {
    if (status === "IDLE") {
      elBtnHint.textContent = "Az élmény indítása után választhattok.";
    } else if (status === "PAUSED") {
      elBtnHint.textContent = "Szünet — az operátor folytatása szükséges.";
    } else if (status === "COMPLETED") {
      elBtnHint.textContent = "Modul lezárva — az operátor visszaállíthatja a rendszert.";
    } else if (!feedbackVisible && selected && validation === "incorrect") {
      elBtnHint.textContent = "Hibás válasz — válasszatok másik lehetőséget.";
    } else if (feedbackVisible) {
      elBtnHint.textContent = "Következő feladat — nyomjátok meg a TOVÁBB gombot.";
    } else if (status === "RUNNING" && !selected) {
      elBtnHint.textContent = "Válasszatok egy válaszlehetőséget.";
    } else if (!feedbackVisible) {
      elBtnHint.textContent = "A helyes válasz megjelölése után válik elérhetővé a TOVÁBB.";
    } else {
      elBtnHint.textContent = "";
    }
  }

  if (elSync) {
    const t = formatStateTimestamp(state.updated_at);
    elSync.textContent = `SYNC // ${status} // ${t}`;
    let link = "ok";
    if (status === "IDLE" || status === "PAUSED") link = "warn";
    else if (status === "COMPLETED") link = "ok";
    elSync.dataset.link = link;
  }
}

  async function onSelectOption(optionId, correctId, btn) {
    if (!touchEnabled) return;
    if (btn?.disabled) return;
    if (btn) btn.disabled = true;
    try {
      const snap = await sync.get();
      if (String(snap.status ?? "") !== "RUNNING") {
        if (btn) btn.disabled = false;
        return;
      }
      const q = asObject(snap.quiz_state);
      if (Boolean(q.feedback_visible)) {
        if (btn) btn.disabled = false;
        return;
      }
      const isCorrect = optionId === correctId;
      await sync.patch({
        quiz_state: {
          selected_answer: optionId,
          validation: isCorrect ? "correct" : "incorrect",
          feedback_visible: isCorrect,
        },
      });
    } catch (e) {
      const el = $("sync-status");
      if (el) el.textContent = `SYNC // hiba: ${String(e)}`;
      if (btn) btn.disabled = false;
    }
  }

  async function onNext() {
    if (!touchEnabled) return;
  const latest = await sync.get();
  const step = Number(latest.current_step ?? 1);
  if (step >= 4) {
    lastChoiceSig = "";
    lastSidebarSig = "";
    await sync.patch({
      status: "COMPLETED",
      quiz_state: {
        feedback_visible: false,
        selected_answer: null,
        validation: "idle",
      },
    });
    return;
  }
  const nextStep = step + 1;
  const bank = QUIZ_STEPS[nextStep - 1];
  if (!bank) {
    return;
  }
  lastChoiceSig = "";
  lastSidebarSig = "";
    await sync.patch({
      current_step: nextStep,
      quiz_state: {
        ...bank,
        feedback_visible: false,
        selected_answer: null,
        validation: "idle",
        task_label: `${nextStep}. FELADAT`,
        current_question_id: nextStep,
      },
    });
  }

  const canvas = $("waveform");
  let ctx = canvas?.getContext("2d") ?? null;
  let waveT = 0;
  let rafId = null;

  const resize = () => {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const drawFrame = () => {
    if (!canvas || !ctx || document.visibilityState !== "visible") {
      rafId = null;
      return;
    }
    waveT += 1;
    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;
    ctx.clearRect(0, 0, w, h);
    const grd = ctx.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, "rgba(0,191,255,0.15)");
    grd.addColorStop(0.5, "rgba(0,191,255,0.55)");
    grd.addColorStop(1, "rgba(57,255,20,0.2)");
    ctx.strokeStyle = grd;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let x = 0; x < w; x += 2) {
      const y =
        h / 2 +
        Math.sin((x + waveT) * 0.09) * (h * 0.28) +
        Math.sin((x - waveT * 2) * 0.025) * (h * 0.1) +
        Math.sin(waveT * 0.03) * (h * 0.04);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    rafId = requestAnimationFrame(drawFrame);
  };

  const startWave = () => {
    if (rafId != null || !canvas || !ctx) return;
    resize();
    rafId = requestAnimationFrame(drawFrame);
  };

  const stopWave = () => {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  if (canvas && ctx) {
    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") startWave();
      else stopWave();
    });
    startWave();
  }

  $("btn-next")?.addEventListener("click", () => void onNext());

  return { render };
}
