// Canvas drawing for the Bagh Chal board.
//
// Critical change vs. the old code: `draw()` no longer schedules itself every
// frame. Instead, the renderer subscribes to `onRedraw` from the store, and
// `markDirty()` from anywhere in the app triggers a single rAF-batched redraw.
//
// On the homepage / when nothing is happening, the GPU goes idle.

import { GRID_SIZE, PIECE_TYPES } from '../config/gameConfig.js';
import { BOARD_POSITIONS } from '../game/boardRules.js';
import { markDirty, onRedraw, state } from '../state/store.js';

let canvas = null;
let ctx = null;

const images = {
  tigerPiece: null,
  goatPiece: null,
  backdrop: null,
  board: null
};

/** Initialize the renderer. Must be called once after DOM is ready. */
export function initBoardRenderer() {
  canvas = document.getElementById('game-canvas');
  if (!canvas) {
    console.error('[render] #game-canvas not found in DOM');
    return;
  }
  ctx = canvas.getContext('2d');
  canvas.width = 600;
  canvas.height = 600;

  // Lazy-load images. Each image triggers a redraw when it loads so the board
  // appears as soon as it's ready (no need to gate the first draw on imagesLoaded).
  const sources = {
    tigerPiece: 'assets/bagh.png',
    goatPiece: 'assets/bhakhra.png',
    backdrop: 'assets/Backdrop.png',
    board: 'assets/baghchal.png'
  };
  for (const [key, src] of Object.entries(sources)) {
    const img = new Image();
    img.src = src;
    img.onload = markDirty;
    img.onerror = markDirty;
    images[key] = img;
  }

  // Resize handler — re-fits canvas to its container, then triggers a redraw.
  window.addEventListener('resize', resizeCanvas, { passive: true });

  // Subscribe to store changes — this is the only place draw() runs.
  onRedraw(() => {
    if (canvas && ctx) drawBoard();
  });

  // Kick off initial draw.
  markDirty();
}

/** Re-fit the canvas to its parent container, then redraw. */
export function resizeCanvas() {
  if (!canvas) return;
  const container = document.querySelector('.board-container');
  if (!container) return;
  const availableWidth = Math.max(container.clientWidth - 48, 320);
  const availableHeight = Math.max(container.clientHeight - 48, 320);
  const size = Math.min(availableWidth, availableHeight, 980);
  canvas.width = size;
  canvas.height = size;
  markDirty();
}

/**
 * Schedule resizeCanvas after layout has settled. Two nested rAFs let the
 * browser apply pending layout changes (e.g. a panel that was just shown) so
 * `container.clientWidth` reads the right value.
 */
export function scheduleCanvasResize() {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(resizeCanvas);
  });
}

/** Convert a click in canvas coordinates to a board index (-1 if no hit). */
export function getClickedPosition(x, y) {
  if (!canvas) return -1;
  const size = Math.min(canvas.width, canvas.height);
  const padding = size * 0.1;
  const cellSize = (size - 2 * padding) / (GRID_SIZE - 1);
  for (let i = 0; i < 25; i++) {
    const { row, col } = BOARD_POSITIONS[i];
    const px = padding + col * cellSize;
    const py = padding + row * cellSize;
    const distance = Math.hypot(x - px, y - py);
    if (distance < cellSize * 0.3) return i;
  }
  return -1;
}

/** Returns the live canvas reference (used by event-binding code). */
export function getCanvas() { return canvas; }

// ── Drawing ────────────────────────────────────────────────────────────────
function drawOctagonPath(x, y, radius) {
  const sides = 8;
  const startAngle = Math.PI / 8;
  ctx.beginPath();
  for (let side = 0; side < sides; side++) {
    const angle = startAngle + (side * Math.PI * 2) / sides;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (side === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawBoard() {
  const game = state.game;
  const size = Math.min(canvas.width, canvas.height);

  // Backdrop
  const boardGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  boardGradient.addColorStop(0, '#7694b0');
  boardGradient.addColorStop(0.5, '#5f7892');
  boardGradient.addColorStop(1, '#4d657d');
  ctx.fillStyle = boardGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const boardGlow = ctx.createRadialGradient(
    canvas.width * 0.48, canvas.height * 0.42, 0,
    canvas.width * 0.48, canvas.height * 0.42, canvas.width * 0.52
  );
  boardGlow.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
  boardGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = boardGlow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const padding = size * 0.1;
  const cellSize = (size - 2 * padding) / (GRID_SIZE - 1);

  // Grid lines
  ctx.strokeStyle = 'rgba(247, 251, 255, 0.86)';
  ctx.lineWidth = 2.6;
  for (let i = 0; i < GRID_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(padding, padding + i * cellSize);
    ctx.lineTo(padding + (GRID_SIZE - 1) * cellSize, padding + i * cellSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padding + i * cellSize, padding);
    ctx.lineTo(padding + i * cellSize, padding + (GRID_SIZE - 1) * cellSize);
    ctx.stroke();
  }

  // Diagonals
  const diag = (x1, y1, x2, y2) => {
    ctx.beginPath();
    ctx.moveTo(padding + x1 * cellSize, padding + y1 * cellSize);
    ctx.lineTo(padding + x2 * cellSize, padding + y2 * cellSize);
    ctx.stroke();
  };
  diag(0, 0, 4, 4);
  diag(4, 0, 0, 4);
  diag(2, 0, 4, 2);
  diag(4, 2, 2, 4);
  diag(2, 4, 0, 2);
  diag(0, 2, 2, 0);

  // Valid-move indicators
  if (game.validMoves.length > 0) {
    ctx.fillStyle = 'rgba(99, 204, 255, 0.28)';
    for (const move of game.validMoves) {
      const { row, col } = BOARD_POSITIONS[move.to];
      const x = padding + col * cellSize;
      const y = padding + row * cellSize;
      ctx.beginPath();
      ctx.arc(x, y, cellSize * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Pieces
  for (let i = 0; i < 25; i++) {
    const piece = game.board[i];
    if (piece === PIECE_TYPES.EMPTY) continue;
    const { row, col } = BOARD_POSITIONS[i];
    const x = padding + col * cellSize;
    const y = padding + row * cellSize;
    if (piece === PIECE_TYPES.TIGER) drawTiger(x, y, cellSize, i);
    else if (piece === PIECE_TYPES.GOAT) drawGoat(x, y, cellSize, i);
  }
}

function drawTiger(x, y, cellSize, index) {
  const game = state.game;
  const isSelected = game.selectedPiece === index;
  const isCurrentTurn = game.currentPlayer === PIECE_TYPES.TIGER;
  const chipRadius = cellSize * 0.4;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#111111';
  drawOctagonPath(x, y, chipRadius);
  ctx.fill();
  resetShadow();

  const tigerImg = images.tigerPiece;
  const innerR = chipRadius * 0.82;
  if (tigerImg && tigerImg.complete) {
    ctx.save();
    drawOctagonPath(x, y, innerR);
    ctx.clip();
    ctx.drawImage(tigerImg, x - innerR, y - innerR, innerR * 2, innerR * 2);
    ctx.restore();
  }

  if (isSelected) {
    ctx.shadowColor = '#e9f3ff'; ctx.shadowBlur = 20;
    ctx.strokeStyle = '#f4f8ff'; ctx.lineWidth = 4;
  } else if (isCurrentTurn) {
    ctx.shadowColor = '#6fd4ff'; ctx.shadowBlur = 14;
    ctx.strokeStyle = '#6fd4ff'; ctx.lineWidth = 4;
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.86)';
    ctx.lineWidth = 2;
  }
  drawOctagonPath(x, y, chipRadius);
  ctx.stroke();
  resetShadow();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.beginPath();
  ctx.arc(x - chipRadius * 0.28, y - chipRadius * 0.32, chipRadius * 0.42, 0, Math.PI * 2);
  ctx.fill();
}

function drawGoat(x, y, cellSize, index) {
  const game = state.game;
  const isSelected = game.selectedPiece === index;
  const chipRadius = cellSize * 0.4;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, chipRadius, 0, Math.PI * 2);
  ctx.fill();
  resetShadow();

  const goatImg = images.goatPiece;
  const goatInnerR = chipRadius * 0.82;
  if (goatImg && goatImg.complete) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, goatInnerR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(goatImg, x - goatInnerR, y - goatInnerR, goatInnerR * 2, goatInnerR * 2);
    ctx.restore();
  }

  if (isSelected) {
    ctx.shadowColor = '#5bc9ff'; ctx.shadowBlur = 14;
    ctx.strokeStyle = '#5bc9ff'; ctx.lineWidth = 4;
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
  }
  ctx.beginPath();
  ctx.arc(x, y, chipRadius, 0, Math.PI * 2);
  ctx.stroke();
  resetShadow();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.beginPath();
  ctx.arc(x - chipRadius * 0.28, y - chipRadius * 0.32, chipRadius * 0.42, 0, Math.PI * 2);
  ctx.fill();
}

function resetShadow() {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}
