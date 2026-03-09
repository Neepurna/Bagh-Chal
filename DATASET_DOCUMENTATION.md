# BaghChal AI Training Dataset Documentation

## Overview
This system generates high-quality training datasets for BaghChal AI through self-play between two HARD difficulty AI agents. Each dataset contains thousands of positions with evaluations and best moves.

## Dataset Format

### Structure
```json
{
  "metadata": {
    "generatedAt": "2026-03-08T...",
    "totalGames": 50,
    "totalPositions": 2847,
    "statistics": {
      "tigerWins": 32,
      "goatWins": 15,
      "draws": 3,
      "avgMovesPerGame": "56.94",
      "avgGoatsCaptured": "3.84",
      "tigerWinRate": "64.0%",
      "goatWinRate": "30.0%"
    }
  },
  "games": [...]
}
```

### Game Record
Each game contains:
```json
{
  "gameId": 1,
  "totalMoves": 63,
  "winner": "tiger",
  "reason": "captured_5_goats",
  "positions": [
    {
      "board": ["empty", "tiger", "empty", ...],
      "currentPlayer": "goat",
      "phase": "placement",
      "goatsPlaced": 5,
      "goatsCaptured": 0,
      "evaluation": 245.8,
      "legalMoves": [...],
      "gamePhase": "early",
      "bestMove": {
        "type": "place",
        "from": null,
        "to": 12,
        "capture": null
      },
      "moveNumber": 6,
      "resultingEval": 268.3
    },
    ...
  ]
}
```

## Position Encoding

### Board Array (25 positions)
- **Index**: 0-24 (5×5 grid, row-major order)
- **Values**: `"empty"`, `"tiger"`, `"goat"`
- **Layout**:
```
 0  1  2  3  4
 5  6  7  8  9
10 11 12 13 14
15 16 17 18 19
20 21 22 23 24
```

### Move Encoding
```json
{
  "type": "place" | "move" | "capture",
  "from": source_index | null,
  "to": destination_index,
  "capture": captured_position | null
}
```

### Game Phases
- **early**: Placement phase (goatsPlaced < 20)
- **mid**: Early movement (goatsPlaced = 20, goatsCaptured < 2)
- **late**: Endgame (goatsCaptured >= 2)

## Using the Dataset

### 1. Generate Dataset
1. Click **📊 Dataset** button in game header
2. Enter number of games (1-1000)
3. Click **🎮 Generate Dataset**
4. Wait for generation (progress shown)
5. Download JSON file

### 2. Training Examples Format
Use `generateTrainingExamples()` to get clean input/output pairs:

```json
{
  "input": {
    "board": [...],
    "player": "tiger",
    "phase": "movement",
    "goatsPlaced": 20,
    "goatsCaptured": 2
  },
  "output": {
    "bestMove": {...},
    "evaluation": 432.7,
    "gamePhase": "late"
  }
}
```

### 3. Neural Network Training

#### Recommended Architecture
```
Input Layer (25 board positions × 3 one-hot encoded) = 75 neurons
  ↓
Hidden Layer 1: 256 neurons (ReLU)
  ↓
Hidden Layer 2: 128 neurons (ReLU)
  ↓
Hidden Layer 3: 64 neurons (ReLU)
  ↓
Output Layers:
  - Policy Head: 625 neurons (25×25 from-to pairs) → Softmax
  - Value Head: 1 neuron → Tanh (-1 to 1 for position evaluation)
```

#### Input Encoding
For each board position, encode as 3-bit one-hot vector:
```
Empty: [1, 0, 0]
Tiger: [0, 1, 0]
Goat:  [0, 0, 1]
```

Additional features (optional):
- Current player (1 bit)
- Game phase (3 bits one-hot)
- Goats placed (normalized 0-1)
- Goats captured (normalized 0-1)

#### Target Encoding

**Policy Target**: One-hot vector of size 625
- For placement: from=any, to=chosen position
- For movement: from=source, to=destination
- Index = from×25 + to

**Value Target**: Normalized evaluation
```python
# Normalize evaluation to [-1, 1] using tanh
value_target = tanh(evaluation / 1000)
```

### 4. PyTorch Example

```python
import torch
import torch.nn as nn
import json

class BaghChalNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.shared = nn.Sequential(
            nn.Linear(75 + 6, 256),  # board + metadata
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Dropout(0.2)
        )
        
        # Policy head (move prediction)
        self.policy_head = nn.Sequential(
            nn.Linear(128, 256),
            nn.ReLU(),
            nn.Linear(256, 625),
            nn.Softmax(dim=1)
        )
        
        # Value head (position evaluation)
        self.value_head = nn.Sequential(
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, 1),
            nn.Tanh()
        )
    
    def forward(self, x):
        shared_out = self.shared(x)
        policy = self.policy_head(shared_out)
        value = self.value_head(shared_out)
        return policy, value

def encode_position(pos):
    """Convert position to network input."""
    # One-hot encode board
    board_tensor = []
    for cell in pos['board']:
        if cell == 'empty':
            board_tensor.extend([1, 0, 0])
        elif cell == 'tiger':
            board_tensor.extend([0, 1, 0])
        else:  # goat
            board_tensor.extend([0, 0, 1])
    
    # Add metadata
    metadata = [
        1 if pos['currentPlayer'] == 'tiger' else 0,
        1 if pos['phase'] == 'placement' else 0,
        1 if pos['gamePhase'] == 'early' else 0,
        1 if pos['gamePhase'] == 'mid' else 0,
        1 if pos['gamePhase'] == 'late' else 0,
        pos['goatsCaptured'] / 5.0  # Normalize
    ]
    
    return torch.tensor(board_tensor + metadata, dtype=torch.float32)

def encode_move(move, board_size=25):
    """Convert move to policy target (one-hot)."""
    from_pos = move['from'] if move['from'] is not None else 0
    to_pos = move['to']
    move_index = from_pos * board_size + to_pos
    
    target = torch.zeros(625)
    target[move_index] = 1.0
    return target

# Load dataset
with open('baghchal_dataset.json', 'r') as f:
    dataset = json.load(f)

# Prepare training data
X = []
y_policy = []
y_value = []

for game in dataset['games']:
    for pos in game['positions']:
        if 'bestMove' in pos:
            X.append(encode_position(pos))
            y_policy.append(encode_move(pos['bestMove']))
            y_value.append(torch.tanh(torch.tensor(pos['evaluation'] / 1000.0)))

# Create DataLoader
from torch.utils.data import TensorDataset, DataLoader

train_dataset = TensorDataset(
    torch.stack(X),
    torch.stack(y_policy),
    torch.stack(y_value)
)
train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True)

# Training loop
model = BaghChalNet()
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
policy_loss_fn = nn.CrossEntropyLoss()
value_loss_fn = nn.MSELoss()

for epoch in range(100):
    for batch_x, batch_policy, batch_value in train_loader:
        optimizer.zero_grad()
        
        pred_policy, pred_value = model(batch_x)
        
        loss_p = policy_loss_fn(pred_policy, batch_policy)
        loss_v = value_loss_fn(pred_value.squeeze(), batch_value)
        
        loss = loss_p + 0.5 * loss_v  # Combined loss
        loss.backward()
        optimizer.step()
    
    print(f'Epoch {epoch+1}: Policy Loss = {loss_p.item():.4f}, Value Loss = {loss_v.item():.4f}')
```

## Dataset Statistics

### Expected Win Rates
With properly tuned HARD AI:
- **Tiger Win Rate**: 55-65% (tigers have slight advantage)
- **Goat Win Rate**: 30-40%
- **Draws**: 5-10% (max moves reached)

### Average Game Length
- **Placement Phase**: 20 moves (fixed)
- **Movement Phase**: 30-50 moves
- **Total**: 50-70 moves per game

### Capture Distribution
```
0 captures: 5%   (goat domination)
1 capture:  10%
2 captures: 15%
3 captures: 20%
4 captures: 25%
5 captures: 25%  (tiger victory)
```

## Best Practices

### 1. Data Quality
- Generate at least **100 games** for meaningful patterns
- **500+ games** recommended for production training
- Use HARD difficulty only (2000 simulations per move)

### 2. Data Augmentation
- **Board Rotations**: 4 rotations (90°, 180°, 270°)
- **Board Reflections**: Horizontal, vertical, diagonal
- Total: 8× data augmentation possible

### 3. Training Strategy
- **Supervised Learning**: Train on expert games first
- **Reinforcement Learning**: Fine-tune with self-play
- **Curriculum Learning**: Start with endgames, then full games

### 4. Validation
- Split dataset: 80% train, 10% validation, 10% test
- Test on games from different generation runs
- Monitor both policy accuracy and value prediction error

## API Reference

### DatasetGenerator Class

```javascript
const generator = new DatasetGenerator();

// Generate N games
const dataset = await generator.generateDataset(
  numGames,      // Number of games to play
  onProgress     // Callback: (current, total, gameRecord) => void
);

// Get training examples
const examples = generator.generateTrainingExamples();

// Export to JSON
const json = generator.exportToJSON();

// Download as file
generator.downloadDataset('filename.json');
```

### Position Analysis Methods

```javascript
// Available in captured positions:
position.board           // 25-element array
position.currentPlayer   // "tiger" or "goat"
position.phase           // "placement" or "movement"
position.gamePhase       // "early", "mid", or "late"
position.evaluation      // Numerical score
position.legalMoves      // Array of all legal moves
position.bestMove        // AI's chosen move
position.resultingEval   // Evaluation after move
```

## Performance Characteristics

### Generation Speed
- **Easy (2-ply)**: ~5 games/second
- **Medium (4-ply)**: ~2 games/second
- **Hard (2000 MCTS)**: ~0.5 games/second

### Recommended Settings
- **Quick Test**: 10-50 games (~2 minutes)
- **Development**: 100-200 games (~7 minutes)
- **Production**: 500-1000 games (~30-60 minutes)

## Integration with AlphaZero

To implement full AlphaZero:

1. **Generate initial dataset** (500+ games)
2. **Train neural network** on positions
3. **Replace MCTS heuristics** with neural network predictions
4. **Self-play iteration**: Generate new games with improved network
5. **Iterative training**: Repeat steps 2-4

The current system provides the **foundation** for AlphaZero training by generating high-quality labeled positions from strong AI play.

## Troubleshooting

### Low Tiger Win Rate (<50%)
- AI may be too defensive as goats
- Increase MCTS simulations for better play
- Check if material evaluation is balanced

### Games Too Short (<40 moves)
- Tigers winning too quickly
- Strengthen goat defensive patterns
- Increase goat chain formation rewards

### Games Too Long (>100 moves)
- Neither side making progress
- Add endgame heuristics
- Increase material value scaling

## License
MIT - Free to use for research and commercial applications
