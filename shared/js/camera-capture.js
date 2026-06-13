/**
 * Shared getUserMedia helpers for admin photobooth and visitor capture.
 * Preview may be mirrored via CSS; captured frames are not mirrored (natural orientation).
 */

const CAMERA_CONSTRAINT_ATTEMPTS = [
  {
    video: {
      facingMode: { ideal: "user" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  },
  {
    video: {
      facingMode: { ideal: "user" },
      width: { ideal: 640 },
      height: { ideal: 480 },
    },
    audio: false,
  },
  { video: { facingMode: "user" }, audio: false },
  { video: true, audio: false },
];

const FRONT_CAMERA_LABEL = /front|user|selfie|face|első|előlapi/i;

function isRetryableConstraintError(err) {
  const name = String(err?.name ?? "");
  return name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError";
}

function scoreFrontCamera(device, index, total) {
  const label = String(device.label ?? "");
  if (FRONT_CAMERA_LABEL.test(label)) return 0;
  if (total > 1 && index === total - 1) return 1;
  return 2;
}

async function requestUserCameraByDeviceId() {
  let probe = null;
  try {
    probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch {
    return null;
  }
  stopMediaStream(probe);

  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter((d) => d.kind === "videoinput");
  if (!videoInputs.length) return null;

  const ordered = [...videoInputs]
    .map((device, index) => ({ device, index }))
    .sort(
      (a, b) =>
        scoreFrontCamera(a.device, a.index, videoInputs.length) -
        scoreFrontCamera(b.device, b.index, videoInputs.length),
    )
    .map((row) => row.device);

  for (const device of ordered) {
    if (!device.deviceId) continue;
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: device.deviceId } },
        audio: false,
      });
    } catch (err) {
      if (isRetryableConstraintError(err)) continue;
    }
  }
  return null;
}

function waitForVideoPlaying(video, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (!video) {
      reject(new Error("Hiányzó video elem."));
      return;
    }
    if (!video.paused && video.readyState >= 2) {
      resolve(null);
      return;
    }

    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("loadeddata", onPlaying);
      window.clearTimeout(timer);
      fn();
    };

    const onPlaying = () => {
      if (!video.paused && video.readyState >= 2) {
        finish(() => resolve(null));
      }
    };

    const timer = window.setTimeout(() => {
      finish(() =>
        reject(new Error("A kamera előnézet nem indult el. Próbáld újra a Kamera be gombot.")),
      );
    }, timeoutMs);

    video.addEventListener("playing", onPlaying);
    video.addEventListener("loadeddata", onPlaying);
    onPlaying();
  });
}

export function cameraErrorMessage(err) {
  const name = String(err?.name ?? "");
  if (name === "NotAllowedError") {
    return "A kamera hozzáférés megtagadva. Engedélyezd a böngészőben, vagy válaszd a Fájl / galéria gombot.";
  }
  if (name === "NotFoundError") {
    return "Nem található kamera. Használd a fájl feltöltést.";
  }
  if (name === "NotReadableError") {
    return "A kamera foglalt vagy nem olvasható. Zárd be a másik alkalmazást, majd próbáld újra.";
  }
  if (name === "OverconstrainedError") {
    return "A kamera nem támogatja a kért beállításokat. Próbáld újra, vagy használd a Fájl / galéria gombot.";
  }
  if (name === "SecurityError") {
    return "A kamera biztonsági okból nem érhető el. Használj HTTPS-t vagy a Fájl / galéria gombot.";
  }
  if (name === "AbortError") {
    return "A kamera indítása megszakadt. Próbáld újra.";
  }
  const msg = String(err?.message ?? err ?? "");
  if (msg.includes("HTTPS") || msg.includes("secure")) {
    return msg;
  }
  return msg || "Ismeretlen kamera hiba";
}

export function stopMediaStream(stream) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function prepareVideoElement(video) {
  if (!video) return;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("autoplay", "");
  video.muted = true;
}

export async function requestUserCamera() {
  if (!window.isSecureContext) {
    throw new Error(
      "A kamera csak HTTPS vagy localhost környezetben érhető el.",
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("A böngésző nem támogatja a kamerát. Használd a Fájl / galéria gombot.");
  }

  let lastError = null;
  for (const constraints of CAMERA_CONSTRAINT_ATTEMPTS) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
      if (isRetryableConstraintError(err)) {
        continue;
      }
      throw err;
    }
  }

  const byDevice = await requestUserCameraByDeviceId();
  if (byDevice) return byDevice;

  throw lastError ?? new Error("Nem sikerült elindítani a kamerát.");
}

export async function attachCameraStream(video, stream) {
  if (!video || !stream) {
    throw new Error("Hiányzó video elem vagy kamera stream.");
  }
  prepareVideoElement(video);
  video.srcObject = stream;
  try {
    await video.play();
    await waitForVideoPlaying(video);
    await waitForVideoFrame(video, 8000);
  } catch (err) {
    throw new Error(
      `A kamera előnézet nem indítható: ${cameraErrorMessage(err)}`,
    );
  }
}

export function waitForVideoFrame(video, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (!video) {
      reject(new Error("Hiányzó video elem."));
      return;
    }
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      resolve(null);
      return;
    }

    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("resize", onReady);
      window.clearTimeout(timer);
      fn();
    };

    const onReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        finish(() => resolve(null));
      }
    };

    const timer = window.setTimeout(() => {
      finish(() =>
        reject(new Error("A kamera képe nem érkezett meg időben. Próbáld újra.")),
      );
    }, timeoutMs);

    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("resize", onReady);
    onReady();
  });
}

export async function captureVideoFrame(video, canvas, { mirror = false, quality = 0.92 } = {}) {
  await waitForVideoFrame(video);
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) {
    throw new Error("A kamera képe üres. Próbáld újra a felvételt.");
  }
  if (!canvas) {
    throw new Error("Hiányzó canvas elem.");
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Nem sikerült a rajzolófelület létrehozása.");
  }
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Nem sikerült a képet menteni."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

export const INSECURE_CAMERA_HINT =
  "Élő kamera csak HTTPS-en vagy localhoston. Használd a Fájl / galéria gombot (közvetlenül megnyitja a tablet kameráját).";

export function isCoarsePointer() {
  return window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
}

export function applyInsecureCameraUx({
  startButton,
  hintEl,
  filePickButton,
  hintText = INSECURE_CAMERA_HINT,
}) {
  if (window.isSecureContext) return;
  if (startButton) startButton.disabled = true;
  if (hintEl) {
    hintEl.hidden = false;
    hintEl.textContent = hintText;
    hintEl.classList.add("camera-hint--warn");
  }
  if (filePickButton && isCoarsePointer()) {
    filePickButton.classList.add("btn-cta");
  }
}
