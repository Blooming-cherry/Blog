# Blog Mobile Crash Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop mobile browser termination by preventing hidden desktop effects from loading on mobile and by making their PJAX lifecycle singleton.

**Architecture:** Keep the existing Hexo/NexT integration and introduce one shared desktop-capability gate in `body-end.swig`. A real Edge/CDP regression runner serves the generated site locally, validates mobile resource absence, and validates desktop singleton behavior across PJAX transitions.

**Tech Stack:** Hexo 8, Swig injection template, browser JavaScript, Node.js 24, Microsoft Edge CDP, Node built-in `node:assert` and `node:http`.

**Spec:** `docs/superpowers/specs/2026-09-18-mobile-crash-remediation.md`

## Global Constraints

- Preserve the three existing user modifications under `technical/source/_posts/`; never stage, restore, or rewrite them.
- Preserve mini-player controls, saved state, and `/audio/` routing while moving source assignment and resume-time restoration behind an explicit play gesture.
- Mobile/coarse-pointer clients load no Live2D or mouse-trail runtime.
- Desktop/fine-pointer clients retain exactly one Live2D and one mouse-trail instance across PJAX.
- Do not reload nginx, restart PM2, alter credentials, or expose repository secrets.
- Do not change `/prose/` or claim its separate Three.js mobile performance has been repaired.
- Stage and commit only the remediation files named by this plan.

---

### Task 1: Add the failing real-browser regression test

**Files:**
- Create: `technical/tools/check-mobile-runtime.mjs`
- Modify: `technical/package.json`

**Interfaces:**
- Consumes: generated `technical/public/` and installed Microsoft Edge at the standard Windows path.
- Produces: `npm run check:mobile-runtime`, exiting 0 only when mobile effects are absent and desktop effects remain singleton through PJAX.

- [ ] **Step 1: Add the runtime check entry point**

Add this script to `technical/package.json`:

```json
"check:mobile-runtime": "node tools/check-mobile-runtime.mjs"
```

Create `technical/tools/check-mobile-runtime.mjs` using only Node built-ins. It must:

```js
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
```

The runner serves `public/`, launches Edge hidden with a temporary profile and a random CDP port, and executes two profiles:

```js
const mobile = {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
};

const desktop = {
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'
};
```

For each profile, seed `localStorage.vs` with the literal returning-user state `{i:0,t:12,p:true}` before site scripts execute. Then collect request URLs and evaluate this observable state before navigation, after clicking the first `.post-title-link`, and after clicking `.site-title` to return home:

```js
({
  waifus: document.querySelectorAll('#waifu').length,
  live2dCanvases: document.querySelectorAll('#live2d').length,
  mouseTrails: document.querySelectorAll('#mouseTrail').length
})
```

Use these literal assertions:

```js
assert.deepEqual(mobileStates, [
  { waifus: 0, live2dCanvases: 0, mouseTrails: 0 },
  { waifus: 0, live2dCanvases: 0, mouseTrails: 0 },
  { waifus: 0, live2dCanvases: 0, mouseTrails: 0 }
]);
assert.equal(mobileLive2dRequests.length, 0);
assert.equal(mobileAudioRequests.length, 0);

for (const state of desktopStates) {
  assert.deepEqual(state, { waifus: 1, live2dCanvases: 1, mouseTrails: 1 });
}
assert.equal(desktopLive2dRequests.length, 1);
assert.equal(desktopAudioRequests.length, 0);
```

Also assert that the player has no `src` through both PJAX transitions. With the local WAV fixture, one play click must assign `/audio/125042`, resume at 12 seconds, and issue a media request; a subsequent paused track change must update the selected index without assigning or requesting the next source.

- [ ] **Step 2: Generate the current site**

Run: `npm run build`

Expected: Hexo generation exits 0. The pre-existing malformed `DeepSeek_V4_Pro_0813_报告.md` warning may remain nonfatal and is outside this fix.

- [ ] **Step 3: Verify the regression test fails for the current bug**

Run: `npm run check:mobile-runtime`

Expected: FAIL because the mobile initial state contains one hidden `#waifu`, one 800 × 800 `#live2d`, and one `#mouseTrail`; subsequent PJAX states increase Live2D instances; and an upstream WAV response begins before play.

### Task 2: Gate and de-duplicate desktop effects

**Files:**
- Modify: `technical/source/_data/body-end.swig`
- Modify: `technical/source/js/siren-url-loader.js`
- Test: `technical/tools/check-mobile-runtime.mjs`

**Interfaces:**
- Consumes: the exact media query and six browser-global idempotency flags defined by the spec.
- Produces: desktop-only, PJAX-idempotent Live2D and mouse-trail initialization.
- Produces: lazy mini-player media loading that starts only after explicit play.

- [ ] **Step 1: Establish the shared capability gate**

Before the Live2D hooks, assign the shared flag exactly once per rendered body fragment:

```js
window.__blogDesktopEffectsEnabled = Boolean(
  window.matchMedia &&
  window.matchMedia('(min-width: 769px) and (hover: hover) and (pointer: fine)').matches
);
```

- [ ] **Step 2: Make Live2D hooks and loader desktop-only and singleton**

Remove the unconditional static `live2d.min.js` and `waifu.css` tags. At the start of the fetch/console hook and Live2D audio-hook IIFEs, return on mobile or an existing hook, then set their singleton flags.

At the start of the widget-loader IIFE, return on mobile or an existing widget, then set `window.__blogLive2dInitialized = true`. Inject one stylesheet with id `blog-live2d-style`, load only `waifu-tips.js`, and keep `cubism2Path` in the existing `initWidget` options so the widget loads the runtime exactly once.

- [ ] **Step 3: Make mouse trail desktop-only and singleton**

Keep the existing PJAX rebind behavior. On mobile, remove the newly rendered `#mouseTrail` canvas and return. On desktop, return if `window.__blogMouseTrailInitialized` already exists; otherwise set it and start the existing draw loop. This leaves the original loop responsible for rebinding to the replacement canvas after `pjax:success`.

- [ ] **Step 4: Stop the mini-player's eager WAV request**

Immediately after `var audio = new Audio();`, set `audio.preload = 'none'`. Do not assign `audio.src` from initialization or from a paused track change. Immediately before the first user-initiated `audio.play()` in `toggle()`, set `audio.preload = 'auto'`, resolve the current `/audio/<cid>` source, and restore the saved time after metadata is available. Remove initialization-time autoplay when saved `p` is true: retain saved track index and time, but require a fresh play gesture.

- [ ] **Step 5: Guard the remaining PJAX re-entry paths**

Guard the footer-credit PJAX listener and the music metadata loader with window-level singleton flags. The runtime check must prove listener registrations stay flat and `music.json` is requested once across both transitions.

- [ ] **Step 6: Verify GREEN**

Run:

```text
npm run build
npm run check:mobile-runtime
```

Expected: both exit 0; the runtime test reports three mobile zero-effect states, three desktop singleton states, and no media request before play in either profile.

- [ ] **Step 7: Review the scoped diff**

Run: `git diff --check`

Run: `git status --short`

Expected: only the three pre-existing post edits plus this plan/spec, `technical/package.json`, `technical/tools/check-mobile-runtime.mjs`, `technical/source/_data/body-end.swig`, and `technical/source/js/siren-url-loader.js` appear. The post edits remain unstaged.

### Task 3: Deploy and verify production

**Files:**
- Create outside the repository: `C:\Users\admin\Desktop\blog-mobile-server-readonly-check.md`

**Interfaces:**
- Consumes: the existing `Deploy Hexo Blog` workflow and public production URL.
- Produces: a deployed fix, public mobile runtime evidence, and an optional secret-free server log checklist.

- [ ] **Step 1: Commit only remediation files**

Stage these paths only:

```text
docs/superpowers/specs/2026-09-18-mobile-crash-remediation.md
docs/superpowers/plans/2026-09-18-mobile-crash-remediation.md
technical/package.json
technical/tools/check-mobile-runtime.mjs
technical/source/_data/body-end.swig
technical/source/js/siren-url-loader.js
```

Commit message:

```text
fix: stop mobile Live2D resource leak
```

- [ ] **Step 2: Push and wait for the existing workflow**

Push the remediation commit to `origin/main`, then use `D:\gh-portable\bin\gh.exe` to wait for its `Deploy Hexo Blog` run. Do not touch the three post edits.

- [ ] **Step 3: Verify production with the real mobile runtime check**

Run the same CDP assertions against `https://blog.adaydream.cn/`. Expected: mobile has zero desktop effects across two PJAX transitions; desktop remains singleton.

- [ ] **Step 4: Create the optional authenticated-server checklist**

Write a Markdown document that contains only read-only commands for the user to run after SSH login: inspect the active vhost paths, hash/stat `/var/www/blog/index.html`, and filter recent access/error logs for mobile UA plus 499/5xx. Explicitly state that no restart or reload is required and that output must be redacted for IPs, usernames, cookies, tokens, and query strings before sharing.

### Task 4: Publish a Claude Code-authored repair log after production passes

**Files:**
- Create: `technical/source/vibecoding/2026-09-18-blog-mobile-crash-remediation.md`
- Modify: `technical/source/vibecoding/index.md`

**Interfaces:**
- Consumes: a redacted, public-only evidence packet containing the production verification results and fix commit.
- Produces: an accurate public post in the Vibe Coding index, followed by a second successful Hexo deployment.

- [ ] **Step 1: Stage a public-only Claude Code input outside the repository**

Create a temporary working directory under `C:\Users\admin` containing only a Markdown brief with: the public URL, confirmed Live2D/PJAX/mouse-trail/audio evidence, the implemented behavior, local and production test results, and the fix commit. Exclude private post contents, credentials, SSH metadata, secrets, unrelated diffs, and server identifiers.

- [ ] **Step 2: Ask local Claude Code to draft the article**

Run the local Claude Code CLI from that temporary directory using the configured Pro route (`--model opus`, mapped locally to `deepseek-v4-pro`). Ask it to output one complete Hexo Markdown article with this front matter:

```yaml
---
title: 2026-09-18-blog-mobile-crash-remediation
date: 2026-09-18
layout: page
comments: false
---
```

The article must distinguish confirmed facts from device-dependent inference, describe RED/GREEN verification, state that no nginx restart was needed, and explicitly limit its claim to the Hexo main site rather than `/prose/`.

- [ ] **Step 3: Review and integrate the draft**

Verify every number and claim against current evidence. Copy the approved draft to `technical/source/vibecoding/2026-09-18-blog-mobile-crash-remediation.md` and add a dated top entry to `technical/source/vibecoding/index.md` linking `2026-09-18-blog-mobile-crash-remediation.html`.

- [ ] **Step 4: Build, commit, push, and verify the article**

Run `npm run build`, then stage only the new article and index change. Commit with `docs: add mobile crash remediation log`, push to `origin/main`, wait for `Deploy Hexo Blog`, and verify the public article URL returns 200 with the expected title and scope statement.
