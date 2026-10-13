(() => {
  "use strict";
  const SUCCESS_KEY = "sempai-auto-gate:success-until";
  const SUCCESS_MS = 1400;
  const ENTER_MS = 260;
  const RESIZE_MS = 320;
  const EXIT_MS = 200;
  const EASE = "cubic-bezier(.22,1,.36,1)";
  let host;
  let box;
  let content;
  let label;
  let icon;
  let presenceAnimation;
  let widthAnimation;
  let contentAnimation;
  let ghost;
  let dismissTimer;
  let removeTimer;
  const reducedMotion = () =>
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clearTimers() {
    clearTimeout(dismissTimer);
    clearTimeout(removeTimer);
  }

  function mount() {
    if (host?.isConnected) return;
    host = document.createElement("div");
    host.id = "sempai-auto-gate";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          position: fixed;
          z-index: 2147483647;
          left: 50%;
          bottom: max(24px, env(safe-area-inset-bottom));
          transform: translate(-50%, 0);
          opacity: 1;
          pointer-events: none;
          color-scheme: dark;
        }
        .toast {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          min-width: 74px;
          max-width: calc(100vw - 32px);
          overflow: hidden;
          padding: 10px 16px;
          border: 0;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.68);
          color: #f5f5f5;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
          font:
            500 13px/20px system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
          -webkit-font-smoothing: antialiased;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .content {
          display: flex;
          flex: none;
          align-items: center;
          gap: 9px;
          width: max-content;
        }
        .ghost {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
        }
        svg {
          flex: none;
          width: 18px;
          height: 18px;
          color: #4ade80;
        }
        svg[hidden] {
          display: none;
        }
        :host([data-state="error"]) .toast {
          color: #fca5a5;
        }
      </style>
      <div class="toast" role="status" aria-live="polite" aria-atomic="true">
        <div class="content">
          <svg hidden viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="9" fill="currentColor" fill-opacity=".16" />
            <path
              d="m6 10 2.5 2.5L14 7"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span></span>
        </div>
      </div>
    `;
    box = shadow.querySelector(".toast");
    content = shadow.querySelector(".content");
    label = shadow.querySelector("span");
    icon = shadow.querySelector("svg");
    document.documentElement.append(host);
  }

  function reveal(fresh) {
    if (!fresh && host.dataset.visible === "true") return;
    const style = getComputedStyle(host);
    const from = fresh
      ? { opacity: 0, transform: "translate(-50%, 8px) scale(.97)" }
      : { opacity: style.opacity, transform: style.transform };
    presenceAnimation?.cancel();
    host.dataset.visible = "true";
    if (!reducedMotion())
      presenceAnimation = host.animate(
        [from, { opacity: 1, transform: "translate(-50%, 0) scale(1)" }],
        { duration: ENTER_MS, easing: EASE },
      );
  }

  function dismiss() {
    clearTimers();
    if (!host) return;
    const exiting = host;
    const style = getComputedStyle(exiting);
    const from = { opacity: style.opacity, transform: style.transform };
    presenceAnimation?.cancel();
    exiting.dataset.visible = "false";
    const duration = reducedMotion() ? 0 : EXIT_MS;
    if (duration)
      presenceAnimation = exiting.animate(
        [from, { opacity: 0, transform: "translate(-50%, 6px) scale(.98)" }],
        { duration, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" },
      );
    removeTimer = setTimeout(() => {
      exiting.remove();
      if (host === exiting) host = null;
    }, duration);
  }

  function show(state, text, duration) {
    clearTimers();
    const fresh = !host?.isConnected;
    mount();
    const oldWidth = parseFloat(getComputedStyle(box).width);
    const changed = label.textContent !== text || host.dataset.state !== state;
    widthAnimation?.cancel();
    contentAnimation?.cancel();
    ghost?.remove();
    ghost = null;
    if (!fresh && changed && !reducedMotion()) {
      ghost = content.cloneNode(true);
      ghost.classList.add("ghost");
      ghost.setAttribute("aria-hidden", "true");
      box.append(ghost);
      const outgoing = ghost;
      outgoing.animate(
        [
          { opacity: 1, transform: "translate(-50%, -50%) translateY(0)" },
          { opacity: 0, transform: "translate(-50%, -50%) translateY(-4px)" },
        ],
        { duration: 140, easing: "ease-out", fill: "forwards" },
      ).onfinish = () => outgoing.remove();
    }
    host.dataset.state = state;
    host.dataset.status = text;
    label.textContent = text;
    icon.toggleAttribute("hidden", state !== "success");
    const newWidth = Math.min(
      Math.max(74, Math.ceil(content.scrollWidth + 32)),
      innerWidth - 32,
    );
    box.style.width = `${newWidth}px`;
    if (!fresh && changed && !reducedMotion()) {
      widthAnimation = box.animate(
        [{ width: `${oldWidth}px` }, { width: `${newWidth}px` }],
        { duration: RESIZE_MS, easing: EASE },
      );
      contentAnimation = content.animate(
        [
          { opacity: 0, transform: "translateY(4px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 220, delay: 70, easing: EASE, fill: "backwards" },
      );
    }
    reveal(fresh);
    if (duration) dismissTimer = setTimeout(dismiss, duration);
  }

  function success(duration = SUCCESS_MS) {
    if (host?.dataset.state === "success") return;
    try {
      sessionStorage.setItem(SUCCESS_KEY, String(Date.now() + duration));
    } catch {}
    show("success", "Unlocked", duration);
  }

  globalThis.SempaiToast = Object.freeze({
    progress(done, required) {
      try {
        sessionStorage.removeItem(SUCCESS_KEY);
      } catch {}
      show("running", `${Math.min(done + 1, required)}/${required}`);
    },
    success,
    complete(done, required) {
      show("stopped", `${done}/${required}`, SUCCESS_MS);
    },
    error(code) {
      show("error", code, 4000);
    },
    dismiss,
    dismissProgress() {
      if (host?.dataset.state === "running") dismiss();
    },
  });

  try {
    const remaining = Number(sessionStorage.getItem(SUCCESS_KEY)) - Date.now();
    sessionStorage.removeItem(SUCCESS_KEY);
    if (remaining > 0 && remaining <= SUCCESS_MS) success(remaining);
  } catch {}
})();
