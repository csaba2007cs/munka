/**
 * Audio clip trigger panel for MQTT admin.
 */
(function (global) {
  function writeHeaders() {
    const Auth = global.NanoportalAuth;
    return Auth ? Auth.buildWriteHeaders({ admin: true }) : { "Content-Type": "application/json" };
  }

  async function init(opts) {
    const grid = opts.gridEl;
    const toast = opts.onToast || function () {};
    if (!grid) return;

    grid.innerHTML = "";
    try {
      const res = await fetch("/api/audio.php", { cache: "no-store" });
      const data = await res.json();
      const clips = Array.isArray(data.clips) ? data.clips : [];
      for (const c of clips) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-ghost";
        btn.textContent = c.file;
        btn.addEventListener("click", () => {
          void fetch("/api/audio.php", {
            method: "POST",
            headers: writeHeaders(),
            body: JSON.stringify({ clip: c.file }),
          })
            .then((r) => {
              if (!r.ok) throw new Error("Hang lejátszás sikertelen");
              toast("Hang: " + c.file, true);
            })
            .catch((e) => toast(String(e.message || e), false));
        });
        grid.appendChild(btn);
      }
      if (!clips.length) {
        const p = document.createElement("p");
        p.className = "section-lead";
        p.textContent = "Nincs hangfájl a shared/assets/audio mappában.";
        grid.appendChild(p);
      }
    } catch (e) {
      grid.textContent = "Hanglista betöltése sikertelen.";
      toast(String(e.message || e), false);
    }
  }

  global.NanoportalAdminAudio = { init };
})(window);
