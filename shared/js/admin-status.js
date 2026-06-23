/**
 * Poll state.php for operator status banner.
 */
(function (global) {
  function init(opts) {
    const els = opts.els || {};
    const pollMs = opts.pollMs ?? 3000;
    let last = null;

    function render(state) {
      last = state;
      const status = String(state.status ?? "IDLE");
      const step = Number(state.current_step ?? 1);
      const confirmed = Boolean(state.players_confirmed);
      if (els.status) els.status.textContent = status;
      if (els.step) els.step.textContent = String(step) + " / 4";
      if (els.roster) {
        els.roster.textContent = confirmed ? "Névsor rendben" : "Névsor nincs véglegesítve";
        els.roster.className = "status-roster " + (confirmed ? "is-ok" : "is-warn");
      }
      if (els.sync) {
        const t = state.updated_at ? String(state.updated_at) : "—";
        els.sync.textContent = "SYNC // " + t.replace("T", " ").replace(/\.\d+Z$/, "Z");
      }
    }

    async function refresh() {
      try {
        const res = await fetch("/api/state.php", { cache: "no-store" });
        if (!res.ok) throw new Error("state.php " + res.status);
        render(await res.json());
      } catch (e) {
        if (els.sync) els.sync.textContent = "SYNC // hiba: " + String(e.message || e);
      }
    }

    global.NanoportalAdminStatus = {
      getState: () => last,
      refresh,
    };

    refresh();
    global.setInterval(refresh, pollMs);
    global.document.addEventListener("visibilitychange", () => {
      if (!global.document.hidden) refresh();
    });
  }

  global.NanoportalAdminStatusInit = { init };
})(window);
