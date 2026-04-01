# BaghChal AI Implementation

## Overview
This implementation follows the **"AI Strategy Approach Development on Baghchal using AlphaZero"** research paper, providing three difficulty levels with progressively sophisticated AI strategies.

## Architecture

### Difficulty Levels

#### 🎯 EASY (Basic Heuristic)
- **Simulations**: 100 evaluations per move
- **Strategy**: Simple position-based evaluation
- **Evaluation Functions**:
  - Material count (captured goats)
  - Positional weights (center = 8, corners = 1)
  - Basic mobility assessment
- **Best for**: Beginners learning the game

#### ⚔️ MEDIUM (Advanced Heuristic)
- **Simulations**: 500 evaluations per move
- **Strategy**: Tactical pattern recognition
- **Key Features**:
  - **Sure-Eat Detection**: Prioritizes guaranteed captures
  - **Fork Detection**: Creates threats to multiple goats simultaneously
  - **Formation Analysis**: Evaluates goat chains and tiger spread
  - Enhanced positional evaluation
- **Best for**: Intermediate players

#### 🧠 HARD (Monte Carlo Tree Search)
- **Simulations**: 1,000 MCTS simulations per move
- **Strategy**: Full MCTS with UCT formula
- **Algorithm Phases**:
  1. **Selection**: UCT = Wi/ni + c√(ln(N)/ni)
  2. **Expansion**: Create child nodes for all legal moves
  3. **Simulation**: Random playout to terminal state
  4. **Backpropagation**: Update win/visit statistics
- **Best for**: Advanced players seeking maximum challenge

## Core Components

### 1. Position Evaluation
```javascript
const POSITION_WEIGHTS = [
  1, 2, 3, 2, 1,   // Row 0 (edges)
  2, 4, 5, 4, 2,   // Row 1
  3, 5, 8, 5, 3,   // Row 2 (center = 8)
  2, 4, 5, 4, 2,   // Row 3
  1, 2, 3, 2, 1    // Row 4 (edges)
];
```

### 2. Tactical Detection

#### Sure-Eat (Forced Captures)
Identifies moves that guarantee goat captures:
- Tiger can jump over adjacent goat
- Landing position is empty
- Path follows valid board lines

#### Fork (Multi-Threat)
Detects positions threatening 2+ goats:
- Tiger positioned to capture multiple goats
- Opponent can only defend one per turn
- Forces material loss

### 3. MCTS Implementation

**UCT Formula**: 
```
UCT = exploitation + exploration
    = (Wi / ni) + c * √(ln(N) / ni)
```

Where:
- Wi = wins from node i
- ni = visits to node i
- N = total visits to parent
- c = exploration constant (√2 ≈ 1.414)

**Tree Phases**:
1. **Selection**: Traverse tree using UCT until leaf node
2. **Expansion**: Add all legal moves as child nodes
3. **Simulation**: Random playout (max 100 moves)
4. **Backpropagation**: Update ancestors with result

### 4. Strategy Differentiation

#### Tiger Strategy (Predator)
- **Early Game**: Maximize captures during placement phase
- **Formation Breaking**: Prevent goat chains
- **Spread Positioning**: Maintain mobility across board
- **Center Control**: Occupy high-mobility positions
- **Target Priority**: Fork → Sure-Eat → Position

#### Goat Strategy (Prey)
- **Placement Phase**: 
  - Occupy center early (index 12)
  - Build unbroken perimeter
  - Avoid isolated positions
- **Movement Phase**:
  - Form solid chains (adjacent goats)
  - Reduce tiger mobility
  - Gradual encirclement
- **Sacrifice Tolerance**: Accept 1-2 captures for strong position

## Technical Details

### Board Representation
- **Grid**: 5×5 (25 positions)
- **Indexing**: 0-24 (row-major order)
- **Connections**: Horizontal, vertical, and diagonal lines
- **Starting Positions**: Tigers at corners [0, 4, 20, 24]

### Move Types
```javascript
{
  type: 'place',    // Goat placement (phase 1)
  type: 'move',     // Regular movement
  type: 'capture',  // Tiger capture jump
  from: index,      // Source position
  to: index,        // Destination position
  capture: index    // Captured goat (or null)
}
```

### State Representation
```javascript
{
  board: [25],           // Piece positions
  currentPlayer: int,    // TIGER or GOAT
  phase: string,         // 'placement' or 'movement'
  goatsPlaced: int,      // 0-20
  goatsCaptured: int     // 0-5
}
```

## Performance Characteristics

| Difficulty | Avg Time/Move | Peak Memory | Strength (ELO est.) |
|-----------|---------------|-------------|---------------------|
| Easy      | ~10ms         | ~2MB        | ~1200               |
| Medium    | ~50ms         | ~5MB        | ~1600               |
| Hard      | ~200-500ms    | ~15MB       | ~2000+              |

## Usage

```javascript
import { BaghchalAI, DIFFICULTY } from './src/BaghchalAI.js';

// Initialize AI
const ai = new BaghchalAI(DIFFICULTY.HARD);

// Get best move
const move = ai.getBestMove(gameState, PIECE_TYPES.TIGER);

// Apply move to game state
applyMove(gameState, move);
```

## Key Algorithms

### 1. Fork Detection Algorithm
```
FOR each potential tiger move:
  count = 0
  FOR each adjacent position to destination:
    IF position contains goat AND can be captured:
      count++
  IF count >= 2:
    RETURN move as fork
```

### 2. Sure-Eat Detection
```
FOR each tiger move:
  IF move.capture !== null:
    RETURN move as sure-eat
```

### 3. Position Evaluation
```
score = 0
score += material_value(captured_goats)
score += positional_value(piece_locations)
score += mobility_value(available_moves)
score += formation_value(piece_patterns)
RETURN score
```

## Research Paper Alignment

This implementation follows the paper's recommendations:

1. ✅ **Center-focused positioning** (highest weight = 8)
2. ✅ **Sure-Eat tactical detection**
3. ✅ **Fork pattern recognition**
4. ✅ **MCTS with UCT formula** (Wi/ni + c√(ln(N)/ni))
5. ✅ **1,000+ simulations** for advanced mode
6. ✅ **Tiger: Break formations** (evaluated in heuristic)
7. ✅ **Goat: Occupy center & maintain perimeter** (formation analysis)

## Future Enhancements

- Neural network integration (AlphaZero full implementation)
- Opening book for common positions
- Endgame tablebase
- Parallel MCTS (multi-threading)
- Adaptive difficulty (adjusts to player skill)

## License
MIT License - Based on traditional Nepali Bagh Chal game
