/**
 * URL helpers for kiosk video / MJPEG streams.
 */
(function (global) {
  function isMjpegUrl(url) {
    const u = String(url || "").toLowerCase();
    if (!u) return false;
    return (
      /\.mjpe?g(\?|$|\/)/.test(u) ||
      u.includes("/mjpeg") ||
      u.includes("multipart/x-mixed-replace") ||
      u.includes("action=stream") ||
      u.includes("videostream.cgi")
    );
  }

  function isHlsUrl(url) {
    return /\.m3u8(\?|$)/i.test(String(url || "")) || String(url || "").toLowerCase().includes("m3u8");
  }

  function resolveMediaUrl(raw, assetFolder) {
    const text = String(raw ?? "").trim();
    if (!text) return "";
    if (text.startsWith("http://") || text.startsWith("https://") || text.startsWith("/")) {
      return text;
    }
    const folder = assetFolder || "video";
    return "/shared/assets/" + folder + "/" + encodeURIComponent(text);
  }

  global.NanoportalMediaUrl = { isMjpegUrl, isHlsUrl, resolveMediaUrl };
})(window);
