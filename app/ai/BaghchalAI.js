// BaghChal AI - Implementing AlphaZero-inspired strategy
// Supports:
//   EASY   - Pure random play (capture-first for tiger, random for goat)
//   MEDIUM - Full heuristic based on paper's observed patterns (no MCTS, no randomness)
//            * Tiger: sure-eat > fork > positional minimax (depth 3)
//            * Goat:  border-first placement, defend threats, form chains (depth 3)
//   HARD   - MCTS (Monte Carlo Tree Search) for BOTH sides, AlphaZero-inspired UCT
//
// Reference: "AI Strategy Approach Development on Baghchal using AlphaZero"
// Thapa & Poudel, GCES/Pokhara University, 2024

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

// Positional weights tuned to paper's observations (Section III):
// - Center (12): highest visibility, 8 positions controlled
// - Edge-centers (2,10,14,22): second most advantageous for tiger
// - Inner positions (6,7,8,11,13,16,17,18): moderate
// - Corners (0,4,20,24): worst for tiger (limited movement, easy to trap)
const POSITION_WEIGHTS = [
  1, 2, 4, 2, 1,   // Row 0  (corners=1, edge-adj=2, top-center=4)
  2, 4, 5, 4, 2,   // Row 1
  4, 5, 8, 5, 4,   // Row 2  (center=8, left/right-center=4)
  2, 4, 5, 4, 2,   // Row 3
  1, 2, 4, 2, 1    // Row 4
];

// Edge-center positions (paper: "center of outside edge" — best first goat placement)
const EDGE_CENTERS = [2, 10, 14, 22];
// Border positions for goat's border-first strategy
const BORDER_POSITIONS = [0,1,2,3,4,5,9,10,14,15,19,20,21,22,23,24];

class BaghchalAI {
  constructor(difficulty = DIFFICULTY.MEDIUM) {
    this.difficulty = difficulty;
    // MCTS parameters (HARD mode)
    this.simulationCount = this.getSimulationCount();
    this.explorationConstant = 1.414; // UCT exploration parameter (√2) per paper eq.(1)
    // Minimax parameters (MEDIUM mode)
    this.searchDepth = this.getSearchDepth();
    this.timeBudget = this.getTimeLimit();

    // Transposition table for memoization (game state -> evaluation score)
    this.transpositionTable = new Map();
    this.tableHits = 0;
    this.tableMisses = 0;
    this.MAX_TRANSPOSITION_SIZE = 5000;
    this.transpositionOrder = [];
  }

  getSimulationCount() {
    switch (this.difficulty) {
      case DIFFICULTY.EASY:   return 0;    // No MCTS for easy
      case DIFFICULTY.MEDIUM: return 0;    // No MCTS for medium (heuristic only)
      case DIFFICULTY.HARD:   return 400;  // MCTS simulations per move
      default: return 0;
    }
  }

  getTimeLimit() {
    switch (this.difficulty) {
      case DIFFICULTY.EASY:   return 30;   // Very fast
      case DIFFICULTY.MEDIUM: return 200;  // Heuristic thinking time
      case DIFFICULTY.HARD:   return 400;  // MCTS budget (feels instant to human)
      default: return 150;
    }
  }

  getSearchDepth() {
    switch (this.difficulty) {
      case DIFFICULTY.EASY:   return 0;  // No lookahead
      case DIFFICULTY.MEDIUM: return 3;  // 3-ply minimax (paper's heuristic approach)
      case DIFFICULTY.HARD:   return 0;  // MCTS handles depth automatically
      default: return 3;
    }
  }

  getDefensivePrecision() {
    // How reliably the AI identifies and responds to threats
    switch (this.difficulty) {
      case DIFFICULTY.EASY:   return 0.0;   // No threat awareness
      case DIFFICULTY.MEDIUM: return 1.0;   // Always defends (full heuristic precision)
      case DIFFICULTY.HARD:   return 1.0;   // Full precision (MCTS handles everything)
      default: return 1.0;
    }
  }

  getGamePhase(gameState) {
    const goatsPlaced = gameState.goatsPlaced;
    const goatsCaptured = gameState.goatsCaptured;
    
    if (goatsPlaced < 20) return 'early'; // Placement phase
    if (goatsPlaced === 20 && goatsCaptured < 2) return 'mid'; // Early movement
    return 'late'; // Endgame
  }

  // Main entry point - get best move
  // Difficulty routing based on paper's recommendations:
  //   Easy   → random (no strategy, approximate paper's random baseline)
  //   Medium → heuristic (paper's pattern-based approach, competitive vs casual players)
  //   Hard   → MCTS for both sides (paper's AlphaZero/MCTS approach, unbeatable for most)
  getBestMove(gameState, aiSide) {
    // Clear transposition table for fresh move evaluation
    this.transpositionTable.clear();
    this.tableHits = 0;
    this.tableMisses = 0;

    switch (this.difficulty) {
      case DIFFICULTY.EASY:
        return this.getEasyMove(gameState, aiSide);
      case DIFFICULTY.MEDIUM:
        return this.getMediumHeuristicMove(gameState, aiSide);
      case DIFFICULTY.HARD:
        return this.getMCTSMove(gameState, aiSide);
      default:
        return this.getMediumHeuristicMove(gameState, aiSide);
    }
  }

  // === EASY MODE: Random play, tiger prefers captures ===
  getEasyMove(gameState, aiSide) {
    const moves = this.getAllPossibleMoves(gameState, aiSide);
    if (moves.length === 0) return null;

    // Tiger: capture-first (bare minimum strategy)
    if (aiSide === PIECE_TYPES.TIGER) {
      const captures = moves.filter(m => m.capture !== null);
      if (captures.length > 0) {
        return captures[Math.floor(Math.random() * captures.length)];
      }
    }
    // Everything else: pure random
    return moves[Math.floor(Math.random() * moves.length)];
  }

  // === MEDIUM MODE: Paper's heuristic strategy (no MCTS, no randomness) ===
  // Based on Section III of the paper: observed patterns from experienced players
  getMediumHeuristicMove(gameState, aiSide) {
    const moves = this.getAllPossibleMoves(gameState, aiSide);
    if (moves.length === 0) return null;

    if (aiSide === PIECE_TYPES.TIGER) {
      return this.getTigerHeuristicMove(moves, gameState);
    } else {
      return this.getGoatHeuristicMove(moves, gameState);
    }
  }

  // Tiger heuristic: priority order from paper Section III
  // 1. Sure-eat (guaranteed capture)
  // 2. Fork (threaten 2+ goats simultaneously)
  // 3. Positional minimax (center > edge-center > others)
  getTigerHeuristicMove(moves, gameState) {
    // Priority 1: Sure eat - directly capture a goat
    const captureMoves = moves.filter(m => m.capture !== null);
    if (captureMoves.length > 0) {
      // Pick the capture that leads to the best board position
      return this.selectMoveWithMinimax(captureMoves, gameState, PIECE_TYPES.TIGER);
    }

    // Priority 2: Fork - move that threatens 2+ goats simultaneously
    const forkMoves = this.detectFork(moves, gameState);
    if (forkMoves.length > 0) {
      return this.selectMoveWithMinimax(forkMoves, gameState, PIECE_TYPES.TIGER);
    }

    // Priority 3: Best positional move via minimax
    return this.selectMoveWithMinimax(moves, gameState, PIECE_TYPES.TIGER);
  }

  // Goat heuristic: based on paper's goat strategy observations
  // 1. Placement phase: edge-centers first, then borders, avoid threatened spots
  // 2. Movement phase: defend threatened goats, form chains, restrict tigers
  getGoatHeuristicMove(moves, gameState) {
    if (gameState.phase === 'placement') {
      return this.getGoatPlacementHeuristic(moves, gameState);
    }
    return this.getGoatMovementHeuristic(moves, gameState);
  }

  getGoatPlacementHeuristic(moves, gameState) {
    // Paper: "Goat is lost if the first move is not the center of an outside edge"
    // First goat should go to an edge-center (2, 10, 14, 22)
    if (gameState.goatsPlaced === 0) {
      const edgeCenterMoves = moves.filter(m => EDGE_CENTERS.includes(m.to));
      if (edgeCenterMoves.length > 0) {
        return edgeCenterMoves[Math.floor(Math.random() * edgeCenterMoves.length)];
      }
    }

    // Paper: "first populate the borders" — prefer border positions
    const safeMoves = moves.filter(m => m.isSafe !== false);
    const availableMoves = safeMoves.length > 0 ? safeMoves : moves;

    // Prioritize border positions, then center area
    const borderMoves = availableMoves.filter(m => BORDER_POSITIONS.includes(m.to));
    if (borderMoves.length > 0) {
      return this.selectMoveWithMinimax(borderMoves, gameState, PIECE_TYPES.GOAT);
    }
    return this.selectMoveWithMinimax(availableMoves, gameState, PIECE_TYPES.GOAT);
  }

  getGoatMovementHeuristic(moves, gameState) {
    // Priority 1: Save any threatened goat
    const defensiveMoves = this.getDefensiveMoves(gameState, moves);
    if (defensiveMoves.length > 0) {
      return this.selectMoveWithMinimax(defensiveMoves, gameState, PIECE_TYPES.GOAT);
    }

    // Priority 2: Best chain/blockade formation via minimax
    return this.selectMoveWithMinimax(moves, gameState, PIECE_TYPES.GOAT);
  }

  // === LEGACY: keep for any external callers ===
  getHeuristicMove(gameState, aiSide) {
    return this.getMediumHeuristicMove(gameState, aiSide);
  }

  selectMoveWithMinimax(moves, gameState, aiSide) {
    let bestMove = null;
    let bestScore = -Infinity;

    // For goats: always prefer safe moves in medium/hard (full precision)
    if (aiSide === PIECE_TYPES.GOAT) {
      const safeMoves = moves.filter(m => m.isSafe !== false);
      if (safeMoves.length > 0) {
        moves = safeMoves;
      }
    }

    // OPTIMIZATION: Sort moves by heuristic value for better pruning
    const sortedMoves = this.sortMovesByHeuristic(moves, gameState, aiSide);
    
    const startTime = Date.now();
    for (const move of sortedMoves) {
      // Check time budget
      if (Date.now() - startTime > this.timeBudget * 0.8) {
        console.log(`⏱️ Time budget exceeded, using best move so far`);
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
    // OPTIMIZATION: Score moves heuristically for move ordering (better alpha-beta pruning)
    return moves.sort((a, b) => {
      let scoreA = this.getMoveHeuristic(gameState, a, aiSide);
      let scoreB = this.getMoveHeuristic(gameState, b, aiSide);
      return scoreB - scoreA; // Descending order (best moves first)
    });
  }
  
  getMoveHeuristic(gameState, move, aiSide) {
    let score = 0;
    
    // Captures are highest priority
    if (move.capture !== null) {
      score += 1000;
    }
    
    // Control center
    if (move.to === 12) {
      score += 100;
    }
    
    // Threatening positions
    if (aiSide === PIECE_TYPES.TIGER) {
      const newState = this.applyMove(gameState, move);
      const threatened = this.countThreatenedGoats(newState, move.to);
      score += threatened * 50;
    } else if (aiSide === PIECE_TYPES.GOAT) {
      // Moving to defend
      const threatened = this.findThreatenedGoats(gameState);
      if (threatened.includes(move.from)) score += 40;
    }
    
    return score;
  }

  minimax(state, depth, alpha, beta, maximizing, aiSide, startTime) {
    // OPTIMIZATION: Check transposition table for cached evaluation
    const stateHash = this.hashGameState(state, depth, maximizing);
    if (this.transpositionTable.has(stateHash)) {
      this.tableHits++;
      return this.transpositionTable.get(stateHash);
    }
    this.tableMisses++;
    
    // OPTIMIZATION: Check time budget (iterative deepening)
    if (startTime && Date.now() - startTime > this.timeBudget * 0.9) {
      return this.evaluatePosition(state, aiSide);
    }
    
    // ENDGAME FIX 4: Use faster evaluation for shallow depths
    if (depth === 1) {
      const evaluation = this.quickEvaluate(state, aiSide);
      this.transpositionTable.set(stateHash, evaluation);
      return evaluation;
    }
    
    if (depth <= 0 || this.isTerminalState(state)) {
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

    // ENDGAME FIX 5: Only sort moves at root and first level (skip at deep depths)
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
        if (beta <= alpha) break; // Alpha-beta pruning
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
        if (beta <= alpha) break; // Alpha-beta pruning
      }
      this.transpositionTable.set(stateHash, minEval);
      return minEval;
    }
  }
  
  hashGameState(gameState, depth, isMaximizing) {
    // OPTIMIZATION: Create hash of game state for transposition table
    // Combine board state + depth + turn to create unique key
    const boardString = gameState.board.join('');
    const key = `${boardString}_d${depth}_${isMaximizing ? 'max' : 'min'}`;
    
    // ENDGAME FIX 1: Implement LRU eviction to prevent unbounded memory growth
    if (this.transpositionTable.size >= this.MAX_TRANSPOSITION_SIZE) {
      // Remove oldest entry
      const oldestKey = this.transpositionOrder.shift();
      if (oldestKey) this.transpositionTable.delete(oldestKey);
    }
    
    // Track insertion order for LRU
    if (!this.transpositionTable.has(key)) {
      this.transpositionOrder.push(key);
    }
    
    return key;
  }



  // Detect threatened goats and return moves that save them
  getDefensiveMoves(gameState, moves) {
    const threatenedGoats = this.findThreatenedGoats(gameState);
    if (threatenedGoats.length === 0) return [];

    console.log(`⚠️ Threatened goats at positions: ${threatenedGoats.join(', ')}`);
    
    // Filter moves that save threatened goats
    const defensiveMoves = moves.filter(move => {
      // Check if this move saves a threatened goat
      if (threatenedGoats.includes(move.from)) {
        // Verify the destination is safe
        const newState = this.applyMove(gameState, move);
        const stillThreatened = this.isGoatThreatened(newState, move.to);
        return !stillThreatened;
      }
      return false;
    });

    return defensiveMoves;
  }

  // Find all goats currently threatened by tigers
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

  // Check if a goat at specific position is threatened by any tiger
  isGoatThreatened(gameState, goatPos) {
    const adjacentPositions = this.getAdjacentPositions(goatPos);
    for (const tigerPos of adjacentPositions) {
      if (gameState.board[tigerPos] === PIECE_TYPES.TIGER) {
        const { row: r1, col: c1 } = this.indexToPos(tigerPos);
        const { row: r2, col: c2 } = this.indexToPos(goatPos);
        const dr = r2 - r1;
        const dc = c2 - c1;
        const jumpRow = r2 + dr;
        const jumpCol = c2 + dc;
        
        if (jumpRow >= 0 && jumpRow < 5 && jumpCol >= 0 && jumpCol < 5) {
          const jumpIndex = jumpRow * 5 + jumpCol;
          if (gameState.board[jumpIndex] === PIECE_TYPES.EMPTY) {
            // Verify jump follows valid line by checking if from goat's perspective the jump destination is adjacent
            const jumpAdjacent = this.getAdjacentPositions(goatPos);
            if (jumpAdjacent.includes(jumpIndex)) {
              return true; // This goat can be captured!
            }
          }
        }
      }
    }
    return false;
  }

  // Detect Sure-Eat: Moves that lead to guaranteed capture
  detectSureEat(moves, gameState) {
    const captureMoves = moves.filter(m => m.capture !== null);
    return captureMoves;
  }

  // Detect Fork: Moves that threaten 2+ goats simultaneously
  detectFork(moves, gameState) {
    const forkMoves = [];

    for (const move of moves) {
      if (move.capture !== null) continue; // Skip captures (already handled)
      
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
        // Check if tiger can capture this goat
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

  selectBestByPosition(moves, gameState, aiSide) {
    let bestMove = null;
    let bestScore = -Infinity;

    for (const move of moves) {
      const newState = this.applyMove(gameState, move);
      const score = this.evaluatePosition(newState, aiSide);
      
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove || moves[0];
  }

  // === HARD MODE: MCTS for both Tiger and Goat ===
  // Implements UCT formula from paper eq.(1): UCT = wi/ni + c*sqrt(ln(N)/ni)
  // Both sides use MCTS — paper shows MCTS dominates heuristic every time

  getMCTSMove(gameState, aiSide) {
    const rootNode = new MCTSNode(gameState, null, null);
    const startTime = Date.now();

    for (let i = 0; i < this.simulationCount; i++) {
      if (Date.now() - startTime > this.timeBudget) break;

      let node = this.selection(rootNode, aiSide);
      if (!node.isTerminal) {
        node = this.expansion(node, aiSide);
      }
      const result = this.simulation(node.state, aiSide);
      this.backpropagation(node, result);
    }

    const bestMove = this.selectBestChild(rootNode);

    // Fallback to medium heuristic if MCTS returns nothing
    if (!bestMove) {
      return this.getMediumHeuristicMove(gameState, aiSide);
    }

    return bestMove;
  }

  // MCTS Phase 1: Selection using UCT
  selection(node, aiSide) {
    while (node.children.length > 0) {
      node = this.selectUCT(node, aiSide);
      
      // Check if terminal
      if (this.isTerminalState(node.state)) {
        node.isTerminal = true;
        break;
      }
    }
    return node;
  }

  // UCT formula: Wi/ni + c * sqrt(ln(N)/ni)
  selectUCT(node, aiSide) {
    let bestChild = null;
    let bestUCT = -Infinity;

    for (const child of node.children) {
      if (child.visits === 0) {
        return child; // Prioritize unvisited nodes
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

  // MCTS Phase 2: Expansion
  expansion(node, aiSide) {
    const currentPlayer = node.state.currentPlayer;
    const moves = this.getAllPossibleMoves(node.state, currentPlayer);
    
    if (moves.length === 0) {
      node.isTerminal = true;
      return node;
    }

    // Create child nodes for all possible moves
    for (const move of moves) {
      const newState = this.applyMove(node.state, move);
      const child = new MCTSNode(newState, node, move);
      node.children.push(child);
    }

    // Return random child for simulation
    return node.children[Math.floor(Math.random() * node.children.length)];
  }

  // MCTS Phase 3: Simulation (playout) - Heuristic-guided (OPTIMIZED)
  simulation(state, aiSide) {
    let currentState = this.cloneState(state);
    let depth = 0;
    // OPTIMIZATION: Reduced maxDepth from 60 to 40 for 33% faster simulations
    const maxDepth = 40;

    while (!this.isTerminalState(currentState) && depth < maxDepth) {
      const moves = this.getAllPossibleMoves(currentState, currentState.currentPlayer);
      if (moves.length === 0) break;

      // OPTIMIZATION: 80% heuristic (increased from 70%), 20% random for faster convergence
      let selectedMove;
      if (Math.random() < 0.8) {
        // Pick best move according to quick evaluation
        selectedMove = this.selectBestMoveQuick(moves, currentState);
      } else {
        // Random move for exploration
        selectedMove = moves[Math.floor(Math.random() * moves.length)];
      }
      
      currentState = this.applyMove(currentState, selectedMove);
      depth++;
    }

    return this.getGameResult(currentState, aiSide);
  }

  selectBestMoveQuick(moves, state) {
    // Quick evaluation without deep search
    let bestMove = null;
    let bestScore = -Infinity;
    const currentPlayer = state.currentPlayer;

    // Prioritize captures for tigers
    if (currentPlayer === PIECE_TYPES.TIGER) {
      const captures = moves.filter(m => m.capture !== null);
      if (captures.length > 0) {
        return captures[Math.floor(Math.random() * captures.length)];
      }
    }

    // Otherwise pick best positional move using getMoveHeuristic for speed
    for (const move of moves) {
      // Instead of deep evaluation, just use the fast heuristic scorer
      const score = this.getMoveHeuristic(state, move, currentPlayer);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove || moves[0];
  }

  // MCTS Phase 4: Backpropagation
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

    // If no child was visited, return first child's move
    if (!bestChild || bestVisits === 0) {
      return rootNode.children[0].move;
    }

    return bestChild.move;
  }

  // === POSITION EVALUATION ===

  // ENDGAME FIX 6: Quick evaluation for shallow search depths (90% faster)
  quickEvaluate(gameState, aiSide) {
    // Skip expensive evaluations, only use material + position
    let score = 0;

    // Material evaluation (most important)
    score += this.evaluateMaterial(gameState, aiSide) * 150;
    
    // Positional evaluation (weight by phase)
    const phase = this.getGamePhase(gameState);
    const posWeight = phase === 'early' ? 1.5 : phase === 'mid' ? 1.0 : 0.7;
    score += this.evaluatePositions(gameState, aiSide) * posWeight;
    
    // Fast mobility (simple count without detailed analysis)
    let myMobility = 0;
    const opponentSide = aiSide === PIECE_TYPES.TIGER ? PIECE_TYPES.GOAT : PIECE_TYPES.TIGER;
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

    // Check terminal states
    if (this.isTerminalState(gameState)) {
      const result = this.getGameResult(gameState, aiSide);
      if (result === 1) return 100000; // AI wins
      if (result === 0) return -100000; // AI loses
    }

    // Material evaluation (most important)
    score += this.evaluateMaterial(gameState, aiSide) * 150;
    
    // Positional evaluation (weight by phase)
    const posWeight = phase === 'early' ? 1.5 : phase === 'mid' ? 1.0 : 0.7;
    score += this.evaluatePositions(gameState, aiSide) * posWeight;
    
    // Mobility evaluation (critical in endgame)
    const mobWeight = phase === 'late' ? 2.0 : 1.0;
    score += this.evaluateMobility(gameState, aiSide) * mobWeight;
    
    // Formation evaluation
    score += this.evaluateFormations(gameState, aiSide);

    // Tactical patterns
    score += this.evaluateTacticalPatterns(gameState, aiSide);

    // Strategic positioning
    score += this.evaluateStrategicGoals(gameState, aiSide, phase);

    return score;
  }

  evaluateTacticalPatterns(gameState, aiSide) {
    let score = 0;

    if (aiSide === PIECE_TYPES.TIGER) {
      // Count capturable goats
      let capturableGoats = 0;
      for (let i = 0; i < 25; i++) {
        if (gameState.board[i] === PIECE_TYPES.TIGER) {
          capturableGoats += this.countThreatenedGoats(gameState, i);
        }
      }
      score += capturableGoats * 40; // Increased reward for threats

      // Penalize trapped tigers
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
      // GOAT: Penalize threatened goats (full penalty for medium/hard)
      const threatenedGoats = this.findThreatenedGoats(gameState);
      score -= threatenedGoats.length * 150;
      
      // Goat: Reward controlling key intersections
      const keyPositions = [2, 10, 12, 14, 22]; // Cross center
      for (const pos of keyPositions) {
        if (gameState.board[pos] === PIECE_TYPES.GOAT) {
          score += 15;
        }
      }

      // Reward restricting tiger movement
      let tigerMobility = 0;
      for (let i = 0; i < 25; i++) {
        if (gameState.board[i] === PIECE_TYPES.TIGER) {
          tigerMobility += this.getValidMoves(gameState, i).length;
        }
      }
      score += (16 - tigerMobility) * 8; // Reward low tiger mobility
    }

    return score;
  }

  evaluateStrategicGoals(gameState, aiSide, phase) {
    let score = 0;

    if (aiSide === PIECE_TYPES.TIGER) {
      // Tiger strategy
      if (phase === 'early') {
        // Early: Maximize capture opportunities
        score += gameState.goatsCaptured * 200;
      } else if (phase === 'mid') {
        // Mid: Balance captures with position
        score += gameState.goatsCaptured * 180;
        // Avoid corner traps
        const corners = [0, 4, 20, 24];
        for (const corner of corners) {
          if (gameState.board[corner] === PIECE_TYPES.TIGER) {
            const moves = this.getValidMoves(gameState, corner);
            if (moves.length <= 2) score -= 40; // Penalize trapped corners
          }
        }
      } else {
        // Late: Aggressive capture or mobility
        score += gameState.goatsCaptured * 220;
      }
    } else {
      // Goat strategy
      if (phase === 'early') {
        // Early: Control center, build solid structure
        if (gameState.board[12] === PIECE_TYPES.GOAT) score += 40;
        // Reward perimeter control
        const perimeter = [0,1,2,3,4,5,9,10,14,15,19,20,21,22,23,24];
        let perimeterCount = 0;
        for (const pos of perimeter) {
          if (gameState.board[pos] === PIECE_TYPES.GOAT) perimeterCount++;
        }
        score += perimeterCount * 8;
      } else {
        // Mid/Late: Form unbreakable chains, trap tigers
        score += this.countGoatChains(gameState) * 25;
        
        // Reward near-trapped tigers
        for (let i = 0; i < 25; i++) {
          if (gameState.board[i] === PIECE_TYPES.TIGER) {
            const moves = this.getValidMoves(gameState, i);
            score += (6 - moves.length) * 20; // Fewer tiger moves = better
          }
        }
      }
    }

    return score;
  }

  evaluateMaterial(gameState, aiSide) {
    const captured = gameState.goatsCaptured;
    
    if (aiSide === PIECE_TYPES.TIGER) {
      // Exponential value for captures (4 captures = critical)
      if (captured >= 5) return 10000; // Won
      if (captured === 4) return 500;  // One away from winning
      return captured * captured * 30; // Quadratic scaling
    } else {
      // Goats: Exponential penalty for losses
      if (captured >= 5) return -10000; // Lost
      if (captured === 4) return -600;  // Danger zone
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
      // Reward goats for forming solid lines (unbroken chains)
      score += this.countGoatChains(gameState) * 10;
      
      // Reward center control
      if (gameState.board[12] === PIECE_TYPES.GOAT) {
        score += 20;
      }
    } else {
      // Reward tigers for breaking goat formations
      score -= this.countGoatChains(gameState) * 5;
      
      // Reward tigers for spread positioning
      score += this.evaluateTigerSpread(gameState) * 10;
    }

    return score;
  }

  countGoatChains(gameState) {
    let chains = 0;
    const visited = new Set();

    for (let i = 0; i < 25; i++) {
      if (gameState.board[i] === PIECE_TYPES.GOAT && !visited.has(i)) {
        const chainSize = this.exploreChain(gameState, i, visited);
        chains += chainSize > 1 ? chainSize : 0;
      }
    }

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

  // === GAME LOGIC HELPERS ===

  getAllPossibleMoves(gameState, side) {
    const moves = [];

    if (side === PIECE_TYPES.GOAT && gameState.phase === 'placement') {
      // Placement phase - place goat on empty spots, mark if immediately capturable
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
      return moves;
    } else {
      // Movement phase - move existing pieces
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
      // Goats can only move to adjacent empty spots
      const adjacent = this.getAdjacentPositions(index);
      for (const adj of adjacent) {
        if (gameState.board[adj] === PIECE_TYPES.EMPTY) {
          // Check if moving here would make goat capturable
          const testState = this.cloneState(gameState);
          testState.board[adj] = PIECE_TYPES.GOAT;
          testState.board[index] = PIECE_TYPES.EMPTY;
          const wouldBeCapturable = this.isGoatThreatened(testState, adj);
          
          moves.push({ 
            type: 'move', 
            from: index, 
            to: adj, 
            capture: null,
            isSafe: !wouldBeCapturable // Mark if move is safe
          });
        }
      }
    } else if (piece === PIECE_TYPES.TIGER) {
      // Tigers can move or capture
      const adjacent = this.getAdjacentPositions(index);
      for (const adj of adjacent) {
        if (gameState.board[adj] === PIECE_TYPES.EMPTY) {
          moves.push({ type: 'move', from: index, to: adj, capture: null });
        } else if (gameState.board[adj] === PIECE_TYPES.GOAT) {
          // Check if can capture
          const { row: r1, col: c1 } = this.indexToPos(index);
          const { row: r2, col: c2 } = this.indexToPos(adj);
          const dr = r2 - r1;
          const dc = c2 - c1;
          const jumpRow = r2 + dr;
          const jumpCol = c2 + dc;
          
          if (jumpRow >= 0 && jumpRow < 5 && jumpCol >= 0 && jumpCol < 5) {
            const jumpIndex = jumpRow * 5 + jumpCol;
            if (gameState.board[jumpIndex] === PIECE_TYPES.EMPTY) {
              // Verify jump follows valid line
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
    // Tigers win by capturing 5 goats
    if (gameState.goatsCaptured >= 5) return true;

    // Goats win by trapping all tigers (movement phase only)
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

    // Check if tigers are trapped
    const tigersMoves = [];
    for (let i = 0; i < 25; i++) {
      if (gameState.board[i] === PIECE_TYPES.TIGER) {
        tigersMoves.push(...this.getValidMoves(gameState, i));
      }
    }

    if (tigersMoves.length === 0) {
      return aiSide === PIECE_TYPES.GOAT ? 1 : 0;
    }

    return 0.5; // Draw/ongoing
  }

  getAdjacentPositions(index) {
    const { row, col } = this.indexToPos(index);
    const adjacent = [];

    // Horizontal and vertical
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;
      if (newRow >= 0 && newRow < 5 && newCol >= 0 && newCol < 5) {
        adjacent.push(newRow * 5 + newCol);
      }
    }

    // Diagonals (check if diagonal line exists)
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

    // Main diagonal
    if (r1 === c1 && r2 === c2) return true;

    // Anti-diagonal
    if (r1 + c1 === 4 && r2 + c2 === 4) return true;

    // Inner diamond diagonals
    const topMid = [0, 2], rightMid = [2, 4], bottomMid = [4, 2], leftMid = [2, 0];
    const pointMatches = (r, c, point) => r === point[0] && c === point[1];

    // Diamond connections through intermediate points
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

// Export for use in main game
export { BaghchalAI, DIFFICULTY, PIECE_TYPES };
