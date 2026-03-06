// Bagh Chal Game Logic
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Load images
const images = {
  goat: new Image(),
  tigers: [
    new Image(),
    new Image(),
    new Image(),
    new Image()
  ]
};

images.goat.src = '/assets/Ghanti.png';
images.tigers[0].src = '/assets/Congress.png';
images.tigers[1].src = '/assets/Maoist.png';
images.tigers[2].src = '/assets/RRP.png';
images.tigers[3].src = '/assets/Surya.png';

let imagesLoaded = 0;
const totalImages = 5;

function imageLoaded() {
  imagesLoaded++;
  if (imagesLoaded === totalImages) {
    draw();
  }
}

images.goat.onload = imageLoaded;
images.tigers.forEach(img => img.onload = imageLoaded);

// Game Constants
const GRID_SIZE = 5;
const PIECE_TYPES = {
  EMPTY: 0,
  TIGER: 1,
  GOAT: 2
};

const PHASE = {
  PLACEMENT: 'placement',
  MOVEMENT: 'movement'
};

// Track which tiger image to use for each position
const tigerImages = [0, 1, 2, 3]; // Maps tiger index to image index

// Player settings
let playerSide = null; // Will be PIECE_TYPES.GOAT or PIECE_TYPES.TIGER
let gameStarted = false;
let isFirstAIMove = true;

// Game State
let gameState = {
  board: Array(25).fill(PIECE_TYPES.EMPTY),
  currentPlayer: PIECE_TYPES.GOAT,
  phase: PHASE.PLACEMENT,
  goatsPlaced: 0,
  goatsCaptured: 0,
  selectedPiece: null,
  validMoves: [],
  gameOver: false
};

// Board positions (x, y coordinates for 5x5 grid)
const positions = [];
for (let row = 0; row < GRID_SIZE; row++) {
  for (let col = 0; col < GRID_SIZE; col++) {
    positions.push({ row, col });
  }
}

// Initialize game
function initGame() {
  // Reset state
  gameState = {
    board: Array(25).fill(PIECE_TYPES.EMPTY),
    currentPlayer: PIECE_TYPES.GOAT,
    phase: PHASE.PLACEMENT,
    goatsPlaced: 0,
    goatsCaptured: 0,
    selectedPiece: null,
    validMoves: [],
    gameOver: false
  };

  // Place tigers at corners
  gameState.board[0] = PIECE_TYPES.TIGER;  // Top-left
  gameState.board[4] = PIECE_TYPES.TIGER;  // Top-right
  gameState.board[20] = PIECE_TYPES.TIGER; // Bottom-left
  gameState.board[24] = PIECE_TYPES.TIGER; // Bottom-right

  updateUI();
  draw();
  
  // If player is tiger, goats go first (AI)
  if (gameStarted && playerSide === PIECE_TYPES.TIGER) {
    setTimeout(() => aiMove(), getAIThinkingTime());
  }
}

// Get randomized AI thinking time (0-0.5 seconds, first move instant)
function getAIThinkingTime() {
  if (isFirstAIMove) {
    isFirstAIMove = false;
    return 0;
  }
  return Math.random() * 500;
}

// Show AI thinking indicator
function showAIThinking() {
  document.getElementById('ai-thinking').classList.add('show');
}

// Hide AI thinking indicator
function hideAIThinking() {
  document.getElementById('ai-thinking').classList.remove('show');
}

// Get adjacent positions
function getAdjacent(index) {
  const { row, col } = positions[index];
  const adjacent = [];

  // Horizontal and vertical
  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1]
  ];

  // Diagonals (only for certain positions)
  const diagonals = [
    [-1, -1], [-1, 1], [1, -1], [1, 1]
  ];

  // Check regular directions
  for (const [dr, dc] of directions) {
    const newRow = row + dr;
    const newCol = col + dc;
    if (newRow >= 0 && newRow < GRID_SIZE && newCol >= 0 && newCol < GRID_SIZE) {
      adjacent.push(newRow * GRID_SIZE + newCol);
    }
  }

  // Check diagonals (valid for corners, center, and mid-edges)
  const isDiagonal = (row === col) || (row + col === GRID_SIZE - 1) || 
                      (row === 2 || col === 2);
  
  if (isDiagonal) {
    for (const [dr, dc] of diagonals) {
      const newRow = row + dr;
      const newCol = col + dc;
      if (newRow >= 0 && newRow < GRID_SIZE && newCol >= 0 && newCol < GRID_SIZE) {
        // Check if diagonal connection exists on the board
        if ((newRow === newCol) || (newRow + newCol === GRID_SIZE - 1) || 
            (row === 2 && newRow === 2) || (col === 2 && newCol === 2)) {
          adjacent.push(newRow * GRID_SIZE + newCol);
        }
      }
    }
  }

  return adjacent;
}

// Get valid moves for a piece
function getValidMoves(index) {
  const piece = gameState.board[index];
  const moves = [];

  if (piece === PIECE_TYPES.GOAT) {
    // Goats can only move to adjacent empty spots
    const adjacent = getAdjacent(index);
    for (const adj of adjacent) {
      if (gameState.board[adj] === PIECE_TYPES.EMPTY) {
        moves.push({ to: adj, capture: null });
      }
    }
  } else if (piece === PIECE_TYPES.TIGER) {
    // Tigers can move or capture
    const adjacent = getAdjacent(index);
    for (const adj of adjacent) {
      if (gameState.board[adj] === PIECE_TYPES.EMPTY) {
        // Regular move
        moves.push({ to: adj, capture: null });
      } else if (gameState.board[adj] === PIECE_TYPES.GOAT) {
        // Check if can capture (jump over goat)
        const { row: r1, col: c1 } = positions[index];
        const { row: r2, col: c2 } = positions[adj];
        const dr = r2 - r1;
        const dc = c2 - c1;
        const jumpRow = r2 + dr;
        const jumpCol = c2 + dc;
        
        if (jumpRow >= 0 && jumpRow < GRID_SIZE && jumpCol >= 0 && jumpCol < GRID_SIZE) {
          const jumpIndex = jumpRow * GRID_SIZE + jumpCol;
          if (gameState.board[jumpIndex] === PIECE_TYPES.EMPTY) {
            moves.push({ to: jumpIndex, capture: adj });
          }
        }
      }
    }
  }

  return moves;
}

// Check if tigers are trapped
function areTigersTrapped() {
  for (let i = 0; i < 25; i++) {
    if (gameState.board[i] === PIECE_TYPES.TIGER) {
      const moves = getValidMoves(i);
      if (moves.length > 0) {
        return false;
      }
    }
  }
  return true;
}

// Check win conditions
function checkWin() {
  // Tigers win by capturing 5 goats
  if (gameState.goatsCaptured >= 5) {
    endGame('Tigers Win!', 'tiger');
    return true;
  }

  // Goats win by trapping all tigers (only in movement phase)
  if (gameState.phase === PHASE.MOVEMENT && areTigersTrapped()) {
    endGame('Goats Win!', 'goat');
    return true;
  }

  return false;
}

// Handle board click
function handleClick(event) {
  if (gameState.gameOver || !gameStarted) return;
  
  // Don't allow clicks if it's not player's turn
  if (gameState.currentPlayer !== playerSide) return;

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  // Convert click to board position
  const clickedIndex = getClickedPosition(x, y);
  
  if (clickedIndex === -1) return;

  if (gameState.phase === PHASE.PLACEMENT) {
    // Placement phase - place goat or move tiger
    if (gameState.currentPlayer === PIECE_TYPES.GOAT && playerSide === PIECE_TYPES.GOAT) {
      if (gameState.board[clickedIndex] === PIECE_TYPES.EMPTY) {
        gameState.board[clickedIndex] = PIECE_TYPES.GOAT;
        gameState.goatsPlaced++;
        
        if (gameState.goatsPlaced === 20) {
          gameState.phase = PHASE.MOVEMENT;
        }
        
        gameState.currentPlayer = PIECE_TYPES.TIGER;
        
        if (!checkWin()) {
          setTimeout(aiMove, getAIThinkingTime());
        }
      }
    } else if (gameState.currentPlayer === PIECE_TYPES.TIGER && playerSide === PIECE_TYPES.TIGER) {
      // Tiger's turn in placement phase
      if (gameState.board[clickedIndex] === PIECE_TYPES.TIGER) {
        // Select tiger
        gameState.selectedPiece = clickedIndex;
        gameState.validMoves = getValidMoves(clickedIndex);
      } else if (gameState.selectedPiece !== null) {
        // Try to move or capture
        const move = gameState.validMoves.find(m => m.to === clickedIndex);
        if (move) {
          gameState.board[move.to] = PIECE_TYPES.TIGER;
          gameState.board[gameState.selectedPiece] = PIECE_TYPES.EMPTY;
          
          if (move.capture !== null) {
            gameState.board[move.capture] = PIECE_TYPES.EMPTY;
            gameState.goatsCaptured++;
          }
          
          gameState.selectedPiece = null;
          gameState.validMoves = [];
          gameState.currentPlayer = PIECE_TYPES.GOAT;
          
          if (!checkWin()) {
            setTimeout(aiMove, getAIThinkingTime());
          }
        } else if (gameState.board[clickedIndex] === PIECE_TYPES.TIGER) {
          // Select different tiger
          gameState.selectedPiece = clickedIndex;
          gameState.validMoves = getValidMoves(clickedIndex);
        } else {
          // Deselect
          gameState.selectedPiece = null;
          gameState.validMoves = [];
        }
      }
    }
  } else {
    // Movement phase
    if (gameState.currentPlayer === PIECE_TYPES.GOAT && playerSide === PIECE_TYPES.GOAT) {
      if (gameState.selectedPiece === null) {
        // Select a goat
        if (gameState.board[clickedIndex] === PIECE_TYPES.GOAT) {
          gameState.selectedPiece = clickedIndex;
          gameState.validMoves = getValidMoves(clickedIndex);
        }
      } else {
        // Try to move selected goat
        const move = gameState.validMoves.find(m => m.to === clickedIndex);
        if (move) {
          gameState.board[move.to] = PIECE_TYPES.GOAT;
          gameState.board[gameState.selectedPiece] = PIECE_TYPES.EMPTY;
          gameState.selectedPiece = null;
          gameState.validMoves = [];
          gameState.currentPlayer = PIECE_TYPES.TIGER;
          
          if (!checkWin()) {
            setTimeout(aiMove, getAIThinkingTime());
          }
        } else if (gameState.board[clickedIndex] === PIECE_TYPES.GOAT) {
          // Select different goat
          gameState.selectedPiece = clickedIndex;
          gameState.validMoves = getValidMoves(clickedIndex);
        } else {
          // Deselect
          gameState.selectedPiece = null;
          gameState.validMoves = [];
        }
      }
    } else if (gameState.currentPlayer === PIECE_TYPES.TIGER && playerSide === PIECE_TYPES.TIGER) {
      // Tiger's turn in movement phase
      if (gameState.selectedPiece === null) {
        // Select a tiger
        if (gameState.board[clickedIndex] === PIECE_TYPES.TIGER) {
          gameState.selectedPiece = clickedIndex;
          gameState.validMoves = getValidMoves(clickedIndex);
        }
      } else {
        // Try to move or capture
        const move = gameState.validMoves.find(m => m.to === clickedIndex);
        if (move) {
          gameState.board[move.to] = PIECE_TYPES.TIGER;
          gameState.board[gameState.selectedPiece] = PIECE_TYPES.EMPTY;
          
          if (move.capture !== null) {
            gameState.board[move.capture] = PIECE_TYPES.EMPTY;
            gameState.goatsCaptured++;
          }
          
          gameState.selectedPiece = null;
          gameState.validMoves = [];
          gameState.currentPlayer = PIECE_TYPES.GOAT;
          
          if (!checkWin()) {
            setTimeout(aiMove, getAIThinkingTime());
          }
        } else if (gameState.board[clickedIndex] === PIECE_TYPES.TIGER) {
          // Select different tiger
          gameState.selectedPiece = clickedIndex;
          gameState.validMoves = getValidMoves(clickedIndex);
        } else {
          // Deselect
          gameState.selectedPiece = null;
          gameState.validMoves = [];
        }
      }
    }
  }

  updateUI();
  draw();
}

// Simple AI for tiger or goat
function aiMove() {
  const aiSide = playerSide === PIECE_TYPES.GOAT ? PIECE_TYPES.TIGER : PIECE_TYPES.GOAT;
  
  if (gameState.currentPlayer !== aiSide || gameState.gameOver || !gameStarted) return;

  const delay = getAIThinkingTime();
  
  setTimeout(() => {
    executeAIMove();
  }, delay);
}

function executeAIMove() {
  const aiSide = playerSide === PIECE_TYPES.GOAT ? PIECE_TYPES.TIGER : PIECE_TYPES.GOAT;
  
  if (aiSide === PIECE_TYPES.TIGER) {
    executeAITigerMove();
  } else {
    executeAIGoatMove();
  }
}

// AI for tiger moves
function executeAITigerMove() {
  if (gameState.gameOver) return;

  const tigers = [];
  for (let i = 0; i < 25; i++) {
    if (gameState.board[i] === PIECE_TYPES.TIGER) {
      const moves = getValidMoves(i);
      if (moves.length > 0) {
        tigers.push({ index: i, moves });
      }
    }
  }

  if (tigers.length === 0) {
    checkWin();
    return;
  }

  // Prioritize captures
  for (const tiger of tigers) {
    const captureMoves = tiger.moves.filter(m => m.capture !== null);
    if (captureMoves.length > 0) {
      const move = captureMoves[0];
      gameState.board[move.to] = PIECE_TYPES.TIGER;
      gameState.board[tiger.index] = PIECE_TYPES.EMPTY;
      gameState.board[move.capture] = PIECE_TYPES.EMPTY;
      gameState.goatsCaptured++;
      gameState.currentPlayer = PIECE_TYPES.GOAT;
      
      updateUI();
      draw();
      checkWin();
      return;
    }
  }

  // Otherwise, make a random move
  const randomTiger = tigers[Math.floor(Math.random() * tigers.length)];
  const randomMove = randomTiger.moves[Math.floor(Math.random() * randomTiger.moves.length)];
  
  gameState.board[randomMove.to] = PIECE_TYPES.TIGER;
  gameState.board[randomTiger.index] = PIECE_TYPES.EMPTY;
  gameState.currentPlayer = PIECE_TYPES.GOAT;

  updateUI();
  draw();
  checkWin();
}

// AI for goat moves
function executeAIGoatMove() {
  if (gameState.gameOver) return;
  
  if (gameState.phase === PHASE.PLACEMENT) {
    // Place goat on random empty spot
    const emptySpots = [];
    for (let i = 0; i < 25; i++) {
      if (gameState.board[i] === PIECE_TYPES.EMPTY) {
        emptySpots.push(i);
      }
    }
    
    if (emptySpots.length > 0) {
      const randomSpot = emptySpots[Math.floor(Math.random() * emptySpots.length)];
      gameState.board[randomSpot] = PIECE_TYPES.GOAT;
      gameState.goatsPlaced++;
      
      if (gameState.goatsPlaced === 20) {
        gameState.phase = PHASE.MOVEMENT;
      }
      
      gameState.currentPlayer = PIECE_TYPES.TIGER;
    }
  } else {
    // Movement phase - move a random goat
    const goats = [];
    for (let i = 0; i < 25; i++) {
      if (gameState.board[i] === PIECE_TYPES.GOAT) {
        const moves = getValidMoves(i);
        if (moves.length > 0) {
          goats.push({ index: i, moves });
        }
      }
    }
    
    if (goats.length > 0) {
      const randomGoat = goats[Math.floor(Math.random() * goats.length)];
      const randomMove = randomGoat.moves[Math.floor(Math.random() * randomGoat.moves.length)];
      
      gameState.board[randomMove.to] = PIECE_TYPES.GOAT;
      gameState.board[randomGoat.index] = PIECE_TYPES.EMPTY;
      gameState.currentPlayer = PIECE_TYPES.TIGER;
    }
  }
  
  updateUI();
  draw();
  checkWin();
}

// Get tiger image index based on position
function getTigerImageIndex(position) {
  // Map corner positions to tiger images
  const cornerMap = {
    0: 0,   // Top-left -> Congress
    4: 1,   // Top-right -> Maoist
    20: 2,  // Bottom-left -> RRP
    24: 3   // Bottom-right -> Surya
  };
  
  // For initial positions
  if (cornerMap[position] !== undefined) {
    return cornerMap[position];
  }
  
  // Find which tiger is at this position
  let tigerCount = 0;
  for (let i = 0; i < 25; i++) {
    if (gameState.board[i] === PIECE_TYPES.TIGER) {
      if (i === position) {
        return tigerCount % 4;
      }
      tigerCount++;
    }
  }
  
  return 0;
}

// Get clicked position
function getClickedPosition(x, y) {
  const size = Math.min(canvas.width, canvas.height);
  const padding = size * 0.1;
  const cellSize = (size - 2 * padding) / (GRID_SIZE - 1);

  for (let i = 0; i < 25; i++) {
    const { row, col } = positions[i];
    const px = padding + col * cellSize;
    const py = padding + row * cellSize;
    const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
    
    if (distance < cellSize * 0.3) {
      return i;
    }
  }

  return -1;
}

// Drawing functions
function draw() {
  const size = Math.min(canvas.width, canvas.height);
  canvas.width = size;
  canvas.height = size;

  ctx.clearRect(0, 0, size, size);

  const padding = size * 0.1;
  const cellSize = (size - 2 * padding) / (GRID_SIZE - 1);

  // Draw board lines
  ctx.strokeStyle = '#4a5568';
  ctx.lineWidth = 2;

  // Horizontal and vertical lines
  for (let i = 0; i < GRID_SIZE; i++) {
    // Horizontal
    ctx.beginPath();
    ctx.moveTo(padding, padding + i * cellSize);
    ctx.lineTo(padding + (GRID_SIZE - 1) * cellSize, padding + i * cellSize);
    ctx.stroke();

    // Vertical
    ctx.beginPath();
    ctx.moveTo(padding + i * cellSize, padding);
    ctx.lineTo(padding + i * cellSize, padding + (GRID_SIZE - 1) * cellSize);
    ctx.stroke();
  }

  // Draw diagonals
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding + 4 * cellSize, padding + 4 * cellSize);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(padding + 4 * cellSize, padding);
  ctx.lineTo(padding, padding + 4 * cellSize);
  ctx.stroke();

  // Cross through center
  ctx.beginPath();
  ctx.moveTo(padding + 2 * cellSize, padding);
  ctx.lineTo(padding + 2 * cellSize, padding + 4 * cellSize);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(padding, padding + 2 * cellSize);
  ctx.lineTo(padding + 4 * cellSize, padding + 2 * cellSize);
  ctx.stroke();

  // Draw valid move indicators
  if (gameState.validMoves.length > 0) {
    ctx.fillStyle = 'rgba(78, 205, 196, 0.3)';
    for (const move of gameState.validMoves) {
      const { row, col } = positions[move.to];
      const x = padding + col * cellSize;
      const y = padding + row * cellSize;
      
      ctx.beginPath();
      ctx.arc(x, y, cellSize * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw pieces
  for (let i = 0; i < 25; i++) {
    const { row, col } = positions[i];
    const x = padding + col * cellSize;
    const y = padding + row * cellSize;
    const piece = gameState.board[i];

    if (piece === PIECE_TYPES.TIGER) {
      // Draw white circular chip
      const isCurrentTurn = gameState.currentPlayer === PIECE_TYPES.TIGER;
      const pulseOffset = isCurrentTurn ? Math.sin(Date.now() / 300) * 0.05 : 0;
      const chipRadius = cellSize * (0.4 + pulseOffset);
      
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = isCurrentTurn ? '#FF6B35' : '#2d3748';
      ctx.lineWidth = isCurrentTurn ? 4 : 3;
      ctx.beginPath();
      ctx.arc(x, y, chipRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Draw tiger image on top
      const tigerIndex = getTigerImageIndex(i);
      const img = images.tigers[tigerIndex];
      const imgSize = cellSize * 0.72;
      
      if (img.complete) {
        ctx.drawImage(img, x - imgSize / 2, y - imgSize / 2, imgSize, imgSize);
      }
    } else if (piece === PIECE_TYPES.GOAT) {
      const isSelected = gameState.selectedPiece === i;
      const isCurrentTurn = gameState.currentPlayer === PIECE_TYPES.GOAT;
      const pulseOffset = isCurrentTurn ? Math.sin(Date.now() / 300) * 0.05 : 0;
      const chipRadius = cellSize * (0.4 + pulseOffset);
      
      // Draw white circular chip
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = isSelected ? '#4ECDC4' : (isCurrentTurn ? '#4ECDC4' : '#2d3748');
      ctx.lineWidth = isSelected ? 5 : (isCurrentTurn ? 4 : 3);
      ctx.beginPath();
      ctx.arc(x, y, chipRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Draw goat image on top
      const imgSize = cellSize * 0.72;
      
      if (images.goat.complete) {
        ctx.drawImage(images.goat, x - imgSize / 2, y - imgSize / 2, imgSize, imgSize);
      }
    }
  }
  
  // Request animation frame for smooth blinking
  if (!gameState.gameOver) {
    requestAnimationFrame(draw);
  }
}

// Update UI
function updateUI() {
  document.getElementById('tiger-captures').textContent = gameState.goatsCaptured;
  document.getElementById('goats-remaining').textContent = 20 - gameState.goatsPlaced;

  const turnIndicator = document.getElementById('turn-indicator');
  const turnIcon = document.getElementById('turn-icon');
  const turnText = document.getElementById('turn-text');
  const phaseText = turnIndicator.querySelector('.phase-text');

  // Remove existing blink classes
  document.querySelectorAll('.blink-piece').forEach(el => el.classList.remove('blink-piece'));
  
  if (gameState.currentPlayer === PIECE_TYPES.TIGER) {
    // Update turn indicator for tigers
    turnIcon.innerHTML = `
      <img src="/assets/Congress.png" class="turn-logo mini-logo">
      <img src="/assets/Maoist.png" class="turn-logo mini-logo">
      <img src="/assets/RRP.png" class="turn-logo mini-logo">
      <img src="/assets/Surya.png" class="turn-logo mini-logo">
    `;
    turnText.textContent = 'Tigers';
    turnIndicator.style.borderColor = '#FF6B35';
  } else {
    // Update turn indicator for goats
    turnIcon.innerHTML = '<img src="/assets/Ghanti.png" alt="Goat" class="turn-logo">';
    turnText.textContent = 'Goats';
    turnIndicator.style.borderColor = '#4ECDC4';
  }

  phaseText.textContent = gameState.phase === PHASE.PLACEMENT ? 
    'Placement Phase' : 'Movement Phase';
}

// End game
function endGame(message, winner) {
  gameState.gameOver = true;
  
  const overlay = document.getElementById('winner-overlay');
  const winnerIcon = document.getElementById('winner-icon');
  const winnerText = document.getElementById('winner-text');

  // Display logos based on winner
  if (winner === 'tiger') {
    winnerIcon.innerHTML = `
      <div class="winner-logos">
        <img src="/assets/Congress.png" class="winner-logo">
        <img src="/assets/Maoist.png" class="winner-logo">
        <img src="/assets/RRP.png" class="winner-logo">
        <img src="/assets/Surya.png" class="winner-logo">
      </div>
    `;
  } else {
    winnerIcon.innerHTML = '<img src="/assets/Ghanti.png" class="winner-logo-single">';
  }
  
  winnerText.textContent = message;
  overlay.classList.add('show');
}

// Reset game
function resetGame() {
  showPlayerSelect();
}

// Event listeners
canvas.addEventListener('click', handleClick);
document.getElementById('reset-btn').addEventListener('click', showPlayerSelect);
document.getElementById('play-again-btn').addEventListener('click', showPlayerSelect);

// Start game button
document.getElementById('start-game-btn').addEventListener('click', () => {
  document.getElementById('start-overlay').classList.remove('show');
  document.getElementById('player-select-overlay').classList.add('show');
});

// Player selection
document.getElementById('select-goat').addEventListener('click', () => {
  playerSide = PIECE_TYPES.GOAT;
  gameStarted = true;
  isFirstAIMove = true;
  document.getElementById('player-select-overlay').classList.remove('show');
  initGame();
});

document.getElementById('select-tiger').addEventListener('click', () => {
  playerSide = PIECE_TYPES.TIGER;
  gameStarted = true;
  isFirstAIMove = true;
  document.getElementById('player-select-overlay').classList.remove('show');
  initGame();
});

function showPlayerSelect() {
  gameStarted = false;
  document.getElementById('winner-overlay').classList.remove('show');
  document.getElementById('player-select-overlay').classList.add('show');
}

// Resize canvas
function resizeCanvas() {
  const container = document.querySelector('.board-container');
  const size = Math.min(container.clientWidth - 80, 600);
  canvas.width = size;
  canvas.height = size;
  draw();
}

window.addEventListener('resize', resizeCanvas);

// Initialize
initGame();
resizeCanvas();
