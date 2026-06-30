/**
 * Photobooth capture + upload for MQTT admin.
 */
import {
  attachCameraStream,
  cameraErrorMessage,
  captureVideoFrame,
  requestUserCamera,
  stopMediaStream,
  waitForVideoFrame,
} from "/shared/js/camera-capture.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function mountPhotobooth(root, { onToast = () => {} } = {}) {
  if (!root) return;

  root.innerHTML = "";
  const wrap = el("div", "photobooth-wrap");
  const video = el("video");
  video.id = "pb-video";
  video.playsInline = true;
  video.autoplay = true;
  video.muted = true;
  video.className = "pb-live";
  const preview = el("img");
  preview.id = "pb-preview";
  preview.alt = "Előnézet";
  preview.hidden = true;
  preview.className = "pb-preview";
  const canvas = el("canvas");
  canvas.hidden = true;
  const countdown = el("p", "pb-countdown");
  const gallery = el("div", "pb-gallery");
  const errEl = el("p", "field-error");
  errEl.hidden = true;

  const row1 = el("div", "action-row");
  const btnStart = el("button", "btn-primary", "Kamera be");
  btnStart.type = "button";
  const btnStop = el("button", "btn-ghost", "Kamera ki");
  btnStop.type = "button";
  const btnCapture = el("button", "btn-primary", "Felvétel");
  btnCapture.type = "button";
  const fileInput = el("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.hidden = true;
  const btnFile = el("button", "btn-ghost", "Fájl");
  btnFile.type = "button";

  const row2 = el("div", "action-row");
  const btnRetake = el("button", "btn-ghost", "Újra");
  btnRetake.type = "button";
  btnRetake.hidden = true;
  const btnUpload = el("button", "btn-primary", "Feltöltés");
  btnUpload.type = "button";
  btnUpload.hidden = true;

  row1.append(btnStart, btnStop, btnCapture, btnFile, fileInput);
  row2.append(btnRetake, btnUpload);
  wrap.append(video, preview, countdown, errEl, row1, row2, el("h3", "field-label", "Legutóbbi feltöltések"), gallery);
  root.appendChild(wrap);

  let stream = null;
  let pendingBlob = null;
  let previewUrl = null;

  function showErr(msg) {
    if (!msg) {
      errEl.hidden = true;
      errEl.textContent = "";
      return;
    }
    errEl.hidden = false;
    errEl.textContent = msg;
  }

  function clearPending() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    pendingBlob = null;
    preview.hidden = true;
    preview.removeAttribute("src");
    btnRetake.hidden = true;
    btnUpload.hidden = true;
    video.hidden = false;
  }

  function showPreview() {
    video.hidden = true;
    preview.hidden = false;
    btnRetake.hidden = false;
    btnUpload.hidden = false;
  }

  async function refreshList() {
    gallery.innerHTML = "";
    try {
      const res = await fetch("/api/photobooth-list.php?limit=12", { cache: "no-store" });
      const data = await res.json();
      const files = Array.isArray(data.files) ? data.files : [];
      if (!files.length) {
        gallery.appendChild(el("p", "section-lead", "Még nincs feltöltött kép."));
        return;
      }
      for (const f of files) {
        const link = el("a");
        link.href = f.path;
        link.target = "_blank";
        link.rel = "noopener";
        const img = el("img", "pb-thumb");
        img.src = f.path;
        img.alt = f.filename || "";
        img.loading = "lazy";
        link.appendChild(img);
        gallery.appendChild(link);
      }
    } catch (e) {
      gallery.appendChild(el("p", "field-error", String(e.message || e)));
    }
  }

  async function startCamera() {
    stopStream();
    showErr("");
    try {
      stream = await requestUserCamera();
      await attachCameraStream(video, stream);
      onToast("Kamera bekapcsolva.", true);
    } catch (e) {
      showErr(cameraErrorMessage(e));
    }
  }

  function stopStream() {
    stopMediaStream(stream);
    stream = null;
    video.srcObject = null;
  }

  btnStart.addEventListener("click", () => void startCamera());
  btnStop.addEventListener("click", () => {
    stopStream();
    onToast("Kamera kikapcsolva.", true);
  });

  btnFile.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    clearPending();
    pendingBlob = file;
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    showPreview();
    fileInput.value = "";
    onToast("Kép betöltve — ellenőrizd az előnézetet.", true);
  });

  btnCapture.addEventListener("click", async () => {
    if (!stream) {
      onToast("Előbb indítsd be a kamerát, vagy válassz fájlt.", false);
      return;
    }
    try {
      await waitForVideoFrame(video);
    } catch (e) {
      onToast(cameraErrorMessage(e), false);
      return;
    }
    let n = 3;
    countdown.textContent = String(n);
    await new Promise((resolve) => {
      const id = window.setInterval(() => {
        n -= 1;
        countdown.textContent = String(Math.max(0, n));
        if (n <= 0) {
          window.clearInterval(id);
          resolve(null);
        }
      }, 1000);
    });
    countdown.textContent = "";
    try {
      const blob = await captureVideoFrame(video, canvas);
      clearPending();
      pendingBlob = blob;
      previewUrl = URL.createObjectURL(blob);
      preview.src = previewUrl;
      showPreview();
      onToast("Ellenőrizd az előnézetet, majd töltsd fel.", true);
    } catch (e) {
      onToast(cameraErrorMessage(e), false);
    }
  });

  btnRetake.addEventListener("click", () => {
    clearPending();
    void startCamera();
  });

  btnUpload.addEventListener("click", async () => {
    if (!pendingBlob) {
      onToast("Nincs kép az előnézetben.", false);
      return;
    }
    const fd = new FormData();
    fd.append("photo", pendingBlob, "capture.jpg");
    try {
      const headers = {};
      try {
        const token = localStorage.getItem("nanoportal.api.token")?.trim();
        if (token) headers["X-Nanoportal-Token"] = token;
      } catch (_) {}
      headers["X-Nanoportal-Admin"] = "1";
      const res = await fetch("/api/upload.php", { method: "POST", headers, body: fd });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Feltöltés sikertelen");
      clearPending();
      onToast("Fotó feltöltve.", true);
      await refreshList();
    } catch (e) {
      onToast(String(e.message || e), false);
    }
  });

  void refreshList();
}
