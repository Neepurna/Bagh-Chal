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
  const initDpr = window.devicePixelRatio || 1;
  canvas.width = 600 * initDpr;
  canvas.height = 600 * initDpr;
  canvas.style.width = '600px';
  canvas.style.height = '600px';
  ctx.setTransform(initDpr, 0, 0, initDpr, 0, 0);

  // Lazy-load images. Each image triggers a redraw when it loads so the board
  // appears as soon as it's ready (no need to gate the first draw on imagesLoaded).
  const sources = {
    tigerPiece: 'assets/Tiger.png',
    goatPiece:  'assets/Goat.png'
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
  const cssSize = Math.min(availableWidth, availableHeight, 980);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cssSize * dpr;
  canvas.height = cssSize * dpr;
  canvas.style.width = cssSize + 'px';
  canvas.style.height = cssSize + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(canvas.width, canvas.height) / dpr;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const padding = size * 0.1;
  const cellSize = (size - 2 * padding) / (GRID_SIZE - 1);

  // ── Background — warm cream ──────────────────────────────────────
  ctx.fillStyle = '#F5F0E4';
  ctx.fillRect(0, 0, size, size);

  // Subtle dot-grid texture
  ctx.fillStyle = 'rgba(17,17,17,0.06)';
  const dotSpacing = cellSize * 0.5;
  for (let dx = dotSpacing; dx < size; dx += dotSpacing) {
    for (let dy = dotSpacing; dy < size; dy += dotSpacing) {
      ctx.beginPath();
      ctx.arc(dx, dy, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Grid lines — bold black ──────────────────────────────────────
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = Math.max(2, size * 0.004);
  ctx.lineCap = 'round';

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

  // ── Diagonals ────────────────────────────────────────────────────
  ctx.lineWidth = Math.max(1.5, size * 0.003);
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

  // ── Intersection dots ────────────────────────────────────────────
  const dotR = Math.max(3, size * 0.007);
  for (let i = 0; i < 25; i++) {
    if (game.board[i] !== PIECE_TYPES.EMPTY) continue;
    const { row, col } = BOARD_POSITIONS[i];
    const x = padding + col * cellSize;
    const y = padding + row * cellSize;
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Valid-move indicators — yellow circles ───────────────────────
  if (game.validMoves.length > 0) {
    for (const move of game.validMoves) {
      const { row, col } = BOARD_POSITIONS[move.to];
      const x = padding + col * cellSize;
      const y = padding + row * cellSize;
      const r = cellSize * 0.22;
      // Shadow offset (neubrutalist)
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.arc(x + 3, y + 3, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFD60A';
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // ── Pieces ───────────────────────────────────────────────────────
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
  const r = cellSize * 0.38;
  const shadowOffset = Math.max(3, r * 0.18);
  const border = Math.max(2.5, r * 0.1);

  // Neubrutalist offset shadow
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(x + shadowOffset, y + shadowOffset, r, 0, Math.PI * 2);
  ctx.fill();

  // Tiger chip background — red
  ctx.fillStyle = isSelected ? '#FFD60A' : '#E8251B';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = border;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Tiger image
  const tigerImg = images.tigerPiece;
  const innerR = r * 0.78;
  if (tigerImg && tigerImg.complete && tigerImg.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, innerR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(tigerImg, x - innerR, y - innerR, innerR * 2, innerR * 2);
    ctx.restore();
  }

  // Active-turn ring — yellow
  if (isCurrentTurn && !isSelected) {
    ctx.strokeStyle = '#FFD60A';
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    ctx.arc(x, y, r + border, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawGoat(x, y, cellSize, index) {
  const game = state.game;
  const isSelected = game.selectedPiece === index;
  const r = cellSize * 0.38;
  const shadowOffset = Math.max(3, r * 0.18);
  const border = Math.max(2.5, r * 0.1);

  // Neubrutalist offset shadow
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(x + shadowOffset, y + shadowOffset, r, 0, Math.PI * 2);
  ctx.fill();

  // Goat chip background — cream/white
  ctx.fillStyle = isSelected ? '#FFD60A' : '#F5F0E4';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = border;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Goat image
  const goatImg = images.goatPiece;
  const innerR = r * 0.78;
  if (goatImg && goatImg.complete && goatImg.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, innerR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(goatImg, x - innerR, y - innerR, innerR * 2, innerR * 2);
    ctx.restore();
  }
}

function resetShadow() {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}
