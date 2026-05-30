export const PIECE = {
  EMPTY: 0,
  TIGER: 1,
  GOAT: 2
} as const;

export const PHASE = {
  PLACEMENT: 'placement',
  MOVEMENT: 'movement'
} as const;

export type Side = 'tiger' | 'goat';

export type MoveInput = {
  type: 'place' | 'move';
  from?: number;
  to: number;
  capture?: number | null;
};

export type GameState = {
  board: number[];
  currentPlayer: Side;
  phase: string;
  goatsPlaced: number;
  goatsCaptured: number;
  tigerIdentities: Record<string, number>;
  goatIdentities: Record<string, number>;
  repetitionCounts?: Record<string, number>;
  gameOver?: boolean;
};

export type BotDifficulty = 'simple' | 'medium' | 'strong';

const EDGE_CENTERS = [2, 10, 14, 22];
const BORDER_POSITIONS = [0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24];

const POSITIONS = Array.from({ length: 25 }, (_, index) => ({
  row: Math.floor(index / 5),
  col: index % 5
}));

export function initialState(): GameState {
  return {
    board: [
      PIECE.TIGER, PIECE.EMPTY, PIECE.EMPTY, PIECE.EMPTY, PIECE.TIGER,
      PIECE.EMPTY, PIECE.EMPTY, PIECE.EMPTY, PIECE.EMPTY, PIECE.EMPTY,
      PIECE.EMPTY, PIECE.EMPTY, PIECE.EMPTY, PIECE.EMPTY, PIECE.EMPTY,
      PIECE.EMPTY, PIECE.EMPTY, PIECE.EMPTY, PIECE.EMPTY, PIECE.EMPTY,
      PIECE.TIGER, PIECE.EMPTY, PIECE.EMPTY, PIECE.EMPTY, PIECE.TIGER
    ],
    currentPlayer: 'goat',
    phase: PHASE.PLACEMENT,
    goatsPlaced: 0,
    goatsCaptured: 0,
    tigerIdentities: { '0': 0, '4': 1, '20': 2, '24': 3 },
    goatIdentities: {},
    repetitionCounts: {}
  };
}

export function applyPlayerMove(state: GameState, side: Side, move: MoveInput) {
  if (state.currentPlayer !== side) throw new Error('It is not your turn.');
  return applyMove(state, side, move);
}

export function applyMove(state: GameState, side: Side, move: MoveInput) {
  const next = cloneState(state);
  if (side === 'goat' && next.phase === PHASE.PLACEMENT) {
    if (move.type !== 'place') throw new Error('Goat must place during placement phase.');
    if (!isBoardIndex(move.to) || next.board[move.to] !== PIECE.EMPTY) throw new Error('Invalid goat placement.');
    next.board[move.to] = PIECE.GOAT;
    next.goatIdentities[String(move.to)] = next.goatsPlaced % 20;
    next.goatsPlaced += 1;
    if (next.goatsPlaced === 20) next.phase = PHASE.MOVEMENT;
    next.currentPlayer = 'tiger';
    return { state: next, move: { type: 'place', to: move.to } };
  }

  if (move.type !== 'move' || !isBoardIndex(move.from) || !isBoardIndex(move.to)) {
    throw new Error('Invalid move payload.');
  }

  const piece = side === 'tiger' ? PIECE.TIGER : PIECE.GOAT;
  if (next.board[move.from] !== piece) throw new Error('Selected piece does not belong to the moving side.');
  const valid = getValidMovesForBoard(move.from, next.board).find((candidate) =>
    candidate.to === move.to && (candidate.capture ?? null) === (move.capture ?? null)
  );
  if (!valid) throw new Error('Illegal BaghChal move.');

  next.board[move.to] = piece;
  next.board[move.from] = PIECE.EMPTY;
  if (side === 'tiger') {
    next.tigerIdentities[String(move.to)] = next.tigerIdentities[String(move.from)] ?? 0;
    delete next.tigerIdentities[String(move.from)];
    if (valid.capture !== null && valid.capture !== undefined) {
      next.board[valid.capture] = PIECE.EMPTY;
      delete next.goatIdentities[String(valid.capture)];
      next.goatsCaptured += 1;
    }
    next.currentPlayer = 'goat';
  } else {
    next.goatIdentities[String(move.to)] = next.goatIdentities[String(move.from)] ?? 0;
    delete next.goatIdentities[String(move.from)];
    next.currentPlayer = 'tiger';
  }

  return {
    state: next,
    move: {
      type: 'move',
      from: move.from,
      to: valid.to,
      capture: valid.capture ?? null
    }
  };
}

export function getBotMove(state: GameState, botSide: Side, difficulty: BotDifficulty = 'strong'): MoveInput | null {
  if (state.currentPlayer !== botSide) return null;
  if (difficulty === 'simple') return getSimpleBotMove(state, botSide);
  if (difficulty === 'medium') return getMediumBotMove(state, botSide);

  if (botSide === 'goat' && state.phase === PHASE.PLACEMENT) {
    const to = chooseGoatPlacement(state);
    return to === null ? null : { type: 'place', to };
  }

  const piece = botSide === 'tiger' ? PIECE.TIGER : PIECE.GOAT;
  const moves = state.board.flatMap((value, index) =>
    value === piece ? getValidMovesForBoard(index, state.board) : []
  );
  if (!moves.length) return null;

  if (botSide === 'tiger') {
    const captures = moves.filter((move) => move.capture !== null && move.capture !== undefined);
    if (captures.length) {
      captures.sort((a, b) => evaluateTigerMove(state, b) - evaluateTigerMove(state, a));
      return { type: 'move', ...captures[0] };
    }
    moves.sort((a, b) => evaluateTigerMove(state, b) - evaluateTigerMove(state, a));
    return { type: 'move', ...moves[0] };
  }

  moves.sort((a, b) => evaluateGoatMove(state, b) - evaluateGoatMove(state, a));
  return { type: 'move', ...moves[0] };
}

export function getChallengeBotDifficulty(): BotDifficulty {
  const configured = Deno.env.get('CHALLENGE_BOT_DIFFICULTY');
  if (configured === 'simple' || configured === 'strong') return configured;
  return 'medium';
}

export function getWinState(state: GameState) {
  if (state.phase === PHASE.MOVEMENT && isThreefoldRepetition(state)) {
    return { winner: 'draw' as const, message: 'Draw by threefold repetition.' };
  }
  if (state.goatsCaptured >= 5) return { winner: 'tiger' as Side, message: 'Tiger won the challenge.' };
  if (state.phase === PHASE.MOVEMENT && arePiecesTrapped(state.board, PIECE.TIGER)) {
    return { winner: 'goat' as Side, message: 'Goat won the challenge.' };
  }
  if (state.phase === PHASE.MOVEMENT && state.goatsPlaced === 20 && arePiecesTrapped(state.board, PIECE.GOAT)) {
    return { winner: 'tiger' as Side, message: 'Tiger won the challenge.' };
  }
  if (state.phase === PHASE.PLACEMENT && state.goatsPlaced > 0 && arePiecesTrapped(state.board, PIECE.TIGER)) {
    return { winner: 'goat' as Side, message: 'Goat won the challenge.' };
  }
  return null;
}

export function recordRepetition(state: GameState) {
  const next = cloneState(state);
  if (next.phase !== PHASE.MOVEMENT) return next;
  const key = getPositionKey(next);
  next.repetitionCounts = {
    ...(next.repetitionCounts || {}),
    [key]: ((next.repetitionCounts || {})[key] || 0) + 1
  };
  return next;
}

function getPositionKey(state: GameState) {
  return `${state.board.join(',')}:${state.currentPlayer}`;
}

function isThreefoldRepetition(state: GameState) {
  return Object.values(state.repetitionCounts || {}).some((count) => count >= 3);
}

function getValidMovesForBoard(index: number, board: number[]) {
  const piece = board[index];
  if (piece === PIECE.EMPTY) return [];
  const moves: Array<{ from: number; to: number; capture: number | null }> = [];
  for (const adjacent of getAdjacentPositions(index)) {
    if (board[adjacent] === PIECE.EMPTY) {
      moves.push({ from: index, to: adjacent, capture: null });
    } else if (piece === PIECE.TIGER && board[adjacent] === PIECE.GOAT) {
      const from = POSITIONS[index];
      const mid = POSITIONS[adjacent];
      const jumpRow = mid.row + (mid.row - from.row);
      const jumpCol = mid.col + (mid.col - from.col);
      if (jumpRow < 0 || jumpRow >= 5 || jumpCol < 0 || jumpCol >= 5) continue;
      const jumpIndex = jumpRow * 5 + jumpCol;
      if (board[jumpIndex] === PIECE.EMPTY && getAdjacentPositions(adjacent).includes(jumpIndex)) {
        moves.push({ from: index, to: jumpIndex, capture: adjacent });
      }
    }
  }
  return moves;
}

function getAdjacentPositions(index: number) {
  const { row, col } = POSITIONS[index];
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  return directions
    .map(([dr, dc]) => ({ row: row + dr, col: col + dc, diagonal: Math.abs(dr) === 1 && Math.abs(dc) === 1 }))
    .filter((point) => point.row >= 0 && point.row < 5 && point.col >= 0 && point.col < 5)
    .filter((point) => !point.diagonal || isDiagonalConnected(row, col, point.row, point.col))
    .map((point) => point.row * 5 + point.col);
}

function isDiagonalConnected(r1: number, c1: number, r2: number, c2: number) {
  if (Math.abs(r1 - r2) !== 1 || Math.abs(c1 - c2) !== 1) return false;
  if (r1 === c1 && r2 === c2) return true;
  if (r1 + c1 === 4 && r2 + c2 === 4) return true;
  const links = [
    [[1, 3], [0, 2]], [[1, 3], [2, 4]],
    [[3, 3], [2, 4]], [[3, 3], [4, 2]],
    [[3, 1], [4, 2]], [[3, 1], [2, 0]],
    [[1, 1], [2, 0]], [[1, 1], [0, 2]]
  ];
  return links.some(([a, b]) =>
    (r1 === a[0] && c1 === a[1] && r2 === b[0] && c2 === b[1]) ||
    (r1 === b[0] && c1 === b[1] && r2 === a[0] && c2 === a[1])
  );
}

function arePiecesTrapped(board: number[], piece: number) {
  return board.every((value, index) => value !== piece || getValidMovesForBoard(index, board).length === 0);
}

function getMediumBotMove(state: GameState, botSide: Side): MoveInput | null {
  const moves = getAllMoves(state, botSide);
  if (!moves.length) return null;
  if (botSide === 'tiger') return chooseMediumTigerMove(state, moves);
  return chooseMediumGoatMove(state, moves);
}

function getAllMoves(state: GameState, side: Side) {
  if (side === 'goat' && state.phase === PHASE.PLACEMENT) {
    return state.board
      .map((value, index) => value === PIECE.EMPTY ? { type: 'place' as const, to: index } : null)
      .filter((move): move is MoveInput => Boolean(move));
  }
  const piece = side === 'tiger' ? PIECE.TIGER : PIECE.GOAT;
  return state.board.flatMap((value, index) =>
    value === piece
      ? getValidMovesForBoard(index, state.board).map((move) => ({ type: 'move' as const, ...move }))
      : []
  );
}

function chooseMediumTigerMove(state: GameState, moves: MoveInput[]) {
  const captures = moves.filter((move) => move.capture !== null && move.capture !== undefined);
  if (captures.length) return bestMoveByScore(state, 'tiger', captures);

  const forks = moves.filter((move) => {
    const next = applyMove(state, 'tiger', move).state;
    return countThreatenedGoats(next.board) >= 2;
  });
  if (forks.length) return bestMoveByScore(state, 'tiger', forks);

  return bestMoveByScore(state, 'tiger', moves);
}

function chooseMediumGoatMove(state: GameState, moves: MoveInput[]) {
  if (state.phase === PHASE.PLACEMENT) {
    const safeMoves = moves.filter((move) => {
      const next = applyMove(state, 'goat', move).state;
      return !isGoatThreatened(next.board, move.to);
    });
    const candidates = safeMoves.length ? safeMoves : moves;
    if (state.goatsPlaced === 0) {
      const edgeCenters = candidates.filter((move) => EDGE_CENTERS.includes(move.to));
      if (edgeCenters.length) return bestMoveByScore(state, 'goat', edgeCenters);
    }
    const borders = candidates.filter((move) => BORDER_POSITIONS.includes(move.to));
    return bestMoveByScore(state, 'goat', borders.length ? borders : candidates);
  }

  const defensive = moves.filter((move) => (
    move.type === 'move' && move.from !== undefined && isGoatThreatened(state.board, move.from)
  ));
  return bestMoveByScore(state, 'goat', defensive.length ? defensive : moves);
}

function bestMoveByScore(state: GameState, side: Side, moves: MoveInput[]) {
  return moves
    .map((move) => {
      const next = applyMove(state, side, move).state;
      const repeatPenalty = getRepeatCount(next) >= 2 ? 90000 : 0;
      const score = side === 'tiger' ? evaluateTigerState(next) : evaluateGoatState(next, move.to);
      return { move, score: score - repeatPenalty };
    })
    .sort((a, b) => b.score - a.score)[0]?.move ?? moves[0];
}

function getRepeatCount(state: GameState) {
  if (state.phase !== PHASE.MOVEMENT) return 0;
  return (state.repetitionCounts || {})[getPositionKey(state)] || 0;
}

function getSimpleBotMove(state: GameState, botSide: Side): MoveInput | null {
  if (botSide === 'goat' && state.phase === PHASE.PLACEMENT) {
    const to = chooseWeakGoatPlacement(state);
    return to === null ? null : { type: 'place', to };
  }

  const piece = botSide === 'tiger' ? PIECE.TIGER : PIECE.GOAT;
  const moves = state.board.flatMap((value, index) =>
    value === piece ? getValidMovesForBoard(index, state.board) : []
  );
  if (!moves.length) return null;

  const quietMoves = moves.filter((move) => move.capture === null || move.capture === undefined);
  const pool = quietMoves.length ? quietMoves : moves;
  pool.sort((a, b) => a.from - b.from || a.to - b.to);
  return { type: 'move', ...pool[0] };
}

function chooseWeakGoatPlacement(state: GameState) {
  const empty = state.board
    .map((value, index) => value === PIECE.EMPTY ? index : -1)
    .filter((index) => index >= 0);
  if (!empty.length) return null;

  const capturable = empty.filter((to) => {
    const next = cloneState(state);
    next.board[to] = PIECE.GOAT;
    next.goatsPlaced += 1;
    next.currentPlayer = 'tiger';
    return isGoatThreatened(next.board, to);
  });
  return (capturable.length ? capturable : empty).sort((a, b) => a - b)[0] ?? null;
}

function chooseGoatPlacement(state: GameState) {
  const candidates = state.board
    .map((value, index) => value === PIECE.EMPTY ? index : -1)
    .filter((index) => index >= 0);
  if (!candidates.length) return null;

  const scored = candidates.map((to) => {
    const next = cloneState(state);
    next.board[to] = PIECE.GOAT;
    next.goatsPlaced += 1;
    if (next.goatsPlaced === 20) next.phase = PHASE.MOVEMENT;
    next.currentPlayer = 'tiger';
    return { to, score: evaluateGoatPosition(next, to) };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.to ?? null;
}

function distanceToCenter(index: number) {
  const { row, col } = POSITIONS[index];
  return Math.abs(row - 2) + Math.abs(col - 2);
}

function evaluateTigerMove(state: GameState, move: { from: number; to: number; capture: number | null }) {
  const next = applyMove(state, 'tiger', { type: 'move', ...move }).state;
  return evaluateTigerState(next) - distanceToCenter(move.to);
}

function evaluateGoatMove(state: GameState, move: { from: number; to: number; capture: number | null }) {
  const next = applyMove(state, 'goat', { type: 'move', ...move }).state;
  return evaluateGoatPosition(next, move.to);
}

function evaluateGoatPosition(state: GameState, movedGoat: number) {
  return evaluateGoatState(state, movedGoat);
}

function evaluateTigerState(state: GameState) {
  const capturedScore = state.goatsCaptured * 1000;
  const mobilityScore = countMoves(state.board, PIECE.TIGER) * 8;
  const pressureScore = countThreatenedGoats(state.board) * 45;
  const trappedPenalty = countTrappedPieces(state.board, PIECE.TIGER) * 120;
  return capturedScore + mobilityScore + pressureScore - trappedPenalty;
}

function evaluateGoatState(state: GameState, movedGoat: number) {
  const threatenedPenalty = isGoatThreatened(state.board, movedGoat) ? 500 : 0;
  const totalThreatPenalty = countThreatenedGoats(state.board) * 80;
  const tigerMobilityPenalty = countMoves(state.board, PIECE.TIGER) * 10;
  const goatMobilityScore = countMoves(state.board, PIECE.GOAT) * 3;
  const trappedTigerScore = countTrappedPieces(state.board, PIECE.TIGER) * 180;
  const supportScore = getAdjacentPositions(movedGoat)
    .filter((index) => state.board[index] === PIECE.GOAT)
    .length * 35;
  const edgeScore = EDGE_CENTERS.includes(movedGoat) ? 40 : BORDER_POSITIONS.includes(movedGoat) ? 15 : 0;
  return trappedTigerScore + supportScore + goatMobilityScore + edgeScore - tigerMobilityPenalty - totalThreatPenalty - threatenedPenalty - distanceToCenter(movedGoat);
}

function countMoves(board: number[], piece: number) {
  return board.reduce((total, value, index) => (
    value === piece ? total + getValidMovesForBoard(index, board).length : total
  ), 0);
}

function countThreatenedGoats(board: number[]) {
  return board.reduce((total, value, index) => (
    value === PIECE.GOAT && isGoatThreatened(board, index) ? total + 1 : total
  ), 0);
}

function countTrappedPieces(board: number[], piece: number) {
  return board.reduce((total, value, index) => (
    value === piece && getValidMovesForBoard(index, board).length === 0 ? total + 1 : total
  ), 0);
}

function isGoatThreatened(board: number[], goatIndex: number) {
  return board.some((value, tigerIndex) => {
    if (value !== PIECE.TIGER) return false;
    return getValidMovesForBoard(tigerIndex, board).some((move) => move.capture === goatIndex);
  });
}

function isBoardIndex(index: unknown) {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < 25;
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    board: [...state.board],
    tigerIdentities: { ...state.tigerIdentities },
    goatIdentities: { ...state.goatIdentities },
    repetitionCounts: { ...(state.repetitionCounts || {}) }
  };
}
