import { GRID_SIZE, PHASE, PIECE_TYPES } from '../config/gameConfig.js';

function createBoardPositions() {
  const boardPositions = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      boardPositions.push({ row, col });
    }
  }
  return boardPositions;
}

export const BOARD_POSITIONS = createBoardPositions();

export function getBoardHash(board) {
  return board.join(',');
}

export function isDiagonalConnected(r1, c1, r2, c2) {
  if (Math.abs(r1 - r2) !== 1 || Math.abs(c1 - c2) !== 1) {
    return false;
  }

  if (r1 === c1 && r2 === c2) {
    return true;
  }

  if (r1 + c1 === 4 && r2 + c2 === 4) {
    return true;
  }

  const topMid = [0, 2];
  const rightMid = [2, 4];
  const bottomMid = [4, 2];
  const leftMid = [2, 0];
  const pointMatches = (r, c, point) => r === point[0] && c === point[1];

  if ((pointMatches(r1, c1, [1, 3]) && pointMatches(r2, c2, topMid)) ||
      (pointMatches(r1, c1, topMid) && pointMatches(r2, c2, [1, 3])) ||
      (pointMatches(r1, c1, [1, 3]) && pointMatches(r2, c2, rightMid)) ||
      (pointMatches(r1, c1, rightMid) && pointMatches(r2, c2, [1, 3]))) {
    return true;
  }

  if ((pointMatches(r1, c1, [3, 3]) && pointMatches(r2, c2, rightMid)) ||
      (pointMatches(r1, c1, rightMid) && pointMatches(r2, c2, [3, 3])) ||
      (pointMatches(r1, c1, [3, 3]) && pointMatches(r2, c2, bottomMid)) ||
      (pointMatches(r1, c1, bottomMid) && pointMatches(r2, c2, [3, 3]))) {
    return true;
  }

  if ((pointMatches(r1, c1, [3, 1]) && pointMatches(r2, c2, bottomMid)) ||
      (pointMatches(r1, c1, bottomMid) && pointMatches(r2, c2, [3, 1])) ||
      (pointMatches(r1, c1, [3, 1]) && pointMatches(r2, c2, leftMid)) ||
      (pointMatches(r1, c1, leftMid) && pointMatches(r2, c2, [3, 1]))) {
    return true;
  }

  if ((pointMatches(r1, c1, [1, 1]) && pointMatches(r2, c2, leftMid)) ||
      (pointMatches(r1, c1, leftMid) && pointMatches(r2, c2, [1, 1])) ||
      (pointMatches(r1, c1, [1, 1]) && pointMatches(r2, c2, topMid)) ||
      (pointMatches(r1, c1, topMid) && pointMatches(r2, c2, [1, 1]))) {
    return true;
  }

  return false;
}

export function getAdjacentPositions(index, positions = BOARD_POSITIONS) {
  const { row, col } = positions[index];
  const adjacent = [];
  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1]
  ];
  const diagonals = [
    [-1, -1], [-1, 1], [1, -1], [1, 1]
  ];

  for (const [dr, dc] of directions) {
    const newRow = row + dr;
    const newCol = col + dc;
    if (newRow >= 0 && newRow < GRID_SIZE && newCol >= 0 && newCol < GRID_SIZE) {
      adjacent.push(newRow * GRID_SIZE + newCol);
    }
  }

  for (const [dr, dc] of diagonals) {
    const newRow = row + dr;
    const newCol = col + dc;
    if (newRow >= 0 && newRow < GRID_SIZE && newCol >= 0 && newCol < GRID_SIZE) {
      if (isDiagonalConnected(row, col, newRow, newCol)) {
        adjacent.push(newRow * GRID_SIZE + newCol);
      }
    }
  }

  return adjacent;
}

export function getValidMovesForBoard(index, board, positions = BOARD_POSITIONS) {
  const piece = board[index];
  if (piece === PIECE_TYPES.EMPTY) return [];

  const moves = [];
  const adjacent = getAdjacentPositions(index, positions);

  for (const adj of adjacent) {
    if (board[adj] === PIECE_TYPES.EMPTY) {
      moves.push({ from: index, to: adj, capture: null });
    } else if (piece === PIECE_TYPES.TIGER && board[adj] === PIECE_TYPES.GOAT) {
      const { row: r1, col: c1 } = positions[index];
      const { row: r2, col: c2 } = positions[adj];
      const dr = r2 - r1;
      const dc = c2 - c1;
      const jumpRow = r2 + dr;
      const jumpCol = c2 + dc;

      if (jumpRow >= 0 && jumpRow < GRID_SIZE && jumpCol >= 0 && jumpCol < GRID_SIZE) {
        const jumpIndex = jumpRow * GRID_SIZE + jumpCol;
        if (board[jumpIndex] === PIECE_TYPES.EMPTY) {
          const jumpAdjacent = getAdjacentPositions(adj, positions);
          if (jumpAdjacent.includes(jumpIndex)) {
            moves.push({ from: index, to: jumpIndex, capture: adj });
          }
        }
      }
    }
  }

  return moves;
}

export function arePiecesTrapped(board, pieceType, positions = BOARD_POSITIONS) {
  for (let i = 0; i < board.length; i++) {
    if (board[i] === pieceType) {
      const moves = getValidMovesForBoard(i, board, positions);
      if (moves.length > 0) {
        return false;
      }
    }
  }
  return true;
}

export function countTrappedPieces(board, pieceType, positions = BOARD_POSITIONS) {
  let trappedCount = 0;
  for (let i = 0; i < board.length; i++) {
    if (board[i] === pieceType) {
      const moves = getValidMovesForBoard(i, board, positions);
      if (moves.length === 0) {
        trappedCount++;
      }
    }
  }
  return trappedCount;
}

export function getWinState(gameState, positions = BOARD_POSITIONS) {
  if (gameState.goatsCaptured >= 5) {
    return { winner: 'tiger', message: 'Congratulations Tiger won!' };
  }

  if (gameState.phase === PHASE.MOVEMENT && arePiecesTrapped(gameState.board, PIECE_TYPES.TIGER, positions)) {
    return { winner: 'goat', message: 'Congratulations Goat won!' };
  }

  if (
    gameState.phase === PHASE.MOVEMENT &&
    gameState.goatsPlaced === 20 &&
    arePiecesTrapped(gameState.board, PIECE_TYPES.GOAT, positions)
  ) {
    return { winner: 'tiger', message: 'Congratulations Tiger won!' };
  }

  if (
    gameState.phase === PHASE.PLACEMENT &&
    gameState.goatsPlaced > 0 &&
    arePiecesTrapped(gameState.board, PIECE_TYPES.TIGER, positions)
  ) {
    return { winner: 'goat', message: 'Governing Parties Win!' };
  }

  return null;
}
