const DEFAULT_INTERVAL_MS = 500;

const HU_TIME = {
  timeZone: "Europe/Budapest",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

/** ISO / RFC3339 → magyar helyi idő (Budapest), operátori megjelenítéshez. */
export function formatStateTimestamp(iso) {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat("hu-HU", HU_TIME).format(d);
}

export function createStateSync(options) {
  const getUrl = options.getUrl ?? "/api/state.php";
  const postUrl = options.postUrl ?? "/api/state.php";
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const onState = options.onState;
  const onError = options.onError ?? (() => {});

  let timer = null;

  async function pull() {
    try {
      const json = await get();
      onState(json);
    } catch (e) {
      onError(e);
    }
  }

  async function get() {
    const res = await fetch(getUrl, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`GET ${getUrl} failed: ${res.status}`);
    }
    return res.json();
  }

  return {
    startPolling() {
      if (timer) return;
      void pull();
      timer = setInterval(pull, intervalMs);
    },
    stopPolling() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    get,
    async patch(patch) {
      const res = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`POST state failed: ${res.status} ${text}`);
      }
      const json = await res.json();
      onState(json);
      return json;
    },
    pull,
  };
}
