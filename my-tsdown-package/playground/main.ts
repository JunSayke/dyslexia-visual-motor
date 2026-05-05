import { getStroke } from 'perfect-freehand';
import type { Stroke } from '../src/core/KinematicRule';
import { FeatureExtractor } from '../src/core/FeatureExtractor';
import { createReferenceProfile } from '../src/core/ReferenceProfile';
import type { ReferenceProfile } from '../src/core/ReferenceProfile';

import { ReversalRule } from '../src/rules/ReversalRule';
import { TimeTakenRule } from '../src/rules/TimeTakenRule';
import { ProportionalDistortionRule } from '../src/rules/ProportionalDistortionRule';
import { ReferenceSimilarityRule } from '../src/rules/ReferenceSimilarityRule';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const drawingCanvas = document.getElementById('drawing-canvas') as HTMLCanvasElement;
const refCanvas     = document.getElementById('reference-canvas') as HTMLCanvasElement;
const ctx           = drawingCanvas.getContext('2d')!;
const refCtx        = refCanvas.getContext('2d')!;

const modeToggle    = document.getElementById('mode-toggle') as HTMLButtonElement;
const saveRefBtn    = document.getElementById('save-ref-btn') as HTMLButtonElement;
const refLabelInput = document.getElementById('ref-label') as HTMLInputElement;
const refSelect     = document.getElementById('ref-select') as HTMLSelectElement;
const clearBtn      = document.getElementById('clear-btn') as HTMLButtonElement;
const replayBtn     = document.getElementById('replay-btn') as HTMLButtonElement;
const validateBtn   = document.getElementById('validate-btn') as HTMLButtonElement;
const outputLog     = document.getElementById('output-log')!;
const modeLabel     = document.getElementById('mode-label')!;
const refPanel      = document.getElementById('ref-controls')!;
const testPanel     = document.getElementById('test-controls')!;

// ── State ─────────────────────────────────────────────────────────────────────
type AppMode = 'record-reference' | 'test';

let mode: AppMode = 'record-reference';
let strokes: Stroke[] = [];
let currentStroke: Stroke = [];
let savedReferences: ReferenceProfile[] = [];
let isReplaying = false;
let replayReqId: number | null = null;

// ── Rules ─────────────────────────────────────────────────────────────────────
const reversalRule  = new ReversalRule();
const timeRule      = new TimeTakenRule();
const propRule      = new ProportionalDistortionRule();
const similarityRule = new ReferenceSimilarityRule();

// ── Rendering ─────────────────────────────────────────────────────────────────
function renderStrokes(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, renderStrokes: Stroke[]) {
  context.fillStyle = '#fafafa';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = mode === 'record-reference' ? '#6366f1' : '#000';

  renderStrokes.forEach(s => {
    if (s.length < 2) return;
    const outline = getStroke(s.map(p => [p.x, p.y, p.pressure]), {
      size: 14, thinning: 0.5, smoothing: 0.5, streamline: 0.5,
    });
    context.beginPath();
    // @ts-ignore
    outline.forEach(([x, y], i) => i === 0 ? context.moveTo(x, y) : context.lineTo(x, y));
    context.fill();
  });
}

function render(partial: Stroke[] = strokes) {
  renderStrokes(drawingCanvas, ctx, partial);
}

function renderSelectedReference() {
  const ref = getSelectedReference();
  if (!ref) {
    refCtx.fillStyle = '#fafafa';
    refCtx.fillRect(0, 0, refCanvas.width, refCanvas.height);
    refCtx.fillStyle = '#888';
    refCtx.font = '16px system-ui';
    refCtx.textAlign = 'center';
    refCtx.fillText('No reference selected', refCanvas.width / 2, refCanvas.height / 2);
    return;
  }
  renderStrokes(refCanvas, refCtx, ref.referenceStrokes);
}

// ── Mode switching ────────────────────────────────────────────────────────────
function setMode(newMode: AppMode) {
  mode = newMode;

  if (mode === 'record-reference') {
    modeLabel.textContent = 'Mode: Drawing Reference';
    modeToggle.textContent = '🧪 Switch to Test Mode';
    refPanel.style.display = 'flex';
    testPanel.style.display = 'none';
    validateBtn.style.display = 'none';
    saveRefBtn.style.display = '';

    refCtx.fillStyle = '#fafafa';
    refCtx.fillRect(0, 0, refCanvas.width, refCanvas.height);
    refCtx.fillStyle = '#6366f1';
    refCtx.font = '16px system-ui';
    refCtx.textAlign = 'center';
    refCtx.fillText('← Your reference will appear here after saving', refCanvas.width / 2, refCanvas.height / 2);
  } else {
    modeLabel.textContent = 'Mode: Testing';
    modeToggle.textContent = '✏️ Draw a New Reference';
    refPanel.style.display = 'none';
    testPanel.style.display = 'flex';
    validateBtn.style.display = '';
    saveRefBtn.style.display = 'none';
    renderSelectedReference();
  }

  clearStrokes();
}

modeToggle.addEventListener('click', () => {
  setMode(mode === 'record-reference' ? 'test' : 'record-reference');
});

// ── Reference management ──────────────────────────────────────────────────────
saveRefBtn.addEventListener('click', () => {
  if (strokes.length === 0) {
    outputLog.textContent = '⚠ Draw the reference shape first, then save it.';
    return;
  }
  const label = refLabelInput.value.trim() || `Reference ${savedReferences.length + 1}`;

  let fingerprint;
  try {
    fingerprint = FeatureExtractor.extract(strokes);
  } catch (e) {
    outputLog.textContent = `⚠ Could not extract features: ${e}`;
    return;
  }

  const profile = createReferenceProfile(label, strokes, fingerprint);
  savedReferences.push(profile);

  localStorage.setItem('dysgraphia_refs', JSON.stringify(savedReferences));

  rebuildRefSelect();
  refSelect.value = profile.id;

  outputLog.textContent = `✓ Reference "${label}" saved.\nFingerprint: ${JSON.stringify(fingerprint, null, 2)}`;

  renderStrokes(refCanvas, refCtx, strokes);
  clearStrokes();
});

function rebuildRefSelect() {
  refSelect.innerHTML = '<option value="">-- choose reference --</option>';
  savedReferences.forEach(ref => {
    const opt = document.createElement('option');
    opt.value = ref.id;
    opt.textContent = ref.label;
    refSelect.appendChild(opt);
  });
}

refSelect.addEventListener('change', renderSelectedReference);

function getSelectedReference(): ReferenceProfile | undefined {
  return savedReferences.find(r => r.id === refSelect.value);
}

try {
  const stored = localStorage.getItem('dysgraphia_refs');
  if (stored) {
    savedReferences = JSON.parse(stored) as ReferenceProfile[];
    rebuildRefSelect();
  }
} catch {
  // fresh start
}

// ── Drawing ───────────────────────────────────────────────────────────────────
drawingCanvas.addEventListener('pointerdown', e => {
  if (isReplaying) return;
  drawingCanvas.setPointerCapture(e.pointerId);
  currentStroke = [{ x: e.offsetX, y: e.offsetY, pressure: e.pressure, timestamp: Date.now() }];
  strokes.push(currentStroke);
});

drawingCanvas.addEventListener('pointermove', e => {
  if (e.buttons !== 1 || isReplaying) return;
  currentStroke.push({ x: e.offsetX, y: e.offsetY, pressure: e.pressure, timestamp: Date.now() });
  render();
});

// ── Clear / Replay ────────────────────────────────────────────────────────────
clearBtn.addEventListener('click', clearStrokes);

function clearStrokes() {
  strokes = [];
  if (replayReqId) cancelAnimationFrame(replayReqId);
  isReplaying = false;
  outputLog.textContent = 'Waiting for input…';
  outputLog.style.color = '#fff';
  render();
}

replayBtn.addEventListener('click', () => {
  if (strokes.length === 0 || isReplaying) return;
  isReplaying = true;
  outputLog.textContent = 'Replaying…';

  const all = strokes.flat();
  const startTime = all[0].timestamp;
  const duration = all[all.length - 1].timestamp - startTime;
  const animStart = performance.now();

  function loop(now: number) {
    const elapsed = now - animStart;
    const simTime = startTime + elapsed;
    const partial = strokes.map(s => s.filter(p => p.timestamp <= simTime)).filter(s => s.length > 0);
    render(partial);
    if (elapsed < duration) {
      replayReqId = requestAnimationFrame(loop);
    } else {
      isReplaying = false;
      render();
      outputLog.textContent = 'Replay complete.';
    }
  }
  replayReqId = requestAnimationFrame(loop);
});

// ── Validation (test mode only) ───────────────────────────────────────────────
validateBtn.addEventListener('click', () => {
  if (strokes.length === 0 || isReplaying) return;

  const reference = getSelectedReference();
  if (!reference) {
    outputLog.textContent = '⚠ Select a reference before validating.';
    outputLog.style.color = '#f59e0b';
    return;
  }

  const results = {
    reversal:   reversalRule.evaluate(strokes, reference),
    timeTaken:  timeRule.evaluate(strokes, reference),
    proportion: propRule.evaluate(strokes, reference),
    similarity: similarityRule.evaluate(strokes, reference),
  };

  const allPassed = Object.values(results).every(r => r.passed);
  outputLog.style.color = allPassed ? '#10b981' : '#f59e0b';
  outputLog.textContent = JSON.stringify(results, null, 2);
});

// ── Boot ──────────────────────────────────────────────────────────────────────
setMode('record-reference');
render();