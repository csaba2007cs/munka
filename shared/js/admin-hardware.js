/**
 * Hardware status panel for MQTT admin (poll state.php).
 */
(function (global) {
  const TYPE_LABELS = {
    motion: "Mozgás",
    door_open: "Ajtó nyitva",
    door_closed: "Ajtó zárva",
    test: "Teszt",
  };

  function hardwareTypeLabel(type) {
    const t = String(type ?? "");
    return TYPE_LABELS[t] || t || "—";
  }

  function formatTs(at) {
    if (!at) return "—";
    try {
      return new Date(at).toLocaleString("hu-HU");
    } catch {
      return String(at);
    }
  }

  function isActive(at) {
    if (!at) return false;
    const ms = Date.parse(at);
    if (Number.isNaN(ms)) return false;
    return Date.now() - ms < 2 * 60 * 1000;
  }

  async function patchState(body) {
    const res = await fetch("/api/state.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("state.php hiba");
    return res.json();
  }

  function render(state, els) {
    const hw = state.hardware && typeof state.hardware === "object" ? state.hardware : {};
    const last = hw.last_sensor_event && typeof hw.last_sensor_event === "object" ? hw.last_sensor_event : {};
    const at = last.at ? String(last.at) : "";
    const active = isActive(at);

    if (els.conn) {
      els.conn.textContent = active ? "Aktív — friss jel érkezett" : "Nincs friss jel (2 percen belül)";
      els.conn.className = "hardware-status " + (active ? "hardware-status--active" : "hardware-status--idle");
    }
    if (els.dev) els.dev.textContent = last.device ? String(last.device) : "—";
    if (els.type) els.type.textContent = last.type ? hardwareTypeLabel(last.type) : "—";
    if (els.at) els.at.textContent = at ? formatTs(at) : "—";

    if (els.zones) {
      els.zones.innerHTML = "";
      const zones = hw.zones && typeof hw.zones === "object" ? hw.zones : {};
      const keys = Object.keys(zones);
      if (!keys.length) {
        const p = document.createElement("p");
        p.className = "section-lead";
        p.textContent = "Nincs zóna definiálva.";
        els.zones.appendChild(p);
      } else {
        for (const key of keys) {
          const z = zones[key] && typeof zones[key] === "object" ? zones[key] : {};
          const led = String(z.led ?? "unknown").toLowerCase();
          const card = document.createElement("div");
          card.className = "hardware-zone-card";
          const title = document.createElement("strong");
          title.textContent = String(z.label ?? key);
          const badge = document.createElement("span");
          badge.className =
            "hardware-led-badge " + (led === "on" ? "is-on" : led === "off" ? "is-off" : "is-unknown");
          badge.textContent = led === "on" ? "LED be" : led === "off" ? "LED ki" : "Ismeretlen";
          card.append(title, badge);
          els.zones.appendChild(card);
        }
      }
    }

    if (els.log) {
      els.log.innerHTML = "";
      const log = Array.isArray(hw.event_log) ? hw.event_log : [];
      if (!log.length) {
        const li = document.createElement("li");
        li.className = "hardware-log-empty";
        li.textContent = "Még nincs esemény a naplóban.";
        els.log.appendChild(li);
      } else {
        for (const row of log) {
          const ev = row && typeof row === "object" ? row : {};
          const li = document.createElement("li");
          const main = document.createElement("span");
          main.textContent = `${String(ev.device ?? "?")} · ${hardwareTypeLabel(ev.type)}`;
          const meta = document.createElement("span");
          meta.className = "hardware-log-meta";
          meta.textContent = formatTs(ev.at);
          li.append(main, meta);
          els.log.appendChild(li);
        }
      }
    }
  }

  function init(opts) {
    const els = opts.els || {};
    const toast = opts.onToast || function () {};
    const pollMs = opts.pollMs ?? 3000;

    async function refresh() {
      try {
        const res = await fetch("/api/state.php", { cache: "no-store" });
        render(await res.json(), els);
      } catch (e) {
        if (els.conn) els.conn.textContent = String(e.message || e);
      }
    }

    async function postEvent(device, type, message) {
      await patchState({
        hardware: {
          last_sensor_event: {
            device,
            type,
            at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
            message,
          },
        },
      });
      toast("Hardver esemény elküldve.", true);
      refresh();
    }

    opts.testMotionBtn?.addEventListener("click", () =>
      void postEvent("esp32-zone-a", "motion", "Operátori teszt").catch((e) => toast(String(e), false)),
    );
    opts.clearLogBtn?.addEventListener("click", () => {
      if (!global.confirm("Törlöd a hardver eseménynaplót?")) return;
      void patchState({ hardware: { event_log: [], last_sensor_event: null } })
        .then(() => {
          toast("Hardver napló törölve.", true);
          refresh();
        })
        .catch((e) => toast(String(e), false));
    });

    refresh();
    global.setInterval(refresh, pollMs);
    global.document.addEventListener("visibilitychange", () => {
      if (!global.document.hidden) refresh();
    });
  }

  global.NanoportalAdminHardware = { init };
})(window);
