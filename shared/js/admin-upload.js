/**
 * Multipart upload helper for MQTT admin (welcome / visitor photos).
 */
(function (global) {
  async function uploadBlob(blob, kind) {
    const fd = new FormData();
    fd.append("photo", blob, "capture.jpg");
    fd.append("kind", kind || "visitor");
    const res = await fetch("/api/upload.php", { method: "POST", body: fd });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Feltöltés sikertelen");
    return String(json.path ?? "");
  }

  async function dataUrlToBlob(dataUrl) {
    const res = await fetch(dataUrl);
    return res.blob();
  }

  async function uploadDataUrl(dataUrl, kind) {
    return uploadBlob(await dataUrlToBlob(dataUrl), kind);
  }

  /** Upload data URLs; pass through existing /data/… paths unchanged. */
  async function uploadDataUrlIfNeeded(urlOrData, kind) {
    const s = String(urlOrData || "").trim();
    if (!s) return "";
    if (s.startsWith("data:")) return uploadDataUrl(s, kind);
    return s;
  }

  global.NanoportalAdminUpload = {
    uploadBlob,
    uploadDataUrl,
    uploadDataUrlIfNeeded,
  };
})(window);
