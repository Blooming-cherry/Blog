const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.resolve(__dirname, '../source/js/companion');
function context() {
  const win = { BlogCompanion: {}, location: { origin: 'https://blog.test', href: 'https://blog.test/post' } };
  const ctx = vm.createContext({ window: win, URL, console, AbortController, setTimeout, clearTimeout });
  for (const file of ['preferences.js', 'voice.js', 'renderer.js']) {
    if (fs.existsSync(path.join(dir, file))) vm.runInContext(fs.readFileSync(path.join(dir, file), 'utf8'), ctx);
  }
  return win;
}
class AudioFixture extends EventTarget {
  constructor() { super(); this.pending = []; this.src = ''; this.paused = true; this.currentTime = 0; }
  play() { this.paused = false; return new Promise((resolve, reject) => this.pending.push({ resolve, reject })); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  load() {}
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  emit(name) { this.dispatchEvent(new Event(name)); }
}
async function run() {
  const api = context().BlogCompanion;
  assert.equal(typeof api.Voice, 'function', 'Dedicated Voice controller is available');
  assert.equal(typeof api.Preferences, 'function', 'Validated preferences are available');
  const audio = new AudioFixture(), duck = [], states = [];
  const voice = new api.Voice({ audio, duck: active => duck.push(active), onState: value => states.push(value) });
  assert.equal(await voice.play('tap', '/tap.wav'), false, 'Default mute never fetches audio');
  assert.equal(audio.src, '');
  voice.setMuted(false);
  const old = voice.play('a', '/a.wav');
  const latest = voice.play('b', '/b.wav');
  audio.pending[0].reject(new Error('old failure'));
  await old;
  assert.equal(voice.state, 'loading', 'Stale rejection cannot overwrite current loading');
  assert.equal(audio.src, 'https://blog.test/b.wav');
  audio.emit('pause');
  assert.equal(voice.state, 'loading', 'Queued old pause cannot stop a new playing intent');
  assert.equal(duck.includes(true), false, 'No duck before actual playing event');
  audio.pending[1].resolve(); await latest;
  assert.equal(voice.state, 'loading', 'Resolved promise is not a playing event');
  audio.emit('playing');
  assert.equal(voice.state, 'playing');
  assert.equal(duck.at(-1), true);
  assert.equal(await voice.play('b', '/b.wav'), false, 'Duplicate current voice is ignored');
  audio.emit('waiting'); assert.equal(duck.at(-1), false, 'Buffering releases music duck');
  audio.emit('playing'); assert.equal(duck.at(-1), true);
  audio.emit('ended'); assert.equal(voice.state, 'idle'); assert.equal(duck.at(-1), false);
  const blocked = voice.play('blocked', '/blocked.wav');
  audio.pending[2].reject(Object.assign(new Error('gesture'), { name: 'NotAllowedError' }));
  await blocked;
  assert.equal(voice.muted, true, 'Autoplay rejection restores mute');
  assert.equal(voice.state, 'muted'); assert.equal(duck.at(-1), false);
  voice.setMuted(false);
  const close = voice.play('close', '/close.wav');
  audio.emit('playing'); voice.destroy(); audio.pending[3].resolve(); await close;
  assert.equal(audio.src, ''); assert.equal(duck.at(-1), false, 'Destroy clears duck and pending source');
  const storage = { getItem: () => '{"muted":false,"size":999,"position":{"x":-20,"y":30}}', setItem() {} };
  const prefs = new api.Preferences(storage);
  assert.equal(prefs.value.size, 270); assert.equal(prefs.value.muted, false);
  assert.equal(prefs.value.position, null, 'Corrupt coordinates are discarded');
  prefs.update({ volume: 9, size: 220 });
  assert.equal(prefs.value.volume, 0.5); assert.equal(prefs.value.size, 220);
  assert.equal(api.shouldAutoLoad({ mobile: true, collapsed: false, disabled: false, reducedMotion: false }), false);
  assert.equal(api.shouldAutoLoad({ mobile: false, collapsed: false, disabled: false, reducedMotion: true }), false);
  assert.equal(api.shouldAutoLoad({ mobile: false, collapsed: false, disabled: false, reducedMotion: false }), true);
  assert.throws(() => api.sameOrigin('https://evil.test/model.json'), /same origin/);
  console.log('PASS 18 companion assertions: voice race / events / duck / mute / cleanup / preferences / mobile and reduced-motion admission / same-origin.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
