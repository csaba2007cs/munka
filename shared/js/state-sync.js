const MAX_PATCH_RETRIES = 3;
const LS_TOKEN_KEY = "nanoportal.api.token";
const DEFAULT_FALLBACK_INTERVAL_MS = 2000;
const SSE_FAILURES_BEFORE_POLL = 3;

const HU_TIME = {
  timeZone: "Europe/Budapest",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

function buildWriteHeaders(opts = {}) {
  if (typeof globalThis.NanoportalAuth !== "undefined") {
    return globalThis.NanoportalAuth.buildWriteHeaders(opts);
  }
  const headers = {};
  if (opts.contentType !== false) {
    headers["Content-Type"] = opts.contentType || "application/json";
  }
  try {
    const token = localStorage.getItem(LS_TOKEN_KEY)?.trim();
    if (token) headers["X-Nanoportal-Token"] = token;
  } catch (_) {}
  if (opts.admin) {
    headers["X-Nanoportal-Admin"] = "1";
  }
  return headers;
}

function revEtag(rev) {
  if (rev == null || Number(rev) <= 0) return null;
  return `"${Number(rev)}"`;
}

/** ISO / RFC3339 → magyar helyi idő (Budapest), operátori megjelenítéshez. */
export function formatStateTimestamp(iso) {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat("hu-HU", HU_TIME).format(d);
}

function trackRev(lastRevRef, state) {
  if (state != null && typeof state._rev === "number") {
    lastRevRef.current = state._rev;
  }
}

export function createStateSync(options) {
  const getUrl = options.getUrl ?? "/api/state.php";
  const postUrl = options.postUrl ?? "/api/state.php";
  const eventsUrl = options.eventsUrl ?? "/api/events.php";
  const fallbackIntervalMs =
    options.fallbackIntervalMs ?? options.intervalMs ?? DEFAULT_FALLBACK_INTERVAL_MS;
  const useSSE = options.useSSE !== false && typeof EventSource !== "undefined";
  const onState = options.onState;
  const onError = options.onError ?? (() => {});
  const isAdmin = Boolean(options.admin);

  const lastRev = { current: null };
  let lastState = null;
  let eventSource = null;
  let pollTimer = null;
  let sseFailureCount = 0;
  let syncStarted = false;

  function deliverState(state) {
    trackRev(lastRev, state);
    lastState = state;
    onState(state);
  }

  async function get() {
    const headers = { Accept: "application/json" };
    const etag = revEtag(lastRev.current);
    if (etag) headers["If-None-Match"] = etag;

    const res = await fetch(getUrl, {
      method: "GET",
      cache: "no-store",
      headers,
    });
    if (res.status === 304) {
      return lastState;
    }
    if (!res.ok) {
      throw new Error(`GET ${getUrl} failed: ${res.status}`);
    }
    const json = await res.json();
    trackRev(lastRev, json);
    lastState = json;
    return json;
  }

  async function patch(patch, retriesLeft = MAX_PATCH_RETRIES) {
    const body = { ...patch };
    if (lastRev.current != null) {
      body._rev = lastRev.current;
    }
    const useAdmin = isAdmin || Boolean(body._full_reset);
    const res = await fetch(postUrl, {
      method: "POST",
      headers: buildWriteHeaders({ admin: useAdmin }),
      body: JSON.stringify(body),
    });
    if (res.status === 409 && retriesLeft > 0) {
      const fresh = await get();
      if (fresh != null) onState(fresh);
      return patch(patch, retriesLeft - 1);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`POST state failed: ${res.status} ${text}`);
    }
    const json = await res.json();
    deliverState(json);
    return json;
  }

  async function pull() {
    try {
      const json = await get();
      if (json != null) onState(json);
    } catch (e) {
      onError(e);
    }
  }

  function stopPollingFallback() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPollingFallback() {
    if (pollTimer) return;
    void pull();
    pollTimer = setInterval(pull, fallbackIntervalMs);
  }

  function closeEventSource() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  }

  function startSSE() {
    if (!useSSE || eventSource) return;
    sseFailureCount = 0;
    const rev = lastRev.current ?? 0;
    const url =
      rev > 0 ? `${eventsUrl}?rev=${encodeURIComponent(String(rev))}` : eventsUrl;
    eventSource = new EventSource(url);

    eventSource.onmessage = (e) => {
      sseFailureCount = 0;
      try {
        const state = JSON.parse(e.data);
        deliverState(state);
      } catch (err) {
        onError(err);
      }
    };

    eventSource.onerror = () => {
      sseFailureCount += 1;
      if (sseFailureCount >= SSE_FAILURES_BEFORE_POLL) {
        closeEventSource();
        startPollingFallback();
      }
    };
  }

  function startSync() {
    if (syncStarted) return;
    syncStarted = true;
    stopPollingFallback();
    closeEventSource();
    if (useSSE) {
      startSSE();
    } else {
      startPollingFallback();
    }
  }

  function stopSync() {
    syncStarted = false;
    stopPollingFallback();
    closeEventSource();
  }

  return {
    startPolling: startSync,
    startSync,
    stopPolling: stopSync,
    stopSync,
    close: stopSync,
    get,
    patch,
    pull,
  };
}
