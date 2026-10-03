/**
 * Admin health polling, TTS status, log viewer, Node-RED heartbeat.
 */
(function (global) {
  const TTS_LABELS = {
    idle: "TTS: idle",
    pending: "🔄 Generating...",
    ready: "✅ Audio ready",
    fallback: "⚠️ Using fallback audio (ElevenLabs unavailable)",
    error: "❌ TTS failed",
  };

  function formatTtsLabel(status) {
    const key = String(status ?? "idle").toLowerCase();
    return TTS_LABELS[key] || "TTS: " + key;
  }

  function badgeClassForTts(status) {
    const key = String(status ?? "idle").toLowerCase();
    if (key === "ready") return "badge-ok";
    if (key === "pending") return "badge-warn";
    if (key === "fallback" || key === "error") return "badge-err";
    return "badge-ok";
  }

  function init(opts) {
    const apiHealthEl = opts.apiHealthEl;
    const ttsHealthEl = opts.ttsHealthEl;
    const ttsStatusLabelEl = opts.ttsStatusLabelEl;
    const noderedHealthEl = opts.noderedHealthEl;
    const logsListEl = opts.logsListEl;
    const logsPanelEl = opts.logsPanelEl;
    const logsRefreshBtn = opts.logsRefreshBtn;
    const onToast = typeof opts.onToast === "function" ? opts.onToast : function () {};
    const onNoderedHeartbeat = opts.onNoderedHeartbeat;

    let lastHealthOk = true;
    let lastNoderedAt = 0;
    let healthTimer = null;
    let noderedTimer = null;

    function applyApiHealthBadge(ok) {
      if (!apiHealthEl) return;
      apiHealthEl.classList.remove("badge-ok", "badge-warn", "badge-err");
      if (ok) {
        apiHealthEl.textContent = "API ✓";
        apiHealthEl.classList.add("badge-ok");
      } else {
        apiHealthEl.textContent = "API ✕";
        apiHealthEl.classList.add("badge-err");
      }
    }

    function applyTtsHealth(status) {
      const key = String(status ?? "idle").toLowerCase();
      if (ttsStatusLabelEl) {
        ttsStatusLabelEl.textContent = formatTtsLabel(key);
      }
      if (ttsHealthEl) {
        ttsHealthEl.classList.remove("badge-ok", "badge-warn", "badge-err");
        ttsHealthEl.textContent =
          key === "fallback"
            ? "TTS fallback"
            : key === "error"
              ? "TTS error"
              : key === "ready"
                ? "TTS ready"
                : key === "pending"
                  ? "TTS …"
                  : "TTS idle";
        ttsHealthEl.classList.add(badgeClassForTts(key));
      }
    }

    function applyNoderedBadge() {
      if (!noderedHealthEl) return;
      const ageMs = lastNoderedAt ? Date.now() - lastNoderedAt : Infinity;
      noderedHealthEl.classList.remove("badge-ok", "badge-warn", "badge-err");
      if (ageMs <= 60000) {
        noderedHealthEl.textContent = "Node-RED ✓";
        noderedHealthEl.classList.add("badge-ok");
      } else if (lastNoderedAt === 0) {
        noderedHealthEl.textContent = "Node-RED …";
        noderedHealthEl.classList.add("badge-warn");
      } else {
        noderedHealthEl.textContent = "Node-RED ✕";
        noderedHealthEl.classList.add("badge-err");
      }
    }

    function recordNoderedHeartbeat(text) {
      try {
        const data = JSON.parse(String(text ?? ""));
        if (data && data.ok !== false) {
          lastNoderedAt = Date.now();
          applyNoderedBadge();
        }
      } catch (_) {
        lastNoderedAt = Date.now();
        applyNoderedBadge();
      }
    }

    async function refreshHealth() {
      try {
        const res = await fetch("/api/health.php", { cache: "no-store" });
        const data = await res.json();
        const ok = Boolean(data.ok);
        applyApiHealthBadge(ok);
        if (data.checks && data.checks.tts_status != null) {
          applyTtsHealth(data.checks.tts_status);
        }
        if (!ok && lastHealthOk) {
          onToast("API health check failed — see System logs.", false);
        }
        lastHealthOk = ok;
      } catch (e) {
        applyApiHealthBadge(false);
        if (lastHealthOk) {
          onToast("Cannot reach /api/health.php", false);
        }
        lastHealthOk = false;
      }
    }

    async function refreshLogs() {
      if (!logsListEl) return;
      const Auth = global.NanoportalAuth;
      const headers = Auth
        ? Auth.buildWriteHeaders({ admin: true, contentType: false })
        : { "X-Nanoportal-Admin": "1" };
      try {
        const res = await fetch("/api/logs.php", { cache: "no-store", headers });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        const lines = Array.isArray(data.lines) ? data.lines : [];
        logsListEl.innerHTML = "";
        if (!lines.length) {
          const p = document.createElement("p");
          p.className = "section-lead";
          p.textContent = "Nincs naplóbejegyzés.";
          logsListEl.appendChild(p);
          return;
        }
        const pre = document.createElement("pre");
        pre.className = "log-viewer";
        pre.textContent = lines
          .map(function (row) {
            const lvl = String(row.level ?? "?").toUpperCase();
            const ts = String(row.ts ?? "");
            const msg = String(row.msg ?? "");
            return ts + " [" + lvl + "] " + msg;
          })
          .join("\n");
        logsListEl.appendChild(pre);
      } catch (e) {
        logsListEl.innerHTML = "";
        const p = document.createElement("p");
        p.className = "section-lead";
        p.textContent = "Napló betöltése sikertelen.";
        logsListEl.appendChild(p);
      }
    }

    function startHealthPolling() {
      if (healthTimer) return;
      void refreshHealth();
      healthTimer = global.setInterval(refreshHealth, 30000);
    }

    function startNoderedWatch() {
      if (noderedTimer) return;
      applyNoderedBadge();
      noderedTimer = global.setInterval(applyNoderedBadge, 10000);
    }

    if (logsPanelEl) {
      logsPanelEl.addEventListener("toggle", function () {
        if (logsPanelEl.open) void refreshLogs();
      });
    }
    if (logsRefreshBtn) {
      logsRefreshBtn.addEventListener("click", function () {
        void refreshLogs();
      });
    }

    startHealthPolling();
    startNoderedWatch();

    return {
      refreshHealth: refreshHealth,
      applyTtsHealth: applyTtsHealth,
      recordNoderedHeartbeat: recordNoderedHeartbeat,
      refreshLogs: refreshLogs,
    };
  }

  global.NanoportalAdminHealth = { init: init, formatTtsLabel: formatTtsLabel };
})(globalThis);
