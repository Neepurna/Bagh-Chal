/**
 * BaghChal AI Worker - Off-thread computation with full AI strategy
 * Runs complete AI move calculation without blocking the UI thread
 */

const PIECE_TYPES = {
  EMPTY: 0,
  TIGER: 1,
  GOAT: 2
};

const DIFFICULTY = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard'
};

// Positional weights - center-focused strategy
const POSITION_WEIGHTS = [
  1, 2, 3, 2, 1,   // Row 0
  2, 4, 5, 4, 2,   // Row 1
  3, 5, 8, 5, 3,   // Row 2 (center = index 12)
  2, 4, 5, 4, 2,   // Row 3
  1, 2, 3, 2, 1    // Row 4
];

// Worker message handler
self.onmessage = function(event) {
  const { board, phase, goatsPlaced, goatsCaptured, aiSide, difficulty } = event.data;
  
  try {
    const gameState = {
      board,
      phase,
      goatsPlaced,
      goatsCaptured,
      currentPlayer: aiSide
    };
    
    const startTime = Date.now();
    const ai = new BaghchalAI(difficulty);
    const bestMove = ai.getBestMove(gameState, aiSide);
    const timeSpent = Date.now() - startTime;
    
    self.postMessage({
      success: true,
      move: bestMove,
      stats: {
        timeSpent: timeSpent,
        difficulty: difficulty
      }
    });
  } catch (error) {
    self.postMessage({
      success: false,
      error: error.message
    });
  }
};

// BaghChal AI Class implementing both heuristic and MCTS strategies
class BaghchalAI {
  constructor(difficulty = DIFFICULTY.MEDIUM) {
    this.difficulty = difficulty;
    this.simulationCount = this.getSimulationCount();
    this.explorationConstant = 1.414;
    this.searchDepth = this.getSearchDepth();
    this.timeBudget = this.getTimeLimit();
    
    this.transpositionTable = new Map();
    this.MAX_TRANSPOSITION_SIZE = 5000;
    this.transpositionOrder = [];
    
    this.threatCache = new Map();
    this.chainCache = new Map();
    this.moveCache = new Map();
    this.boardStateHash = '';
  }

  getSimulationCount() {
    switch (this.difficulty) {
      case DIFFICULTY.EASY: return 25;
      case DIFFICULTY.MEDIUM: return 100;
      case DIFFICULTY.HARD: return 300;
      default: return 100;
    }
  }
  
  getTimeLimit() {
    switch (this.difficulty) {
      case DIFFICULTY.EASY: return 50;
      case DIFFICULTY.MEDIUM: return 150;
      case DIFFICULTY.HARD: return 300;
      default: return 100;
    }
  }

  getSearchDepth() {
    switch (this.difficulty) {
      case DIFFICULTY.EASY: return 2;
      case DIFFICULTY.MEDIUM: return 4;
      case DIFFICULTY.HARD: return 0;
      default: return 3;
    }
  }

  getDefensivePrecision() {
    switch (this.difficulty) {
      case DIFFICULTY.EASY: return 0.01;
      case DIFFICULTY.MEDIUM: return 0.80;
      case DIFFICULTY.HARD: return 0.95;
      default: return 0.80;
    }
  }

  getGamePhase(gameState) {
    const goatsPlaced = gameState.goatsPlaced;
    const goatsCaptured = gameState.goatsCaptured;
    
    if (goatsPlaced < 20) return 'early';
    if (goatsPlaced === 20 && goatsCaptured < 2) return 'mid';
    return 'late';
  }

  getBestMove(gameState, aiSide) {
    this.transpositionTable.clear();
    this.threatCache.clear();
    this.chainCache.clear();
    this.moveCache.clear();
    this.boardStateHash = gameState.board.join(',');
    
    if (this.difficulty === DIFFICULTY.HARD && aiSide === PIECE_TYPES.TIGER) {
      return this.getMCTSMove(gameState, aiSide);
    } else {
      return this.getHeuristicMove(gameState, aiSide);
    }
  }

  getHeuristicMove(gameState, aiSide) {
    const moves = this.getAllPossibleMoves(gameState, aiSide);
    if (moves.length === 0) return null;

    if (this.difficulty === DIFFICULTY.EASY) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    if (this.difficulty === DIFFICULTY.MEDIUM) {
      if (aiSide === PIECE_TYPES.GOAT && gameState.phase === 'movement') {
        const defensiveMoves = this.getDefensiveMoves(gameState, moves);
        if (defensiveMoves.length > 0) {
          if (Math.random() < 0.80) {
            return this.selectMoveWithMinimax(defensiveMoves, gameState, aiSide);
          }
        }
      }
      
      if (Math.random() < 0.50) {
        return moves[Math.floor(Math.random() * moves.length)];
      }
    }

    if (aiSide === PIECE_TYPES.GOAT && gameState.phase === 'movement') {
      const defensiveMoves = this.getDefensiveMoves(gameState, moves);
      if (defensiveMoves.length > 0) {
        return this.selectMoveWithMinimax(defensiveMoves, gameState, aiSide);
      }
    }

    if (aiSide === PIECE_TYPES.TIGER) {
      const sureEat = this.detectSureEat(moves, gameState);
      if (sureEat.length > 0) {
        return this.selectMoveWithMinimax(sureEat, gameState, aiSide);
      }

      const forks = this.detectFork(moves, gameState);
      if (forks.length > 0) {
        return this.selectMoveWithMinimax(forks, gameState, aiSide);
      }
    }

    return this.selectMoveWithMinimax(moves, gameState, aiSide);
  }

  selectMoveWithMinimax(moves, gameState, aiSide) {
    let bestMove = null;
    let bestScore = -Infinity;

    if (aiSide === PIECE_TYPES.GOAT) {
      const safeMoves = moves.filter(m => m.isSafe !== false);
      const precision = this.getDefensivePrecision();
      
      if (safeMoves.length > 0 && Math.random() < precision) {
        moves = safeMoves;
      }
    }

    const sortedMoves = this.sortMovesByHeuristic(moves, gameState, aiSide);
    
    const startTime = Date.now();
    for (const move of sortedMoves) {
      if (Date.now() - startTime > this.timeBudget * 0.8) {
        break;
      }
      
      const newState = this.applyMove(gameState, move);
      const score = this.minimax(newState, this.searchDepth - 1, -Infinity, Infinity, false, aiSide, startTime);
      
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove || moves[0];
  }
  
  sortMovesByHeuristic(moves, gameState, aiSide) {
    return moves.sort((a, b) => {
      let scoreA = this.getMoveHeuristic(gameState, a, aiSide);
      let scoreB = this.getMoveHeuristic(gameState, b, aiSide);
      return scoreB - scoreA;
    });
  }
  
  getMoveHeuristic(gameState, move, aiSide) {
    let score = 0;
    
    if (move.capture !== null) {
      score += 1000;
    }
    
    if (move.to === 12) {
      score += 100;
    }
    
    if (aiSide === PIECE_TYPES.TIGER) {
      const newState = this.applyMove(gameState, move);
      const threatened = this.countThreatenedGoats(newState, move.to);
      score += threatened * 50;
    } else if (aiSide === PIECE_TYPES.GOAT) {
      const threatened = this.findThreatenedGoats(gameState);
      if (threatened.includes(move.from)) score += 40;
    }
    
    return score;
  }

  minimax(state, depth, alpha, beta, maximizing, aiSide, startTime) {
    const stateHash = this.hashGameState(state, depth, maximizing);
    if (this.transpositionTable.has(stateHash)) {
      return this.transpositionTable.get(stateHash);
    }
    
    if (startTime && Date.now() - startTime > this.timeBudget * 0.9) {
      return this.evaluatePosition(state, aiSide);
    }
    
    if (depth <= 1 && depth > 0) {
      const evaluation = this.quickEvaluate(state, aiSide);
      this.transpositionTable.set(stateHash, evaluation);
      return evaluation;
    }
    
    if (depth === 0 || this.isTerminalState(state)) {
      const evaluation = this.evaluatePosition(state, aiSide);
      this.transpositionTable.set(stateHash, evaluation);
      return evaluation;
    }

    const currentPlayer = state.currentPlayer;
    const moves = this.getAllPossibleMoves(state, currentPlayer);
    
    if (moves.length === 0) {
      const evaluation = this.evaluatePosition(state, aiSide);
      this.transpositionTable.set(stateHash, evaluation);
      return evaluation;
    }

    let sortedMoves = moves;
    if (depth >= this.searchDepth - 1) {
      sortedMoves = this.sortMovesByHeuristic(moves, state, currentPlayer);
    }

    if (maximizing) {
      let maxEval = -Infinity;
      for (const move of sortedMoves) {
        const newState = this.applyMove(state, move);
        const evaluation = this.minimax(newState, depth - 1, alpha, beta, false, aiSide, startTime);
        maxEval = Math.max(maxEval, evaluation);
        alpha = Math.max(alpha, evaluation);
        if (beta <= alpha) break;
      }
      this.transpositionTable.set(stateHash, maxEval);
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of sortedMoves) {
        const newState = this.applyMove(state, move);
        const evaluation = this.minimax(newState, depth - 1, alpha, beta, true, aiSide, startTime);
        minEval = Math.min(minEval, evaluation);
        beta = Math.min(beta, evaluation);
        if (beta <= alpha) break;
      }
      this.transpositionTable.set(stateHash, minEval);
      return minEval;
    }
  }
  
  hashGameState(gameState, depth, isMaximizing) {
    const boardString = gameState.board.join('');
    const key = `${boardString}_d${depth}_${isMaximizing ? 'max' : 'min'}`;
    
    if (this.transpositionTable.size >= this.MAX_TRANSPOSITION_SIZE) {
      const oldestKey = this.transpositionOrder.shift();
      if (oldestKey) this.transpositionTable.delete(oldestKey);
    }
    
    if (!this.transpositionTable.has(key)) {
      this.transpositionOrder.push(key);
    }
    
    return key;
  }

  getDefensiveMoves(gameState, moves) {
    const threatenedGoats = this.findThreatenedGoats(gameState);
    if (threatenedGoats.length === 0) return [];

    const defensiveMoves = moves.filter(move => {
      if (threatenedGoats.includes(move.from)) {
        const newState = this.applyMove(gameState, move);
        const stillThreatened = this.isGoatThreatened(newState, move.to);
        return !stillThreatened;
      }
      return false;
    });

    return defensiveMoves;
  }

  findThreatenedGoats(gameState) {
    const threatenedPositions = [];
    
    for (let i = 0; i < 25; i++) {
      if (gameState.board[i] === PIECE_TYPES.GOAT) {
        if (this.isGoatThreatened(gameState, i)) {
          threatenedPositions.push(i);
        }
      }
    }
    
    return threatenedPositions;
  }

  isGoatThreatened(gameState, goatPos) {
    const cacheKey = `threat_${goatPos}_${this.boardStateHash}`;
    if (this.threatCache.has(cacheKey)) {
      return this.threatCache.get(cacheKey);
    }
    
    for (let i = 0; i < 25; i++) {
      if (gameState.board[i] === PIECE_TYPES.TIGER) {
        const tigerMoves = this.getValidMoves(gameState, i);
        for (const move of tigerMoves) {
          if (move.capture === goatPos) {
            this.threatCache.set(cacheKey, true);
            return true;
          }
        }
      }
    }
    this.threatCache.set(cacheKey, false);
    return false;
  }

  detectSureEat(moves, gameState) {
    return moves.filter(m => m.capture !== null);
  }

  detectFork(moves, gameState) {
    const forkMoves = [];

    for (const move of moves) {
      if (move.capture !== null) continue;
      
      const newState = this.applyMove(gameState, move);
      const threatenedGoats = this.countThreatenedGoats(newState, move.to);
      
      if (threatenedGoats >= 2) {
        forkMoves.push(move);
      }
    }

    return forkMoves;
  }

  countThreatenedGoats(gameState, tigerPos) {
    let threatened = 0;
    const adjacent = this.getAdjacentPositions(tigerPos);

    for (const adjPos of adjacent) {
      if (gameState.board[adjPos] === PIECE_TYPES.GOAT) {
        const { row: r1, col: c1 } = this.indexToPos(tigerPos);
        const { row: r2, col: c2 } = this.indexToPos(adjPos);
        const dr = r2 - r1;
        const dc = c2 - c1;
        const jumpRow = r2 + dr;
        const jumpCol = c2 + dc;
        
        if (jumpRow >= 0 && jumpRow < 5 && jumpCol >= 0 && jumpCol < 5) {
          const jumpIndex = jumpRow * 5 + jumpCol;
          if (gameState.board[jumpIndex] === PIECE_TYPES.EMPTY) {
            threatened++;
          }
        }
      }
    }

    return threatened;
  }

  getMCTSMove(gameState, aiSide) {
    const rootNode = new MCTSNode(gameState, null, null);
    
    for (let i = 0; i < this.simulationCount; i++) {
      let node = this.selection(rootNode, aiSide);
      if (!node.isTerminal) {
        node = this.expansion(node, aiSide);
      }
      const result = this.simulation(node.state, aiSide);
      this.backpropagation(node, result);
    }

    const bestMove = this.selectBestChild(rootNode);
    
    if (!bestMove) {
      return this.getHeuristicMove(gameState, aiSide);
    }
    
    return bestMove;
  }

  selection(node, aiSide) {
    while (node.children.length > 0) {
      node = this.selectUCT(node, aiSide);
      
      if (this.isTerminalState(node.state)) {
        node.isTerminal = true;
        break;
      }
    }
    return node;
  }

  selectUCT(node, aiSide) {
    let bestChild = null;
    let bestUCT = -Infinity;

    for (const child of node.children) {
      if (child.visits === 0) {
        return child;
      }

      const exploitation = child.wins / child.visits;
      const exploration = this.explorationConstant * Math.sqrt(Math.log(node.visits) / child.visits);
      const uct = exploitation + exploration;

      if (uct > bestUCT) {
        bestUCT = uct;
        bestChild = child;
      }
    }

    return bestChild;
  }

  expansion(node, aiSide) {
    const currentPlayer = node.state.currentPlayer;
    const moves = this.getAllPossibleMoves(node.state, currentPlayer);
    
    if (moves.length === 0) {
      node.isTerminal = true;
      return node;
    }

    for (const move of moves) {
      const newState = this.applyMove(node.state, move);
      const child = new MCTSNode(newState, node, move);
      node.children.push(child);
    }

    return node.children[Math.floor(Math.random() * node.children.length)];
  }

  simulation(state, aiSide) {
    let currentState = this.cloneState(state);
    let depth = 0;
    const maxDepth = 40;

    while (!this.isTerminalState(currentState) && depth < maxDepth) {
      const moves = this.getAllPossibleMoves(currentState, currentState.currentPlayer);
      if (moves.length === 0) break;

      let selectedMove;
      if (Math.random() < 0.8) {
        selectedMove = this.selectBestMoveQuick(moves, currentState);
      } else {
        selectedMove = moves[Math.floor(Math.random() * moves.length)];
      }
      
      currentState = this.applyMove(currentState, selectedMove);
      depth++;
    }

    return this.getGameResult(currentState, aiSide);
  }

  selectBestMoveQuick(moves, state) {
    let bestMove = null;
    let bestScore = -Infinity;
    const currentPlayer = state.currentPlayer;

    if (currentPlayer === PIECE_TYPES.TIGER) {
      const captures = moves.filter(m => m.capture !== null);
      if (captures.length > 0) {
        return captures[Math.floor(Math.random() * captures.length)];
      }
    }

    for (const move of moves) {
      const newState = this.applyMove(state, move);
      const score = this.evaluatePosition(newState, currentPlayer);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove || moves[0];
  }

  backpropagation(node, result) {
    while (node !== null) {
      node.visits++;
      node.wins += result;
      node = node.parent;
    }
  }

  selectBestChild(rootNode) {
    if (rootNode.children.length === 0) {
      return null;
    }
    
    let bestChild = null;
    let bestVisits = -1;

    for (const child of rootNode.children) {
      if (child.visits > bestVisits) {
        bestVisits = child.visits;
        bestChild = child;
      }
    }

    if (!bestChild || bestVisits === 0) {
      return rootNode.children[0].move;
    }

    return bestChild.move;
  }

  quickEvaluate(gameState, aiSide) {
    let score = 0;
    score += this.evaluateMaterial(gameState, aiSide) * 150;
    
    const phase = this.getGamePhase(gameState);
    const posWeight = phase === 'early' ? 1.5 : phase === 'mid' ? 1.0 : 0.7;
    score += this.evaluatePositions(gameState, aiSide) * posWeight;
    
    let myMobility = 0;
    for (let i = 0; i < 25; i++) {
      if (gameState.board[i] === aiSide) {
        myMobility += this.getValidMoves(gameState, i).length;
      }
    }
    score += myMobility * 3;
    
    return score;
  }

  evaluatePosition(gameState, aiSide) {
    const phase = this.getGamePhase(gameState);
    let score = 0;

    if (this.isTerminalState(gameState)) {
      const result = this.getGameResult(gameState, aiSide);
      if (result === 1) return 100000;
      if (result === 0) return -100000;
    }

    score += this.evaluateMaterial(gameState, aiSide) * 150;
    
    const posWeight = phase === 'early' ? 1.5 : phase === 'mid' ? 1.0 : 0.7;
    score += this.evaluatePositions(gameState, aiSide) * posWeight;
    
    const mobWeight = phase === 'late' ? 2.0 : 1.0;
    score += this.evaluateMobility(gameState, aiSide) * mobWeight;
    
    score += this.evaluateFormations(gameState, aiSide);
    score += this.evaluateTacticalPatterns(gameState, aiSide);
    score += this.evaluateStrategicGoals(gameState, aiSide, phase);

    return score;
  }

  evaluateMaterial(gameState, aiSide) {
    const captured = gameState.goatsCaptured;
    
    if (aiSide === PIECE_TYPES.TIGER) {
      if (captured >= 5) return 10000;
      if (captured === 4) return 500;
      return captured * captured * 30;
    } else {
      if (captured >= 5) return -10000;
      if (captured === 4) return -600;
      return -captured * captured * 35;
    }
  }

  evaluatePositions(gameState, aiSide) {
    let score = 0;

    for (let i = 0; i < 25; i++) {
      if (gameState.board[i] === aiSide) {
        score += POSITION_WEIGHTS[i];
      }
    }

    return score;
  }

  evaluateMobility(gameState, aiSide) {
    let myMobility = 0;
    let opponentMobility = 0;
    const opponentSide = aiSide === PIECE_TYPES.TIGER ? PIECE_TYPES.GOAT : PIECE_TYPES.TIGER;

    for (let i = 0; i < 25; i++) {
      if (gameState.board[i] === aiSide) {
        myMobility += this.getValidMoves(gameState, i).length;
      } else if (gameState.board[i] === opponentSide) {
        opponentMobility += this.getValidMoves(gameState, i).length;
      }
    }

    return (myMobility - opponentMobility) * 5;
  }

  evaluateFormations(gameState, aiSide) {
    let score = 0;

    if (aiSide === PIECE_TYPES.GOAT) {
      score += this.countGoatChains(gameState) * 10;
      
      if (gameState.board[12] === PIECE_TYPES.GOAT) {
        score += 20;
      }
    } else {
      score -= this.countGoatChains(gameState) * 5;
      score += this.evaluateTigerSpread(gameState) * 10;
    }

    return score;
  }

  evaluateTacticalPatterns(gameState, aiSide) {
    let score = 0;

    if (aiSide === PIECE_TYPES.TIGER) {
      let capturableGoats = 0;
      for (let i = 0; i < 25; i++) {
        if (gameState.board[i] === PIECE_TYPES.TIGER) {
          capturableGoats += this.countThreatenedGoats(gameState, i);
        }
      }
      score += capturableGoats * 40;

      let trappedTigers = 0;
      for (let i = 0; i < 25; i++) {
        if (gameState.board[i] === PIECE_TYPES.TIGER) {
          const moves = this.getValidMoves(gameState, i);
          if (moves.length === 0) trappedTigers++;
          else if (moves.length === 1) trappedTigers += 0.5;
        }
      }
      score -= trappedTigers * 60;
    } else {
      const threatenedGoats = this.findThreatenedGoats(gameState);
      const precision = this.getDefensivePrecision();
      const threatPenalty = precision * 150;
      score -= threatenedGoats.length * threatPenalty;
      
      const keyPositions = [2, 10, 12, 14, 22];
      for (const pos of keyPositions) {
        if (gameState.board[pos] === PIECE_TYPES.GOAT) {
          score += 15;
        }
      }

      let tigerMobility = 0;
      for (let i = 0; i < 25; i++) {
        if (gameState.board[i] === PIECE_TYPES.TIGER) {
          tigerMobility += this.getValidMoves(gameState, i).length;
        }
      }
      score += (16 - tigerMobility) * 8;
    }

    return score;
  }

  evaluateStrategicGoals(gameState, aiSide, phase) {
    let score = 0;

    if (aiSide === PIECE_TYPES.TIGER) {
      if (phase === 'early') {
        score += gameState.goatsCaptured * 200;
      } else if (phase === 'mid') {
        score += gameState.goatsCaptured * 180;
        const corners = [0, 4, 20, 24];
        for (const corner of corners) {
          if (gameState.board[corner] === PIECE_TYPES.TIGER) {
            const moves = this.getValidMoves(gameState, corner);
            if (moves.length <= 2) score -= 40;
          }
        }
      } else {
        score += gameState.goatsCaptured * 220;
      }
    } else {
      if (phase === 'early') {
        if (gameState.board[12] === PIECE_TYPES.GOAT) score += 40;
        const perimeter = [0,1,2,3,4,5,9,10,14,15,19,20,21,22,23,24];
        let perimeterCount = 0;
        for (const pos of perimeter) {
          if (gameState.board[pos] === PIECE_TYPES.GOAT) perimeterCount++;
        }
        score += perimeterCount * 8;
      } else {
        score += this.countGoatChains(gameState) * 25;
        
        for (let i = 0; i < 25; i++) {
          if (gameState.board[i] === PIECE_TYPES.TIGER) {
            const moves = this.getValidMoves(gameState, i);
            score += (6 - moves.length) * 20;
          }
        }
      }
    }

    return score;
  }

  countGoatChains(gameState) {
    const cacheKey = `chains_${this.boardStateHash}`;
    if (this.chainCache.has(cacheKey)) {
      return this.chainCache.get(cacheKey);
    }
    
    let chains = 0;
    const visited = new Set();

    for (let i = 0; i < 25; i++) {
      if (gameState.board[i] === PIECE_TYPES.GOAT && !visited.has(i)) {
        const chainSize = this.exploreChain(gameState, i, visited);
        chains += chainSize > 1 ? chainSize : 0;
      }
    }

    this.chainCache.set(cacheKey, chains);
    return chains;
  }

  exploreChain(gameState, index, visited) {
    if (visited.has(index) || gameState.board[index] !== PIECE_TYPES.GOAT) {
      return 0;
    }

    visited.add(index);
    let size = 1;

    const adjacent = this.getAdjacentPositions(index);
    for (const adj of adjacent) {
      if (gameState.board[adj] === PIECE_TYPES.GOAT) {
        size += this.exploreChain(gameState, adj, visited);
      }
    }

    return size;
  }

  evaluateTigerSpread(gameState) {
    const tigers = [];
    for (let i = 0; i < 25; i++) {
      if (gameState.board[i] === PIECE_TYPES.TIGER) {
        tigers.push(i);
      }
    }

    if (tigers.length < 2) return 0;

    let totalDistance = 0;
    for (let i = 0; i < tigers.length; i++) {
      for (let j = i + 1; j < tigers.length; j++) {
        const pos1 = this.indexToPos(tigers[i]);
        const pos2 = this.indexToPos(tigers[j]);
        const distance = Math.abs(pos1.row - pos2.row) + Math.abs(pos1.col - pos2.col);
        totalDistance += distance;
      }
    }

    return totalDistance / (tigers.length * (tigers.length - 1) / 2);
  }

  getAllPossibleMoves(gameState, side) {
    const moves = [];

    if (side === PIECE_TYPES.GOAT && gameState.phase === 'placement') {
      for (let i = 0; i < 25; i++) {
        if (gameState.board[i] === PIECE_TYPES.EMPTY) {
          const testState = this.applyMove(gameState, { type: 'place', to: i, from: null, capture: null });
          const wouldBeCapturable = this.isGoatThreatened(testState, i);
          
          moves.push({ 
            type: 'place', 
            to: i, 
            from: null, 
            capture: null,
            isSafe: !wouldBeCapturable
          });
        }
      }
      
      const safeMoves = moves.filter(m => m.isSafe);
      
      if (safeMoves.length > 0) {
        const precision = this.getDefensivePrecision();
        if (Math.random() < precision) {
          return safeMoves;
        }
      }
      
      return moves;
    } else {
      for (let i = 0; i < 25; i++) {
        if (gameState.board[i] === side) {
          const pieceMoves = this.getValidMoves(gameState, i);
          moves.push(...pieceMoves);
        }
      }
    }

    return moves;
  }

  getValidMoves(gameState, index) {
    const piece = gameState.board[index];
    const moves = [];

    if (piece === PIECE_TYPES.GOAT) {
      const adjacent = this.getAdjacentPositions(index);
      for (const adj of adjacent) {
        if (gameState.board[adj] === PIECE_TYPES.EMPTY) {
          const testState = this.cloneState(gameState);
          testState.board[adj] = PIECE_TYPES.GOAT;
          testState.board[index] = PIECE_TYPES.EMPTY;
          const wouldBeCapturable = this.isGoatThreatened(testState, adj);
          
          moves.push({ 
            type: 'move', 
            from: index, 
            to: adj, 
            capture: null,
            isSafe: !wouldBeCapturable
          });
        }
      }
    } else if (piece === PIECE_TYPES.TIGER) {
      const adjacent = this.getAdjacentPositions(index);
      for (const adj of adjacent) {
        if (gameState.board[adj] === PIECE_TYPES.EMPTY) {
          moves.push({ type: 'move', from: index, to: adj, capture: null });
        } else if (gameState.board[adj] === PIECE_TYPES.GOAT) {
          const { row: r1, col: c1 } = this.indexToPos(index);
          const { row: r2, col: c2 } = this.indexToPos(adj);
          const dr = r2 - r1;
          const dc = c2 - c1;
          const jumpRow = r2 + dr;
          const jumpCol = c2 + dc;
          
          if (jumpRow >= 0 && jumpRow < 5 && jumpCol >= 0 && jumpCol < 5) {
            const jumpIndex = jumpRow * 5 + jumpCol;
            if (gameState.board[jumpIndex] === PIECE_TYPES.EMPTY) {
              const jumpAdjacent = this.getAdjacentPositions(adj);
              if (jumpAdjacent.includes(jumpIndex)) {
                moves.push({ type: 'capture', from: index, to: jumpIndex, capture: adj });
              }
            }
          }
        }
      }
    }

    return moves;
  }

  applyMove(gameState, move) {
    const newState = this.cloneState(gameState);

    if (move.type === 'place') {
      newState.board[move.to] = PIECE_TYPES.GOAT;
      newState.goatsPlaced++;
      if (newState.goatsPlaced === 20) {
        newState.phase = 'movement';
      }
      newState.currentPlayer = PIECE_TYPES.TIGER;
    } else {
      const piece = newState.board[move.from];
      newState.board[move.to] = piece;
      newState.board[move.from] = PIECE_TYPES.EMPTY;

      if (move.capture !== null) {
        newState.board[move.capture] = PIECE_TYPES.EMPTY;
        newState.goatsCaptured++;
      }

      newState.currentPlayer = piece === PIECE_TYPES.TIGER ? PIECE_TYPES.GOAT : PIECE_TYPES.TIGER;
    }

    return newState;
  }

  cloneState(gameState) {
    return {
      board: [...gameState.board],
      currentPlayer: gameState.currentPlayer,
      phase: gameState.phase,
      goatsPlaced: gameState.goatsPlaced,
      goatsCaptured: gameState.goatsCaptured
    };
  }

  isTerminalState(gameState) {
    if (gameState.goatsCaptured >= 5) return true;

    if (gameState.phase === 'movement') {
      const tigersMoves = [];
      for (let i = 0; i < 25; i++) {
        if (gameState.board[i] === PIECE_TYPES.TIGER) {
          tigersMoves.push(...this.getValidMoves(gameState, i));
        }
      }
      if (tigersMoves.length === 0) return true;
    }

    return false;
  }

  getGameResult(gameState, aiSide) {
    if (gameState.goatsCaptured >= 5) {
      return aiSide === PIECE_TYPES.TIGER ? 1 : 0;
    }

    const tigersMoves = [];
    for (let i = 0; i < 25; i++) {
      if (gameState.board[i] === PIECE_TYPES.TIGER) {
        tigersMoves.push(...this.getValidMoves(gameState, i));
      }
    }

    if (tigersMoves.length === 0) {
      return aiSide === PIECE_TYPES.GOAT ? 1 : 0;
    }

    return 0.5;
  }

  getAdjacentPositions(index) {
    const { row, col } = this.indexToPos(index);
    const adjacent = [];

    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;
      if (newRow >= 0 && newRow < 5 && newCol >= 0 && newCol < 5) {
        adjacent.push(newRow * 5 + newCol);
      }
    }

    const diagonals = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of diagonals) {
      const newRow = row + dr;
      const newCol = col + dc;
      if (newRow >= 0 && newRow < 5 && newCol >= 0 && newCol < 5) {
        if (this.isDiagonalConnected(row, col, newRow, newCol)) {
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

    const topMid = [0, 2], rightMid = [2, 4], bottomMid = [4, 2], leftMid = [2, 0];
    const pointMatches = (r, c, point) => r === point[0] && c === point[1];

    const diamondConnections = [
      [[1, 3], topMid], [[1, 3], rightMid],
      [[3, 3], rightMid], [[3, 3], bottomMid],
      [[3, 1], bottomMid], [[3, 1], leftMid],
      [[1, 1], leftMid], [[1, 1], topMid]
    ];

    for (const [intermediate, edge] of diamondConnections) {
      if ((pointMatches(r1, c1, intermediate) && pointMatches(r2, c2, edge)) ||
          (pointMatches(r1, c1, edge) && pointMatches(r2, c2, intermediate))) {
        return true;
      }
    }

    return false;
  }

  indexToPos(index) {
    return { row: Math.floor(index / 5), col: index % 5 };
  }
}

// MCTS Node class
class MCTSNode {
  constructor(state, parent, move) {
    this.state = state;
    this.parent = parent;
    this.move = move;
    this.children = [];
    this.visits = 0;
    this.wins = 0;
    this.isTerminal = false;
  }
}

/**
 * Smart move ordering - puts likely good moves first for better pruning
 */
function orderMovesByHeuristic(moves, gameState, aiSide) {
  const scored = moves.map(move => {
    let score = 0;
    
    // Captures are highest priority
    if (move.type === 'move' && move.capture) {
      score += 1000;
    }
    
    // Forks (threatening multiple pieces)
    if (move.fork) {
      score += 500;
    }
    
    // Center control
    if (move.to === 12) score += 100; // Center octagon
    if ([6, 8, 16, 18].includes(move.to)) score += 50; // Mid-level centers
    
    // Defensive moves
    if (move.saves_piece) score += 300;
    
    return { move, score };
  });
  
  scored.sort((a, b) => b.score - a.score);
  return scored.map(item => item.move);
}

/**
 * Minimax with alpha-beta pruning and transposition table
 */
function minimax(gameState, depth, alpha, beta, isMaximizing, aiSide, opponent, timeRemaining) {
  nodeCount++;
  
  // Time check - abort if running out of time
  if (nodeCount % 1000 === 0 && timeRemaining <= 50) {
    return evaluatePosition(gameState, aiSide);
  }
  
  // Terminal conditions
  if (depth === 0 || gameState.goatsCaptured >= 5) {
    return evaluatePositionCached(gameState, aiSide);
  }
  
  // Check if game is over
  if (isTerminalState(gameState)) {
    if (gameState.goatsCaptured >= 5) return 10000; // Tigers won
    if (gameState.phase === PHASE.MOVEMENT) {
      const tigersMoved = countTigerMovesAvailable(gameState);
      if (tigersMoved === 0) return -10000; // Goats won
    }
    return evaluatePositionCached(gameState, aiSide);
  }
  
  // Transposition table lookup
  const posHash = hashPosition(gameState);
  if (transpositionTable.has(posHash)) {
    const cached = transpositionTable.get(posHash);
    if (cached.depth >= depth) {
      return cached.score;
    }
  }
  
  const moves = getAllPossibleMoves(gameState, isMaximizing ? aiSide : opponent);
  
  if (moves.length === 0) {
    return isMaximizing ? -5000 : 5000;
  }
  
  // Sort moves for better pruning
  const orderedMoves = orderMovesByHeuristic(moves, gameState, isMaximizing ? aiSide : opponent);
  
  let bestEval;
  
  if (isMaximizing) {
    bestEval = -Infinity;
    for (const move of orderedMoves) {
      const newState = applyMoveImmutable(gameState, move);
      const evaluation = minimax(newState, depth - 1, alpha, beta, false, aiSide, opponent, timeRemaining);
      bestEval = Math.max(bestEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break; // Beta cutoff
    }
  } else {
    bestEval = Infinity;
    for (const move of orderedMoves) {
      const newState = applyMoveImmutable(gameState, move);
      const evaluation = minimax(newState, depth - 1, alpha, beta, true, aiSide, opponent, timeRemaining);
      bestEval = Math.min(bestEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break; // Alpha cutoff
    }
  }
  
  // Store in transposition table
  if (transpositionTable.size < TABLE_MAX_SIZE) {
    transpositionTable.set(posHash, { score: bestEval, depth });
  }
  
  return bestEval;
}

/**
 * Cached position evaluation
 */
function evaluatePositionCached(gameState, aiSide) {
  const hash = hashPosition(gameState);
  if (evaluationCache.has(hash)) {
    return evaluationCache.get(hash);
  }
  
  const score = evaluatePosition(gameState, aiSide);
  evaluationCache.set(hash, score);
  return score;
}

/**
 * Position evaluation - values each board state
 */
function evaluatePosition(gameState, aiSide) {
  let score = 0;
  
  // Material count (most important)
  const tigerCount = countPieces(gameState.board, PIECE_TYPES.TIGER);
  const goatCount = countPieces(gameState.board, PIECE_TYPES.GOAT);
  const captured = gameState.goatsCaptured;
  
  if (aiSide === PIECE_TYPES.TIGER) {
    // Tigers win with 5 captures
    score += captured * 500;
    score += (20 - goatCount) * 400;
    score += tigerCount * 100;
  } else {
    // Goats win by trapping all tigers
    score += (tigerCount > 0 ? tigerCount * 50 : 5000);
    score += goatCount * 200;
    score -= captured * 400;
  }
  
  // Mobility bonus
  const aiMoves = getAllPossibleMoves(gameState, aiSide);
  const opponentType = aiSide === PIECE_TYPES.TIGER ? PIECE_TYPES.GOAT : PIECE_TYPES.TIGER;
  const oppMoves = getAllPossibleMoves(gameState, opponentType);
  score += (aiMoves.length - oppMoves.length) * 10;
  
  // Center control bonus
  for (let i of [6, 7, 8, 11, 12, 13, 16, 17, 18]) {
    if (gameState.board[i] === aiSide) score += 20;
    if (gameState.board[i] !== PIECE_TYPES.EMPTY && gameState.board[i] !== aiSide) score -= 15;
  }
  
  return score;
}

/**
 * Utility functions
 */

function countPieces(board, type) {
  return board.filter(p => p === type).length;
}

function hashPosition(gameState) {
  // Simple hash of board state
  return gameState.board.join(',') + '_' + gameState.goatsCaptured + '_' + gameState.phase;
}

function isTerminalState(gameState) {
  if (gameState.goatsCaptured >= 5) return true;
  if (gameState.phase === PHASE.MOVEMENT) {
    return countTigerMovesAvailable(gameState) === 0;
  }
  return false;
}

function countTigerMovesAvailable(gameState) {
  let count = 0;
  for (let i = 0; i < 25; i++) {
    if (gameState.board[i] === PIECE_TYPES.TIGER) {
      count += (getValidMoves(gameState, i) || []).length;
    }
  }
  return count;
}

function getAllPossibleMoves(gameState, player) {
  const moves = [];
  
  if (gameState.phase === PHASE.PLACEMENT) {
    if (player === PIECE_TYPES.GOAT) {
      for (let i = 0; i < 25; i++) {
        if (gameState.board[i] === PIECE_TYPES.EMPTY) {
          moves.push({ type: 'place', to: i });
        }
      }
    }
  } else {
    for (let i = 0; i < 25; i++) {
      if (gameState.board[i] === player) {
        const validMoves = getValidMoves(gameState, i);
        for (const to of validMoves) {
          const move = {
            type: 'move',
            from: i,
            to: to,
            capture: gameState.board[to] !== PIECE_TYPES.EMPTY ? gameState.board[to] : null
          };
          moves.push(move);
        }
      }
    }
  }
  
  return moves;
}

function getValidMoves(gameState, index) {
  const piece = gameState.board[index];
  if (!piece || piece === PIECE_TYPES.EMPTY) return [];
  
  const moves = [];
  const adjacent = getAdjacent(index);
  
  for (const adj of adjacent) {
    if (gameState.board[adj] === PIECE_TYPES.EMPTY) {
      moves.push(adj);
    } else if (piece === PIECE_TYPES.TIGER && gameState.board[adj] === PIECE_TYPES.GOAT) {
      // Check if tiger can capture
      const farPos = getOpposite(index, adj);
      if (farPos !== -1 && gameState.board[farPos] === PIECE_TYPES.EMPTY) {
        moves.push(farPos);
      }
    }
  }
  
  return moves;
}

function getAdjacent(index) {
  const adjacency = {
    0: [1, 5, 6],
    1: [0, 2, 5, 6, 7],
    2: [1, 3, 6, 7, 8],
    3: [2, 4, 7, 8],
    4: [3, 8, 9],
    5: [0, 1, 6, 10, 11],
    6: [0, 1, 2, 5, 7, 10, 11, 12],
    7: [1, 2, 3, 6, 8, 11, 12, 13],
    8: [2, 3, 4, 7, 9, 12, 13, 14],
    9: [4, 8, 13, 14],
    10: [5, 6, 11, 15, 16],
    11: [5, 6, 7, 10, 12, 15, 16, 17],
    12: [6, 7, 8, 11, 13, 16, 17, 18],
    13: [7, 8, 9, 12, 14, 17, 18, 19],
    14: [8, 9, 13, 18, 19],
    15: [10, 11, 16, 20, 21],
    16: [10, 11, 12, 15, 17, 20, 21, 22],
    17: [11, 12, 13, 16, 18, 21, 22, 23],
    18: [12, 13, 14, 17, 19, 22, 23, 24],
    19: [13, 14, 18, 23, 24],
    20: [15, 16, 21],
    21: [15, 16, 17, 20, 22],
    22: [16, 17, 18, 21, 23],
    23: [17, 18, 19, 22, 24],
    24: [18, 19, 23]
  };
  return adjacency[index] || [];
}

function getOpposite(from, through) {
  // Returns the position opposite 'from' through 'through'
  const opposites = {
    '0_1': 2, '0_5': 10, '0_6': 12,
    '1_0': -1, '1_2': -1, '1_5': 11, '1_6': 13, '1_7': 12,
    '2_1': 0, '2_3': 4, '2_6': 12, '2_7': 11, '2_8': 13,
    '3_2': 2, '3_4': -1, '3_7': 13, '3_8': 12,
    '4_3': -1, '4_8': 12, '4_9': 14,
    '5_0': 10, '5_1': 11, '5_6': 12, '5_10': 15, '5_11': 16,
    '6_0': 12, '6_1': 12, '6_2': 12, '6_5': 16, '6_7': 13, '6_10': 16, '6_11': 17, '6_12': 18,
    '7_1': 12, '7_2': 13, '7_3': 14, '7_6': 12, '7_8': 13, '7_11': 17, '7_12': 18, '7_13': 19,
    '8_2': 12, '8_3': 13, '8_4': 14, '8_7': 13, '8_9': 14, '8_12': 18, '8_13': 19, '8_14': 24,
    '9_4': 14, '9_8': 13, '9_13': 18, '9_14': 19,
    '10_5': 15, '10_6': 16, '10_11': 17, '10_15': 20, '10_16': 21,
    '11_5': 16, '11_6': 17, '11_7': 18, '11_10': 16, '11_12': 18, '11_15': 21, '11_16': 22, '11_17': 23,
    '12_6': 18, '12_7': 18, '12_8': 18, '12_11': 18, '12_13': 18, '12_16': 22, '12_17': 23, '12_18': 24,
    '13_7': 18, '13_8': 19, '13_9': 24, '13_12': 18, '13_14': 24, '13_17': 23, '13_18': 24, '13_19': 24,
    '14_8': 18, '14_9': 19, '14_13': 18, '14_18': 22, '14_19': 24,
    '15_10': 20, '15_11': 21, '15_16': 22, '15_20': -1, '15_21': 23,
    '16_10': 21, '16_11': 22, '16_12': 23, '16_15': 21, '16_17': 23, '16_20': 21, '16_21': 22, '16_22': 24,
    '17_11': 23, '17_12': 24, '17_13': -1, '17_16': 23, '17_18': -1, '17_21': 24, '17_22': -1, '17_23': -1,
    '18_12': 24, '18_13': -1, '18_14': -1, '18_17': -1, '18_19': -1, '18_22': -1, '18_23': -1, '18_24': -1,
    '19_13': 18, '19_14': 24, '19_18': -1, '19_23': -1, '19_24': -1,
    '20_15': -1, '20_16': 21, '20_21': 22,
    '21_15': 23, '21_16': 22, '21_17': -1, '21_20': 22, '21_22': 23,
    '22_16': 24, '22_17': -1, '22_18': -1, '22_21': 23, '22_23': 24,
    '23_17': -1, '23_18': -1, '23_19': -1, '23_22': 24, '23_24': -1,
    '24_18': -1, '24_19': -1, '24_23': -1
  };
  
  return opposites[`${from}_${through}`] || -1;
}

/**
 * Immutable state update - creates new state without mutating
 */
function applyMoveImmutable(gameState, move) {
  const newBoard = [...gameState.board];
  let newGoatsCaptured = gameState.goatsCaptured;
  let newPhase = gameState.phase;
  
  if (move.type === 'place') {
    newBoard[move.to] = PIECE_TYPES.GOAT;
    // Check if we should transition to movement phase
    if (gameState.goatsPlaced + 1 === 20) {
      newPhase = PHASE.MOVEMENT;
    }
  } else {
    // Move piece
    newBoard[move.to] = newBoard[move.from];
    newBoard[move.from] = PIECE_TYPES.EMPTY;
    
    // Handle capture
    if (move.capture === PIECE_TYPES.GOAT) {
      newGoatsCaptured++;
    }
  }
  
  return {
    ...gameState,
    board: newBoard,
    goatsCaptured: newGoatsCaptured,
    phase: newPhase,
    goatsPlaced: move.type === 'place' ? gameState.goatsPlaced + 1 : gameState.goatsPlaced
  };
}
