/**
 * Pending registration queue for MQTT admin (MQTT push + HTTP fallback).
 */
(function (global) {
  async function fetchPending() {
    const res = await fetch("/api/register.php", { cache: "no-store" });
    const data = await res.json();
    return Array.isArray(data.pending_registrations) ? data.pending_registrations : [];
  }

  async function patchState(body) {
    const Auth = global.NanoportalAuth;
    const headers = Auth
      ? Auth.buildWriteHeaders({ admin: true })
      : { "Content-Type": "application/json" };
    const res = await fetch("/api/state.php", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "state.php hiba");
    }
    return res.json();
  }

  function formatAt(at) {
    if (!at) return "";
    try {
      return new Date(at).toLocaleString("hu-HU");
    } catch {
      return String(at);
    }
  }

  function renderPendingList(listEl, pending) {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!pending.length) {
      const p = document.createElement("p");
      p.className = "section-lead";
      p.textContent = "Nincs függő regisztráció.";
      listEl.appendChild(p);
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "pending-list";
    for (const row of pending) {
      const li = document.createElement("li");
      const name = String(row.name ?? "").trim() || "—";
      const at = row.at ? " · " + formatAt(row.at) : "";
      li.textContent = name + at;
      ul.appendChild(li);
    }
    listEl.appendChild(ul);
  }

  function init(opts) {
    const listEl = opts.listEl;
    const toast = opts.onToast || function () {};

    async function refresh() {
      try {
        renderPendingList(listEl, await fetchPending());
      } catch (e) {
        if (!listEl) return;
        listEl.innerHTML = "";
        const p = document.createElement("p");
        p.className = "field-error";
        p.textContent = String(e.message || e);
        listEl.appendChild(p);
      }
    }

    function refreshFromMqtt(text) {
      try {
        const data = JSON.parse(String(text ?? ""));
        const pending = Array.isArray(data.pending_registrations) ? data.pending_registrations : [];
        renderPendingList(listEl, pending);
      } catch {
        void refresh();
      }
    }

    async function importAll() {
      const stateRes = await fetch("/api/state.php", { cache: "no-store" });
      const s = await stateRes.json();
      const pending = Array.isArray(s.pending_registrations) ? s.pending_registrations : [];
      if (!pending.length) {
        toast("Nincs importálandó függő regisztráció.", "info");
        return;
      }
      const players = Array.isArray(s.players) ? s.players.map((p) => ({ ...p })) : [];
      let maxId = players.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0);
      for (const row of pending) {
        const name = String(row.name ?? "").trim();
        if (!name) continue;
        maxId += 1;
        players.push({ id: maxId, name });
      }
      const updated = await patchState({ players, pending_registrations: [], players_confirmed: false });
      toast(
        pending.length + " név importálva — adj hozzá fotókat a látogatókhoz, majd küldés.",
        true,
      );
      if (typeof opts.onAfterImport === "function") {
        opts.onAfterImport(updated);
      }
      refresh();
    }

    async function confirmRoster() {
      await patchState({ players_confirmed: true });
      toast("Névsor rendben.", true);
    }

    async function clearPending() {
      if (!global.confirm("Törlöd a függő regisztrációkat?")) return;
      await patchState({ pending_registrations: [] });
      toast("Függő regisztrációk törölve.", true);
      refresh();
    }

    opts.importBtn?.addEventListener("click", () => void importAll().catch((e) => toast(String(e.message || e), false)));
    opts.confirmBtn?.addEventListener("click", () => void confirmRoster().catch((e) => toast(String(e.message || e), false)));
    opts.clearBtn?.addEventListener("click", () => void clearPending().catch((e) => toast(String(e.message || e), false)));

    refresh();
    const pollMs = opts.pollMs ?? 30000;
    global.setInterval(refresh, pollMs);
    global.document.addEventListener("visibilitychange", () => {
      if (!global.document.hidden) refresh();
    });

    return { refresh, refreshFromMqtt };
  }

  global.NanoportalAdminRegistrations = { init, fetchPending };
})(window);
