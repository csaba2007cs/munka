/**
 * Shared API write auth headers (NANOPORTAL_API_TOKEN + admin flag).
 * Set token via localStorage key nanoportal.api.token (admin: TOKEN? button).
 */
(function (global) {
  const LS_TOKEN_KEY = "nanoportal.api.token";

  function getApiToken() {
    try {
      const stored = global.localStorage.getItem(LS_TOKEN_KEY);
      return stored ? String(stored).trim() : "";
    } catch (_) {
      return "";
    }
  }

  /** @param {{ admin?: boolean, contentType?: string|boolean }} [opts] */
  function buildWriteHeaders(opts) {
    opts = opts || {};
    const headers = {};
    if (opts.contentType !== false) {
      headers["Content-Type"] = opts.contentType || "application/json";
    }
    const token = getApiToken();
    if (token) {
      headers["X-Nanoportal-Token"] = token;
    }
    if (opts.admin) {
      headers["X-Nanoportal-Admin"] = "1";
    }
    return headers;
  }

  global.NanoportalAuth = {
    LS_TOKEN_KEY: LS_TOKEN_KEY,
    getApiToken: getApiToken,
    buildWriteHeaders: buildWriteHeaders,
  };
})(globalThis);
