/* StemLab — logica applicativa (vanilla JS, nessun build step) */
'use strict';

// Metti true DOPO aver collegato il motore Open-Unmix nel worker (vedi README).
const USE_REAL_ENGINE = false;

const STEMS = [
  { key: 'vocals', name: 'Voce',     short: 'VOX',  color: 'var(--c-vocals)' },
  { key: 'drums',  name: 'Batteria', short: 'DRM',  color: 'var(--c-drums)'  },
  { key: 'bass',   name: 'Basso',    short: 'BASS', color: 'var(--c-bass)'   },
  { key: 'other',  name: 'Altro',    short: 'OTH',  color: 'var(--c-other)'  },
];

const $ = (id) => document.getElementById(id);
const views = {
  drop: $('dropView'), process: $('processView'), mixer: $('mixerView'),
};
function show(view) {
  for (const k in views) views[k].hidden = (k !== view);
}

/* ---------- service worker ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  );
}

/* ---------- install prompt ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('installBtn').hidden = false;
});
$('installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('installBtn').hidden = true;
});

/* ---------- file input ---------- */
const dropZone = $('dropZone');
const fileInput = $('fileInput');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});
['dragenter', 'dragover'].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add('drag'); })
);
['dragleave', 'drop'].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove('drag'); })
);
dropZone.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
});

$('newBtn').addEventListener('click', () => { engine.reset(); show('drop'); });

/* ---------- pipeline ---------- */
let audioBuffer = null;

async function handleFile(file) {
  $('procName').textContent = file.name;
  $('mixName').textContent = file.name;
  show('process');
  setProgress(0, 'Decodifica audio…');

  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuf = await file.arrayBuffer();
    audioBuffer = await ac.decodeAudioData(arrayBuf);
    ac.close();

    // avviso durata su mobile: il motore reale è lento
    const mins = audioBuffer.duration / 60;
    if (mins > 6) {
      $('procHint').textContent =
        `Brano lungo (${mins.toFixed(1)} min): con il motore AI reale può richiedere parecchi minuti su mobile.`;
    }

    setProgress(8, 'Separazione…');
    const stems = USE_REAL_ENGINE
      ? await separateReal(audioBuffer)
      : await separatePlaceholder(audioBuffer);

    setProgress(100, 'Pronto');
    buildMixer(stems);
    show('mixer');
  } catch (err) {
    alert('Impossibile elaborare il file: ' + (err.message || err));
    show('drop');
  }
}

function setProgress(pct, stage) {
  const C = 327;
  $('ringFg').style.strokeDashoffset = String(C - (C * pct) / 100);
  $('procPct').textContent = Math.round(pct);
  if (stage) $('procStage').textContent = stage;
}

/* ---------- separazione SEGNAPOSTO (filtri EQ, thread principale) ---------- */
/* Solo per provare la UI. NON è separazione AI. */
async function separatePlaceholder(buf) {
  const profiles = {
    vocals: (ctx, src) => chain(ctx, src, [hp(ctx, 500)]),
    drums:  (ctx, src) => chain(ctx, src, [hp(ctx, 2500)]),
    bass:   (ctx, src) => chain(ctx, src, [lp(ctx, 180)]),
    other:  (ctx, src) => chain(ctx, src, [hp(ctx, 180), lp(ctx, 2500)]),
  };
  const out = {};
  let done = 0;
  for (const { key } of STEMS) {
    out[key] = await renderFiltered(buf, profiles[key]);
    done++;
    setProgress(8 + (done / STEMS.length) * 90, 'Separazione…');
    await new Promise((r) => setTimeout(r, 120)); // lascia respirare la UI
  }
  return out;
}
function hp(ctx, f) { const n = ctx.createBiquadFilter(); n.type = 'highpass'; n.frequency.value = f; return n; }
function lp(ctx, f) { const n = ctx.createBiquadFilter(); n.type = 'lowpass';  n.frequency.value = f; return n; }
function chain(ctx, src, nodes) {
  let prev = src;
  for (const n of nodes) { prev.connect(n); prev = n; }
  return prev;
}
async function renderFiltered(buf, build) {
  const off = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
  const src = off.createBufferSource();
  src.buffer = buf;
  const last = build(off, src);
  last.connect(off.destination);
  src.start();
  return off.startRendering();
}

/* ---------- separazione REALE (worker) ---------- */
function separateReal(buf) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js');
    const channels = [];
    for (let c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c).slice());
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') setProgress(8 + m.value * 0.9, 'Separazione AI…');
      else if (m.type === 'done') { resolve(toBuffers(m.stems, buf.sampleRate)); worker.terminate(); }
      else if (m.type === 'error') { reject(new Error(m.message)); worker.terminate(); }
    };
    worker.postMessage(
      { type: 'separate', payload: { channels, sampleRate: buf.sampleRate, length: buf.length } },
      channels.map((c) => c.buffer)
    );
  });
}
function toBuffers(stems, sr) {
  const out = {};
  for (const k in stems) {
    const chs = stems[k];
    const b = new AudioBuffer({ length: chs[0].length, numberOfChannels: chs.length, sampleRate: sr });
    chs.forEach((data, i) => b.copyToChannel(data, i));
    out[k] = b;
  }
  return out;
}

/* ===================== MIXER ===================== */
const engine = {
  ctx: null, stems: {}, nodes: {}, sources: {},
  playing: false, startedAt: 0, offset: 0, duration: 0, raf: 0,
  soloed: new Set(), muted: new Set(), gains: {},

  reset() {
    this.stop();
    if (this.ctx) { this.ctx.close(); this.ctx = null; }
    this.stems = {}; this.nodes = {}; this.sources = {};
    this.offset = 0; this.soloed.clear(); this.muted.clear(); this.gains = {};
    $('strips').innerHTML = '';
  },
};

function buildMixer(stems) {
  engine.reset();
  engine.ctx = new (window.AudioContext || window.webkitAudioContext)();
  engine.stems = stems;
  engine.duration = stems.vocals.duration;
  $('tDur').textContent = fmt(engine.duration);

  const master = engine.ctx.createGain();
  master.connect(engine.ctx.destination);
  engine.master = master;

  const wrap = $('strips');
  for (const s of STEMS) {
    engine.gains[s.key] = 1;
    const g = engine.ctx.createGain();
    g.gain.value = 1;
    g.connect(master);
    engine.nodes[s.key] = g;
    wrap.appendChild(makeStrip(s));
  }
  applyMix();
}

function makeStrip(s) {
  const el = document.createElement('div');
  el.className = 'strip';
  el.style.setProperty('--c', s.color);
  el.dataset.key = s.key;
  el.innerHTML = `
    <div class="strip-led">${s.short}</div>
    <div class="strip-main">
      <div class="strip-name"><span class="swatch"></span>${s.name}</div>
      <canvas class="wave" width="600" height="60"></canvas>
      <div class="gain-row">
        <input type="range" min="0" max="150" value="100" aria-label="Volume ${s.name}" />
        <span class="gain-val">100</span>
      </div>
    </div>
    <div class="strip-ctrls">
      <button class="mini" data-act="solo" title="Solo">S</button>
      <button class="mini" data-act="mute" title="Mute">M</button>
      <button class="mini" data-act="dl" title="Scarica WAV">
        <svg viewBox="0 0 24 24"><path d="M12 3v10l3.5-3.5L17 11l-5 5-5-5 1.5-1.5L12 13V3zM5 19h14v2H5z"/></svg>
      </button>
    </div>`;

  drawWave(el.querySelector('canvas'), engine.stems[s.key], s.color);

  const range = el.querySelector('input[type=range]');
  const val = el.querySelector('.gain-val');
  range.addEventListener('input', () => {
    engine.gains[s.key] = range.value / 100;
    val.textContent = range.value;
    applyMix();
  });

  el.querySelector('[data-act=solo]').addEventListener('click', (e) => {
    toggleSet(engine.soloed, s.key); e.currentTarget.classList.toggle('on'); applyMix();
  });
  el.querySelector('[data-act=mute]').addEventListener('click', (e) => {
    toggleSet(engine.muted, s.key); e.currentTarget.classList.toggle('on');
    el.classList.toggle('muted'); applyMix();
  });
  el.querySelector('[data-act=dl]').addEventListener('click', () =>
    downloadWav(engine.stems[s.key], `${$('mixName').textContent.replace(/\.[^.]+$/, '')}-${s.key}.wav`)
  );
  return el;
}

function toggleSet(set, key) { set.has(key) ? set.delete(key) : set.add(key); }

function applyMix() {
  const anySolo = engine.soloed.size > 0;
  for (const s of STEMS) {
    let audible = engine.muted.has(s.key) ? 0 : 1;
    if (anySolo && !engine.soloed.has(s.key)) audible = 0;
    const g = engine.nodes[s.key];
    if (g) g.gain.setTargetAtTime(audible * engine.gains[s.key], engine.ctx.currentTime, 0.01);
  }
}

/* ---- transport ---- */
$('playAll').addEventListener('click', () => engine.playing ? pause() : play());

function play() {
  const ctx = engine.ctx;
  if (ctx.state === 'suspended') ctx.resume();
  engine.sources = {};
  for (const s of STEMS) {
    const src = ctx.createBufferSource();
    src.buffer = engine.stems[s.key];
    src.connect(engine.nodes[s.key]);
    src.start(0, engine.offset);
    engine.sources[s.key] = src;
  }
  engine.startedAt = ctx.currentTime;
  engine.playing = true;
  setPlayIcon(true);
  // fine brano
  engine.sources.vocals.onended = () => { if (engine.playing) { engine.offset = 0; pause(); updateClock(true); } };
  tick();
}
function pause() {
  if (engine.playing) {
    engine.offset += engine.ctx.currentTime - engine.startedAt;
    for (const k in engine.sources) try { engine.sources[k].onended = null; engine.sources[k].stop(); } catch (_) {}
  }
  engine.playing = false;
  setPlayIcon(false);
  cancelAnimationFrame(engine.raf);
}
engine.stop = function () { this.playing = false; cancelAnimationFrame(this.raf); for (const k in this.sources) { try { this.sources[k].onended = null; this.sources[k].stop(); } catch (_) {} } };

function setPlayIcon(on) {
  document.querySelector('.ic-play').hidden = on;
  document.querySelector('.ic-pause').hidden = !on;
}

const seek = $('seek');
seek.addEventListener('input', () => {
  const wasPlaying = engine.playing;
  if (wasPlaying) pause();
  engine.offset = (seek.value / 1000) * engine.duration;
  updateClock(true);
  if (wasPlaying) play();
});

function tick() {
  updateClock(false);
  engine.raf = requestAnimationFrame(tick);
}
function updateClock(fromSeek) {
  let cur = engine.offset;
  if (engine.playing) cur += engine.ctx.currentTime - engine.startedAt;
  cur = Math.min(cur, engine.duration);
  const ratio = engine.duration ? cur / engine.duration : 0;
  $('scrubFill').style.width = (ratio * 100) + '%';
  if (!fromSeek) seek.value = String(Math.round(ratio * 1000));
  $('tCur').textContent = fmt(cur);
}

/* ---------- waveform ---------- */
function drawWave(canvas, buf, color) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, mid = H / 2;
  const data = buf.getChannelData(0);
  const step = Math.floor(data.length / W) || 1;
  ctx.clearRect(0, 0, W, H);
  const col = getComputedStyle(document.documentElement)
    .getPropertyValue(color.replace('var(', '').replace(')', '').trim()) || '#ffb454';
  ctx.fillStyle = col.trim() || '#ffb454';
  for (let x = 0; x < W; x++) {
    let min = 1, max = -1;
    for (let i = 0; i < step; i++) {
      const v = data[x * step + i] || 0;
      if (v < min) min = v; if (v > max) max = v;
    }
    const y = Math.max(1, (max - min) * mid);
    ctx.fillRect(x, mid - y / 2, 1, y);
  }
}

/* ---------- WAV export ---------- */
function downloadWav(buf, name) {
  const wav = encodeWav(buf);
  const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function encodeWav(buf) {
  const numCh = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buf.getChannelData(c));
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const ws = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); ws(8, 'WAVE');
  ws(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
  view.setUint32(28, sr * blockAlign, true); view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); ws(36, 'data'); view.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let v = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      off += 2;
    }
  }
  return ab;
}

/* ---------- utils ---------- */
function fmt(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
