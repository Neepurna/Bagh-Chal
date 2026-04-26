// BaghChal Dataset Generator
// Generates training datasets through self-play and position analysis

import { BaghchalAI, DIFFICULTY, PIECE_TYPES } from './BaghchalAI.js';

class DatasetGenerator {
  constructor() {
    this.tigerAI = new BaghchalAI(DIFFICULTY.HARD);
    this.goatAI = new BaghchalAI(DIFFICULTY.HARD);
    this.gameData = [];
  }

  // Generate a dataset of N games
  async generateDataset(numGames = 100, onProgress = null) {
    console.log(`🎮 Starting dataset generation: ${numGames} games`);
    const startTime = Date.now();
    
    for (let gameNum = 0; gameNum < numGames; gameNum++) {
      const gameRecord = await this.playOneGame(gameNum + 1);
      this.gameData.push(gameRecord);
      
      if (onProgress) {
        onProgress(gameNum + 1, numGames, gameRecord);
      }
      
      // Log progress every 10 games
      if ((gameNum + 1) % 10 === 0) {
        console.log(`✅ Completed ${gameNum + 1}/${numGames} games`);
      }
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`🏁 Dataset generation complete: ${numGames} games in ${elapsed}s`);
    
    return this.formatDataset();
  }

  // Play one full game and record all positions
  async playOneGame(gameId) {
    const positions = [];
    let state = this.getInitialState();
    let moveCount = 0;
    const maxMoves = 200; // Prevent infinite games

    while (!this.isGameOver(state) && moveCount < maxMoves) {
      const currentPlayer = state.currentPlayer;
      const ai = currentPlayer === PIECE_TYPES.TIGER ? this.tigerAI : this.goatAI;
      
      // Record position before move
      const positionRecord = this.capturePosition(state, currentPlayer, ai);
      
      // Get AI's best move
      const move = ai.getBestMove(state, currentPlayer);
      if (!move) break;
      
      // Record the move
      positionRecord.bestMove = this.serializeMove(move);
      positionRecord.moveNumber = moveCount + 1;
      
      // Apply move
      state = this.applyMove(state, move);
      
      // Evaluate resulting position
      positionRecord.resultingEval = ai.evaluatePosition(state, currentPlayer);
      
      positions.push(positionRecord);
      moveCount++;
      
      // Add small delay to prevent UI freezing
      if (moveCount % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    const result = this.getGameOutcome(state);
    
    return {
      gameId,
      totalMoves: moveCount,
      winner: result.winner,
      reason: result.reason,
      positions: positions
    };
  }

  capturePosition(state, player, ai) {
    return {
      board: this.serializeBoard(state.board),
      currentPlayer: player === PIECE_TYPES.TIGER ? 'tiger' : 'goat',
      phase: state.phase,
      goatsPlaced: state.goatsPlaced,
      goatsCaptured: state.goatsCaptured,
      evaluation: ai.evaluatePosition(state, player),
      legalMoves: this.serializeMoves(ai.getAllPossibleMoves(state, player)),
      gamePhase: ai.getGamePhase(state)
    };
  }

  serializeBoard(board) {
    return board.map(cell => {
      if (cell === PIECE_TYPES.EMPTY) return 'empty';
      if (cell === PIECE_TYPES.TIGER) return 'tiger';
      if (cell === PIECE_TYPES.GOAT) return 'goat';
      return 'empty';
    });
  }

  serializeMove(move) {
    return {
      type: move.type,
      from: move.from,
      to: move.to,
      capture: move.capture
    };
  }

  serializeMoves(moves) {
    return moves.map(m => this.serializeMove(m));
  }

  isGameOver(state) {
    if (state.goatsCaptured >= 5) return true;

    if (state.phase === 'movement') {
      let tigerMoves = 0;
      for (let i = 0; i < 25; i++) {
        if (state.board[i] === PIECE_TYPES.TIGER) {
          tigerMoves += this.getValidMoves(state, i).length;
        }
      }
      if (tigerMoves === 0) return true;
    }

    return false;
  }

  getGameOutcome(state) {
    if (state.goatsCaptured >= 5) {
      return { winner: 'tiger', reason: 'captured_5_goats' };
    }

    let tigerMoves = 0;
    for (let i = 0; i < 25; i++) {
      if (state.board[i] === PIECE_TYPES.TIGER) {
        tigerMoves += this.getValidMoves(state, i).length;
      }
    }

    if (tigerMoves === 0) {
      return { winner: 'goat', reason: 'trapped_all_tigers' };
    }

    return { winner: 'draw', reason: 'max_moves_reached' };
  }

  formatDataset() {
    const stats = this.calculateStatistics();
    
    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        totalGames: this.gameData.length,
        totalPositions: this.gameData.reduce((sum, g) => sum + g.positions.length, 0),
        statistics: stats
      },
      games: this.gameData
    };
  }

  calculateStatistics() {
    const stats = {
      tigerWins: 0,
      goatWins: 0,
      draws: 0,
      avgMovesPerGame: 0,
      avgGoatsCaptured: 0,
      captureDistribution: {},
      phaseDistribution: { early: 0, mid: 0, late: 0 }
    };

    let totalMoves = 0;
    let totalCaptures = 0;

    for (const game of this.gameData) {
      if (game.winner === 'tiger') stats.tigerWins++;
      else if (game.winner === 'goat') stats.goatWins++;
      else stats.draws++;

      totalMoves += game.totalMoves;
      
      const captures = game.positions[game.positions.length - 1]?.goatsCaptured || 0;
      totalCaptures += captures;
      stats.captureDistribution[captures] = (stats.captureDistribution[captures] || 0) + 1;

      for (const pos of game.positions) {
        if (pos.gamePhase) {
          stats.phaseDistribution[pos.gamePhase]++;
        }
      }
    }

    stats.avgMovesPerGame = (totalMoves / this.gameData.length).toFixed(2);
    stats.avgGoatsCaptured = (totalCaptures / this.gameData.length).toFixed(2);
    stats.tigerWinRate = ((stats.tigerWins / this.gameData.length) * 100).toFixed(1) + '%';
    stats.goatWinRate = ((stats.goatWins / this.gameData.length) * 100).toFixed(1) + '%';

    return stats;
  }

  exportToJSON() {
    const dataset = this.formatDataset();
    const jsonString = JSON.stringify(dataset, null, 2);
    return jsonString;
  }

  downloadDataset(filename = 'baghchal_dataset.json') {
    const jsonString = this.exportToJSON();
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  getInitialState() {
    const board = Array(25).fill(PIECE_TYPES.EMPTY);
    board[0] = PIECE_TYPES.TIGER;
    board[4] = PIECE_TYPES.TIGER;
    board[20] = PIECE_TYPES.TIGER;
    board[24] = PIECE_TYPES.TIGER;

    return {
      board,
      currentPlayer: PIECE_TYPES.GOAT,
      phase: 'placement',
      goatsPlaced: 0,
      goatsCaptured: 0
    };
  }

  applyMove(state, move) {
    const newState = JSON.parse(JSON.stringify(state));
    
    if (move.type === 'place') {
      newState.board[move.to] = PIECE_TYPES.GOAT;
      newState.goatsPlaced++;
      if (newState.goatsPlaced === 20) {
        newState.phase = 'movement';
      }
    } else {
      newState.board[move.to] = newState.board[move.from];
      newState.board[move.from] = PIECE_TYPES.EMPTY;
      
      if (move.capture !== null) {
        newState.board[move.capture] = PIECE_TYPES.EMPTY;
        newState.goatsCaptured++;
      }
    }
    
    newState.currentPlayer = newState.currentPlayer === PIECE_TYPES.TIGER
      ? PIECE_TYPES.GOAT
      : PIECE_TYPES.TIGER;
    
    return newState;
  }

  getValidMoves(state, index) {
    const piece = state.board[index];
    if (piece === PIECE_TYPES.EMPTY) return [];

    const moves = [];
    const adjacent = this.getAdjacent(index);
    
    for (const adj of adjacent) {
      if (state.board[adj] === PIECE_TYPES.EMPTY) {
        moves.push({ to: adj, capture: null });
      } else if (piece === PIECE_TYPES.TIGER && state.board[adj] === PIECE_TYPES.GOAT) {
        const { row: r1, col: c1 } = this.indexToPos(index);
        const { row: r2, col: c2 } = this.indexToPos(adj);
        const dr = r2 - r1;
        const dc = c2 - c1;
        const jumpRow = r2 + dr;
        const jumpCol = c2 + dc;
        
        if (jumpRow >= 0 && jumpRow < 5 && jumpCol >= 0 && jumpCol < 5) {
          const jumpIndex = jumpRow * 5 + jumpCol;
          if (state.board[jumpIndex] === PIECE_TYPES.EMPTY) {
            const jumpAdjacent = this.getAdjacent(adj);
            if (jumpAdjacent.includes(jumpIndex)) {
              moves.push({ to: jumpIndex, capture: adj });
            }
          }
        }
      }
    }

    return moves;
  }

  // Helper methods (copied from BaghchalAI for independence)
  getAdjacent(index) {
    const { row, col } = this.indexToPos(index);
    const adjacent = [];

    const directions = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [-1, 1], [1, -1], [1, 1]
    ];

    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;
      if (newRow >= 0 && newRow < 5 && newCol >= 0 && newCol < 5) {
        if (Math.abs(dr) === 1 && Math.abs(dc) === 1) {
          if (this.isDiagonalConnected(row, col, newRow, newCol)) {
            adjacent.push(newRow * 5 + newCol);
          }
        } else {
          adjacent.push(newRow * 5 + newCol);
        }
      }
    }

    return adjacent;
  }

  isDiagonalConnected(r1, c1, r2, c2) {
    if (Math.abs(r1 - r2) !== 1 || Math.abs(c1 - c2) !== 1) return false;

    if (r1 === c1 && r2 === c2) return true;
    if (r1 + c1 === 4 && r2 + c2 === 4) return true;

    const topMid = [0, 2];
    const rightMid = [2, 4];
    const bottomMid = [4, 2];
    const leftMid = [2, 0];
    
    const pointMatches = (r, c, point) => r === point[0] && c === point[1];
    
    if ((pointMatches(r1, c1, [1, 3]) && pointMatches(r2, c2, topMid)) ||
        (pointMatches(r1, c1, topMid) && pointMatches(r2, c2, [1, 3])) ||
        (pointMatches(r1, c1, [1, 3]) && pointMatches(r2, c2, rightMid)) ||
        (pointMatches(r1, c1, rightMid) && pointMatches(r2, c2, [1, 3]))) return true;
    
    if ((pointMatches(r1, c1, [3, 3]) && pointMatches(r2, c2, rightMid)) ||
        (pointMatches(r1, c1, rightMid) && pointMatches(r2, c2, [3, 3])) ||
        (pointMatches(r1, c1, [3, 3]) && pointMatches(r2, c2, bottomMid)) ||
        (pointMatches(r1, c1, bottomMid) && pointMatches(r2, c2, [3, 3]))) return true;
    
    if ((pointMatches(r1, c1, [3, 1]) && pointMatches(r2, c2, bottomMid)) ||
        (pointMatches(r1, c1, bottomMid) && pointMatches(r2, c2, [3, 1])) ||
        (pointMatches(r1, c1, [3, 1]) && pointMatches(r2, c2, leftMid)) ||
        (pointMatches(r1, c1, leftMid) && pointMatches(r2, c2, [3, 1]))) return true;
    
    if ((pointMatches(r1, c1, [1, 1]) && pointMatches(r2, c2, leftMid)) ||
        (pointMatches(r1, c1, leftMid) && pointMatches(r2, c2, [1, 1])) ||
        (pointMatches(r1, c1, [1, 1]) && pointMatches(r2, c2, topMid)) ||
        (pointMatches(r1, c1, topMid) && pointMatches(r2, c2, [1, 1]))) return true;

    return false;
  }

  indexToPos(index) {
    return { row: Math.floor(index / 5), col: index % 5 };
  }
}

export { DatasetGenerator };
