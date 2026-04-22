/**
 * Violin Studio — app.js (v3)
 * Features: file tree, video playback, video annotations w/ timestamp seek,
 *           metronome, chromatic tuner, pitch reference, iPad camera recording.
 *
 * v3 fixes:
 *  - Triple loadPersistedAnnotations collapsed into one canonical async version
 *    (backend fetch → sessionStorage fallback). Previous bug: JS hoisting meant
 *    only the last (sessionStorage-only) definition ever ran.
 *  - Duplicate camera-preview ID removed from HTML; single PiP element used.
 *  - loadVideo duplicate code and double AI message eliminated.
 *  - RecorderManager AudioContext leak fixed; mixing context closed on stop.
 *  - Recording timer, camera-flip, and upload-status feedback added.
 */

'use strict';

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────
const state = {
  files:       [],
  activeFile:  null,       // { name, path }
  annotations: [],         // { id, type, videoId, rawSeconds, timestamp, text, author, createdAt }
  pendingTs:   null,       // raw seconds captured when Add Note is clicked
};

// ─────────────────────────────────────────────
// DOM refs
// ─────────────────────────────────────────────
const fileTree      = document.getElementById('file-tree');
const fileCount     = document.getElementById('file-count');
const mainPlayer    = document.getElementById('main-player');
const scoreViewer   = document.getElementById('score-viewer');
const scoreFilename = document.getElementById('score-filename');
const videoPH       = document.getElementById('video-placeholder');
const scorePH       = document.getElementById('score-placeholder');
const refreshBtn    = document.getElementById('refresh-btn');

// AI
const aiMessages = document.getElementById('ai-messages');
const aiInput    = document.getElementById('ai-input');
const aiSend     = document.getElementById('ai-send');

// Annotations
const annotationsList  = document.getElementById('annotations-list');
const addNoteBtn       = document.getElementById('add-note-btn');
const inlineAnnWrap    = document.getElementById('inline-ann-wrap');
const inlineTsLabel    = document.getElementById('inline-ts-label');
const inlineAnnInput   = document.getElementById('inline-ann-input');
const inlineAnnSave    = document.getElementById('inline-ann-save');
const inlineAnnCancel  = document.getElementById('inline-ann-cancel');
const generalNoteInput = document.getElementById('general-note-input');
const generalNoteSave  = document.getElementById('general-note-save');


// ═══════════════════════════════════════════════
// SECTION 1 — FILE TREE
// ═══════════════════════════════════════════════

async function fetchFiles() {
  refreshBtn.classList.add('spinning');
  try {
    const res = await fetch('/api/files');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const treeData = await res.json();
    renderFileTree(treeData);
  } catch (err) {
    fileTree.innerHTML = `<div class="file-tree-empty"><span style="color:var(--red-bright)">Failed to load library.</span><span style="font-size:10px;margin-top:4px">${esc(err.message)}</span></div>`;
  } finally {
    refreshBtn.classList.remove('spinning');
  }
}

refreshBtn.addEventListener('click', fetchFiles);

function renderFileTree(treeData) {
  fileCount.textContent = 'Library Structured';

  function createTreeHTML(nodes, level = 0) {
    return nodes.map(node => {
      const padding = level * 12;
      if (node.type === 'folder') {
        return `
          <div class="folder-group ${level === 0 ? 'open' : ''}">
            <div class="folder-header" style="padding-left: ${padding + 12}px">
              <svg class="folder-arrow" viewBox="0 0 20 20"><path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2"/></svg>
              <span class="folder-name">${esc(node.name)}</span>
            </div>
            <div class="folder-children">${createTreeHTML(node.children, level + 1)}</div>
          </div>`;
      } else {
        const icon = isVideo(node.name) ? videoIcon() : isPDF(node.name) ? pdfIcon() : fileIcon();
        return `
          <div class="file-item"
               style="padding-left: ${padding + 28}px"
               data-path="${esc(node.path)}"
               data-name="${esc(node.name)}">
            ${icon}<span class="file-name">${esc(node.name)}</span>
          </div>`;
      }
    }).join('');
  }

  fileTree.innerHTML = createTreeHTML(treeData);

  fileTree.querySelectorAll('.folder-header').forEach(el => {
    el.onclick = e => { e.stopPropagation(); el.parentElement.classList.toggle('open'); };
  });

  fileTree.querySelectorAll('.file-item').forEach(el => {
    el.onclick = e => {
      e.stopPropagation();
      fileTree.querySelectorAll('.file-item').forEach(i => i.classList.remove('active'));
      el.classList.add('active');
      const path = el.getAttribute('data-path');
      const name = el.getAttribute('data-name');
      if (isVideo(name))    loadVideo(path, name);
      else if (isPDF(name)) loadScore(path, name);
    };
  });
}


// ═══════════════════════════════════════════════
// SECTION 2 — VIDEO ANNOTATIONS
// ═══════════════════════════════════════════════

/**
 * Format raw seconds to MM:SS.d (e.g. 75.38 → "01:15.4")
 */
function formatTimestamp(rawSeconds) {
  const total      = Math.max(0, rawSeconds);
  const mins       = Math.floor(total / 60);
  const secs       = total % 60;
  const secRounded = Math.round(secs * 10) / 10;
  const finalMins  = secRounded >= 60 ? mins + 1 : mins;
  const finalSecs  = secRounded >= 60 ? 0         : secRounded;
  const mm = String(finalMins).padStart(2, '0');
  const ss = finalSecs < 10 ? '0' + finalSecs.toFixed(1) : finalSecs.toFixed(1);
  return `${mm}:${ss}`;
}

// Add Note button — pause video, capture timestamp, show inline input
addNoteBtn.addEventListener('click', () => {
  if (!mainPlayer.src || mainPlayer.readyState < 1) {
    alert('Load a video first before adding a note.');
    return;
  }
  mainPlayer.pause();
  const raw = mainPlayer.currentTime;
  state.pendingTs = raw;
  inlineTsLabel.textContent = `[${formatTimestamp(raw)}]`;
  inlineAnnWrap.classList.add('visible');
  inlineAnnInput.value = '';
  inlineAnnInput.focus();
  switchTab('notes');
});

inlineAnnSave.addEventListener('click', commitVideoAnnotation);
inlineAnnInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitVideoAnnotation(); }
  if (e.key === 'Escape') cancelInlineAnn();
});
inlineAnnCancel.addEventListener('click', cancelInlineAnn);

function cancelInlineAnn() {
  inlineAnnWrap.classList.remove('visible');
  state.pendingTs = null;
}

function commitVideoAnnotation() {
  const text = inlineAnnInput.value.trim();
  if (!text) return;

  const raw     = state.pendingTs;
  const ts      = formatTimestamp(raw);
  const videoId = state.activeFile?.name ?? 'unknown';

  const ann = {
    id:         Date.now(),
    type:       'video',
    videoId,
    rawSeconds: raw,
    timestamp:  ts,
    text,
    author:     'Teacher',
    createdAt:  new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  };

  state.annotations.push(ann);
  saveAnnotationToBackend(ann);
  persistAnnotations();
  renderAnnotations();
  cancelInlineAnn();
}

async function saveAnnotationToBackend(ann) {
  try {
    await fetch('/api/annotations', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        video_url: ann.videoId,
        timestamp: ann.rawSeconds,
        text:      ann.text,
        author:    ann.author,
      }),
    });
  } catch (err) {
    console.warn('Failed to sync annotation to backend:', err);
  }
}

/**
 * Load annotations from the backend, falling back to sessionStorage if the
 * server is unavailable.  This is the single canonical definition — the
 * previous code had three conflicting function declarations which caused JS
 * hoisting to silently discard the backend version.
 */
async function loadPersistedAnnotations() {
  try {
    const res = await fetch('/api/annotations');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.annotations = data.map(d => ({
      id:         Date.now() + Math.random(),
      type:       'video',
      videoId:    d.video_url,
      rawSeconds: d.timestamp,
      timestamp:  formatTimestamp(d.timestamp),
      text:       d.text,
      author:     d.author,
      createdAt:  'Loaded',
    }));
    // Persist locally so the fallback is always fresh
    persistAnnotations();
  } catch (err) {
    console.warn('Backend annotations unavailable, falling back to sessionStorage:', err);
    try {
      const raw = sessionStorage.getItem('vs_annotations');
      if (raw) state.annotations = JSON.parse(raw);
    } catch {}
  }
  renderAnnotations();
}

function persistAnnotations() {
  try { sessionStorage.setItem('vs_annotations', JSON.stringify(state.annotations)); } catch {}
}

// Timestamp click → seek + play
function seekToTimestamp(rawSeconds) {
  if (!mainPlayer.src || mainPlayer.readyState < 1) return;
  mainPlayer.currentTime = rawSeconds;
  mainPlayer.play().catch(() => {});
}

// General notes (no timestamp)
generalNoteSave.addEventListener('click', saveGeneralNote);
generalNoteInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.ctrlKey) saveGeneralNote();
});

function saveGeneralNote() {
  const text = generalNoteInput.value.trim();
  if (!text) return;
  const note = {
    id:        Date.now(),
    type:      'note',
    text,
    author:    'Me',
    createdAt: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  };
  state.annotations.push(note);
  generalNoteInput.value = '';
  persistAnnotations();
  renderAnnotations();
}

function renderAnnotations() {
  if (!state.annotations.length) {
    annotationsList.innerHTML = `<div class="file-tree-empty" style="padding-top:28px">
      <span style="font-size:10px">No annotations yet.</span>
      <span style="font-size:10px;margin-top:4px">Press <span style="color:var(--blue-bright)">Add Note</span></span>
      <span style="font-size:10px">on the video to mark a timestamp.</span></div>`;
    return;
  }

  const sorted = [...state.annotations].sort((a, b) => {
    if (a.type === 'video' && b.type === 'video') return a.rawSeconds - b.rawSeconds;
    if (a.type === 'video') return -1;
    if (b.type === 'video') return 1;
    return a.id - b.id;
  });

  annotationsList.innerHTML = sorted.map(a => {
    if (a.type === 'video') {
      return `<div class="ann-card fade-in">
        <button class="ann-ts-link" data-raw="${a.rawSeconds}">[${esc(a.timestamp)}]</button>
        <div class="ann-card-right">
          <div class="ann-card-text">${esc(a.text)}</div>
          <div class="ann-card-meta">${esc(a.videoId)} · ${esc(a.author)} · ${esc(a.createdAt)}</div>
        </div>
      </div>`;
    } else {
      return `<div class="note-card fade-in">
        <div class="note-meta">${esc(a.author)} · ${esc(a.createdAt)}</div>
        <div class="note-text">${esc(a.text)}</div>
      </div>`;
    }
  }).join('');

  annotationsList.querySelectorAll('.ann-ts-link').forEach(btn => {
    btn.addEventListener('click', () => seekToTimestamp(parseFloat(btn.dataset.raw)));
  });
  annotationsList.scrollTop = annotationsList.scrollHeight;
}


// ═══════════════════════════════════════════════
// VIDEO TOOLS: Mirror & A-B Loop
// ═══════════════════════════════════════════════

let isMirrored = false;
let loopA = null;
let loopB = null;

const btnMirror  = document.getElementById('btn-mirror');
const btnSetA    = document.getElementById('btn-set-a');
const btnSetB    = document.getElementById('btn-set-b');
const btnClearAB = document.getElementById('btn-clear-ab');

btnMirror.addEventListener('click', () => {
  isMirrored = !isMirrored;
  mainPlayer.style.transform = isMirrored ? 'scaleX(-1)' : 'none';
  btnMirror.classList.toggle('active', isMirrored);
});

btnSetA.addEventListener('click', () => {
  loopA = mainPlayer.currentTime;
  btnSetA.textContent = `A: ${formatTimestamp(loopA)}`;
  btnSetA.classList.add('active');
  btnClearAB.style.display = 'block';
});

btnSetB.addEventListener('click', () => {
  if (loopA === null) { alert('Please Set A first!'); return; }
  loopB = mainPlayer.currentTime;
  btnSetB.textContent = `B: ${formatTimestamp(loopB)}`;
  btnSetB.classList.add('active');
});

btnClearAB.addEventListener('click', () => {
  loopA = null; loopB = null;
  btnSetA.textContent = 'Set A'; btnSetB.textContent = 'Set B';
  btnSetA.classList.remove('active'); btnSetB.classList.remove('active');
  btnClearAB.style.display = 'none';
});

mainPlayer.addEventListener('timeupdate', () => {
  if (loopA !== null && loopB !== null && mainPlayer.currentTime >= loopB) {
    mainPlayer.currentTime = loopA;
    mainPlayer.play();
  }
});


// ═══════════════════════════════════════════════
// SECTION 3 — TAB SWITCHING
// ═══════════════════════════════════════════════

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === `tab-${name}`));
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});


// ═══════════════════════════════════════════════
// SECTION 4 — AI ASSISTANT
// ═══════════════════════════════════════════════

function addAIMessage(role, html) {
  const el = document.createElement('div');
  el.className = `msg ${role} fade-in`;
  el.innerHTML = `<div class="msg-label">${role === 'user' ? 'You' : 'Assistant'}</div>${html}`;
  aiMessages.appendChild(el);
  aiMessages.scrollTop = aiMessages.scrollHeight;
}

async function sendAIMessage() {
  const text = aiInput.value.trim();
  if (!text) return;
  addAIMessage('user', esc(text));
  aiInput.value = '';

  const context = state.activeFile ? `Currently loaded: "${state.activeFile.name}".` : '';
  try {
    const res = await fetch('/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message: text, context }),
    });
    if (res.ok) {
      const data = await res.json();
      addAIMessage('assistant', esc(data.reply ?? 'No response.'));
    } else {
      addAIMessage('assistant', '<em style="opacity:.5">Backend not available. Wire /api/chat to your LLM.</em>');
    }
  } catch {
    addAIMessage('assistant', '<em style="opacity:.5">Could not reach AI backend.</em>');
  }
}

aiSend.addEventListener('click', sendAIMessage);
aiInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIMessage(); }
});
aiInput.addEventListener('input', () => {
  aiInput.style.height = 'auto';
  aiInput.style.height = Math.min(aiInput.scrollHeight, 120) + 'px';
});


// ═══════════════════════════════════════════════
// SECTION 5 — METRONOME  (Web Audio API)
// ═══════════════════════════════════════════════

const Metro = (() => {
  let audioCtx   = null;
  let mixerNode  = null;
  let running    = false;
  let beatIndex  = 0;
  let nextBeatAt = 0;
  let timerId    = null;

  const bpmInput = document.getElementById('metro-slider');
  const bpmNum   = document.getElementById('metro-bpm-num');
  const beatsEl  = document.getElementById('metro-beats');
  const pendulum = document.getElementById('metro-pendulum');
  const beatsSel = document.getElementById('metro-beats-select');
  const presets  = document.querySelectorAll('.metro-preset');

  function getBPM()   { return parseInt(bpmInput.value, 10); }
  function getBeats() { return parseInt(beatsSel.value, 10); }

  function buildBeatDots() {
    const n = getBeats();
    beatsEl.innerHTML = Array.from({ length: n }, (_, i) =>
      `<div class="beat-dot" id="bd-${i}"></div>`).join('');
  }

  function flashDot(idx) {
    const n = getBeats();
    for (let i = 0; i < n; i++) {
      const d = document.getElementById(`bd-${i}`);
      if (!d) continue;
      d.classList.remove('active-accent', 'active-beat');
      if (i === idx) d.classList.add(idx === 0 ? 'active-accent' : 'active-beat');
    }
    setTimeout(() => {
      const d = document.getElementById(`bd-${idx}`);
      if (d) d.classList.remove('active-accent', 'active-beat');
    }, 120);
  }

  function swingPendulum(dir) {
    pendulum.classList.remove('swing-l', 'swing-r', 'flash');
    void pendulum.offsetWidth; // reflow to restart animation
    pendulum.classList.add(dir ? 'swing-r' : 'swing-l', 'flash');
    setTimeout(() => pendulum.classList.remove('flash'), 60);
  }

  function scheduleBeats() {
    if (!running) return;
    const interval = 60 / getBPM();
    const now      = audioCtx.currentTime;

    while (nextBeatAt < now + 0.1) {
      const beat = beatIndex % getBeats();
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      if (mixerNode) gain.connect(mixerNode); // Route to recorder mix bus

      osc.frequency.value = beat === 0 ? 1050 : 880;
      gain.gain.setValueAtTime(beat === 0 ? 0.45 : 0.28, nextBeatAt);
      gain.gain.exponentialRampToValueAtTime(0.001, nextBeatAt + 0.06);

      osc.start(nextBeatAt);
      osc.stop(nextBeatAt + 0.07);

      const delay = (nextBeatAt - now) * 1000;
      const b = beat;
      const i = beatIndex;
      setTimeout(() => {
        flashDot(b);
        swingPendulum(i % 2 === 0);
      }, Math.max(0, delay));

      nextBeatAt += interval;
      beatIndex++;
    }
    timerId = setTimeout(scheduleBeats, 25);
  }

  function start() {
    if (running) return;
    if (!audioCtx) {
      audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
      mixerNode = audioCtx.createMediaStreamDestination();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    running    = true;
    beatIndex  = 0;
    nextBeatAt = audioCtx.currentTime + 0.05;
    pendulum.style.setProperty('--swing-dur', `${60 / getBPM()}s`);
    buildBeatDots();
    scheduleBeats();
  }

  function stop() {
    running = false;
    clearTimeout(timerId);
    pendulum.classList.remove('swing-l', 'swing-r', 'flash');
  }

  bpmInput.addEventListener('input', () => {
    bpmNum.textContent = bpmInput.value;
    pendulum.style.setProperty('--swing-dur', `${60 / getBPM()}s`);
  });

  beatsSel.addEventListener('change', () => { stop(); buildBeatDots(); });
  presets.forEach(p => p.addEventListener('click', () => {
    bpmInput.value = p.dataset.bpm;
    bpmNum.textContent = p.dataset.bpm;
    if (running) { stop(); start(); }
  }));

  document.getElementById('metro-start').addEventListener('click', start);
  document.getElementById('metro-stop').addEventListener('click', stop);
  buildBeatDots();

  return {
    start,
    stop,
    isRunning: () => running,
    getStream: () => mixerNode ? mixerNode.stream : null,
  };
})();


// ═══════════════════════════════════════════════
// SECTION 6 — CHROMATIC TUNER  (Web Audio + getUserMedia)
// ═══════════════════════════════════════════════

const Tuner = (() => {
  let audioCtx    = null;
  let analyser    = null;
  let mediaStream = null;
  let rafId       = null;
  let buffer      = null;

  const noteEl  = document.getElementById('tuner-note');
  const centsEl = document.getElementById('tuner-cents');
  const freqEl  = document.getElementById('tuner-freq');
  const needle  = document.getElementById('tuner-needle');

  const NOTE_NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];

  function freqToMidi(freq) { return 12 * Math.log2(freq / 440) + 69; }

  function detectPitch(buf, sampleRate) {
    const n = buf.length;
    let rms = 0;
    for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / n);
    if (rms < 0.01) return null;

    let r1 = 0, r2 = n - 1;
    const threshold = 0.2;
    for (let i = 0; i < n / 2; i++) { if (Math.abs(buf[i]) < threshold) { r1 = i; break; } }
    for (let i = 1; i < n / 2; i++) { if (Math.abs(buf[n - i]) < threshold) { r2 = n - i; break; } }
    const trimmed = buf.slice(r1, r2);
    const size = trimmed.length;

    const c = new Float32Array(size).fill(0);
    for (let i = 0; i < size; i++)
      for (let j = 0; j < size - i; j++)
        c[i] += trimmed[j] * trimmed[j + i];

    let d = 0;
    while (d < size && c[d] > c[d + 1]) d++;
    let maxPos = d;
    for (let i = d; i < size; i++) if (c[i] > c[maxPos]) maxPos = i;
    if (maxPos === 0 || maxPos === size - 1) return null;

    const refined = maxPos + (c[maxPos - 1] - c[maxPos + 1]) /
      (2 * (2 * c[maxPos] - c[maxPos - 1] - c[maxPos + 1]));
    return sampleRate / refined;
  }

  function updateUI(freq) {
    const midi    = freqToMidi(freq);
    const nearest = Math.round(midi);
    const cents   = Math.round((midi - nearest) * 100);
    const octave  = Math.floor(nearest / 12) - 1;
    const name    = NOTE_NAMES[nearest % 12];

    noteEl.textContent  = `${name}${octave}`;
    centsEl.textContent = `${cents >= 0 ? '+' : ''}${cents} cents`;
    freqEl.textContent  = `${freq.toFixed(1)} Hz`;

    const deg = Math.max(-60, Math.min(60, cents * 1.2));
    needle.style.transform = `translate(-50%, -100%) rotate(${deg}deg)`;
    needle.classList.toggle('in-tune', Math.abs(cents) <= 5);

    const openNotes = { G3: 55, D4: 62, A4: 69, E5: 76 };
    document.querySelectorAll('.open-str-note').forEach(el => {
      const midiStr = openNotes[el.dataset.note];
      el.classList.toggle('highlight', midiStr !== undefined && Math.abs(nearest - midiStr) <= 1);
    });
  }

  function tick() {
    analyser.getFloatTimeDomainData(buffer);
    const freq = detectPitch(buffer, audioCtx.sampleRate);
    if (freq && freq > 50 && freq < 5000) updateUI(freq);
    rafId = requestAnimationFrame(tick);
  }

  async function start() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx    = new (window.AudioContext || window.webkitAudioContext)();
      analyser    = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      buffer      = new Float32Array(analyser.fftSize);
      audioCtx.createMediaStreamSource(mediaStream).connect(analyser);
      tick();
    } catch (err) {
      alert('Microphone access denied. Please allow microphone use to enable the tuner.');
    }
  }

  function stop() {
    cancelAnimationFrame(rafId);
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    if (audioCtx)    audioCtx.close();
    audioCtx = analyser = mediaStream = null;
    noteEl.textContent  = '—';
    centsEl.textContent = '— cents';
    freqEl.textContent  = '— Hz';
    needle.style.transform = `translate(-50%, -100%) rotate(0deg)`;
    needle.classList.remove('in-tune');
    document.querySelectorAll('.open-str-note').forEach(el => el.classList.remove('highlight'));
  }

  document.getElementById('tuner-start').addEventListener('click', start);
  document.getElementById('tuner-stop').addEventListener('click', stop);
})();


// ═══════════════════════════════════════════════
// SECTION 7 — PITCH REFERENCE
// ═══════════════════════════════════════════════

const PitchRef = (() => {
  const grid    = document.getElementById('pitch-grid');
  const playBtn = document.getElementById('pitch-play');

  const NOTES = [
    { label:'G3',  freq:196.00 }, { label:'D4',  freq:293.66 }, { label:'A4', freq:440.00 }, { label:'E5', freq:659.25 },
    { label:'G4',  freq:392.00 }, { label:'A3',  freq:220.00 }, { label:'D5', freq:587.33 }, { label:'E4', freq:329.63 },
    { label:'B4',  freq:493.88 }, { label:'F♯4', freq:369.99 }, { label:'C5', freq:523.25 }, { label:'G5', freq:783.99 },
  ];

  let selected = NOTES[2]; // A4 default
  let audioCtx = null;
  let oscNode  = null;

  function buildGrid() {
    grid.innerHTML = NOTES.map((n, i) =>
      `<button class="pitch-note-btn${i === 2 ? ' active' : ''}" data-idx="${i}">${n.label}</button>`
    ).join('');
    grid.querySelectorAll('.pitch-note-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.pitch-note-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selected = NOTES[parseInt(btn.dataset.idx, 10)];
      });
    });
  }

  function playNote() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (oscNode) { try { oscNode.stop(); } catch {} oscNode = null; }

    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = 'sine';
    osc.frequency.value = selected.freq;
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.35, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2.0);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 2.0);
    oscNode = osc;
  }

  playBtn.addEventListener('click', playNote);
  buildGrid();
})();


// ═══════════════════════════════════════════════
// SECTION 8 — MEDIA RECORDER (iPad & Desktop)
// ═══════════════════════════════════════════════

const RecorderManager = (() => {
  let mediaRecorder   = null;
  let recordedChunks  = [];
  let cameraStream    = null;
  let combinedStream  = null;
  let mixAudioCtx     = null; // kept separate so it can be closed on stop
  let timerInterval   = null;
  let elapsedSeconds  = 0;
  let facingMode      = 'user'; // 'user' = front, 'environment' = rear

  const cameraPreview  = document.getElementById('camera-preview');
  const recIndicator   = document.getElementById('rec-indicator');
  const recTimerPip    = document.getElementById('rec-timer-pip');
  const btnRecordMain  = document.getElementById('btn-record-main');
  const btnRecordLabel = document.getElementById('btn-record-label');
  const recTimer       = document.getElementById('rec-timer');
  const uploadStatus   = document.getElementById('upload-status');
  const btnFlip        = document.getElementById('btn-flip-camera');

  function formatDuration(s) {
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
  }

  function setUploadStatus(msg, type = '') {
    uploadStatus.textContent = msg;
    uploadStatus.className = `visible ${type}`;
  }

  btnRecordMain.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording();
    } else {
      await startRecording();
    }
  });

  btnFlip.addEventListener('click', () => {
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    // Mirroring only makes sense for the front camera
    cameraPreview.classList.toggle('flip-back', facingMode === 'environment');
    // If currently recording, restart the camera stream with the new facing mode
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording();
    }
  });

  async function startRecording() {
    uploadStatus.className = '';
    uploadStatus.textContent = '';

    try {
      // 1. Request camera + mic
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });

      // 2. Show PiP preview (playsinline is required for iOS)
      cameraPreview.muted = true;
      cameraPreview.setAttribute('playsinline', '');
      cameraPreview.srcObject = cameraStream;
      cameraPreview.style.display = 'block';
      cameraPreview.classList.toggle('flip-back', facingMode === 'environment');
      await cameraPreview.play();

      // 3. Build combined audio stream (mic + metronome click if running)
      const metroStream = Metro.getStream();
      if (metroStream && metroStream.getAudioTracks().length > 0) {
        mixAudioCtx = new AudioContext();
        const micSrc   = mixAudioCtx.createMediaStreamSource(cameraStream);
        const metroSrc = mixAudioCtx.createMediaStreamSource(metroStream);
        const dest     = mixAudioCtx.createMediaStreamDestination();
        micSrc.connect(dest);
        metroSrc.connect(dest);
        combinedStream = new MediaStream([
          ...cameraStream.getVideoTracks(),
          ...dest.stream.getAudioTracks(),
        ]);
      } else {
        combinedStream = cameraStream;
      }

      // 4. Initialise MediaRecorder with the best supported format
      recordedChunks = [];
      const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')
        ? 'video/mp4'
        : 'video/webm';
      mediaRecorder = new MediaRecorder(combinedStream, { mimeType });

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = handleRecordingStop;

      // 5. Start and update UI
      mediaRecorder.start(100); // collect in 100 ms chunks for smoother stop

      elapsedSeconds = 0;
      recTimer.classList.add('visible');
      recTimer.textContent = '00:00';
      timerInterval = setInterval(() => {
        elapsedSeconds++;
        const t = formatDuration(elapsedSeconds);
        recTimer.textContent = t;
        recTimerPip.textContent = t;
      }, 1000);

      recIndicator.classList.add('visible');
      btnRecordMain.classList.add('recording');
      btnRecordLabel.textContent = 'Stop Recording';

      // Demo video keeps playing — no action needed; the PiP overlay simply
      // appears on top of the existing main-player content.

    } catch (err) {
      console.error('Camera capture error:', err);
      alert('Camera access denied or unavailable. Please allow camera and microphone permissions.');
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    clearInterval(timerInterval);
  }

  async function handleRecordingStop() {
    // Clean up camera stream
    cameraStream.getTracks().forEach(t => t.stop());
    if (mixAudioCtx) { mixAudioCtx.close(); mixAudioCtx = null; }

    cameraPreview.style.display = 'none';
    cameraPreview.srcObject = null;
    recIndicator.classList.remove('visible');
    recTimer.classList.remove('visible');
    btnRecordMain.classList.remove('recording');
    btnRecordLabel.textContent = 'Start Recording';

    // Upload
    const ext      = (recordedChunks[0]?.type || 'video/mp4').includes('mp4') ? 'mp4' : 'webm';
    const filename = `Practice_${Date.now()}.${ext}`;
    const blob     = new Blob(recordedChunks, { type: `video/${ext}` });
    recordedChunks = [];

    setUploadStatus('⏳ Uploading recording…');
    const formData = new FormData();
    formData.append('file', blob, filename);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        setUploadStatus(`✓ Saved as ${data.filename}`, 'success');
        fetchFiles(); // Refresh library so the new file appears immediately
      } else {
        const err = await res.json().catch(() => ({}));
        setUploadStatus(`Upload failed: ${err.detail || res.status}`, 'error');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setUploadStatus('Upload failed. Check your connection.', 'error');
    }
  }

  return { startRecording, stopRecording };
})();


// ═══════════════════════════════════════════════
// SECTION 9 — VIDEO LOAD / SCORE LOAD
// ═══════════════════════════════════════════════

function loadVideo(path, name) {
  // If the same file is already loaded, just play it
  if (state.activeFile?.path === path) {
    mainPlayer.play().catch(() => {});
    return;
  }

  mainPlayer.src = path;
  mainPlayer.load();
  videoPH.classList.add('hidden');
  state.activeFile = { name, path };

  mainPlayer.play().catch(e => {
    if (e.name !== 'AbortError') console.warn('Auto-play blocked:', e);
  });

  addAIMessage('assistant',
    `Loaded: <strong>${esc(name)}</strong>. Click [Add Note] to timestamp a moment, or use the Tools tab to start the metronome.`);
}

function loadScore(path, name) {
  scoreViewer.src = path + '#view=FitH&toolbar=0&navpanes=0';
  scorePH.classList.add('hidden');
  scoreFilename.textContent = name;
  scoreFilename.style.color = 'var(--accent)';
  state.activeFile = { name, path };
}


// ═══════════════════════════════════════════════
// SECTION 10 — HELPERS
// ═══════════════════════════════════════════════

function isVideo(name) { return /\.(mp4|webm|mov|mkv|avi)$/i.test(name); }
function isPDF(name)   { return /\.pdf$/i.test(name); }

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function videoIcon() {
  return `<svg class="file-icon" viewBox="0 0 14 14" fill="none"><rect x="1" y="2.5" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1"/><path d="M5.5 5L9 7L5.5 9V5Z" fill="currentColor"/></svg>`;
}
function pdfIcon() {
  return `<svg class="file-icon" viewBox="0 0 14 14" fill="none"><rect x="2" y="1" width="10" height="12" rx="1.5" stroke="currentColor" stroke-width="1"/><path d="M4.5 5H9.5M4.5 7H9.5M4.5 9H7" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>`;
}
function fileIcon() {
  return `<svg class="file-icon" viewBox="0 0 14 14" fill="none"><path d="M3 1.5H8.5L11 4V12.5H3V1.5Z" stroke="currentColor" stroke-width="1"/><path d="M8.5 1.5V4H11" stroke="currentColor" stroke-width="1"/></svg>`;
}

// Space bar: play / pause (only when not typing)
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (mainPlayer.paused) mainPlayer.play();
    else mainPlayer.pause();
  }
});


// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════

(async function init() {
  await loadPersistedAnnotations(); // single canonical async call
  fetchFiles();
})();
