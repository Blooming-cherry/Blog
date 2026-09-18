# Blog Mobile Crash Remediation Spec

## Problem

`https://blog.adaydream.cn/` can be terminated by mobile browsers after normal in-site navigation. Public HTTP checks are healthy, so the failure must be treated as a client runtime resource leak rather than an nginx availability failure.

This remediation covers the Hexo main site and article routes. `/prose/` is a separately built Three.js application and is not loaded by the main site; its mobile quality policy is outside this fix and must not be described as repaired by the resulting public log.

## Reproduction evidence

- Android mobile emulation at 390 × 844, DPR 3 creates a hidden `#waifu` plus an 800 × 800 `#live2d` canvas on first load even though CSS sets `#waifu { display: none; }`.
- The first mobile load contains two `live2d.min.js` script elements: one static include and one loaded by `initWidget({ cubism2Path })`.
- PJAX navigation is not idempotent. The observed `#live2d` canvas counts were 1 on initial load, 2 after entering a post, and 3 after returning home. `#waifu` instances grew the same way.
- A 30-second mobile CDP comparison measured 3,542,875 encoded resource bytes with Live2D versus 1,046,095 bytes with Live2D blocked. The visible-hidden widget added the 2.33 MB model texture and related runtime/model resources.
- During the 20-second steady-state sample, Live2D enabled consumed 0.486 seconds of script time versus 0.026 seconds with Live2D blocked. No server 5xx or missing homepage dependency explained the failure.
- Independently of Live2D, the mini-player assigns its WAV source during page initialization. With no play action, Edge received a `206` response advertising 63,338,906 bytes and transferred 4,628,523 encoded bytes in 30 seconds before aborting. This is avoidable first-load pressure on mobile devices.

## Required behavior

1. Mobile/coarse-pointer clients must not load Live2D JavaScript, CSS, model files, textures, install its fetch/audio hooks, or create `#waifu` / `#live2d`.
2. Mobile/coarse-pointer clients must not create or animate `#mouseTrail`.
3. Desktop clients at 1280 × 900 with a fine pointer must retain one working Live2D widget and one mouse-trail canvas.
4. Any number of PJAX navigations must keep desktop effects singleton: one `#waifu`, one `#live2d`, one `#mouseTrail`, and one Live2D runtime request.
5. The mini-player must not assign `audio.src` or request `/audio/` / an upstream `.wav` before the user presses play, including when a returning profile has saved `p: true`. Its controls, track list, saved index/time, and `/audio/` routing must otherwise remain unchanged; playback itself does not auto-resume without a new gesture.
6. PJAX navigation must not accumulate page-level listeners or repeat the `music.json` loader within one document lifetime.
7. The user-modified post files must remain untouched.
8. The fix must require no nginx reload, PM2 restart, DNS change, credential change, or server package installation.

## Runtime policy

Desktop-only visual effects are enabled only when this media query matches:

```js
window.matchMedia('(min-width: 769px) and (hover: hover) and (pointer: fine)').matches
```

The browser globals below are the idempotency boundary across PJAX swaps:

```js
window.__blogDesktopEffectsEnabled
window.__blogLive2dHooksInstalled
window.__blogLive2dInitialized
window.__blogMouseTrailInitialized
window.__blogCreditPjaxBound
window.__blogSirenLoaderStarted
```

## Acceptance tests

- Generate the Hexo site with `npm run build` in `technical/`.
- Run `npm run check:mobile-runtime` in `technical/` against the generated `public/` tree.
- The test must exercise a real Edge runtime through CDP, use an Android mobile UA/device metrics for the mobile case, use desktop metrics for the desktop case, and perform two PJAX transitions in each case.
- Mobile assertions: zero Live2D resources, no Live2D audio hook, zero `#waifu`, zero `#live2d`, zero `#mouseTrail` before and after PJAX.
- Desktop assertions: exactly one `#waifu`, `#live2d`, and `#mouseTrail`, plus one Live2D runtime request, before and after PJAX.
- Both profiles seed a returning-user state (`{i:0,t:12,p:true}`) before site scripts run, assert that `audio.src` is absent and that zero `/audio/` / `.wav` requests occur before interaction, then verify one explicit play action assigns the source and starts a media request. The local fixture also verifies playback resumes from the saved 12-second position.
- Both profiles keep the document-level PJAX listener count stable and request `music.json` only once across the two transitions.

## Deployment and server boundary

The existing `Deploy Hexo Blog` workflow builds `technical/` and rsyncs it to `/var/www/blog/`. Production verification must wait for that workflow, then rerun the public mobile runtime check. Authenticated nginx/access-log inspection is optional follow-up because no named SSH host is configured locally; provide the user a secret-free, read-only runbook instead of guessing credentials.

Only after production verification passes, a public repair log may be drafted through local Claude Code from a redacted evidence packet. The packet may contain the public URL, public response/runtime measurements, the remediation behavior, test results, and commit identifiers; it must not contain repository secrets, SSH material, private post drafts, or unrelated source.
