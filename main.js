// Bagh Chal Game Logic

// ===== FIREBASE AUTHENTICATION =====
// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCwZWRiXb_KwyNpUcQUfRNJQvQyf-o6x5g",
  authDomain: "baghchal-26da2.firebaseapp.com",
  projectId: "baghchal-26da2",
  storageBucket: "baghchal-26da2.firebasestorage.app",
  messagingSenderId: "342367298445",
  appId: "1:342367298445:web:b30dc206c09e73ab24d3c4",
  measurementId: "G-6VR5DSX8CT"
};

// Initialize Firebase
let auth, db;
let currentUser = null;
let userStats = { gamesPlayed: 0, tigerWins: 0, goatWins: 0 };

try {
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error);
}

// Auth state observer
if (auth) {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      console.log('User signed in:', user.email);
      await loadUserData(user);
      updateUIForSignedInUser();
    } else {
      currentUser = null;
      console.log('User signed out');
      updateUIForSignedOutUser();
    }
  });
}

// Sign in with Google
async function signInWithGoogle() {
  if (!auth) return;
  
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await auth.signInWithPopup(provider);
    const user = result.user;
    
    // Check if user needs to set username
    const userDoc = await db.collection('users').doc(user.uid).get();
    if (!userDoc.exists) {
      // New user - show username setup
      showUsernameSetup();
    }
  } catch (error) {
    console.error('Sign-in error:', error);
    alert('Failed to sign in with Google. Please try again.');
  }
}

// Load user data from Firestore
async function loadUserData(user) {
  if (!db) return;
  
  try {
    const userDoc = await db.collection('users').doc(user.uid).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      userStats = {
        gamesPlayed: data.gamesPlayed || 0,
        tigerWins: data.tigerWins || 0,
        goatWins: data.goatWins || 0,
        username: data.username || user.displayName || 'Player'
      };
    } else {
      userStats = { gamesPlayed: 0, tigerWins: 0, goatWins: 0, username: user.displayName || 'Player' };
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

// Save username for new user
async function saveUsername(username) {
  if (!currentUser || !db) return;
  
  try {
    await db.collection('users').doc(currentUser.uid).set({
      username: username,
      email: currentUser.email,
      gamesPlayed: 0,
      tigerWins: 0,
      goatWins: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    userStats.username = username;
    hideUsernameSetup();
    updateUIForSignedInUser();
  } catch (error) {
    console.error('Error saving username:', error);
    alert('Failed to save username. Please try again.');
  }
}

// Update stats after game
async function updateUserStats(won, side) {
  if (!currentUser || !db) return;
  
  try {
    const userRef = db.collection('users').doc(currentUser.uid);
    const updates = {
      gamesPlayed: firebase.firestore.FieldValue.increment(1)
    };
    
    if (won) {
      if (side === 'tiger') {
        updates.tigerWins = firebase.firestore.FieldValue.increment(1);
        userStats.tigerWins++;
      } else {
        updates.goatWins = firebase.firestore.FieldValue.increment(1);
        userStats.goatWins++;
      }
    }
    
    userStats.gamesPlayed++;
    await userRef.update(updates);
    updateStatsDisplay();
  } catch (error) {
    console.error('Error updating stats:', error);
  }
}

// Sign out
async function signOut() {
  if (!auth) return;
  
  try {
    await auth.signOut();
  } catch (error) {
    console.error('Sign-out error:', error);
  }
}

// UI Updates
function updateUIForSignedInUser() {
  document.getElementById('sign-in-btn').style.display = 'none';
  document.getElementById('profile-menu').style.display = 'block';
  
  const profileImg = document.getElementById('profile-img');
  const profileUsername = document.getElementById('profile-username');
  
  if (currentUser) {
    profileImg.src = currentUser.photoURL || 'https://via.placeholder.com/32';
    profileUsername.textContent = userStats.username || currentUser.displayName || 'Player';
  }
  
  updateStatsDisplay();
}

function updateUIForSignedOutUser() {
  document.getElementById('sign-in-btn').style.display = 'block';
  document.getElementById('profile-menu').style.display = 'none';
}

function updateStatsDisplay() {
  document.getElementById('stats-games').textContent = userStats.gamesPlayed;
  document.getElementById('stats-tiger-wins').textContent = userStats.tigerWins;
  document.getElementById('stats-goat-wins').textContent = userStats.goatWins;
}

function showUsernameSetup() {
  document.getElementById('username-setup-overlay').classList.add('show');
}

function hideUsernameSetup() {
  document.getElementById('username-setup-overlay').classList.remove('show');
}

// ===== GAME LOGIC =====

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
let aiDifficulty = 'easy'; // 'easy' or 'hard'

// Timer settings
let timerInterval = null;
let currentTime = 30; // 30 seconds per move
const TIME_PER_MOVE = 30;
const TIME_INCREMENT = 3;

// AI Configuration
const AI_CONFIG = {
  easy: {
    depth: 0, // Random moves
    thinkTime: 300
  },
  hard: {
    tigerPlacementDepth: 1, // Tiger doesn't place, but for consistency
    tigerMovementDepth: 2,  // Tiger attacks - moderate depth
    goatPlacementDepth: 3,  // Goat defense needs planning - deeper search
    goatMovementDepth: 3,   // Goat defense critical - deeper search
    thinkTime: 500
  }
};

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

// Position history to detect repetitions
let positionHistory = [];
const MAX_POSITION_HISTORY = 10; // Track last 10 positions

// Helper function to create board hash
function getBoardHash(board) {
  return board.join(',');
}

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
  
  // Clear position history
  positionHistory = [];

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
  
  // Show/hide panels based on game state
  if (gameStarted) {
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('gameStatePanel').classList.remove('hidden');
    document.getElementById('tigerPanel').classList.remove('hidden');
    document.getElementById('goatPanel').classList.remove('hidden');
    startTimer();
  } else {
    document.getElementById('welcome-screen').style.display = 'flex';
    document.getElementById('gameStatePanel').classList.add('hidden');
    document.getElementById('tigerPanel').classList.add('hidden');
    document.getElementById('goatPanel').classList.add('hidden');
  }
  
  // If player is tiger, goats go first (AI)
  if (gameStarted && playerSide === PIECE_TYPES.TIGER) {
    setTimeout(() => aiMove(), getAIThinkingTime());
  }
}

// Timer functions
function startTimer() {
  stopTimer();
  currentTime = TIME_PER_MOVE;
  updateTimerDisplay();
  
  timerInterval = setInterval(() => {
    currentTime -= 0.1;
    if (currentTime <= 0) {
      currentTime = 0;
      stopTimer();
      handleTimeOut();
    }
    updateTimerDisplay();
  }, 100);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function resetTimer() {
  currentTime = TIME_PER_MOVE + TIME_INCREMENT;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const timerElement = document.getElementById('timer-text');
  if (timerElement) {
    timerElement.textContent = currentTime.toFixed(1);
    
    // Update color based on time remaining
    timerElement.classList.remove('warning', 'danger');
    if (currentTime <= 5) {
      timerElement.classList.add('danger');
    } else if (currentTime <= 10) {
      timerElement.classList.add('warning');
    }
  }
}

function handleTimeOut() {
  if (gameState.gameOver) return;
  
  stopTimer();
  
  // Current player loses
  const winner = gameState.currentPlayer === PIECE_TYPES.GOAT ? 'tiger' : 'goat';
  const message = gameState.currentPlayer === PIECE_TYPES.GOAT 
    ? 'Opposition Wins - Time Out!' 
    : 'Governing Parties Win - Time Out!';
  
  endGame(message, winner);
}

function onMoveMade() {
  // Reset timer with increment and start for next player
  resetTimer();
  startTimer();
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
        
        // Track position
        const boardHash = getBoardHash(gameState.board);
        positionHistory.push(boardHash);
        if (positionHistory.length > MAX_POSITION_HISTORY) {
          positionHistory.shift();
        }
        
        updateUI();
        onMoveMade();
        
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
          
          // Track position after tiger move in placement
          const boardHashTigerPlace = getBoardHash(gameState.board);
          positionHistory.push(boardHashTigerPlace);
          if (positionHistory.length > MAX_POSITION_HISTORY) {
            positionHistory.shift();
          }
          
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
          
          // Track position
          const boardHash = getBoardHash(gameState.board);
          positionHistory.push(boardHash);
          if (positionHistory.length > MAX_POSITION_HISTORY) {
            positionHistory.shift();
          }
          
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
          
          // Track position after tiger move in movement phase
          const boardHashTigerMove = getBoardHash(gameState.board);
          positionHistory.push(boardHashTigerMove);
          if (positionHistory.length > MAX_POSITION_HISTORY) {
            positionHistory.shift();
          }
          
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
    if (aiDifficulty === 'hard') {
      executeHardAIMove();
    } else {
      executeAIMove();
    }
    hideAIThinking();
  }, delay);
}

// ===== HARD AI IMPLEMENTATION =====

// Evaluate board state from perspective of given player
function evaluateBoard(board, player, phase, goatsPlaced, goatsCaptured) {
  let score = 0;
  
  if (player === PIECE_TYPES.TIGER) {
    // Tiger evaluation
    score += goatsCaptured * 100; // Captures are paramount
    
    // Count tiger mobility
    let totalMobility = 0;
    let trappedTigers = 0;
    
    for (let i = 0; i < 25; i++) {
      if (board[i] === PIECE_TYPES.TIGER) {
        const moves = getValidMovesForState(i, board);
        totalMobility += moves.length;
        
        if (moves.length === 0) {
          trappedTigers++;
          score -= 500; // Heavily penalize trapped tigers
        } else {
          score += moves.length * 10; // Reward mobility
        }
        
        // Reward center control
        const pos = positions[i];
        if (pos.row === 2 && pos.col === 2) {
          score += 15;
        } else if (Math.abs(pos.row - 2) <= 1 && Math.abs(pos.col - 2) <= 1) {
          score += 5;
        }
        
        // Count capture opportunities
        const captureMoves = moves.filter(m => m.capture !== null);
        score += captureMoves.length * 50;
      }
    }
    
    // Penalize if all tigers are trapped
    if (trappedTigers === 4) {
      score -= 10000;
    }
    
  } else {
    // Goat evaluation - DEFENSIVE PRIORITY
    score -= goatsCaptured * 200; // Losing goats is very bad
    
    // Heavily penalize if close to losing (4 captures = game over at 5)
    if (goatsCaptured >= 4) {
      score -= 5000;
    }
    
    // Count goat safety and formation
    let safeGoats = 0;
    let isolatedGoats = 0;
    let tigerMobility = 0;
    let tigerCaptureMoves = 0;
    
    for (let i = 0; i < 25; i++) {
      if (board[i] === PIECE_TYPES.GOAT) {
        const pos = positions[i];
        const adjacent = getAdjacentForState(i, board);
        
        // Check if goat has backup (critical for defense)
        let hasBackup = false;
        let adjacentGoats = 0;
        
        for (const adj of adjacent) {
          if (board[adj] === PIECE_TYPES.GOAT) {
            adjacentGoats++;
            hasBackup = true;
          }
        }
        
        if (hasBackup) {
          safeGoats++;
          score += 40; // Strong reward for goat formations
        } else {
          isolatedGoats++;
          score -= 25; // Penalize isolated goats
        }
        
        // Extra reward for goats in pairs/groups (2+ adjacent goats)
        if (adjacentGoats >= 2) {
          score += 30; // Strong defensive formation
        }
        
        // Strategic positioning in placement phase
        if (phase === PHASE.PLACEMENT) {
          // Prioritize center and key blocking positions
          if (pos.row === 2 && pos.col === 2) {
            score += 35; // Center control
          } else if (Math.abs(pos.row - 2) <= 1 && Math.abs(pos.col - 2) <= 1) {
            score += 15; // Near center
          }
          
          // Reward key diagonal intersections
          if ((pos.row === 1 || pos.row === 3) && (pos.col === 1 || pos.col === 3)) {
            score += 20;
          }
        }
        
        // In movement phase, prioritize trapping
        if (phase === PHASE.MOVEMENT) {
          // Reward positions that block tiger paths
          const nearTiger = adjacent.some(adj => board[adj] === PIECE_TYPES.TIGER);
          if (nearTiger && hasBackup) {
            score += 35; // Blocking tiger with backup is excellent
          }
        }
        
        // Penalize vulnerable edge goats
        if (pos.row === 0 || pos.row === 4 || pos.col === 0 || pos.col === 4) {
          if (!hasBackup) {
            score -= 15; // Isolated edge goats are very vulnerable
          }
        }
      } else if (board[i] === PIECE_TYPES.TIGER) {
        const moves = getValidMovesForState(i, board);
        tigerMobility += moves.length;
        
        // Count capture opportunities for tigers
        const captureMoves = moves.filter(m => m.capture !== null);
        tigerCaptureMoves += captureMoves.length;
      }
    }
    
    // CRITICAL: Reward for restricting tiger movement (suffocation strategy)
    score += (40 - tigerMobility) * 8; // Higher weight for suffocation
    
    // Penalize if tigers have capture opportunities
    score -= tigerCaptureMoves * 60;
    
    // Bonus for trapping tigers completely
    if (tigerMobility === 0 && phase === PHASE.MOVEMENT) {
      score += 15000; // Winning position
    }
    
    // Reward tight formations over isolated goats
    score += safeGoats * 25;
    score -= isolatedGoats * 20;
  }
  
  return score;
}

// Get valid moves for a position in a given board state
function getValidMovesForState(index, board) {
  const piece = board[index];
  if (piece === PIECE_TYPES.EMPTY) return [];
  
  const moves = [];
  const adjacent = getAdjacentForState(index, board);
  
  for (const adj of adjacent) {
    if (board[adj] === PIECE_TYPES.EMPTY) {
      moves.push({ from: index, to: adj, capture: null });
    } else if (piece === PIECE_TYPES.TIGER && board[adj] === PIECE_TYPES.GOAT) {
      // Check for capture - calculate jump position
      const { row: r1, col: c1 } = positions[index];
      const { row: r2, col: c2 } = positions[adj];
      const dr = r2 - r1;
      const dc = c2 - c1;
      const jumpRow = r2 + dr;
      const jumpCol = c2 + dc;
      
      if (jumpRow >= 0 && jumpRow < GRID_SIZE && jumpCol >= 0 && jumpCol < GRID_SIZE) {
        const jumpIndex = jumpRow * GRID_SIZE + jumpCol;
        
        if (board[jumpIndex] === PIECE_TYPES.EMPTY) {
          const jumpAdjacent = getAdjacentForState(adj, board);
          if (jumpAdjacent.includes(jumpIndex)) {
            moves.push({ from: index, to: jumpIndex, capture: adj });
          }
        }
      }
    }
  }
  
  return moves;
}

// Get adjacent positions for a given board state
function getAdjacentForState(index, board) {
  const pos = positions[index];
  const adjacent = [];
  
  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1], // orthogonal
    [-1, -1], [-1, 1], [1, -1], [1, 1] // diagonal
  ];
  
  for (const [dr, dc] of directions) {
    const newRow = pos.row + dr;
    const newCol = pos.col + dc;
    
    if (newRow >= 0 && newRow < GRID_SIZE && newCol >= 0 && newCol < GRID_SIZE) {
      const newIndex = newRow * GRID_SIZE + newCol;
      
      // Check if diagonal is valid
      if (Math.abs(dr) === 1 && Math.abs(dc) === 1) {
        if (isDiagonalConnected(pos.row, pos.col, newRow, newCol)) {
          adjacent.push(newIndex);
        }
      } else {
        adjacent.push(newIndex);
      }
    }
  }
  
  return adjacent;
}

// Minimax with alpha-beta pruning
function minimax(board, depth, alpha, beta, isMaximizing, player, phase, goatsPlaced, goatsCaptured) {
  // Terminal conditions
  if (depth === 0 || goatsCaptured >= 5) {
    return evaluateBoard(board, player, phase, goatsPlaced, goatsCaptured);
  }
  
  // Check if game is over (all tigers trapped)
  if (phase === PHASE.MOVEMENT) {
    let allTrapped = true;
    for (let i = 0; i < 25; i++) {
      if (board[i] === PIECE_TYPES.TIGER) {
        const moves = getValidMovesForState(i, board);
        if (moves.length > 0) {
          allTrapped = false;
          break;
        }
      }
    }
    if (allTrapped) {
      return isMaximizing ? -10000 : 10000;
    }
  }
  
  const currentPlayer = isMaximizing ? player : (player === PIECE_TYPES.TIGER ? PIECE_TYPES.GOAT : PIECE_TYPES.TIGER);
  
  if (isMaximizing) {
    let maxEval = -Infinity;
    const moves = getAllPossibleMoves(board, currentPlayer, phase, goatsPlaced);
    
    for (const move of moves) {
      const newState = applyMove(board, move, phase, goatsPlaced, goatsCaptured);
      const evaluation = minimax(newState.board, depth - 1, alpha, beta, false, player, newState.phase, newState.goatsPlaced, newState.goatsCaptured);
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break; // Prune
    }
    
    return maxEval;
  } else {
    let minEval = Infinity;
    const moves = getAllPossibleMoves(board, currentPlayer, phase, goatsPlaced);
    
    for (const move of moves) {
      const newState = applyMove(board, move, phase, goatsPlaced, goatsCaptured);
      const evaluation = minimax(newState.board, depth - 1, alpha, beta, true, player, newState.phase, newState.goatsPlaced, newState.goatsCaptured);
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break; // Prune
    }
    
    return minEval;
  }
}

// Get all possible moves for a player
function getAllPossibleMoves(board, player, phase, goatsPlaced) {
  const moves = [];
  
  if (player === PIECE_TYPES.GOAT && phase === PHASE.PLACEMENT && goatsPlaced < 20) {
    // Placement moves
    for (let i = 0; i < 25; i++) {
      if (board[i] === PIECE_TYPES.EMPTY) {
        moves.push({ type: 'place', to: i });
      }
    }
  } else {
    // Movement moves
    for (let i = 0; i < 25; i++) {
      if (board[i] === player) {
        const pieceMoves = getValidMovesForState(i, board);
        moves.push(...pieceMoves);
      }
    }
  }
  
  return moves;
}

// Apply a move to create a new board state
function applyMove(board, move, phase, goatsPlaced, goatsCaptured) {
  const newBoard = [...board];
  let newPhase = phase;
  let newGoatsPlaced = goatsPlaced;
  let newGoatsCaptured = goatsCaptured;
  
  if (move.type === 'place') {
    newBoard[move.to] = PIECE_TYPES.GOAT;
    newGoatsPlaced++;
    if (newGoatsPlaced === 20) {
      newPhase = PHASE.MOVEMENT;
    }
  } else {
    newBoard[move.to] = newBoard[move.from];
    newBoard[move.from] = PIECE_TYPES.EMPTY;
    if (move.capture !== null) {
      newBoard[move.capture] = PIECE_TYPES.EMPTY;
      newGoatsCaptured++;
    }
  }
  
  return { board: newBoard, phase: newPhase, goatsPlaced: newGoatsPlaced, goatsCaptured: newGoatsCaptured };
}

// Execute hard AI move using minimax
function executeHardAIMove() {
  if (gameState.gameOver) return;
  
  console.log('=== Hard AI Move Start ===');
  const aiSide = playerSide === PIECE_TYPES.GOAT ? PIECE_TYPES.TIGER : PIECE_TYPES.GOAT;
  console.log('AI Side:', aiSide === PIECE_TYPES.TIGER ? 'TIGER' : 'GOAT');
  console.log('Phase:', gameState.phase);
  
  const allMoves = getAllPossibleMoves(gameState.board, aiSide, gameState.phase, gameState.goatsPlaced);
  console.log('Total possible moves:', allMoves.length);
  
  if (allMoves.length === 0) {
    console.log('No moves available!');
    checkWin();
    return;
  }
  
  // Determine search depth based on AI side and phase
  let searchDepth;
  if (aiSide === PIECE_TYPES.GOAT) {
    searchDepth = gameState.phase === PHASE.PLACEMENT ? 
      AI_CONFIG.hard.goatPlacementDepth : 
      AI_CONFIG.hard.goatMovementDepth;
  } else {
    searchDepth = gameState.phase === PHASE.PLACEMENT ? 
      AI_CONFIG.hard.tigerPlacementDepth : 
      AI_CONFIG.hard.tigerMovementDepth;
  }
  
  console.log('Using search depth:', searchDepth);
  
  let bestMove = null;
  let bestScore = -Infinity;
  let alternativeMoves = []; // Track good alternative moves
  
  // Use minimax search for accurate play
  console.log('Evaluating moves with minimax...');
  for (let i = 0; i < allMoves.length; i++) {
    const move = allMoves[i];
    const newState = applyMove(gameState.board, move, gameState.phase, gameState.goatsPlaced, gameState.goatsCaptured);
    
    // Check if this position would repeat recent history
    const newBoardHash = getBoardHash(newState.board);
    const wouldRepeat = positionHistory.slice(-6).includes(newBoardHash); // Check last 6 positions
    
    // Use minimax to look ahead
    const score = minimax(
      newState.board, 
      searchDepth - 1, 
      -Infinity, 
      Infinity, 
      false, // Opponent's turn next
      aiSide, 
      newState.phase, 
      newState.goatsPlaced, 
      newState.goatsCaptured
    );
    
    // Penalize repetitive moves for Goat AI
    let adjustedScore = score;
    if (aiSide === PIECE_TYPES.GOAT && wouldRepeat) {
      adjustedScore -= 100; // Penalty for repetition
      console.log('Move would repeat position, applying penalty');
    }
    
    // Track alternative moves that are close to best
    if (adjustedScore > bestScore - 50 && !wouldRepeat) {
      alternativeMoves.push({ move, score: adjustedScore });
    }
    
    if (adjustedScore > bestScore) {
      bestScore = adjustedScore;
      bestMove = move;
    }
  }
  
  // If best move would cause repetition and we have alternatives, choose alternative
  if (aiSide === PIECE_TYPES.GOAT && alternativeMoves.length > 1) {
    // Sort alternatives by score
    alternativeMoves.sort((a, b) => b.score - a.score);
    
    // Check if the top alternative is different from best move
    const bestNewState = applyMove(gameState.board, bestMove, gameState.phase, gameState.goatsPlaced, gameState.goatsCaptured);
    const bestHash = getBoardHash(bestNewState.board);
    
    if (positionHistory.slice(-4).includes(bestHash)) {
      console.log('Choosing alternative move to avoid repetition');
      // Pick second or third best move to add variety
      const altIndex = Math.floor(Math.random() * Math.min(3, alternativeMoves.length));
      bestMove = alternativeMoves[altIndex].move;
      bestScore = alternativeMoves[altIndex].score;
    }
  }
  
  console.log('Best move selected with score:', bestScore);
  console.log('Move:', bestMove);
  
  // Apply the best move
  if (bestMove) {
    saveState();
    
    if (bestMove.type === 'place') {
      console.log('Placing goat at position:', bestMove.to);
      gameState.board[bestMove.to] = PIECE_TYPES.GOAT;
      gameState.goatsPlaced++;
      if (gameState.goatsPlaced === 20) {
        gameState.phase = PHASE.MOVEMENT;
      }
      gameState.currentPlayer = PIECE_TYPES.TIGER;
    } else {
      console.log('Moving from', bestMove.from, 'to', bestMove.to);
      if (gameState.board[bestMove.from] === PIECE_TYPES.TIGER) {
        const tigerIdentity = gameState.tigerIdentities[bestMove.from];
        gameState.tigerIdentities[bestMove.to] = tigerIdentity;
        delete gameState.tigerIdentities[bestMove.from];
      }
      
      gameState.board[bestMove.to] = gameState.board[bestMove.from];
      gameState.board[bestMove.from] = PIECE_TYPES.EMPTY;
      
      if (bestMove.capture !== null) {
        console.log('Captured piece at:', bestMove.capture);
        gameState.board[bestMove.capture] = PIECE_TYPES.EMPTY;
        gameState.goatsCaptured++;
        playSound('tigerCapture');
      }
      
      gameState.currentPlayer = aiSide === PIECE_TYPES.TIGER ? PIECE_TYPES.GOAT : PIECE_TYPES.TIGER;
    }
    
    // Track position to detect repetitions
    const currentBoardHash = getBoardHash(gameState.board);
    positionHistory.push(currentBoardHash);
    
    // Keep only recent history
    if (positionHistory.length > MAX_POSITION_HISTORY) {
      positionHistory.shift();
    }
    
    playSound('pieceMove');
    updateUI();
    draw();
    console.log('=== Hard AI Move Complete ===');
    checkWin();
    onMoveMade();
  }
}

// ===== ORIGINAL EASY AI =====

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
      onMoveMade();
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
  
  // Update user stats if logged in
  if (currentUser) {
    const playerWon = (winner === 'tiger' && playerSide === PIECE_TYPES.TIGER) || 
                      (winner === 'goat' && playerSide === PIECE_TYPES.GOAT);
    const side = playerSide === PIECE_TYPES.TIGER ? 'tiger' : 'goat';
    updateUserStats(playerWon, side);
  }
  
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

// Authentication event listeners (with safe checks)
const signInBtn = document.getElementById('sign-in-btn');
if (signInBtn) {
  signInBtn.addEventListener('click', () => {
    document.getElementById('signup-overlay').classList.add('show');
  });
}

const googleSigninBtn = document.getElementById('google-signin-btn');
if (googleSigninBtn) {
  googleSigninBtn.addEventListener('click', signInWithGoogle);
}

const signOutBtn = document.getElementById('sign-out-btn');
if (signOutBtn) {
  signOutBtn.addEventListener('click', signOut);
}

// Profile dropdown toggle
const profileBtn = document.getElementById('profile-btn');
if (profileBtn) {
  profileBtn.addEventListener('click', () => {
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) {
      dropdown.classList.toggle('show');
    }
  });
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const profileMenu = document.getElementById('profile-menu');
  const dropdown = document.getElementById('profile-dropdown');
  if (profileMenu && !profileMenu.contains(e.target)) {
    dropdown.classList.remove('show');
  }
});

// Username setup form
const usernameForm = document.getElementById('username-form');
if (usernameForm) {
  usernameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const usernameInput = document.getElementById('new-username');
    if (usernameInput) {
      const username = usernameInput.value.trim();
      if (username.length >= 3) {
        saveUsername(username);
      } else {
        alert('Username must be at least 3 characters long');
      }
    }
  });
}

// Sign up overlay close button
document.getElementById('signup-close').addEventListener('click', () => {
  document.getElementById('signup-overlay').classList.remove('show');
});

document.getElementById('play-again-btn').addEventListener('click', showPlayerSelect);
document.getElementById('view-prev-btn').addEventListener('click', toggleViewPrevious);

// Welcome start button
document.getElementById('welcome-start-btn').addEventListener('click', () => {
  document.getElementById('player-select-overlay').classList.add('show');
});

// Tutorial buttons (handle all instances)
document.querySelectorAll('#tutorial-btn, #footer-tutorial').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('tutorial-overlay').classList.add('show');
  });
});

// Tutorial close button
document.getElementById('tutorial-close').addEventListener('click', () => {
  document.getElementById('tutorial-overlay').classList.remove('show');
});

// Player selection close button
document.getElementById('player-select-close').addEventListener('click', () => {
  document.getElementById('player-select-overlay').classList.remove('show');
});

// Sign up overlay close button (safe check for optional element)
const signupClose = document.getElementById('signup-close');
if (signupClose) {
  signupClose.addEventListener('click', () => {
    document.getElementById('signup-overlay').classList.remove('show');
  });
}

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
    document.getElementById('about-overlay').classList.add('show');
  });
});

// About close button
const aboutClose = document.getElementById('about-close');
if (aboutClose) {
  aboutClose.addEventListener('click', () => {
    document.getElementById('about-overlay').classList.remove('show');
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

// Difficulty selection
const difficultyButtons = document.querySelectorAll('.difficulty-btn');
difficultyButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    // Remove active class from all buttons
    difficultyButtons.forEach(b => b.classList.remove('active'));
    // Add active class to clicked button
    btn.classList.add('active');
    // Set difficulty
    aiDifficulty = btn.dataset.difficulty;
    console.log('AI Difficulty set to:', aiDifficulty);
  });
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
