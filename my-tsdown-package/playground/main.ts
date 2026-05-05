import { getStroke } from 'perfect-freehand';
import type { Stroke } from '../src/core/KinematicRule';

import { KinematicReversalRule } from '../src/rules/KinematicReversalRule';
import { TimeTakenRule } from '../src/rules/TimeTakenRule';
import { ProportionalDistortionRule } from '../src/rules/ProportionalDistortionRule';
import { DrawingProcessRule } from '../src/rules/DrawingProcessRule';
import { ReferenceSimilarityRule } from '../src/rules/ReferenceSimilarityRule';

const drawingCanvas = document.getElementById('drawing-canvas') as HTMLCanvasElement;
const refCanvas = document.getElementById('reference-canvas') as HTMLCanvasElement;
const ctx = drawingCanvas.getContext('2d')!;
const refCtx = refCanvas.getContext('2d')!;
const validateBtn = document.getElementById('validate-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const replayBtn = document.getElementById('replay-btn') as HTMLButtonElement;
const shapeSelect = document.getElementById('shape-select') as HTMLSelectElement;
const outputLog = document.getElementById('output-log')!;

let strokes: Stroke[] = [];
let currentStroke: Stroke = [];

// Initialize rules
const reversalRule = new KinematicReversalRule();
const timeRule = new TimeTakenRule();
const propRule = new ProportionalDistortionRule();
const processRule = new DrawingProcessRule();
const similarityRule = new ReferenceSimilarityRule();

// --- REPLAY ENGINE VARIABLES ---
let isReplaying = false;
let replayReqId: number | null = null;

function drawReference() {
  refCtx.fillStyle = '#fafafa';
  refCtx.fillRect(0, 0, refCanvas.width, refCanvas.height);
  refCtx.fillStyle = '#000';

  const shape = shapeSelect.value;

  if (shape === 'spiral') {
    refCtx.beginPath();
    const centerX = refCanvas.width / 2;
    const centerY = refCanvas.height / 2;
    for (let i = 0; i < 360; i++) {
      const angle = 0.1 * i;
      const x = centerX + (1 + angle) * Math.cos(angle) * 12;
      const y = centerY + (1 + angle) * Math.sin(angle) * 12;
      if (i === 0) refCtx.moveTo(x, y);
      else refCtx.lineTo(x, y);
    }
    refCtx.lineWidth = 4;
    refCtx.stroke();
  } else {
    refCtx.font = '250px Arial';
    refCtx.textAlign = 'center';
    refCtx.textBaseline = 'middle';
    refCtx.fillText(shape, refCanvas.width / 2, refCanvas.height / 2);
  }
}

// Render accepts an optional parameter so we can pass partial strokes during a replay
function render(renderStrokes: Stroke[] = strokes) {
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  ctx.fillStyle = '#000';

  renderStrokes.forEach(s => {
    if (s.length < 2) return;
    const inputPoints = s.map(p => [p.x, p.y, p.pressure]);
    const outline = getStroke(inputPoints, {
      size: 14,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
    });

    ctx.beginPath();
    // @ts-ignore
    outline.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.fill();
  });
}

drawingCanvas.addEventListener('pointerdown', (e) => {
  if (isReplaying) return; // Prevent drawing during replay
  drawingCanvas.setPointerCapture(e.pointerId);
  currentStroke = [{ x: e.offsetX, y: e.offsetY, pressure: e.pressure, timestamp: Date.now() }];
  strokes.push(currentStroke);
});

drawingCanvas.addEventListener('pointermove', (e) => {
  if (e.buttons !== 1 || isReplaying) return;
  currentStroke.push({ x: e.offsetX, y: e.offsetY, pressure: e.pressure, timestamp: Date.now() });
  render();
});

shapeSelect.addEventListener('change', () => {
  clearCanvas();
  drawReference();
});

clearBtn.addEventListener('click', clearCanvas);

function clearCanvas() {
  strokes = [];
  if (replayReqId) cancelAnimationFrame(replayReqId);
  isReplaying = false;
  outputLog.textContent = 'Waiting for input...';
  outputLog.style.color = '#fff';
  render();
}

// --- VISUAL REPLAY LOGIC ---
replayBtn.addEventListener('click', () => {
  if (strokes.length === 0 || isReplaying) return;
  
  isReplaying = true;
  outputLog.textContent = 'Replaying...';
  
  const allPoints = strokes.flat();
  const startTime = allPoints[0].timestamp;
  const duration = allPoints[allPoints.length - 1].timestamp - startTime;
  
  let animationStart = performance.now();

  function replayLoop(now: number) {
    const elapsed = now - animationStart;
    const currentSimulatedTime = startTime + elapsed;

    // Filter strokes to only include points drawn up to 'currentSimulatedTime'
    const partialStrokes = strokes.map(stroke => {
      return stroke.filter(p => p.timestamp <= currentSimulatedTime);
    }).filter(stroke => stroke.length > 0);

    render(partialStrokes);

    if (elapsed < duration) {
      replayReqId = requestAnimationFrame(replayLoop);
    } else {
      isReplaying = false;
      render(); // Ensure final render includes everything
      outputLog.textContent = 'Replay complete.';
    }
  }

  replayReqId = requestAnimationFrame(replayLoop);
});

// --- UNIFIED EVALUATION ENGINE ---
validateBtn.addEventListener('click', () => {
  if (strokes.length === 0 || isReplaying) return;
  
  const selectedShape = shapeSelect.value;
  
  const results = {
    reversal: reversalRule.evaluate(strokes, selectedShape),
    timeTaken: timeRule.evaluate(strokes, selectedShape),
    proportion: propRule.evaluate(strokes, selectedShape),
    process: processRule.evaluate(strokes, selectedShape),
    similarity: similarityRule.evaluate(strokes, selectedShape)
  };

  outputLog.textContent = JSON.stringify(results, null, 2);

  // Simple fail-check: if any rule fails, color it amber or red
  const allPassed = Object.values(results).every(r => r.passed);
  outputLog.style.color = allPassed ? '#10b981' : '#f59e0b';
});

drawReference();
render();