/**
 * Session history from state snapshots (GET /api/sessions.php).
 */
(function (global) {
  function adminHeaders() {
    const Auth = global.NanoportalAuth;
    return Auth
      ? Auth.buildWriteHeaders({ admin: true, contentType: false })
      : { "X-Nanoportal-Admin": "1" };
  }

  async function fetchSessions() {
    const res = await fetch("/api/sessions.php", {
      cache: "no-store",
      headers: adminHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "sessions.php hiba");
    }
    const data = await res.json();
    return Array.isArray(data.sessions) ? data.sessions : [];
  }

  async function fetchSnapshot(filename) {
    const url =
      "/api/sessions.php?file=" + encodeURIComponent(String(filename ?? ""));
    const res = await fetch(url, { cache: "no-store", headers: adminHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Snapshot letöltés sikertelen");
    }
    return res.json();
  }

  async function fetchCurrentRev() {
    const res = await fetch("/api/state.php", { cache: "no-store" });
    if (!res.ok) throw new Error("state.php hiba");
    const state = await res.json();
    return Number(state._rev ?? 0);
  }

  async function restoreSnapshot(snapshot) {
    const Auth = global.NanoportalAuth;
    const rev = await fetchCurrentRev();
    const body = { ...snapshot, _rev: rev, _restore_state: true };
    const headers = Auth
      ? Auth.buildWriteHeaders({ admin: true })
      : {
          "Content-Type": "application/json",
          "X-Nanoportal-Admin": "1",
        };
    const res = await fetch("/api/state.php", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Visszaállítás sikertelen");
    }
    return res.json();
  }

  function formatAt(at) {
    if (!at) return "—";
    try {
      return new Date(at).toLocaleString("hu-HU");
    } catch {
      return String(at);
    }
  }

  function formatDuration(minutes) {
    if (minutes == null || Number.isNaN(Number(minutes))) return "—";
    const m = Number(minutes);
    if (m < 60) return m + " perc";
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h + " ó " + r + " perc";
  }

  function renderSessionsList(listEl, sessions) {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!sessions.length) {
      const p = document.createElement("p");
      p.className = "section-lead";
      p.textContent = "Még nincs lezárt munkamenet (COMPLETED pillanatkép).";
      listEl.appendChild(p);
      return;
    }
    const table = document.createElement("table");
    table.className = "sessions-table";
    const thead = document.createElement("thead");
    thead.innerHTML =
      "<tr><th>Lezárva</th><th>Játékosok</th><th>Lépések</th><th>Időtartam</th><th></th></tr>";
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (const row of sessions) {
      const tr = document.createElement("tr");
      const players =
        Array.isArray(row.players) && row.players.length
          ? row.players.join(", ")
          : "—";

      const tdDate = document.createElement("td");
      tdDate.textContent = formatAt(row.completed_at);
      const tdPlayers = document.createElement("td");
      tdPlayers.textContent = players;
      const tdSteps = document.createElement("td");
      tdSteps.textContent = String(row.steps_completed ?? "—");
      const tdDuration = document.createElement("td");
      tdDuration.textContent = formatDuration(row.duration_minutes);
      tr.append(tdDate, tdPlayers, tdSteps, tdDuration);

      const td = document.createElement("td");
      td.className = "sessions-actions";
      const btnDl = document.createElement("button");
      btnDl.type = "button";
      btnDl.className = "btn-neon btn-neon-sm";
      btnDl.textContent = "Letöltés";
      btnDl.dataset.filename = String(row.filename ?? "");
      btnDl.dataset.action = "download";
      const btnRestore = document.createElement("button");
      btnRestore.type = "button";
      btnRestore.className = "btn-neon btn-neon-sm";
      btnRestore.textContent = "Visszaállítás";
      btnRestore.dataset.filename = String(row.filename ?? "");
      btnRestore.dataset.action = "restore";
      td.appendChild(btnDl);
      td.appendChild(btnRestore);
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    listEl.appendChild(table);
  }

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "snapshot.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function init(opts) {
    const panelEl = opts.panelEl;
    const listEl = opts.listEl;
    const refreshBtn = opts.refreshBtn;
    const onToast = typeof opts.onToast === "function" ? opts.onToast : function () {};

    async function refresh() {
      try {
        const sessions = await fetchSessions();
        renderSessionsList(listEl, sessions);
      } catch (e) {
        onToast(String(e.message || e), false);
        if (listEl) {
          listEl.innerHTML =
            '<p class="section-lead">Nem sikerült betölteni a munkamenet-előzményeket.</p>';
        }
      }
    }

    if (panelEl) {
      panelEl.addEventListener("toggle", function () {
        if (panelEl.open) void refresh();
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        void refresh();
      });
    }
    if (listEl) {
      listEl.addEventListener("click", function (ev) {
        const btn = ev.target.closest("button[data-action]");
        if (!btn) return;
        const filename = btn.dataset.filename;
        const action = btn.dataset.action;
        if (!filename) return;
        if (action === "download") {
          void fetchSnapshot(filename)
            .then(function (snap) {
              downloadJson(filename, snap);
              onToast("Pillanatkép letöltve.", true);
            })
            .catch(function (e) {
              onToast(String(e.message || e), false);
            });
          return;
        }
        if (action === "restore") {
          const ok = global.confirm(
            "Ez felülírja az aktuális állapotot. Biztosan visszaállítod ezt a munkamenetet?",
          );
          if (!ok) return;
          void fetchSnapshot(filename)
            .then(function (snap) {
              return restoreSnapshot(snap);
            })
            .then(function () {
              onToast("Állapot visszaállítva.", true);
            })
            .catch(function (e) {
              onToast(String(e.message || e), false);
            });
        }
      });
    }

    return { refresh: refresh };
  }

  global.NanoportalAdminSessions = { init: init, fetchSessions: fetchSessions };
})(globalThis);
