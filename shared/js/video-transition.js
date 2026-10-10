(function (global) {
  "use strict";

  const DEFAULT_THRESHOLD_SECONDS = 10;

  function createId(prefix) {
    const random =
      typeof global.crypto?.randomUUID === "function"
        ? global.crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    return prefix + "-" + random;
  }

  function createVideoTransition(options) {
    options = options || {};
    const threshold =
      Number.isFinite(Number(options.thresholdSeconds)) && Number(options.thresholdSeconds) > 0
        ? Number(options.thresholdSeconds)
        : DEFAULT_THRESHOLD_SECONDS;
    const owner = options.owner !== false;
    const publishEvent = typeof options.publishEvent === "function" ? options.publishEvent : function () {};
    const clearNext = typeof options.clearNext === "function" ? options.clearNext : function () {};
    const setLoop = typeof options.setLoop === "function" ? options.setLoop : function () {};
    const switchTo = typeof options.switchTo === "function" ? options.switchTo : function () {
      return Promise.reject(new Error("Nincs átmeneti lejátszási művelet."));
    };

    const state = {
      current: "",
      next: "",
      playbackId: createId("run"),
      warningSent: false,
      switchInProgress: false,
      active: false,
      paused: true,
      seeking: false,
      duration: NaN,
      currentTime: 0,
    };

    function eventId() {
      return createId("event");
    }

    function emit(type, fields) {
      if (!owner) return;
      publishEvent({
        event: type,
        eventId: eventId(),
        playbackId: state.playbackId,
        ...fields,
      });
    }

    function remainingSeconds() {
      if (!Number.isFinite(state.duration) || state.duration <= 0) return NaN;
      return state.duration - state.currentTime;
    }

    function warnIfReady() {
      const remaining = remainingSeconds();
      if (
        !owner ||
        !state.active ||
        state.paused ||
        state.seeking ||
        state.switchInProgress ||
        state.warningSent ||
        !state.next ||
        !Number.isFinite(remaining) ||
        remaining <= 0 ||
        remaining > threshold
      ) {
        return false;
      }
      state.warningSent = true;
      emit("ending_soon", {
        message:
          state.current +
          " will end in approximately " +
          threshold +
          " seconds and switch to " +
          state.next,
        current: state.current,
        next: state.next,
        remainingSeconds: Number(remaining.toFixed(3)),
      });
      return true;
    }

    function setCurrent(filename) {
      state.current = String(filename || "").trim();
      state.playbackId = createId("run");
      state.warningSent = false;
      state.switchInProgress = false;
      state.currentTime = 0;
      state.duration = NaN;
    }

    function setActive(active) {
      state.active = Boolean(active);
      if (!state.active) state.paused = true;
    }

    function setNext(filename) {
      const value = String(filename || "").trim();
      const previous = state.next;
      state.next = value;
      if (owner) setLoop(!Boolean(value));
      if (previous && !value) {
        emit("switch_cancelled", {
          message: "The scheduled switch was cancelled.",
          current: state.current,
          previousNext: previous,
        });
      } else if (previous && value && previous !== value) {
        state.warningSent = false;
        emit("ending_soon", {
          message:
            state.current +
            " will end in approximately " +
            threshold +
            " seconds and switch to " +
            value,
          current: state.current,
          next: value,
          remainingSeconds: Number.isFinite(remainingSeconds())
            ? Number(Math.max(0, remainingSeconds()).toFixed(3))
            : null,
          updated: true,
        });
      }
      warnIfReady();
    }

    function updatePlayback(meta) {
      meta = meta || {};
      if (meta.duration !== undefined) state.duration = Number(meta.duration);
      if (meta.currentTime !== undefined) state.currentTime = Number(meta.currentTime);
      if (meta.paused !== undefined) state.paused = Boolean(meta.paused);
      if (meta.seeking !== undefined) state.seeking = Boolean(meta.seeking);
      return warnIfReady();
    }

    function restart() {
      state.playbackId = createId("run");
      state.warningSent = false;
      state.switchInProgress = false;
    }

    async function ended() {
      if (!owner || !state.next || state.switchInProgress) return false;
      const previous = state.current;
      const next = state.next;
      state.next = "";
      state.switchInProgress = true;
      setLoop(false);
      clearNext();
      try {
        await switchTo(next);
        setCurrent(next);
        state.active = true;
        state.paused = false;
        emit("switched", {
          message: "Now playing " + next,
          current: next,
          previous: previous,
        });
        return true;
      } catch (error) {
        state.switchInProgress = false;
        setLoop(true);
        emit("switch_failed", {
          message: "Failed to switch to " + next,
          current: previous,
          next: next,
          error: String(error && error.message ? error.message : error),
        });
        return false;
      }
    }

    return {
      DEFAULT_THRESHOLD_SECONDS,
      state,
      remainingSeconds,
      setCurrent,
      setActive,
      setNext,
      updatePlayback,
      restart,
      ended,
    };
  }

  global.NanoportalVideoTransition = {
    DEFAULT_THRESHOLD_SECONDS,
    createVideoTransition,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      DEFAULT_THRESHOLD_SECONDS,
      createVideoTransition,
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
