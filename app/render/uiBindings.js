// Reactive UI text/progress updates: turn name, phase, captures, progress bars.
// Subscribes to the same redraw signal the canvas uses, so every state change
// updates both at once.

import { PHASE, PIECE_TYPES } from '../config/gameConfig.js';
import { getAdventureBot } from '../game/adventureConfig.js';
import { countTrappedPieces, BOARD_POSITIONS } from '../game/boardRules.js';
import { id } from '../ui/dom.js';
import { onRedraw, state } from '../state/store.js';

export function initUiBindings() {
  onRedraw(updateUI);
  updateUI();
}

/**
 * Imperative call site for callers that need a synchronous text refresh
 * (e.g. after `endGame` updates a counter). The redraw subscriber will run on
 * the next frame regardless, but some flows want the DOM to be in sync now.
 */
export function updateUI() {
  const game = state.game;

  setText('tiger-captures', game.goatsCaptured);
  setText('goats-remaining', 20 - game.goatsPlaced);
  setText('tigers-trapped', `${countTrappedPieces(game.board, PIECE_TYPES.TIGER, BOARD_POSITIONS)} / 4`);

  const turnText = id('turn-text');
  if (turnText) turnText.textContent = game.currentPlayer === PIECE_TYPES.TIGER ? 'Tiger' : 'Goat';

  const phaseText = id('phase-text');
  if (phaseText) phaseText.textContent = game.phase === PHASE.PLACEMENT ? 'Placement Phase' : 'Movement Phase';

  setWidth('captureProgress', `${(game.goatsCaptured / 5) * 100}%`);
  setWidth('placedProgress', `${(game.goatsPlaced / 20) * 100}%`);

  setText('tigerTag', `Captures: ${game.goatsCaptured} / 5`);
  setText('goatTag', `Placed: ${game.goatsPlaced} / 20`);

  updateMultiplayerTags(game);
  updatePlaySidebar(game);
  updateSandboxUI(game);
}

function updateMultiplayerTags(game) {
  const isMP = state.gameMode === 'multiplayer' && state.gameStarted;

  const playerTag = id('mp-player-tag');
  const opponentTag = id('mp-opponent-tag');
  if (!playerTag || !opponentTag) return;

  if (isMP) {
    playerTag.classList.remove('hidden');
    opponentTag.classList.remove('hidden');

    // Names
    const myName = state.userStats?.username || 'You';
    const oppName = state.opponentUsername || 'Opponent';
    setText('mp-player-name', myName);
    setText('mp-opponent-name', oppName);

    // Active-turn glow
    const myTurn = game.currentPlayer === state.playerSide;
    playerTag.classList.toggle('mp-tag-active', myTurn);
    opponentTag.classList.toggle('mp-tag-active', !myTurn);
  } else {
    playerTag.classList.add('hidden');
    opponentTag.classList.add('hidden');
    playerTag.classList.remove('mp-tag-active');
    opponentTag.classList.remove('mp-tag-active');
  }
}

function updatePlaySidebar(game) {
  const playingStandardGame = state.gameStarted
    && (state.gameMode === 'ai' || state.gameMode === 'multiplayer' || state.gameMode === 'challenge');

  const playSidebar = id('play-sidebar');
  if (playSidebar) playSidebar.classList.toggle('hidden', !playingStandardGame);

  const gameLayout = id('game-layout');
  if (gameLayout) gameLayout.classList.toggle('game-layout-playing', playingStandardGame);
  document.body.classList.toggle('game-playing', playingStandardGame);

  const mobilePlayActions = id('mobile-play-actions');
  if (mobilePlayActions) mobilePlayActions.classList.toggle('hidden', !playingStandardGame);

  if (!playingStandardGame) return;

  const playerName = state.userStats?.username || state.currentUser?.displayName || 'You';
  const opponentName = state.gameMode === 'challenge'
    ? (state.challenge?.botName || 'Bounty Bot')
    : state.adventureModeActive
    ? getAdventureBot(state.adventureBotId).name
    : (state.gameMode === 'ai' ? 'Mr.Bot' : (state.opponentUsername || 'Opponent'));

  const panelTitle = state.gameMode === 'challenge'
    ? 'USDC Bot Bounty'
    : (state.gameMode === 'ai' ? 'Play BaghChal' : 'Friend Match');
  setText('play-panel-title', panelTitle);
  setText('play-player-name', playerName);
  setText('play-opponent-name', opponentName);
  setText('play-side-label', state.playerSide === PIECE_TYPES.TIGER ? 'You play as Tiger' : 'You play as Goat');
  setText('play-opponent-side-label', state.playerSide === PIECE_TYPES.TIGER ? 'Opponent plays as Goat' : 'Opponent plays as Tiger');
  setText('bot-profile-copy', state.gameMode === 'challenge'
    ? getChallengeProfileCopy()
    : state.gameMode === 'ai'
    ? getBotProfileCopy()
    : 'Live game against your friend.');

  // Piece images for the mobile player strip
  const playerSrc = state.playerSide === PIECE_TYPES.TIGER ? 'assets/Tiger.png' : 'assets/Goat.png';
  const opponentSrc = state.playerSide === PIECE_TYPES.TIGER ? 'assets/Goat.png' : 'assets/Tiger.png';
  const playerPieceImg = id('play-player-piece-img');
  const opponentPieceImg = id('play-opponent-piece-img');
  if (playerPieceImg) playerPieceImg.src = playerSrc;
  if (opponentPieceImg) opponentPieceImg.src = opponentSrc;

  // Compact stats for mobile strip
  if (state.playerSide === PIECE_TYPES.TIGER) {
    setText('play-player-stat', `cap: ${game.goatsCaptured}`);
    setText('play-opponent-stat', `left: ${20 - game.goatsPlaced}`);
  } else {
    setText('play-player-stat', `left: ${20 - game.goatsPlaced}`);
    setText('play-opponent-stat', `cap: ${game.goatsCaptured}`);
  }

  const isPlayerTurn = game.currentPlayer === state.playerSide;
  id('play-player-card')?.classList.toggle('active', isPlayerTurn);
  id('play-opponent-card')?.classList.toggle('active', !isPlayerTurn);
  id('play-player-indicator')?.classList.toggle('active', isPlayerTurn);
  id('play-opponent-indicator')?.classList.toggle('active', !isPlayerTurn);

  const rated = state.matchRatingType === 'rated';
  id('undo-game-btn')?.toggleAttribute('hidden', state.gameMode !== 'ai' || rated);
  id('restart-left-btn')?.toggleAttribute('hidden', state.gameMode !== 'ai' || rated);
  id('undo-game-btn')?.toggleAttribute(
    'disabled',
    !(state.gameMode === 'ai' && !rated && game.currentPlayer === state.playerSide && state.gameHistory.length > 0)
  );
}

function getChallengeProfileCopy() {
  if (state.challenge?.pendingMoveUi) return 'Verifying your move on the server...';
  const prize = state.challenge?.prizeUsdc ? `${state.challenge.prizeUsdc} USDC` : 'USDC';
  return `Server-verified prize attempt. Win to claim ${prize}.`;
}

function getBotProfileCopy() {
  if (state.adventureModeActive) {
    const bot = getAdventureBot(state.adventureBotId);
    return `${bot.title}. Rated adventure match.`;
  }
  const label = state.matchRatingType === 'rated' ? 'Rated' : 'Unrated';
  return state.aiDifficulty === 'hard'
    ? `${label} hard bot ready for a real fight.`
    : `${label} ${capitalize(state.aiDifficulty)} bot is on the board.`;
}

function updateSandboxUI(game) {
  const tigerReserve = 4 - countPieces(game.board, PIECE_TYPES.TIGER);
  const goatReserve = 20 - countPieces(game.board, PIECE_TYPES.GOAT);

  setText('sandbox-tigers-remaining', String(Math.max(0, tigerReserve)));
  setText('sandbox-goats-remaining', String(Math.max(0, goatReserve)));
  setText('sandbox-tool-label', getSandboxToolLabel());

  const tigerTool = id('sandbox-tool-tiger');
  const goatTool = id('sandbox-tool-goat');
  const eraseTool = id('sandbox-tool-erase');
  const cancelTool = id('sandbox-tool-cancel');
  const goatTurnBtn = id('sandbox-turn-goat');
  const tigerTurnBtn = id('sandbox-turn-tiger');
  const startBtn = id('sandbox-start-btn');

  tigerTool?.classList.toggle('active', state.sandboxTool === 'tiger');
  goatTool?.classList.toggle('active', state.sandboxTool === 'goat');
  eraseTool?.classList.toggle('active', state.sandboxTool === 'erase');
  cancelTool?.classList.toggle('active', state.sandboxTool === null);
  goatTurnBtn?.classList.toggle('active', state.sandboxStarterSide === PIECE_TYPES.GOAT);
  tigerTurnBtn?.classList.toggle('active', state.sandboxStarterSide === PIECE_TYPES.TIGER);
  tigerTool?.toggleAttribute('disabled', tigerReserve <= 0);
  goatTool?.toggleAttribute('disabled', goatReserve <= 0);
  startBtn?.toggleAttribute('disabled', !canStartSandboxMatch(game));
}

function getSandboxToolLabel() {
  const turnLabel = state.sandboxStarterSide === PIECE_TYPES.TIGER ? 'Tiger' : 'Goat';
  if (state.sandboxTool === 'tiger') return 'Placing tigers';
  if (state.sandboxTool === 'goat') return 'Placing goats';
  if (state.sandboxTool === 'erase') return 'Removing pieces';
  return `${turnLabel} to move`;
}

function canStartSandboxMatch(game) {
  const tigerCount = countPieces(game.board, PIECE_TYPES.TIGER);
  const goatCount = countPieces(game.board, PIECE_TYPES.GOAT);
  return tigerCount === 4 && goatCount <= 20;
}

function countPieces(board, pieceType) {
  return board.reduce((count, piece) => count + (piece === pieceType ? 1 : 0), 0);
}

function capitalize(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function setText(elementId, value) {
  const el = id(elementId);
  if (el) el.textContent = value;
}

function setWidth(elementId, width) {
  const el = id(elementId);
  if (el) el.style.width = width;
}
