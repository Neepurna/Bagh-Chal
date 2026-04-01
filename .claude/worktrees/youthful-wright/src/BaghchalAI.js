// BaghChal AI - Implementing AlphaZero-inspired strategy
// Supports EASY (basic heuristic), MEDIUM (advanced heuristic), HARD (MCTS)

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

class BaghchalAI {
  constructor(difficulty = DIFFICULTY.MEDIUM) {
    this.difficulty = difficulty;
    this.simulationCount = this.getSimulationCount();
    this.explorationConstant = 1.414; // UCT exploration parameter (√2)
    this.searchDepth = this.getSearchDepth();
  }

  getSimulationCount() {
    switch (this.difficulty) {
      case DIFFICULTY.EASY: return 50;
      case DIFFICULTY.MEDIUM: return 200;
      case DIFFICULTY.HARD: return 500; // Reduced for faster play while maintaining strength
      default: return 200;
    }
  }

  getSearchDepth() {
    switch (this.difficulty) {
      case DIFFICULTY.EASY: return 2;  // 2-ply lookahead
      case DIFFICULTY.MEDIUM: return 4; // 4-ply lookahead
      case DIFFICULTY.HARD: return 0;   // MCTS (no depth limit)
      default: return 3;
    }
  }

  getDefensivePrecision() {
    // Probability of making correct defensive move
    switch (this.difficulty) {
      case DIFFICULTY.EASY: return 0.01;    // 1% precision (almost random play)
      case DIFFICULTY.MEDIUM: return 0.80;  // 80% precision (good defense, some mistakes)
      case DIFFICULTY.HARD: return 0.95;    // 95% precision (very strong defense)
      default: return 0.80;
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
  getBestMove(gameState, aiSide) {
    console.log('getBestMove called - difficulty:', this.difficulty, 'aiSide:', aiSide, 'phase:', gameState.phase);
    
    // Hard mode: Use MCTS for Tiger, Heuristic for Goat (defense is better with heuristic)
    if (this.difficulty === DIFFICULTY.HARD) {
      if (aiSide === PIECE_TYPES.TIGER) {
        return this.getMCTSMove(gameState, aiSide);
      } else {
        // Use heuristic for Goat - better defense
        console.log('Hard mode: Using heuristic for GOAT');
        return this.getHeuristicMove(gameState, aiSide);
      }
    } else {
      return this.getHeuristicMove(gameState, aiSide);
    }
  }

  // === HEURISTIC MODE ===

  getHeuristicMove(gameState, aiSide) {
    const moves = this.getAllPossibleMoves(gameState, aiSide);
    console.log('getHeuristicMove - moves count:', moves.length, 'difficulty:', this.difficulty);
    if (moves.length === 0) return null;

    // EASY MODE: Pure random play (no strategy)
    if (this.difficulty === DIFFICULTY.EASY) {
      const randomMove = moves[Math.floor(Math.random() * moves.length)];
      console.log('🎲 EASY MODE: Playing random move (no strategy)');
      return randomMove;
    }

    // MEDIUM MODE: Mix of random and strategic play
    if (this.difficulty === DIFFICULTY.MEDIUM) {
      // Always check for defense needs
      if (aiSide === PIECE_TYPES.GOAT && gameState.phase === 'movement') {
        const defensiveMoves = this.getDefensiveMoves(gameState, moves);
        if (defensiveMoves.length > 0) {
          // Defend 80% of the time when threatened
          const shouldDefend = Math.random() < 0.80;
          if (shouldDefend) {
            console.log('🛡️ MEDIUM MODE: Defending against threat');
            return this.selectMoveWithMinimax(defensiveMoves, gameState, aiSide);
          }
        }
      }
      
      // For non-defensive moves: 50% strategic, 50% random
      const useStrategy = Math.random() < 0.50;
      if (!useStrategy) {
        const randomMove = moves[Math.floor(Math.random() * moves.length)];
        console.log('🎲 MEDIUM MODE: Playing random move');
        return randomMove;
      }
      console.log('🎯 MEDIUM MODE: Playing strategic move');
      // Fall through to strategic play
    }

    // HARD MODE & MEDIUM strategic moves: Use full strategy

    // GOAT PRIORITY: Defend threatened pieces
    if (aiSide === PIECE_TYPES.GOAT && gameState.phase === 'movement') {
      const defensiveMoves = this.getDefensiveMoves(gameState, moves);
      if (defensiveMoves.length > 0) {
        console.log(`🛡️ GOAT DEFENSE: Defending threatened pieces!`);
        return this.selectMoveWithMinimax(defensiveMoves, gameState, aiSide);
      }
    }

    // Priority check for forced moves
    if (aiSide === PIECE_TYPES.TIGER) {
      const sureEat = this.detectSureEat(moves, gameState);
      if (sureEat.length > 0) {
        // If we can capture, evaluate which capture is best
        return this.selectMoveWithMinimax(sureEat, gameState, aiSide);
      }

      // Check for fork opportunities
      const forks = this.detectFork(moves, gameState);
      if (forks.length > 0) {
        return this.selectMoveWithMinimax(forks, gameState, aiSide);
      }
    }

    // Use minimax for deeper analysis
    return this.selectMoveWithMinimax(moves, gameState, aiSide);
  }

  selectMoveWithMinimax(moves, gameState, aiSide) {
    let bestMove = null;
    let bestScore = -Infinity;

    // For goats, prefer safe moves (based on difficulty)
    if (aiSide === PIECE_TYPES.GOAT) {
      const safeMoves = moves.filter(m => m.isSafe !== false);
      const precision = this.getDefensivePrecision();
      
      // Apply precision: sometimes allow unsafe moves based on difficulty
      if (safeMoves.length > 0 && Math.random() < precision) {
        moves = safeMoves; // Only consider safe moves
        console.log(`✅ Filtering to ${safeMoves.length} safe moves (${(precision*100).toFixed(0)}% precision)`);
      } else if (safeMoves.length > 0) {
        console.log(`⚠️ Allowing unsafe moves (${(precision*100).toFixed(0)}% precision - failed roll)`);
        // Don't filter, allow risky moves
      }
    }

    for (const move of moves) {
      const newState = this.applyMove(gameState, move);
      const score = this.minimax(newState, this.searchDepth - 1, -Infinity, Infinity, false, aiSide);
      
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove || moves[0];
  }

  minimax(state, depth, alpha, beta, maximizing, aiSide) {
    if (depth === 0 || this.isTerminalState(state)) {
      return this.evaluatePosition(state, aiSide);
    }

    const currentPlayer = state.currentPlayer;
    const moves = this.getAllPossibleMoves(state, currentPlayer);
    
    if (moves.length === 0) {
      return this.evaluatePosition(state, aiSide);
    }

    if (maximizing) {
      let maxEval = -Infinity;
      for (const move of moves) {
        const newState = this.applyMove(state, move);
        const evaluation = this.minimax(newState, depth - 1, alpha, beta, false, aiSide);
        maxEval = Math.max(maxEval, evaluation);
        alpha = Math.max(alpha, evaluation);
        if (beta <= alpha) break; // Alpha-beta pruning
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of moves) {
        const newState = this.applyMove(state, move);
        const evaluation = this.minimax(newState, depth - 1, alpha, beta, true, aiSide);
        minEval = Math.min(minEval, evaluation);
        beta = Math.min(beta, evaluation);
        if (beta <= alpha) break; // Alpha-beta pruning
      }
      return minEval;
    }
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
    // Check all tigers to see if they can capture this goat
    for (let i = 0; i < 25; i++) {
      if (gameState.board[i] === PIECE_TYPES.TIGER) {
        const tigerMoves = this.getValidMoves(gameState, i);
        // Check if any tiger move captures this goat
        for (const move of tigerMoves) {
          if (move.capture === goatPos) {
            return true; // This goat can be captured!
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

  // === MCTS MODE ===

  getMCTSMove(gameState, aiSide) {
    const rootNode = new MCTSNode(gameState, null, null);
    
    // Run MCTS simulations
    for (let i = 0; i < this.simulationCount; i++) {
      let node = this.selection(rootNode, aiSide);
      if (!node.isTerminal) {
        node = this.expansion(node, aiSide);
      }
      const result = this.simulation(node.state, aiSide);
      this.backpropagation(node, result);
    }

    // Select best move based on visit count
    const bestMove = this.selectBestChild(rootNode);
    
    // Fallback: if MCTS fails, use heuristic
    if (!bestMove) {
      console.log('⚠️ HARD MODE: MCTS failed, using heuristic fallback');
      return this.getHeuristicMove(gameState, aiSide);
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

  // MCTS Phase 3: Simulation (playout) - Heuristic-guided
  simulation(state, aiSide) {
    let currentState = this.cloneState(state);
    let depth = 0;
    const maxDepth = 60; // Reduced for faster simulations

    while (!this.isTerminalState(currentState) && depth < maxDepth) {
      const moves = this.getAllPossibleMoves(currentState, currentState.currentPlayer);
      if (moves.length === 0) break;

      // 70% chance to use heuristic move, 30% random (for exploration)
      let selectedMove;
      if (Math.random() < 0.7) {
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

    // Otherwise pick best positional move
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
      // GOAT: Penalize threatened goats (scaled by difficulty)
      const threatenedGoats = this.findThreatenedGoats(gameState);
      const precision = this.getDefensivePrecision();
      
      // Scale penalty based on defensive precision
      // Easy (20%): -30 per threat (weak awareness)
      // Medium (60%): -90 per threat (moderate awareness)
      // Hard (100%): -150 per threat (full awareness)
      const threatPenalty = precision * 150;
      score -= threatenedGoats.length * threatPenalty;
      
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
      // Placement phase - place goat on empty spots (avoid immediately capturable)
      for (let i = 0; i < 25; i++) {
        if (gameState.board[i] === PIECE_TYPES.EMPTY) {
          // Check if placing here would be immediately capturable
          const testState = this.applyMove(gameState, { type: 'place', to: i, from: null, capture: null });
          const wouldBeCapturable = this.isGoatThreatened(testState, i);
          
          // Only add safe placements, or if no choice, add all
          moves.push({ 
            type: 'place', 
            to: i, 
            from: null, 
            capture: null,
            isSafe: !wouldBeCapturable // Mark safe placements
          });
        }
      }
      
      // Prioritize safe placements based on difficulty
      const safeMoves = moves.filter(m => m.isSafe);
      
      // If there are safe moves, prefer them (especially in hard mode)
      if (safeMoves.length > 0) {
        const precision = this.getDefensivePrecision();
        if (Math.random() < precision) {
          console.log(`Placement: Using ${safeMoves.length} safe moves (precision: ${precision})`);
          return safeMoves;
        }
      }
      
      // If no safe moves exist, or precision check failed, return all moves
      console.log(`Placement: Using all ${moves.length} moves`);
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
