// Bagh Chal Game Logic
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Set canvas size
canvas.width = 600;
canvas.height = 600;

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

images.goat.src = 'assets/Ghanti.png';
images.tigers[0].src = 'assets/Congress.png';
images.tigers[1].src = 'assets/Maoist.png';
images.tigers[2].src = 'assets/RRP.png';
images.tigers[3].src = 'assets/Surya.png';

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

// Audio system
const soundUrls = {
  newGame:      '/music/newgamestart.mp3',
  pieceMove:    '/music/Piece-Move.mp3',
  tigerCapture: '/music/tiger-points.mp3',
  winning:      '/music/winning-sound.mp3'
};

function playSound(name) {
  const url = soundUrls[name];
  if (url) {
    const snd = new Audio(url);
    snd.play().catch(() => {});
  }
}

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

// History for viewing previous move
let gameHistory = [];
let isViewingPrevious = false;
let currentGameState = null;

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
    gameOver: false,
    tigerIdentities: {} // Track which tiger logo is at which position
  };

  // Clear history
  gameHistory = [];
  isViewingPrevious = false;
  currentGameState = null;
  updateViewPrevButton();

  // Place tigers at corners with their identities
  gameState.board[0] = PIECE_TYPES.TIGER;  // Top-left - Congress
  gameState.tigerIdentities[0] = 0;
  gameState.board[4] = PIECE_TYPES.TIGER;  // Top-right - Maoist
  gameState.tigerIdentities[4] = 1;
  gameState.board[20] = PIECE_TYPES.TIGER; // Bottom-left - RRP
  gameState.tigerIdentities[20] = 2;
  gameState.board[24] = PIECE_TYPES.TIGER; // Bottom-right - Surya
  gameState.tigerIdentities[24] = 3;

  if (gameStarted) {
    playSound('newGame');
  }

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

  // Diagonals
  const diagonals = [
    [-1, -1], [-1, 1], [1, -1], [1, 1]
  ];

  // Check regular directions (always valid)
  for (const [dr, dc] of directions) {
    const newRow = row + dr;
    const newCol = col + dc;
    if (newRow >= 0 && newRow < GRID_SIZE && newCol >= 0 && newCol < GRID_SIZE) {
      adjacent.push(newRow * GRID_SIZE + newCol);
    }
  }

  // Check diagonals - check if diagonal line exists between two points
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

// Check if two positions are connected by a diagonal line on the board
function isDiagonalConnected(r1, c1, r2, c2) {
  // Must be diagonal move (both row and col change by 1)
  if (Math.abs(r1 - r2) !== 1 || Math.abs(c1 - c2) !== 1) {
    return false;
  }

  // Main diagonal (top-left to bottom-right): row === col
  // Valid positions: (0,0)-(1,1)-(2,2)-(3,3)-(4,4)
  if (r1 === c1 && r2 === c2) {
    return true;
  }

  // Anti-diagonal (top-right to bottom-left): row + col === 4
  // Valid positions: (0,4)-(1,3)-(2,2)-(3,1)-(4,0)
  if (r1 + c1 === 4 && r2 + c2 === 4) {
    return true;
  }

  // Inner diamond diagonals connecting edge midpoints
  // The diamond connects: (0,2) ↔ (2,4) ↔ (4,2) ↔ (2,0) ↔ (0,2)
  
  // Define the edge midpoints
  const topMid = [0, 2];
  const rightMid = [2, 4];
  const bottomMid = [4, 2];
  const leftMid = [2, 0];
  
  // Helper to check if point matches coordinates
  const pointMatches = (r, c, point) => r === point[0] && c === point[1];
  
  // Check all diamond connections
  // Top-center (0,2) to Right-center (2,4): moves through (1,3)
  if ((pointMatches(r1, c1, [1, 3]) && pointMatches(r2, c2, topMid)) ||
      (pointMatches(r1, c1, topMid) && pointMatches(r2, c2, [1, 3])) ||
      (pointMatches(r1, c1, [1, 3]) && pointMatches(r2, c2, rightMid)) ||
      (pointMatches(r1, c1, rightMid) && pointMatches(r2, c2, [1, 3]))) {
    return true;
  }
  
  // Right-center (2,4) to Bottom-center (4,2): moves through (3,3)
  if ((pointMatches(r1, c1, [3, 3]) && pointMatches(r2, c2, rightMid)) ||
      (pointMatches(r1, c1, rightMid) && pointMatches(r2, c2, [3, 3])) ||
      (pointMatches(r1, c1, [3, 3]) && pointMatches(r2, c2, bottomMid)) ||
      (pointMatches(r1, c1, bottomMid) && pointMatches(r2, c2, [3, 3]))) {
    return true;
  }
  
  // Bottom-center (4,2) to Left-center (2,0): moves through (3,1)
  if ((pointMatches(r1, c1, [3, 1]) && pointMatches(r2, c2, bottomMid)) ||
      (pointMatches(r1, c1, bottomMid) && pointMatches(r2, c2, [3, 1])) ||
      (pointMatches(r1, c1, [3, 1]) && pointMatches(r2, c2, leftMid)) ||
      (pointMatches(r1, c1, leftMid) && pointMatches(r2, c2, [3, 1]))) {
    return true;
  }
  
  // Left-center (2,0) to Top-center (0,2): moves through (1,1)
  if ((pointMatches(r1, c1, [1, 1]) && pointMatches(r2, c2, leftMid)) ||
      (pointMatches(r1, c1, leftMid) && pointMatches(r2, c2, [1, 1])) ||
      (pointMatches(r1, c1, [1, 1]) && pointMatches(r2, c2, topMid)) ||
      (pointMatches(r1, c1, topMid) && pointMatches(r2, c2, [1, 1]))) {
    return true;
  }

  return false;
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
        // Regular move - only to directly adjacent empty position
        moves.push({ to: adj, capture: null });
      } else if (gameState.board[adj] === PIECE_TYPES.GOAT) {
        // Check if can capture (jump over goat)
        const { row: r1, col: c1 } = positions[index];
        const { row: r2, col: c2 } = positions[adj];
        const dr = r2 - r1;
        const dc = c2 - c1;
        const jumpRow = r2 + dr;
        const jumpCol = c2 + dc;
        
        // Validate jump position is within board
        if (jumpRow >= 0 && jumpRow < GRID_SIZE && jumpCol >= 0 && jumpCol < GRID_SIZE) {
          const jumpIndex = jumpRow * GRID_SIZE + jumpCol;
          
          // Must land on empty space
          if (gameState.board[jumpIndex] === PIECE_TYPES.EMPTY) {
            // Verify the jump follows a valid line on the board
            // The jump destination must be adjacent to the goat in the same direction
            const jumpAdjacent = getAdjacent(adj);
            if (jumpAdjacent.includes(jumpIndex)) {
              // Additional check: the tiger must be able to reach the goat position
              // This prevents invalid diagonal jumps
              moves.push({ to: jumpIndex, capture: adj });
            }
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

// Count how many tigers are trapped (have no valid moves)
function countTrappedTigers() {
  let trappedCount = 0;
  for (let i = 0; i < 25; i++) {
    if (gameState.board[i] === PIECE_TYPES.TIGER) {
      const moves = getValidMoves(i);
      if (moves.length === 0) {
        trappedCount++;
      }
    }
  }
  return trappedCount;
}

// Check if goats are trapped (rare case)
function areGoatsTrapped() {
  for (let i = 0; i < 25; i++) {
    if (gameState.board[i] === PIECE_TYPES.GOAT) {
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
    endGame('Opposition Wins!', 'tiger');
    return true;
  }

  // Goats win by trapping all tigers (only in movement phase)
  if (gameState.phase === PHASE.MOVEMENT && areTigersTrapped()) {
    endGame('Governing Parties Win!', 'goat');
    return true;
  }

  // Tigers win by trapping all goats (rare case, only in movement phase)
  if (gameState.phase === PHASE.MOVEMENT && gameState.goatsPlaced === 20 && areGoatsTrapped()) {
    endGame('Opposition Wins!', 'tiger');
    return true;
  }

  return false;
}

// Handle board click
function handleClick(event) {
  if (gameState.gameOver || !gameStarted || isViewingPrevious) return;
  
  // Don't allow clicks if it's not player's turn
  if (gameState.currentPlayer !== playerSide) {
    console.log('Not your turn. Current:', gameState.currentPlayer, 'Your side:', playerSide);
    return;
  }

  const rect = canvas.getBoundingClientRect();
  // Scale click coordinates from displayed size to canvas size
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  console.log('Click at:', x, y, 'Canvas size:', canvas.width, canvas.height, 'Display size:', rect.width, rect.height);

  // Convert click to board position
  const clickedIndex = getClickedPosition(x, y);
  
  console.log('Clicked index:', clickedIndex, 'Piece at index:', gameState.board[clickedIndex]);
  
  if (clickedIndex === -1) return;

  if (gameState.phase === PHASE.PLACEMENT) {
    // Placement phase - place goat or move tiger
    if (gameState.currentPlayer === PIECE_TYPES.GOAT && playerSide === PIECE_TYPES.GOAT) {
      if (gameState.board[clickedIndex] === PIECE_TYPES.EMPTY) {
        saveState(); // Save state before move
        gameState.board[clickedIndex] = PIECE_TYPES.GOAT;
        gameState.goatsPlaced++;
        playSound('pieceMove');
        
        if (gameState.goatsPlaced === 20) {
          gameState.phase = PHASE.MOVEMENT;
        }
        
        gameState.currentPlayer = PIECE_TYPES.TIGER;
        updateUI();
        
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
        draw();
      } else if (gameState.selectedPiece !== null) {
        // Try to move or capture
        const move = gameState.validMoves.find(m => m.to === clickedIndex);
        if (move) {
          saveState(); // Save state before move
          // Transfer tiger identity when moving
          const tigerIdentity = gameState.tigerIdentities[gameState.selectedPiece];
          gameState.board[move.to] = PIECE_TYPES.TIGER;
          gameState.tigerIdentities[move.to] = tigerIdentity;
          
          gameState.board[gameState.selectedPiece] = PIECE_TYPES.EMPTY;
          delete gameState.tigerIdentities[gameState.selectedPiece];
          
          playSound('pieceMove');
          if (move.capture !== null) {
            gameState.board[move.capture] = PIECE_TYPES.EMPTY;
            gameState.goatsCaptured++;
            playSound('tigerCapture');
            updateUI();
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
          saveState(); // Save state before move
          gameState.board[move.to] = PIECE_TYPES.GOAT;
          gameState.board[gameState.selectedPiece] = PIECE_TYPES.EMPTY;
          playSound('pieceMove');
          gameState.selectedPiece = null;
          gameState.validMoves = [];
          gameState.currentPlayer = PIECE_TYPES.TIGER;
          updateUI();
          
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
          draw();
        }
      } else {
        // Try to move or capture
        const move = gameState.validMoves.find(m => m.to === clickedIndex);
        if (move) {
          saveState(); // Save state before move
          // Transfer tiger identity when moving
          const tigerIdentity = gameState.tigerIdentities[gameState.selectedPiece];
          gameState.board[move.to] = PIECE_TYPES.TIGER;
          gameState.tigerIdentities[move.to] = tigerIdentity;
          
          gameState.board[gameState.selectedPiece] = PIECE_TYPES.EMPTY;
          delete gameState.tigerIdentities[gameState.selectedPiece];
          
          playSound('pieceMove');
          if (move.capture !== null) {
            gameState.board[move.capture] = PIECE_TYPES.EMPTY;
            gameState.goatsCaptured++;
            playSound('tigerCapture');
            updateUI();
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
  console.log('aiMove called. Current player:', gameState.currentPlayer, 'playerSide:', playerSide);
  const aiSide = playerSide === PIECE_TYPES.GOAT ? PIECE_TYPES.TIGER : PIECE_TYPES.GOAT;
  console.log('AI side:', aiSide, 'gameStarted:', gameStarted, 'gameOver:', gameState.gameOver);
  
  if (gameState.currentPlayer !== aiSide || gameState.gameOver || !gameStarted) {
    console.log('aiMove returning early');
    return;
  }

  console.log('aiMove proceeding with AI move');
  showAIThinking();
  const delay = getAIThinkingTime();
  
  setTimeout(() => {
    console.log('Executing AI move after delay');
    executeAIMove();
    hideAIThinking();
  }, delay);
}

function executeAIMove() {
  console.log('executeAIMove called');
  const aiSide = playerSide === PIECE_TYPES.GOAT ? PIECE_TYPES.TIGER : PIECE_TYPES.GOAT;
  console.log('executeAIMove - aiSide:', aiSide);
  
  if (aiSide === PIECE_TYPES.TIGER) {
    console.log('Calling executeAITigerMove');
    executeAITigerMove();
  } else {
    console.log('Calling executeAIGoatMove');
    executeAIGoatMove();
  }
}

// AI for tiger moves
function executeAITigerMove() {
  console.log('executeAITigerMove called');
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

  console.log('Found tigers with moves:', tigers.length);

  if (tigers.length === 0) {
    checkWin();
    return;
  }

  // Prioritize captures
  for (const tiger of tigers) {
    const captureMoves = tiger.moves.filter(m => m.capture !== null);
    if (captureMoves.length > 0) {
      const move = captureMoves[0];
      saveState(); // Save state before AI move
      
      // Transfer tiger identity
      const tigerIdentity = gameState.tigerIdentities[tiger.index];
      gameState.board[move.to] = PIECE_TYPES.TIGER;
      gameState.tigerIdentities[move.to] = tigerIdentity;
      
      gameState.board[tiger.index] = PIECE_TYPES.EMPTY;
      delete gameState.tigerIdentities[tiger.index];
      
      gameState.board[move.capture] = PIECE_TYPES.EMPTY;
      gameState.goatsCaptured++;
      playSound('pieceMove');
      playSound('tigerCapture');
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
  saveState(); // Save state before AI move
  
  // Transfer tiger identity
  const tigerIdentity = gameState.tigerIdentities[randomTiger.index];
  gameState.board[randomMove.to] = PIECE_TYPES.TIGER;
  gameState.tigerIdentities[randomMove.to] = tigerIdentity;
  
  gameState.board[randomTiger.index] = PIECE_TYPES.EMPTY;
  delete gameState.tigerIdentities[randomTiger.index];
  
  playSound('pieceMove');
  gameState.currentPlayer = PIECE_TYPES.GOAT;

  updateUI();
  draw();
  checkWin();
}

// AI for goat moves
function executeAIGoatMove() {
  console.log('executeAIGoatMove called. Phase:', gameState.phase);
  if (gameState.gameOver) return;
  
  if (gameState.phase === PHASE.PLACEMENT) {
    console.log('Placement phase - placing goat');
    // Place goat on random empty spot
    const emptySpots = [];
    for (let i = 0; i < 25; i++) {
      if (gameState.board[i] === PIECE_TYPES.EMPTY) {
        emptySpots.push(i);
      }
    }
    
    console.log('Empty spots:', emptySpots.length);
    
    if (emptySpots.length > 0) {
      const randomSpot = emptySpots[Math.floor(Math.random() * emptySpots.length)];
      console.log('Placing goat at:', randomSpot);
      saveState(); // Save state before AI move
      gameState.board[randomSpot] = PIECE_TYPES.GOAT;
      gameState.goatsPlaced++;
      playSound('pieceMove');
      
      if (gameState.goatsPlaced === 20) {
        gameState.phase = PHASE.MOVEMENT;
      }
      
      gameState.currentPlayer = PIECE_TYPES.TIGER;
      console.log('Goat placed. Current player now:', gameState.currentPlayer);
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
      saveState(); // Save state before AI move
      
      gameState.board[randomMove.to] = PIECE_TYPES.GOAT;
      gameState.board[randomGoat.index] = PIECE_TYPES.EMPTY;
      playSound('pieceMove');
      gameState.currentPlayer = PIECE_TYPES.TIGER;
    }
  }
  
  updateUI();
  draw();
  checkWin();
}

// Get tiger image index based on position
function getTigerImageIndex(position) {
  // Use the tracked tiger identity
  if (gameState.tigerIdentities && gameState.tigerIdentities[position] !== undefined) {
    return gameState.tigerIdentities[position];
  }
  
  // Fallback to position-based for backwards compatibility
  const cornerMap = {
    0: 0,   // Top-left -> Congress
    4: 1,   // Top-right -> Maoist
    20: 2,  // Bottom-left -> RRP
    24: 3   // Bottom-right -> Surya
  };
  
  return cornerMap[position] !== undefined ? cornerMap[position] : 0;
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

  ctx.clearRect(0, 0, canvas.width, canvas.height);

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
  // Main diagonals from corners to center
  ctx.beginPath();
  ctx.moveTo(padding, padding); // Top-left to bottom-right
  ctx.lineTo(padding + 4 * cellSize, padding + 4 * cellSize);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(padding + 4 * cellSize, padding); // Top-right to bottom-left
  ctx.lineTo(padding, padding + 4 * cellSize);
  ctx.stroke();

  // Inner square diagonals (connecting middle points of edges)
  // Top-center to right-center
  ctx.beginPath();
  ctx.moveTo(padding + 2 * cellSize, padding);
  ctx.lineTo(padding + 4 * cellSize, padding + 2 * cellSize);
  ctx.stroke();

  // Right-center to bottom-center
  ctx.beginPath();
  ctx.moveTo(padding + 4 * cellSize, padding + 2 * cellSize);
  ctx.lineTo(padding + 2 * cellSize, padding + 4 * cellSize);
  ctx.stroke();

  // Bottom-center to left-center
  ctx.beginPath();
  ctx.moveTo(padding + 2 * cellSize, padding + 4 * cellSize);
  ctx.lineTo(padding, padding + 2 * cellSize);
  ctx.stroke();

  // Left-center to top-center
  ctx.beginPath();
  ctx.moveTo(padding, padding + 2 * cellSize);
  ctx.lineTo(padding + 2 * cellSize, padding);
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
      // Check if tiger is trapped
      const validMoves = getValidMoves(i);
      const isTrapped = validMoves.length === 0;
      
      // Draw white circular chip with neon glow if selected
      const isSelected = gameState.selectedPiece === i;
      const isCurrentTurn = gameState.currentPlayer === PIECE_TYPES.TIGER;
      const pulseOffset = isCurrentTurn ? Math.sin(Date.now() / 300) * 0.05 : 0;
      const chipRadius = cellSize * (0.4 + pulseOffset);
      
      // Fade color if trapped
      ctx.fillStyle = isTrapped ? '#cccccc' : '#ffffff';
      
      if (isSelected) {
        // Add neon gold glow effect
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 6;
      } else {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = isTrapped ? '#666666' : (isCurrentTurn ? '#FF6B35' : '#2d3748');
        ctx.lineWidth = isCurrentTurn ? 4 : 3;
      }
      
      ctx.beginPath();
      ctx.arc(x, y, chipRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Reset shadow
      ctx.shadowBlur = 0;
      
      // Draw tiger image on top with grayscale if trapped
      const tigerIndex = getTigerImageIndex(i);
      const img = images.tigers[tigerIndex];
      const imgSize = cellSize * 0.72;
      
      if (img.complete) {
        if (isTrapped) {
          // Apply grayscale and fade effect
          ctx.globalAlpha = 0.5;
          ctx.filter = 'grayscale(100%)';
        }
        ctx.drawImage(img, x - imgSize / 2, y - imgSize / 2, imgSize, imgSize);
        if (isTrapped) {
          // Reset filters
          ctx.globalAlpha = 1.0;
          ctx.filter = 'none';
        }
      }
    } else if (piece === PIECE_TYPES.GOAT) {
      const isSelected = gameState.selectedPiece === i;
      const isCurrentTurn = gameState.currentPlayer === PIECE_TYPES.GOAT;
      const pulseOffset = isCurrentTurn ? Math.sin(Date.now() / 300) * 0.05 : 0;
      const chipRadius = cellSize * (0.4 + pulseOffset);
      
      // Draw white circular chip with neon glow if selected
      ctx.fillStyle = '#ffffff';
      
      if (isSelected) {
        // Add neon green glow effect
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 6;
      } else {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = isCurrentTurn ? '#4ECDC4' : '#2d3748';
        ctx.lineWidth = isCurrentTurn ? 4 : 3;
      }
      
      ctx.beginPath();
      ctx.arc(x, y, chipRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // Reset shadow
      ctx.shadowBlur = 0;
      
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
  document.getElementById('tigers-trapped').textContent = countTrappedTigers() + ' / 4';

  const turnText = document.getElementById('turn-text');
  const phaseText = document.getElementById('phase-text');

  // Update turn text
  if (gameState.currentPlayer === PIECE_TYPES.TIGER) {
    turnText.textContent = 'Opposition';
  } else {
    turnText.textContent = 'Governing Parties';
  }

  // Update phase text
  phaseText.textContent = gameState.phase === PHASE.PLACEMENT ? 
    'Placement Phase' : 'Movement Phase';

  // Update progress bars
  const captureProgress = document.getElementById('captureProgress');
  if (captureProgress) {
    captureProgress.style.width = (gameState.goatsCaptured / 5 * 100) + '%';
  }

  const placedProgress = document.getElementById('placedProgress');
  if (placedProgress) {
    placedProgress.style.width = (gameState.goatsPlaced / 20 * 100) + '%';
  }

  // Update tags
  const tigerTag = document.getElementById('tigerTag');
  if (tigerTag) {
    tigerTag.textContent = 'Captures: ' + gameState.goatsCaptured + ' / 5';
  }

  const goatTag = document.getElementById('goatTag');
  if (goatTag) {
    goatTag.textContent = 'Placed: ' + gameState.goatsPlaced + ' / 20';
  }
}

// Save current game state to history
function saveState() {
  const stateCopy = {
    board: [...gameState.board],
    currentPlayer: gameState.currentPlayer,
    phase: gameState.phase,
    goatsPlaced: gameState.goatsPlaced,
    goatsCaptured: gameState.goatsCaptured,
    tigerIdentities: {...gameState.tigerIdentities}
  };
  gameHistory.push(stateCopy);
  // Keep only last move
  if (gameHistory.length > 1) {
    gameHistory.shift();
  }
  updateViewPrevButton();
}

// Toggle viewing previous move
function toggleViewPrevious() {
  if (gameHistory.length === 0 || gameState.gameOver) return;
  
  const btn = document.getElementById('view-prev-btn');
  
  if (!isViewingPrevious) {
    // Save current state and show previous
    currentGameState = {
      board: [...gameState.board],
      currentPlayer: gameState.currentPlayer,
      phase: gameState.phase,
      goatsPlaced: gameState.goatsPlaced,
      goatsCaptured: gameState.goatsCaptured,
      tigerIdentities: {...gameState.tigerIdentities},
      selectedPiece: gameState.selectedPiece,
      validMoves: [...gameState.validMoves]
    };
    
    const previousState = gameHistory[0];
    gameState.board = [...previousState.board];
    gameState.currentPlayer = previousState.currentPlayer;
    gameState.phase = previousState.phase;
    gameState.goatsPlaced = previousState.goatsPlaced;
    gameState.goatsCaptured = previousState.goatsCaptured;
    gameState.tigerIdentities = {...previousState.tigerIdentities};
    gameState.selectedPiece = null;
    gameState.validMoves = [];
    
    isViewingPrevious = true;
    btn.classList.add('viewing');
  } else {
    // Restore current state
    gameState.board = [...currentGameState.board];
    gameState.currentPlayer = currentGameState.currentPlayer;
    gameState.phase = currentGameState.phase;
    gameState.goatsPlaced = currentGameState.goatsPlaced;
    gameState.goatsCaptured = currentGameState.goatsCaptured;
    gameState.tigerIdentities = {...currentGameState.tigerIdentities};
    gameState.selectedPiece = currentGameState.selectedPiece;
    gameState.validMoves = [...currentGameState.validMoves];
    
    isViewingPrevious = false;
    btn.classList.remove('viewing');
  }
  
  updateUI();
  draw();
}

// Update view previous button state
function updateViewPrevButton() {
  const btn = document.getElementById('view-prev-btn');
  if (btn) {
    btn.disabled = gameHistory.length === 0 || gameState.gameOver;
    if (gameHistory.length === 0 || gameState.gameOver) {
      btn.classList.remove('viewing');
      isViewingPrevious = false;
    }
  }
}

// End game
function endGame(message, winner) {
  gameState.gameOver = true;
  playSound('winning');
  
  const overlay = document.getElementById('winner-overlay');
  const winnerIcon = document.getElementById('winner-icon');
  const winnerText = document.getElementById('winner-text');

  // Display logos based on winner
  if (winner === 'tiger') {
    winnerIcon.innerHTML = `
      <div class="winner-logos">
        <img src="assets/Congress.png" class="winner-logo">
        <img src="assets/Maoist.png" class="winner-logo">
        <img src="assets/RRP.png" class="winner-logo">
        <img src="assets/Surya.png" class="winner-logo">
      </div>
    `;
  } else {
    winnerIcon.innerHTML = '<img src="assets/Ghanti.png" class="winner-logo-single">';
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
document.getElementById('view-prev-btn').addEventListener('click', toggleViewPrevious);

// Start game button
document.getElementById('start-game-btn').addEventListener('click', () => {
  document.getElementById('start-overlay').classList.remove('show');
  document.getElementById('player-select-overlay').classList.add('show');
});

// Tutorial buttons (handle all instances)
document.querySelectorAll('#tutorial-btn, #footer-tutorial').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('start-overlay').classList.remove('show');
    document.getElementById('tutorial-overlay').classList.add('show');
  });
});

// Tutorial close button
document.getElementById('tutorial-close').addEventListener('click', () => {
  document.getElementById('tutorial-overlay').classList.remove('show');
  document.getElementById('start-overlay').classList.add('show');
});

// Tutorial start playing button
const tutorialStart = document.getElementById('tutorial-start');
if (tutorialStart) {
  tutorialStart.addEventListener('click', () => {
    document.getElementById('tutorial-overlay').classList.remove('show');
    document.getElementById('player-select-overlay').classList.add('show');
  });
}

// About buttons (handle all instances)
document.querySelectorAll('#about-btn, #footer-about').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('start-overlay').classList.remove('show');
    document.getElementById('about-overlay').classList.add('show');
  });
});

// About close button
const aboutClose = document.getElementById('about-close');
if (aboutClose) {
  aboutClose.addEventListener('click', () => {
    document.getElementById('about-overlay').classList.remove('show');
    document.getElementById('start-overlay').classList.add('show');
  });
}

// About start playing button
const aboutStart = document.getElementById('about-start');
if (aboutStart) {
  aboutStart.addEventListener('click', () => {
    document.getElementById('about-overlay').classList.remove('show');
    document.getElementById('player-select-overlay').classList.add('show');
  });
}

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

// Footer links
const footerSettings = document.getElementById('footer-settings');
if (footerSettings) {
  footerSettings.addEventListener('click', () => {
    const settingsOverlay = document.getElementById('settings-overlay');
    if (settingsOverlay) {
      settingsOverlay.classList.add('show');
    }
  });
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
