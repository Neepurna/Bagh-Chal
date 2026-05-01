// End-of-game overlay: chooses copy based on whether the local player won,
// shows the winner image, and schedules a 1-second board reset behind the
// overlay so the next match starts from a clean state.

import { playSound } from '../audio/audioSystem.js';
import { PIECE_TYPES } from '../config/gameConfig.js';
import { id } from './dom.js';
import { state } from '../state/store.js';

export function buildWinnerPresentation(message, winner) {
  // Draw by repetition (cantonment movement — the paper confirms optimal play leads to draw)
  if (winner === 'draw') {
    return {
      title: 'Draw!',
      kicker: 'Balanced Battle',
      subtext: 'The position repeated three times. With optimal play, Baghchal is a draw.'
    };
  }

  const playerWon = (winner === 'tiger' && state.playerSide === PIECE_TYPES.TIGER)
                    || (winner === 'goat' && state.playerSide === PIECE_TYPES.GOAT);
  const winnerLabel = winner === 'tiger' ? 'Tiger' : 'Goat';

  if (state.gameMode === 'multiplayer') {
    if (playerWon) {
      return {
        title: 'Victory!',
        kicker: winner === 'tiger' ? 'Predator Prevails' : 'The Herd Holds',
        subtext: winner === 'tiger'
          ? 'A sharp finishing sequence let the tiger seize the final advantage.'
          : 'Disciplined positioning closed every escape and sealed the board for the goats.'
      };
    }
    return {
      title: 'You Lose!',
      kicker: 'Defeated',
      subtext: winner === 'tiger'
        ? 'Tiger found the decisive breakthrough and closed the match cleanly.'
        : 'Goat controlled the board patiently and converted the endgame without error.'
    };
  }

  if (state.gameMode === 'ai') {
    if (playerWon) {
      return {
        title: `${winnerLabel} Won!`,
        kicker: winner === 'tiger' ? 'Predator Prevails' : 'The Herd Holds',
        subtext: winner === 'tiger'
          ? 'A sharp finishing sequence let the tiger seize the final advantage.'
          : 'Disciplined positioning closed every escape and sealed the board for the goats.'
      };
    }
    return {
      title: winner === 'tiger' ? 'Tiger Won' : 'Goat Won',
      kicker: 'Match Lost',
      subtext: winner === 'tiger'
        ? 'Tiger found the decisive breakthrough and closed the match cleanly.'
        : 'Goat controlled the board patiently and converted the endgame without error.'
    };
  }

  return {
    title: message || `${winnerLabel} won the match.`,
    kicker: winner === 'tiger' ? 'Predator Prevails' : 'The Herd Holds',
    subtext: winner === 'tiger'
      ? 'A sharp finishing sequence let the tiger seize the final advantage.'
      : 'Disciplined positioning closed every escape and sealed the board for the goats.'
  };
}

/**
 * Render the winner overlay. Plays the winning sound and reveals the panel.
 * Note: this module does not handle stat updates or board reset — the game
 * controller sequences those around this call.
 */
export function showWinnerOverlay(message, winner) {
  playSound('winning');

  const overlay = id('winner-overlay');
  if (!overlay) return;
  const winnerIcon = id('winner-icon');
  const winnerText = id('winner-text');
  const winnerKicker = id('winner-kicker');
  const winnerSubtext = id('winner-subtext');
  const presentation = buildWinnerPresentation(message, winner);

  overlay.dataset.winner = winner;
  if (winnerIcon) {
    if (winner === 'tiger') {
      winnerIcon.innerHTML = '<img src="assets/bagh.png" class="winner-logo">';
    } else if (winner === 'goat') {
      winnerIcon.innerHTML = '<img src="assets/bhakhra.png" class="winner-logo-single">';
    } else {
      // Draw: no icons needed
      winnerIcon.innerHTML = '';
    }
  }
  if (winnerKicker) winnerKicker.textContent = presentation.kicker;
  if (winnerSubtext) winnerSubtext.textContent = presentation.subtext;
  if (winnerText) winnerText.textContent = presentation.title;
  overlay.classList.add('show');
}

export function hideWinnerOverlay() {
  const overlay = id('winner-overlay');
  if (overlay) overlay.classList.remove('show');
}
