/** Fullscreen video + looping background audio for display / v2 screen layers. */

function asObject(v) {
  return typeof v === "object" && v !== null ? v : {};
}

/**
 * @param {{ video?: string, audio?: string }} media
 * @param {{ videoEl: HTMLVideoElement|null, audioEl: HTMLAudioElement|null }} els
 */
export function applyScreenMedia(media, { videoEl, audioEl }) {
  const m = asObject(media);
  const bgVideo = String(m.video ?? "").trim();
  const bgAudio = String(m.audio ?? "").trim();

  if (videoEl) {
    const next = bgVideo ? `/shared/assets/video/${encodeURIComponent(bgVideo)}` : "";
    if (next) {
      if (videoEl.getAttribute("data-src") !== next) {
        videoEl.setAttribute("data-src", next);
        videoEl.src = next;
        videoEl.poster = "/shared/assets/images/poster_placeholder.svg";
        void videoEl.play().catch(() => {});
      }
    } else {
      videoEl.removeAttribute("data-src");
      videoEl.removeAttribute("src");
      videoEl.poster = "/shared/assets/images/poster_placeholder.svg";
    }
  }

  if (audioEl) {
    const next = bgAudio ? `/shared/assets/audio/${encodeURIComponent(bgAudio)}` : "";
    if (next) {
      if (audioEl.getAttribute("data-src") !== next) {
        audioEl.setAttribute("data-src", next);
        audioEl.src = next;
        audioEl.loop = true;
        void audioEl.play().catch(() => {});
      }
    } else {
      audioEl.removeAttribute("data-src");
      audioEl.removeAttribute("src");
      audioEl.pause();
    }
  }
}

/**
 * @param {Record<string, unknown>} state
 * @param {{ videoEl: HTMLVideoElement|null, audioEl: HTMLAudioElement|null }} els
 */
export function applyDisplayMedia(state, { videoEl, audioEl }) {
  const display = asObject(state.display);
  applyScreenMedia(
    {
      video: display.background_video,
      audio: display.background_audio,
    },
    { videoEl, audioEl },
  );
}
