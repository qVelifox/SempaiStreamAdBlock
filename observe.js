(() => {
  "use strict";
  const records = [];
  const automatic = new WeakSet();
  let hooked;

  function summarize(value) {
    if (
      value === null ||
      typeof value === "boolean" ||
      typeof value === "number"
    )
      return value;
    if (typeof value === "string") {
      if (
        /^E_[A-Z0-9_]{1,64}$/.test(value) ||
        /^(cooldown|pending|denied|blocked|ok|success|failed|unauthorized|expired|ad_not_ready)$/i.test(
          value,
        )
      )
        return value;
      return { type: "string", length: value.length };
    }
    if (typeof value === "object") {
      const result = { type: Array.isArray(value) ? "array" : "object" };
      for (const key of ["ok", "success"]) {
        if (typeof value[key] === "boolean") result[key] = value[key];
      }
      if (typeof value.code === "number" || typeof value.code === "string")
        result.code = summarize(value.code);
      return result;
    }
    return { type: typeof value };
  }

  function attach() {
    if (hooked || typeof window.fetch !== "function") return;
    const original = window.fetch;
    hooked = function (input, options) {
      const watched = [];
      try {
        const url = new URL(
          typeof input === "string" || input instanceof URL ? input : input.url,
          location.href,
        );
        if (
          url.origin === location.origin &&
          url.pathname === "/livewire/update" &&
          !automatic.has(options) &&
          typeof options?.body === "string"
        ) {
          const payload = JSON.parse(options.body);
          for (const component of payload.components || []) {
            const sent = JSON.parse(component.snapshot);
            if (
              sent.memo?.name !== "ad-gate" ||
              !component.calls?.some((call) => call.method === "adClicked")
            )
              continue;
            const record = {
              source: "site",
              sentDone: sent.data?.done,
              sentRequired: sent.data?.required,
            };
            records.push(record);
            if (records.length > 10) records.shift();
            watched.push({ record, id: sent.memo.id, checksum: sent.checksum });
          }
        }
      } catch {}
      const started = Date.now();
      const promise = original.call(this, input, options);
      if (watched.length) {
        promise
          .then((response) => {
            for (const { record } of watched) {
              record.http = response.status;
              record.responseMs = Date.now() - started;
            }
            return response
              .clone()
              .json()
              .then((payload) => {
                for (const component of payload.components || []) {
                  const snapshot = JSON.parse(component.snapshot);
                  for (const { record, id, checksum } of watched) {
                    if (snapshot.memo?.id !== id) continue;
                    record.receivedDone = snapshot.data?.done;
                    record.receivedRequired = snapshot.data?.required;
                    record.unlocked = snapshot.data?.unlocked;
                    record.signatureChanged = checksum !== snapshot.checksum;
                    record.effects = Object.keys(component.effects || {});
                    record.returns = (component.effects?.returns || []).map(
                      summarize,
                    );
                  }
                }
              });
          })
          .catch(() => {
            for (const { record } of watched)
              record.code = "E_SITE_OBSERVE_FAILED";
          });
      }
      return promise;
    };
    window.fetch = hooked;
  }
  globalThis.SempaiObserve = Object.freeze({
    attach,
    summarize,
    automatic: (options) => automatic.add(options),
    records: () => records.map((record) => ({ ...record })),
  });
  attach();
})();
