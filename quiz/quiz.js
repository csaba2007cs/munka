import { createStateSync } from "/shared/js/state-sync.js";
import { initQuizPanel } from "/shared/js/quiz-panel.js";

const sync = createStateSync({
  onState: (state) => panel.render(state),
  onError: (e) => {
    const el = document.getElementById("sync-status");
    if (el) {
      el.textContent = `SYNC ERROR // ${String(e)}`;
      el.dataset.link = "err";
    }
  },
});

const panel = initQuizPanel({
  root: document,
  sync,
  touchEnabled: true,
});

sync.startPolling();
