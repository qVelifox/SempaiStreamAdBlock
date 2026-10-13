(() => {
  "use strict";
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function registerOpening(url) {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const receive = (event) => {
        let response;
        try {
          response = JSON.parse(event.detail);
        } catch {
          return;
        }
        if (response.id !== id) return;
        clearTimeout(timer);
        document.removeEventListener("sempai:go-response", receive);
        response.ok
          ? resolve()
          : reject(new Error(response.code || "E_GO_FAILED"));
      };
      const timer = setTimeout(() => {
        document.removeEventListener("sempai:go-response", receive);
        reject(new Error("E_GO_BRIDGE_TIMEOUT"));
      }, 15000);
      document.addEventListener("sempai:go-response", receive);
      document.dispatchEvent(
        new CustomEvent("sempai:go-request", {
          detail: JSON.stringify({ id, url }),
        }),
      );
    });
  }

  function create(wire, root, diagnostics, active, report) {
    diagnostics.requests = [];
    const state = () => JSON.parse(wire.__instance.snapshotEncoded).data;
    return {
      $get: (key) => state()[key],
      async $call() {
        const link = root.querySelector("#adgate-continue");
        if (!link?.href) throw new Error("E_AD_LINK_MISSING");
        await registerOpening(link.href);
        if (!active()) return;
        for (let retry = 0; retry < 5 && active(); retry++) {
          const sent = state();
          const started = Date.now();
          const record = {
            attempt: ++diagnostics.attempts,
            sentDone: sent.done,
            sentRequired: sent.required,
            goNavigation: true,
            externalBlocking: "enabled",
          };
          diagnostics.requests.push(record);
          const result = await wire.$call("adClicked");
          const received = state();
          record.receivedDone = received.done;
          record.receivedRequired = received.required;
          record.unlocked = received.unlocked;
          record.responseMs = Date.now() - started;
          record.ok = result?.ok;
          record.reason =
            typeof result?.reason === "string" &&
            /^[a-z_]{1,40}$/.test(result.reason)
              ? result.reason
              : null;
          diagnostics.done = received.done;
          diagnostics.required = received.required;
          diagnostics.unlocked = received.unlocked;
          if (result?.ok) {
            if (received.unlocked && active()) report("success", "UNLOCKED");
            return;
          }
          if (result?.reason === "too_fast" || result?.reason === "busy") {
            const wait = result.reason === "busy" ? 5 : Number(result.wait);
            if (!Number.isFinite(wait) || wait < 0 || wait > 60)
              throw new Error("E_GATE_WAIT");
            record.waitSeconds = wait;
            report("running", `WAITING ${wait}s`);
            const until = Date.now() + wait * 1000 + 400;
            while (active() && Date.now() < until)
              await sleep(Math.min(200, until - Date.now()));
            continue;
          }
          throw new Error(
            result?.reason === "not_opened"
              ? "E_GO_NOT_REGISTERED"
              : result?.reason === "expired"
                ? "E_GATE_EXPIRED"
                : "E_GATE_REJECTED",
          );
        }
        if (active()) throw new Error("E_GATE_RETRY_LIMIT");
      },
    };
  }
  globalThis.SempaiFlow = Object.freeze({ create });
})();
