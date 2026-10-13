(() => {
  "use strict";
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function read(wire) {
    const get = (key) => wire.$get(key);
    const done = Number(get("done"));
    const required = Number(get("required"));
    if (
      !Number.isInteger(done) ||
      !Number.isInteger(required) ||
      done < 0 ||
      required < 0 ||
      required > 20
    ) {
      throw new Error("E_GATE_STATE");
    }
    return {
      done,
      required,
      unlocked: get("unlocked") === true,
      relayRequired: get("relayObligatoire") === true,
    };
  }

  async function run({ wire, active, report, delay = 0, timeout = 15000 }) {
    let stalled = 0;
    for (let attempt = 0; attempt < 20 && active(); attempt++) {
      const before = read(wire);
      if (before.unlocked) return report("success", "UNLOCKED");
      if (before.done >= before.required) {
        return report("stopped", "GATE_COMPLETE");
      }
      if (before.relayRequired) {
        return report("error", "E_RELAY_REQUIRED");
      }
      report("running", `RUNNING ${before.done}/${before.required}`);
      let timer;
      try {
        await Promise.race([
          wire.$call("adClicked"),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("E_REQUEST_TIMEOUT")),
              timeout,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      if (!active()) return;
      const after = read(wire);
      if (after.unlocked) return report("success", "UNLOCKED");
      stalled = after.done > before.done ? 0 : stalled + 1;
      if (stalled >= 3) {
        return report("error", "E_NO_PROGRESS");
      }
      if (after.done >= after.required) {
        return report("stopped", "GATE_COMPLETE");
      }
      await wait(delay * (stalled + 1));
    }
    if (active()) report("error", "E_ATTEMPT_LIMIT");
  }

  globalThis.SempaiGate = Object.freeze({ read, run });
})();
