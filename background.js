"use strict";

function visit(tabId, url) {
  return new Promise((resolve, reject) => {
    let timer;
    let started = false;
    const finish = (error) => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(updated);
      chrome.tabs.onRemoved.removeListener(removed);
      error ? reject(error) : resolve();
    };
    const updated = (id, change) => {
      if (id !== tabId) return;
      if (change.status === "loading") started = true;
      if (started && change.status === "complete") finish();
    };
    const removed = (id) => {
      if (id === tabId) finish(new Error("E_GO_TAB_CLOSED"));
    };
    chrome.tabs.onUpdated.addListener(updated);
    chrome.tabs.onRemoved.addListener(removed);
    timer = setTimeout(() => finish(new Error("E_GO_TIMEOUT")), 12000);
    chrome.tabs
      .update(tabId, { url })
      .catch(() => finish(new Error("E_GO_NAVIGATION")));
  });
}

const pending = new Set();
const reservedRules = new Set();
async function allocateRules() {
  const existing = new Set(
    (await chrome.declarativeNetRequest.getSessionRules()).map(
      (rule) => rule.id,
    ),
  );
  const ids = [];
  for (let id = 1; ids.length < 2; id++) {
    if (!existing.has(id) && !reservedRules.has(id)) {
      ids.push(id);
      reservedRules.add(id);
    }
  }
  return ids;
}
async function openGate(url, sender) {
  let origin;
  let destination;
  try {
    origin = new URL(sender.url);
    destination = new URL(url);
  } catch {
    throw new Error("E_GO_URL");
  }
  if (
    origin.origin !== "https://senpai-stream.living" ||
    !origin.pathname.startsWith("/watch/") ||
    destination.origin !== origin.origin ||
    !/^\/go\/[a-zA-Z0-9_-]+$/.test(destination.pathname) ||
    destination.search ||
    destination.hash ||
    !sender.tab?.id ||
    sender.frameId !== 0
  )
    throw new Error("E_GO_URL");
  if (pending.has(sender.tab.id)) throw new Error("E_GO_BUSY");
  pending.add(sender.tab.id);
  let tab;
  let ruleIds = [];
  try {
    tab = await chrome.tabs.create({ url: "about:blank", active: false });
    ruleIds = await allocateRules();
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [
        {
          id: ruleIds[0],
          priority: 1,
          action: { type: "block" },
          condition: {
            tabIds: [tab.id],
            excludedRequestDomains: ["senpai-stream.living"],
            resourceTypes: [
              "main_frame",
              "sub_frame",
              "script",
              "stylesheet",
              "image",
              "font",
              "xmlhttprequest",
              "ping",
              "media",
              "websocket",
              "other",
            ],
          },
        },
        {
          id: ruleIds[1],
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              { header: "Referer", operation: "set", value: sender.url },
              {
                header: "Sec-Fetch-Site",
                operation: "set",
                value: "same-origin",
              },
            ],
          },
          condition: {
            tabIds: [tab.id],
            urlFilter: "|https://senpai-stream.living/go/",
            resourceTypes: ["main_frame"],
          },
        },
      ],
    });
    await visit(tab.id, destination.href);
    return { ok: true };
  } finally {
    if (tab) {
      await chrome.tabs.remove(tab.id).catch(() => {});
      if (ruleIds.length)
        await chrome.declarativeNetRequest
          .updateSessionRules({ removeRuleIds: ruleIds })
          .catch(() => {});
    }
    for (const id of ruleIds) reservedRules.delete(id);
    pending.delete(sender.tab.id);
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== "sempai-go") return;
  openGate(message.url, sender)
    .then(respond)
    .catch((error) => {
      globalThis.lastFailure = error.message
        .replace(/https?:\/\/\S+/g, "[url]")
        .slice(0, 300);
      respond({
        ok: false,
        code: /^E_[A-Z_]+$/.test(error.message) ? error.message : "E_GO_FAILED",
      });
    });
  return true;
});
