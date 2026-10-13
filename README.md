# Sempai Stream NoAds

Browser extension that automates the ad gate before a movie or episode on [Senpai Stream](https://senpai-stream.living/).

## Install

1. Open your browser's extensions page (`chrome://extensions`, `brave://extensions`, or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.

## How it works

Each ad link opens in a temporary background tab with external redirects blocked.
The extension then submits the validation through Livewire and repeats until the gate is unlocked.
Server cooldowns still apply.

## Debug

Available in the page's DevTools console:

```js
SempaiAutoGate.debug()
SempaiAutoGate.pause()
SempaiAutoGate.resume()
SempaiAutoGate.retry()
```

Use `copy(SempaiAutoGate.debug())` to copy the diagnostic output.
If a request times out, refresh the page before retrying.
