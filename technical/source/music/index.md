---
title: MUSIC / 塞壬唱片
date: 2026-05-24 12:00:00
type: "music"
layout: page
description: "明日方舟官方音乐厂牌塞壬唱片(Monster Siren)作品选"
---

<div class="vinyl-stage" id="musicStage">
  <div class="vinyl-deck">
    <div class="vinyl-disc" id="vinylDisc">
      <img id="vinylCover" src="/js/music/placeholder.svg" width="120" height="120" alt="默认唱片封面">
      <div class="center-hole"></div>
    </div>
  </div>
  <div class="vinyl-info"><div class="track-title" id="trackTitle">—</div><div class="track-artist" id="trackArtist">—</div></div>
  <p id="musicStatus" class="music-status" role="status" aria-live="polite">点击播放</p>
  <div class="music-retries"><button type="button" id="musicRetry" hidden>重试播放</button><button type="button" id="musicCoverRetry" hidden>重试封面</button></div>
  <div class="music-progress-wrap"><span class="vinyl-time" id="timeCur">00:00</span><input id="progressBar" type="range" min="0" max="0" value="0" step="1" aria-label="播放进度" disabled><span class="vinyl-time" id="timeDur">00:00</span></div>
  <div class="vinyl-controls">
    <button class="vinyl-btn" id="musicPrev" type="button" aria-label="上一首"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
    <button class="vinyl-btn play-btn" id="playBtn" type="button" aria-label="播放" aria-pressed="false"><span data-play><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span><span data-pause hidden><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg></span></button>
    <button class="vinyl-btn" id="musicNext" type="button" aria-label="下一首"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
  </div>
  <label class="music-volume">音量 <input id="musicVolume" type="range" min="0" max="100" value="30" step="1" aria-label="音乐音量"></label>
  <div class="vinyl-playlist" id="playlist" aria-label="播放列表"></div>
</div>