import { createStateSync } from "/shared/js/state-sync.js";

const form = document.getElementById("reg-form");
const nameInput = document.getElementById("reg-name");
const msg = document.getElementById("reg-msg");
const submitBtn = form?.querySelector('button[type="submit"], input[type="submit"]');

function setMsg(text, isErr) {
  if (!msg) return;
  msg.textContent = text;
  msg.classList.toggle("is-err", Boolean(isErr));
}

const sync = createStateSync({
  onState(state) {
    const open = state.status === "IDLE" || state.status === "PAUSED";
    if (nameInput) nameInput.disabled = !open;
    if (submitBtn && !submitBtn.dataset.busy) submitBtn.disabled = !open;
    if (!open && msg && !msg.textContent) {
      setMsg("A regisztráció jelenleg zárva — az élmény fut vagy lezárult.", false);
    }
  },
  onError() {
    /* registration form still works without live state */
  },
});

sync.startSync();

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = (nameInput?.value ?? "").trim();
  if (!name) {
    setMsg("Adj meg nevet.", true);
    return;
  }
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.dataset.busy = "1";
  }
  setMsg("Küldés…", false);
  try {
    const res = await fetch("/api/register.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(String(data.error ?? res.status), true);
      return;
    }
    setMsg("Köszönjük — az operátor hamarosan felveszi a névsorba.", false);
    if (nameInput) nameInput.value = "";
  } catch (err) {
    setMsg("Hálózati hiba — próbáld újra.", true);
  } finally {
    if (submitBtn) delete submitBtn.dataset.busy;
    void sync.pull();
  }
});
