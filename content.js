(() => {
  "use strict";
  if (window.__sempaiGateLoaded) return;
  window.__sempaiGateLoaded = true;

  const VERSION = "1.5.2";
  const toast = window.SempaiToast;
  let enabled = true;
  let generation = 0;
  let pending = false;
  let lastUrl = location.href;
  let currentKey = null;
  const processed = new Set();
  let reloadRequired = false;
  let diagnostics = {
    version: VERSION,
    transport: "go-navigation",
    attempts: 0,
  };

  function report(kind, message) {
    diagnostics.status = message;
    const progress = /^RUNNING (\d+)\/(\d+)$/.exec(message);
    if (progress) toast.progress(Number(progress[1]), Number(progress[2]));
    else if (kind === "success") toast.success();
    else if (message === "GATE_COMPLETE")
      toast.complete(diagnostics.done, diagnostics.required);
    else if (kind === "error") {
      toast.error(message);
      console.warn("[Sempai Stream NoAds]", { ...diagnostics });
    }
  }

  window.SempaiAutoGate = Object.freeze({
    debug: () =>
      JSON.parse(
        JSON.stringify({
          ...diagnostics,
          siteRequests: window.SempaiObserve.records(),
        }),
      ),
    pause() {
      enabled = false;
      generation++;
      toast.dismiss();
    },
    resume() {
      enabled = true;
      if (currentKey) processed.delete(currentKey);
      scan();
    },
    retry() {
      if (pending || !enabled || reloadRequired) return;
      if (currentKey) processed.delete(currentKey);
      scan();
    },
  });

  async function scan() {
    window.SempaiObserve.attach();
    if (lastUrl !== location.href) {
      generation++;
      lastUrl = location.href;
      currentKey = null;
      toast.dismissProgress();
    }
    if (!location.pathname.startsWith("/watch/")) {
      toast.dismissProgress();
      return;
    }
    if (!enabled || pending || reloadRequired) return;
    const roots = document.querySelectorAll("[wire\\:snapshot]");
    for (const root of roots) {
      let snapshot;
      try {
        snapshot = JSON.parse(root.getAttribute("wire:snapshot"));
      } catch {
        continue;
      }
      if (snapshot?.memo?.name !== "ad-gate") continue;
      const id = root.getAttribute("wire:id");
      const wire = window.Livewire?.find(id);
      if (!wire || typeof wire.$call !== "function") continue;
      currentKey = `${location.href}|${id}|${snapshot.data?.passId}`;
      if (processed.has(currentKey)) return;
      processed.add(currentKey);
      const runGeneration = generation;
      const runUrl = location.href;
      const active = () =>
        enabled &&
        generation === runGeneration &&
        location.href === runUrl &&
        root.isConnected;
      pending = true;
      diagnostics = {
        version: VERSION,
        transport: "go-navigation",
        attempts: 0,
      };
      try {
        const transport = window.SempaiFlow.create(
          wire,
          root,
          diagnostics,
          active,
          report,
        );
        const initial = window.SempaiGate.read(transport);
        diagnostics.done = initial.done;
        diagnostics.required = initial.required;
        await window.SempaiGate.run({
          wire: transport,
          active,
          report,
          timeout: 90000,
        });
      } catch (error) {
        const code = /^E_[A-Z0-9_]+$/.test(error.message)
          ? error.message
          : "E_REQUEST_FAILED";
        const wasActive = active();
        if (code === "E_REQUEST_TIMEOUT") {
          reloadRequired = true;
          generation++;
        }
        if (wasActive) report("error", code);
      } finally {
        pending = false;
      }
      return;
    }
    if (!pending) toast.dismissProgress();
  }

  document.addEventListener("livewire:initialized", scan);
  document.addEventListener("livewire:navigated", scan);
  setInterval(scan, 1000);
  scan();
})();
