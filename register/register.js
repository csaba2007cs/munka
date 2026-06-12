const form = document.getElementById("reg-form");
const nameInput = document.getElementById("reg-name");
const msg = document.getElementById("reg-msg");

function setMsg(text, isErr) {
  if (!msg) return;
  msg.textContent = text;
  msg.classList.toggle("is-err", Boolean(isErr));
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = (nameInput?.value ?? "").trim();
  if (!name) {
    setMsg("Adj meg nevet.", true);
    return;
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
    setMsg(String(err), true);
  }
});
