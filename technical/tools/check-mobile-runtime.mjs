import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const stateExpression = `({
  waifus: document.querySelectorAll('#waifu').length,
  live2dCanvases: document.querySelectorAll('#live2d').length,
  mouseTrails: document.querySelectorAll('#mouseTrail').length
})`;
const effectActivityExpression = `(() => {
  const live2d = document.querySelector('#live2d');
  const mouseTrail = document.querySelector('#mouseTrail');
  return {
    live2dWidth: live2d ? live2d.width : 0,
    live2dHeight: live2d ? live2d.height : 0,
    mouseTrailWidth: mouseTrail ? mouseTrail.width : 0,
    mouseTrailHeight: mouseTrail ? mouseTrail.height : 0,
    live2dAudioHooked: Boolean(window.__lv2AudioHooked)
  };
})()`;

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

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.wav', 'audio/wav'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

function createSilentWav(durationSeconds = 20, sampleRate = 8_000) {
  const bytesPerSample = 2;
  const dataSize = durationSeconds * sampleRate * bytesPerSample;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * bytesPerSample, 28);
  wav.writeUInt16LE(bytesPerSample, 32);
  wav.writeUInt16LE(bytesPerSample * 8, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  return wav;
}

const audioFixture = createSilentWav();

const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));

function findEdge() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  const edgePath = candidates.find(candidate => existsSync(candidate));
  assert.ok(edgePath, `Microsoft Edge was not found at a standard path:\n${candidates.join('\n')}`);
  return edgePath;
}

async function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, 'http://127.0.0.1');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  const relativePath = pathname.replace(/^\/+/, '');
  let filePath = resolve(publicRoot, relativePath);
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${sep}`)) return null;

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    return null;
  }

  try {
    const info = await stat(filePath);
    return info.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

async function startStaticServer() {
  assert.ok(existsSync(join(publicRoot, 'index.html')), 'Generated public/index.html is missing; run npm run build first.');

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/audio/125042') {
      const rangeMatch = /^bytes=(\d+)-(\d*)$/i.exec(request.headers.range || '');
      const start = rangeMatch ? Number(rangeMatch[1]) : 0;
      if (start >= audioFixture.length) {
        response.writeHead(416, { 'content-range': `bytes */${audioFixture.length}` });
        response.end();
        return;
      }
      const requestedEnd = rangeMatch?.[2] ? Number(rangeMatch[2]) : audioFixture.length - 1;
      const end = Math.min(requestedEnd, audioFixture.length - 1);
      const body = audioFixture.subarray(start, end + 1);
      const headers = {
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
        'content-length': body.length,
        'content-type': 'audio/wav'
      };
      if (rangeMatch) headers['content-range'] = `bytes ${start}-${end}/${audioFixture.length}`;
      response.writeHead(rangeMatch ? 206 : 200, headers);
      response.end(request.method === 'HEAD' ? undefined : body);
      return;
    }

    const filePath = await resolveRequestPath(request.url || '/');
    if (!filePath) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': contentTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream'
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(filePath).on('error', error => response.destroy(error)).pipe(response);
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    baseUrl: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolveClose, rejectClose) => {
      server.closeAllConnections();
      server.close(error => error ? rejectClose(error) : resolveClose());
    })
  };
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();

    socket.addEventListener('message', event => this.handleMessage(event.data));
    socket.addEventListener('close', () => {
      for (const { rejectCall } of this.pending.values()) rejectCall(new Error('Edge CDP connection closed.'));
      this.pending.clear();
    });
  }

  static async connect(webSocketDebuggerUrl) {
    const socket = new WebSocket(webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', resolveOpen, { once: true });
      socket.addEventListener('error', () => rejectOpen(new Error('Could not connect to Edge CDP.')), { once: true });
    });
    return new CdpClient(socket);
  }

  handleMessage(rawMessage) {
    const message = JSON.parse(String(rawMessage));
    if (message.id) {
      const pendingCall = this.pending.get(message.id);
      if (!pendingCall) return;
      this.pending.delete(message.id);
      clearTimeout(pendingCall.timeout);
      if (message.error) pendingCall.rejectCall(new Error(`${pendingCall.method}: ${message.error.message}`));
      else pendingCall.resolveCall(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) || []) listener(message.params);
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveCall, rejectCall) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectCall(new Error(`${method} timed out.`));
      }, 30_000);
      this.pending.set(id, { method, resolveCall, rejectCall, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  close() {
    this.socket.close();
  }
}

async function waitForDevToolsPort(profileDirectory, edgeProcess, stderr) {
  const portFile = join(profileDirectory, 'DevToolsActivePort');
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (edgeProcess.exitCode !== null) {
      throw new Error(`Edge exited before CDP became ready (code ${edgeProcess.exitCode}).\n${stderr.value}`);
    }
    try {
      const [port] = (await readFile(portFile, 'utf8')).trim().split(/\r?\n/);
      if (/^\d+$/.test(port)) return Number(port);
    } catch {
      // Edge creates the port file after its temporary profile is initialized.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for Edge CDP.\n${stderr.value}`);
}

async function waitForPageTarget(cdpPort) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const targets = await response.json();
      const target = targets.find(candidate => candidate.type === 'page');
      if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
    } catch {
      // The discovery endpoint can lag slightly behind DevToolsActivePort.
    }
    await delay(100);
  }
  throw new Error('Edge opened CDP but did not expose a page target.');
}

async function launchEdge() {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'blog-mobile-runtime-'));
  const stderr = { value: '' };
  const edgeProcess = spawn(findEdge(), [
    '--headless=new',
    '--disable-background-networking',
    '--disable-features=msEdgeFirstRunExperience',
    '--no-default-browser-check',
    '--no-first-run',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDirectory}`,
    'about:blank'
  ], {
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true
  });
  edgeProcess.stderr.setEncoding('utf8');
  edgeProcess.stderr.on('data', chunk => {
    stderr.value = `${stderr.value}${chunk}`.slice(-8_000);
  });

  try {
    const cdpPort = await waitForDevToolsPort(profileDirectory, edgeProcess, stderr);
    const webSocketDebuggerUrl = await waitForPageTarget(cdpPort);
    const client = await CdpClient.connect(webSocketDebuggerUrl);
    return { client, edgeProcess, profileDirectory };
  } catch (error) {
    edgeProcess.kill();
    await rm(profileDirectory, { force: true, recursive: true, maxRetries: 5, retryDelay: 100 });
    throw error;
  }
}

async function closeEdge({ client, edgeProcess, profileDirectory }) {
  client.close();
  if (edgeProcess.exitCode === null) {
    const exited = new Promise(resolveExit => edgeProcess.once('exit', resolveExit));
    edgeProcess.kill();
    await Promise.race([exited, delay(5_000)]);
  }
  await rm(profileDirectory, { force: true, recursive: true, maxRetries: 10, retryDelay: 100 });
}

async function evaluate(client, expression) {
  const result = await client.call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(client, expression, description, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(client, expression)) return;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}.${lastError ? ` Last error: ${lastError.message}` : ''}`);
}

async function readSettledState(client, minimumDelay = 2_500) {
  await delay(minimumDelay);
  let previous;
  let stableSamples = 0;
  for (let sample = 0; sample < 12; sample++) {
    const state = await evaluate(client, stateExpression);
    const serialized = JSON.stringify(state);
    stableSamples = serialized === previous ? stableSamples + 1 : 0;
    if (stableSamples >= 2) return state;
    previous = serialized;
    await delay(250);
  }
  return evaluate(client, stateExpression);
}

async function clickThroughPjax(client, selector, destinationDescription) {
  const startingUrl = await evaluate(client, 'location.href');
  const clicked = await evaluate(client, `(() => {
    window.__runtimeCheckPjaxCompleted = false;
    const runtimeCheckHandler = () => {
      window.__runtimeCheckPjaxCompleted = true;
    };
    runtimeCheckHandler.__runtimeCheckIgnore = true;
    document.addEventListener('pjax:success', runtimeCheckHandler, { once: true });
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!target) return false;
    target.click();
    return true;
  })()`);
  assert.equal(clicked, true, `Could not find ${selector} for the ${destinationDescription} PJAX transition.`);
  await waitFor(
    client,
    `location.href !== ${JSON.stringify(startingUrl)} && window.__runtimeCheckPjaxCompleted === true`,
    `${destinationDescription} PJAX transition`
  );
}

function isLive2dRuntimeUrl(responseUrl) {
  try {
    return /\/live2d(?:\.min)?\.js$/i.test(new URL(responseUrl).pathname);
  } catch {
    return false;
  }
}

function isLive2dResourceUrl(responseUrl) {
  try {
    const url = new URL(responseUrl);
    const pathname = url.pathname.toLowerCase();
    return pathname.includes('/live2d-widgets@') ||
      pathname.includes('/yzs-live2d_src@') ||
      pathname.includes('/live2dcubismcore') ||
      pathname === '/js/live2d-config.json' ||
      pathname.startsWith('/js/model/');
  } catch {
    return false;
  }
}

function isAudioUrl(responseUrl) {
  try {
    const pathname = new URL(responseUrl).pathname;
    return pathname.startsWith('/audio/') || /\.wav$/i.test(pathname);
  } catch {
    return false;
  }
}

function isMusicMetadataUrl(requestUrl) {
  try {
    return new URL(requestUrl).pathname === '/music.json';
  } catch {
    return false;
  }
}

async function runProfile(name, profile, baseUrl) {
  const edge = await launchEdge();
  const requestUrls = [];
  edge.client.on('Network.requestWillBeSent', ({ request }) => requestUrls.push(request.url));

  try {
    await edge.client.call('Network.enable');
    await edge.client.call('Page.enable');
    await edge.client.call('Runtime.enable');
    await edge.client.call('Network.setUserAgentOverride', { userAgent: profile.userAgent });
    await edge.client.call('Emulation.setDeviceMetricsOverride', {
      width: profile.width,
      height: profile.height,
      deviceScaleFactor: profile.deviceScaleFactor,
      mobile: profile.mobile,
      screenWidth: profile.width,
      screenHeight: profile.height
    });
    await edge.client.call('Emulation.setTouchEmulationEnabled', {
      enabled: profile.mobile,
      maxTouchPoints: profile.mobile ? 5 : 1
    });
    await edge.client.call('Emulation.setEmulatedMedia', {
      features: [
        { name: 'hover', value: profile.mobile ? 'none' : 'hover' },
        { name: 'any-hover', value: profile.mobile ? 'none' : 'hover' },
        { name: 'pointer', value: profile.mobile ? 'coarse' : 'fine' },
        { name: 'any-pointer', value: profile.mobile ? 'coarse' : 'fine' }
      ]
    });
    await edge.client.call('Page.addScriptToEvaluateOnNewDocument', {
      source: `try {
        localStorage.setItem('vs', JSON.stringify({ i: 0, t: 12, p: true }));
      } catch {}
      if (!window.__runtimeCheckListenerProbeInstalled) {
        window.__runtimeCheckListenerProbeInstalled = true;
        window.__runtimeCheckPjaxListenerCount = 0;
        const originalAddEventListener = document.addEventListener;
        document.addEventListener = function(type, listener, options) {
          if (type === 'pjax:success' && !listener.__runtimeCheckIgnore) {
            window.__runtimeCheckPjaxListenerCount += 1;
          }
          return originalAddEventListener.call(this, type, listener, options);
        };
      }`
    });

    await edge.client.call('Page.navigate', { url: baseUrl });
    await waitFor(
      edge.client,
      `document.readyState === 'complete' && Boolean(document.querySelector('.post-title-link'))`,
      `${name} initial page`
    );

    const states = [await readSettledState(edge.client)];
    const effectActivity = [await evaluate(edge.client, effectActivityExpression)];
    const pjaxListenerCounts = [await evaluate(edge.client, 'window.__runtimeCheckPjaxListenerCount')];
    const audioSources = [await evaluate(edge.client, `window.__vinyl?.audio?.getAttribute('src') ?? null`)];

    await clickThroughPjax(edge.client, '.post-title-link', 'first post');
    states.push(await readSettledState(edge.client));
    effectActivity.push(await evaluate(edge.client, effectActivityExpression));
    pjaxListenerCounts.push(await evaluate(edge.client, 'window.__runtimeCheckPjaxListenerCount'));
    audioSources.push(await evaluate(edge.client, `window.__vinyl?.audio?.getAttribute('src') ?? null`));

    await clickThroughPjax(edge.client, '.site-title', 'home');
    states.push(await readSettledState(edge.client));
    effectActivity.push(await evaluate(edge.client, effectActivityExpression));
    pjaxListenerCounts.push(await evaluate(edge.client, 'window.__runtimeCheckPjaxListenerCount'));
    audioSources.push(await evaluate(edge.client, `window.__vinyl?.audio?.getAttribute('src') ?? null`));

    const audioRequestsBeforeInteraction = requestUrls.filter(isAudioUrl);
    const playClicked = await evaluate(edge.client, `(() => {
      const playButton = document.querySelector('#mpBtn');
      if (!playButton) return false;
      playButton.click();
      return true;
    })()`);
    assert.equal(playClicked, true, `Could not find the mini-player play button for ${name}.`);
    const localTarget = new URL(baseUrl).hostname === '127.0.0.1';
    if (localTarget) {
      await waitFor(
        edge.client,
        'window.__vinyl?.audio?.currentTime >= 11.5',
        `${name} saved audio position restoration`,
        10_000
      );
    } else {
      await delay(1_000);
    }
    const audioSourceAfterInteraction = await evaluate(
      edge.client,
      `window.__vinyl?.audio?.getAttribute('src') ?? null`
    );
    const audioCurrentTimeAfterInteraction = await evaluate(
      edge.client,
      'window.__vinyl?.audio?.currentTime ?? 0'
    );
    const requestsBeforePausedTrackChange = requestUrls.length;
    const pausedTrackChange = await evaluate(edge.client, `(() => {
      document.querySelector('#mpBtn')?.click();
      document.querySelector('#mpNext')?.click();
      return {
        selectedIndex: window.__vinyl?.getIdx() ?? -1,
        source: window.__vinyl?.audio?.getAttribute('src') ?? null,
        sourceIndex: window.__vinyl?.audio?.getAttribute('data-idx') ?? null,
        paused: window.__vinyl?.audio?.paused ?? false
      };
    })()`);
    await delay(250);

    return {
      localTarget,
      states,
      effectActivity,
      pjaxListenerCounts,
      audioSources,
      live2dResources: requestUrls.filter(isLive2dResourceUrl),
      live2dRequests: requestUrls.filter(isLive2dRuntimeUrl),
      musicMetadataRequests: requestUrls.filter(isMusicMetadataUrl),
      audioRequestsBeforeInteraction,
      audioRequestsAfterInteraction: requestUrls.filter(isAudioUrl),
      audioSourceAfterInteraction,
      audioCurrentTimeAfterInteraction,
      pausedTrackChange,
      pausedTrackChangeRequests: requestUrls.slice(requestsBeforePausedTrackChange).filter(isAudioUrl)
    };
  } finally {
    await closeEdge(edge);
  }
}

function recordAssertion(failures, label, assertion) {
  try {
    assertion();
  } catch (error) {
    failures.push({ label, error });
  }
}

const requestedTarget = process.argv[2];
let server;
let baseUrl;

if (requestedTarget) {
  const target = new URL(requestedTarget);
  assert.ok(['http:', 'https:'].includes(target.protocol), 'Remote target must use http or https.');
  target.hash = '';
  baseUrl = target.href;
} else {
  server = await startStaticServer();
  baseUrl = server.baseUrl;
}

try {
  const mobileResult = await runProfile('mobile', mobile, baseUrl);
  const desktopResult = await runProfile('desktop', desktop, baseUrl);

  console.log(JSON.stringify({ mobile: mobileResult, desktop: desktopResult }, null, 2));

  const mobileStates = mobileResult.states;
  const mobileLive2dResources = mobileResult.live2dResources;
  const mobileLive2dRequests = mobileResult.live2dRequests;
  const desktopStates = desktopResult.states;
  const desktopLive2dRequests = desktopResult.live2dRequests;
  const failures = [];

  recordAssertion(failures, 'mobile effects are absent through PJAX', () => assert.deepEqual(mobileStates, [
    { waifus: 0, live2dCanvases: 0, mouseTrails: 0 },
    { waifus: 0, live2dCanvases: 0, mouseTrails: 0 },
    { waifus: 0, live2dCanvases: 0, mouseTrails: 0 }
  ]));
  recordAssertion(failures, 'mobile makes no Live2D resource request', () => assert.equal(mobileLive2dResources.length, 0));
  recordAssertion(failures, 'mobile makes no Live2D runtime request', () => assert.equal(mobileLive2dRequests.length, 0));
  for (const [index, activity] of mobileResult.effectActivity.entries()) {
    recordAssertion(failures, `mobile effect activity ${index} remains absent`, () => {
      assert.deepEqual(activity, {
        live2dWidth: 0,
        live2dHeight: 0,
        mouseTrailWidth: 0,
        mouseTrailHeight: 0,
        live2dAudioHooked: false
      });
    });
  }
  recordAssertion(failures, 'mobile PJAX listener count remains stable', () => {
    assert.deepEqual(mobileResult.pjaxListenerCounts, Array(3).fill(mobileResult.pjaxListenerCounts[0]));
  });

  for (const [index, state] of desktopStates.entries()) {
    recordAssertion(failures, `desktop state ${index} remains singleton`, () => {
      assert.deepEqual(state, { waifus: 1, live2dCanvases: 1, mouseTrails: 1 });
    });
  }
  for (const [index, activity] of desktopResult.effectActivity.entries()) {
    recordAssertion(failures, `desktop effect activity ${index} remains live`, () => {
      assert.ok(activity.live2dWidth > 0 && activity.live2dHeight > 0, 'Live2D canvas is not initialized.');
      assert.equal(activity.mouseTrailWidth, desktop.width);
      assert.equal(activity.mouseTrailHeight, desktop.height);
      assert.equal(activity.live2dAudioHooked, true);
    });
  }
  recordAssertion(failures, 'desktop PJAX listener count remains stable', () => {
    assert.deepEqual(desktopResult.pjaxListenerCounts, Array(3).fill(desktopResult.pjaxListenerCounts[0]));
  });
  recordAssertion(failures, 'desktop makes one Live2D runtime request', () => assert.equal(desktopLive2dRequests.length, 1));
  recordAssertion(failures, 'mobile starts the music metadata loader once', () => {
    assert.equal(mobileResult.musicMetadataRequests.length, 1);
  });
  recordAssertion(failures, 'desktop starts the music metadata loader once', () => {
    assert.equal(desktopResult.musicMetadataRequests.length, 1);
  });
  recordAssertion(failures, 'mobile does not preload audio before interaction', () => {
    assert.deepEqual(mobileResult.audioSources, [null, null, null]);
    assert.equal(mobileResult.audioRequestsBeforeInteraction.length, 0);
  });
  recordAssertion(failures, 'desktop does not preload audio before interaction', () => {
    assert.deepEqual(desktopResult.audioSources, [null, null, null]);
    assert.equal(desktopResult.audioRequestsBeforeInteraction.length, 0);
  });
  recordAssertion(failures, 'mobile loads audio after the play gesture', () => {
    assert.ok(mobileResult.audioSourceAfterInteraction?.endsWith('/audio/125042'));
    assert.ok(mobileResult.audioRequestsAfterInteraction.length > 0);
    if (mobileResult.localTarget) assert.ok(mobileResult.audioCurrentTimeAfterInteraction >= 11.5);
  });
  recordAssertion(failures, 'desktop loads audio after the play gesture', () => {
    assert.ok(desktopResult.audioSourceAfterInteraction?.endsWith('/audio/125042'));
    assert.ok(desktopResult.audioRequestsAfterInteraction.length > 0);
    if (desktopResult.localTarget) assert.ok(desktopResult.audioCurrentTimeAfterInteraction >= 11.5);
  });
  for (const [name, result] of [['mobile', mobileResult], ['desktop', desktopResult]]) {
    recordAssertion(failures, `${name} paused track change stays lazy`, () => {
      assert.deepEqual(result.pausedTrackChange, {
        selectedIndex: 1,
        source: '/audio/125042',
        sourceIndex: '0',
        paused: true
      });
      assert.equal(result.pausedTrackChangeRequests.length, 0);
    });
  }

  if (failures.length) {
    for (const failure of failures) {
      console.error(`\nFAIL: ${failure.label}\n${failure.error.message}`);
    }
    throw new Error(`${failures.length} mobile runtime regression assertion(s) failed.`);
  }

  console.log('PASS: mobile effects and eager audio requests are absent; desktop effects remain singleton through PJAX.');
} finally {
  if (server) await server.close();
}
