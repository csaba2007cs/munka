import assert from "node:assert/strict";
import { createVideoTransition } from "../shared/js/video-transition.js";

function createHarness(options = {}) {
  const events = [];
  const loops = [];
  let cleared = 0;
  let switchResult = options.switchResult || Promise.resolve();
  const controller = createVideoTransition({
    owner: options.owner !== false,
    publishEvent: (event) => events.push(event),
    clearNext: () => {
      cleared += 1;
    },
    setLoop: (enabled) => loops.push(enabled),
    switchTo: async (filename) => {
      if (options.switchTo) return options.switchTo(filename);
      await switchResult;
    },
  });
  return { controller, events, loops, get cleared() { return cleared; } };
}

async function testWarnsFromPlaybackPosition() {
  const h = createHarness();
  h.controller.setCurrent("a.mp4");
  h.controller.setActive(true);
  h.controller.setNext("b.mp4");
  h.controller.updatePlayback({ duration: 100, currentTime: 89, paused: false });
  assert.equal(h.events.length, 0);
  h.controller.updatePlayback({ duration: 100, currentTime: 90.2, paused: false });
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].event, "ending_soon");
  assert.equal(h.events[0].current, "a.mp4");
  assert.equal(h.events[0].next, "b.mp4");
  assert.equal(h.events[0].eventId.startsWith("event-"), true);
  h.controller.updatePlayback({ duration: 100, currentTime: 91, paused: false });
  assert.equal(h.events.length, 1);
}

async function testPauseDoesNotWarnEarly() {
  const h = createHarness();
  h.controller.setCurrent("a.mp4");
  h.controller.setActive(true);
  h.controller.setNext("b.mp4");
  h.controller.updatePlayback({ duration: 100, currentTime: 91, paused: true });
  assert.equal(h.events.length, 0);
  h.controller.updatePlayback({ duration: 100, currentTime: 91, paused: false });
  assert.equal(h.events.length, 1);
}

async function testSeekRequiresResume() {
  const h = createHarness();
  h.controller.setCurrent("a.mp4");
  h.controller.setActive(true);
  h.controller.setNext("b.mp4");
  h.controller.updatePlayback({ duration: 100, currentTime: 95, paused: false, seeking: true });
  assert.equal(h.events.length, 0);
  h.controller.updatePlayback({ duration: 100, currentTime: 95, paused: false, seeking: false });
  assert.equal(h.events.length, 1);
}

async function testSwitchAndClearNext() {
  const h = createHarness();
  h.controller.setCurrent("a.mp4");
  h.controller.setActive(true);
  h.controller.setNext("b.mp4");
  const switched = await h.controller.ended();
  assert.equal(switched, true);
  assert.equal(h.cleared, 1);
  assert.deepEqual(h.events.map((event) => event.event), ["switched"]);
  assert.equal(h.events[0].current, "b.mp4");
  assert.equal(h.events[0].previous, "a.mp4");
  assert.equal(h.controller.state.current, "b.mp4");
  assert.equal(h.controller.state.next, "");
}

async function testFailureDoesNotClaimSwitch() {
  const h = createHarness({
    switchTo: async () => {
      throw new Error("missing");
    },
  });
  h.controller.setCurrent("a.mp4");
  h.controller.setActive(true);
  h.controller.setNext("missing.mp4");
  const switched = await h.controller.ended();
  assert.equal(switched, false);
  assert.deepEqual(h.events.map((event) => event.event), ["switch_failed"]);
  assert.equal(h.events[0].current, "a.mp4");
  assert.equal(h.events[0].next, "missing.mp4");
}

async function testCancellationAndNoNextLoop() {
  const h = createHarness();
  h.controller.setCurrent("a.mp4");
  h.controller.setActive(true);
  h.controller.setNext("b.mp4");
  h.controller.setNext("");
  assert.deepEqual(h.events.map((event) => event.event), ["switch_cancelled"]);
  assert.equal(await h.controller.ended(), false);
  assert.equal(h.loops.at(-1), true);
}

await testWarnsFromPlaybackPosition();
await testPauseDoesNotWarnEarly();
await testSeekRequiresResume();
await testSwitchAndClearNext();
await testFailureDoesNotClaimSwitch();
await testCancellationAndNoNextLoop();
console.log("[OK] video transition behavior");
