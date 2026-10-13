(() => {
  "use strict";
  document.addEventListener("sempai:go-request", async (event) => {
    let request;
    try {
      request = JSON.parse(event.detail);
    } catch {
      return;
    }
    if (typeof request?.id !== "string" || typeof request.url !== "string")
      return;
    let result;
    try {
      result = await chrome.runtime.sendMessage({
        type: "sempai-go",
        url: request.url,
      });
    } catch {
      result = { ok: false, code: "E_EXTENSION_RELOAD" };
    }
    document.dispatchEvent(
      new CustomEvent("sempai:go-response", {
        detail: JSON.stringify({ id: request.id, ...result }),
      }),
    );
  });
})();
