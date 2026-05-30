import { playSound } from '../audio/audioSystem.js';
import { PIECE_TYPES } from '../config/gameConfig.js';
import { state } from '../state/store.js';
import {
  claimChallengeReward,
  connectAndLinkWallet,
  isChallengeBackendConfigured,
  loadBotChallenges,
  loadLinkedWallet,
  startChallengeAttempt,
  submitChallengeResult
} from '../challenges/challengeService.js';
import { getExplorerTxUrl } from '../challenges/challengeConfig.js';
import { hideOverlay, id, on, showOverlay } from './dom.js';

let startChallengeGame = () => {};
let cachedChallenges = [];
let linkedWallet = null;

export function configureBotBountyUI({ startChallengeGame: startGame }) {
  if (typeof startGame === 'function') startChallengeGame = startGame;
}

export function initBotBountyUI() {
  on('bot-bounty-refresh-btn', 'click', () => refreshBotBountyUI());
  on('bot-bounty-wallet-btn', 'click', linkWalletFromUI);
  on('claim-reward-btn', 'click', claimRewardFromWinnerOverlay);
  refreshBotBountyUI();
}

export async function refreshBotBountyUI() {
  const status = id('bot-bounty-status');
  if (status) status.textContent = 'Loading bounty challenges...';

  const [challenges, wallet] = await Promise.all([
    loadBotChallenges(),
    state.currentUser ? loadLinkedWallet() : Promise.resolve(null)
  ]);
  cachedChallenges = challenges;
  linkedWallet = wallet;

  renderWalletState();
  renderChallengeCards();

  if (status) {
    if (!isChallengeBackendConfigured()) {
      status.textContent = 'Supabase is not configured, so bounty claims are disabled in this environment.';
    } else if (!state.currentUser) {
      status.textContent = 'Sign in to link Phantom and start prize-eligible attempts.';
    } else {
      status.textContent = wallet?.wallet_address
        ? `Linked payout wallet: ${shortWallet(wallet.wallet_address)}`
        : 'Link Phantom before starting a prize attempt.';
    }
  }
}

function renderWalletState() {
  const walletText = id('bot-bounty-wallet-text');
  const walletButton = id('bot-bounty-wallet-btn');
  if (!walletText || !walletButton) return;

  if (!state.currentUser) {
    walletText.textContent = 'Sign in required';
    walletButton.textContent = 'Sign In First';
    walletButton.disabled = false;
    return;
  }

  if (linkedWallet?.wallet_address) {
    walletText.textContent = shortWallet(linkedWallet.wallet_address);
    walletButton.textContent = 'Relink Wallet';
  } else {
    walletText.textContent = 'No wallet linked';
    walletButton.textContent = 'Link Phantom';
  }
  walletButton.disabled = !isChallengeBackendConfigured();
}

function renderChallengeCards() {
  const grid = id('bot-bounty-grid');
  if (!grid) return;

  grid.innerHTML = cachedChallenges.map((challenge) => {
    const claimsPaid = challenge.claimsPaid ?? 0;
    const claimsLeft = Math.max(0, (challenge.maxClaims || 0) - claimsPaid);
    const disabled = !state.currentUser || !isChallengeBackendConfigured() || claimsLeft <= 0;
    const buttonLabel = claimsLeft <= 0 ? 'Prize Claimed' : 'Start Challenge';
    const prizeState = claimsLeft <= 0 ? 'Prize claimed' : 'Prize available';
    const pieceSrc = challenge.botSide === PIECE_TYPES.TIGER ? 'assets/Tiger.png' : 'assets/Goat.png';
    return `
      <article class="bot-bounty-card">
        <div class="bot-bounty-card-media">
          <img src="${pieceSrc}" alt="${challenge.botSideLabel} bot">
        </div>
        <div class="bot-bounty-card-copy">
          <span class="bot-bounty-label">${challenge.prizeUsdc} USDC reward</span>
          <h3>${escapeHtml(challenge.title)}</h3>
          <p>${escapeHtml(challenge.subtitle || '')}</p>
          <div class="bot-bounty-meta">
            <span>You play ${challenge.playerSideLabel}</span>
            <span>${prizeState}</span>
          </div>
        </div>
        <button class="bot-bounty-start-btn" type="button" data-challenge-id="${challenge.id}" ${disabled ? 'disabled' : ''}>${buttonLabel}</button>
      </article>
    `;
  }).join('');

  grid.querySelectorAll('.bot-bounty-start-btn').forEach((button) => {
    button.addEventListener('click', () => startChallengeFromUI(button.dataset.challengeId));
  });
}

async function linkWalletFromUI() {
  if (!state.currentUser) {
    showOverlay('signup-overlay');
    return;
  }

  setStatus('Opening Phantom...');
  try {
    const result = await connectAndLinkWallet();
    if (!result.ok) {
      setStatus(result.installUrl ? `${result.error} Install Phantom to continue.` : result.error);
      return;
    }
    playSound('buttonClick');
    setStatus(`Linked payout wallet: ${shortWallet(result.walletAddress)}`);
    await refreshBotBountyUI();
  } catch (err) {
    setStatus(err.message || 'Wallet link failed.');
  }
}

async function startChallengeFromUI(challengeId) {
  if (!state.currentUser) {
    showOverlay('signup-overlay');
    return;
  }

  if (!linkedWallet?.wallet_address) {
    await linkWalletFromUI();
    if (!linkedWallet?.wallet_address) return;
  }

  setStatus('Starting server-verified attempt...');
  const result = await startChallengeAttempt(challengeId);
  if (!result.ok) {
    setStatus(result.error);
    return;
  }

  hideOverlay('player-select-overlay');
  startChallengeGame(result.data);
  playSound('buttonClick');
}

async function claimRewardFromWinnerOverlay() {
  if (state.gameMode !== 'challenge' || !state.challenge?.claimEligible) return;
  const button = id('claim-reward-btn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Preparing Claim...';
  }

  const submitted = await submitChallengeResult(state.challenge.attemptId);
  if (!submitted.ok) {
    updateClaimButton(`Claim Failed: ${submitted.error}`, false);
    return;
  }

  state.challenge.claimId = submitted.data.claim?.id || submitted.data.claim_id || state.challenge.claimId;
  const claimed = await claimChallengeReward(state.challenge.claimId);
  if (!claimed.ok) {
    updateClaimButton(`Claim Pending: ${claimed.error}`, false);
    return;
  }

  const txSignature = claimed.data.tx_signature || claimed.data.claim?.tx_signature;
  state.challenge.claimTxSignature = txSignature || null;
  if (txSignature) {
    updateClaimButton('Reward Sent', true, getExplorerTxUrl(txSignature));
  } else if (claimed.data.status === 'pending_chain' || claimed.data.status === 'approved') {
    updateClaimButton(
      claimed.data.status === 'approved'
        ? 'Claim Approved (Local Test)'
        : 'Claim Pending On-Chain',
      true
    );
    setStatus(claimed.data.message || 'Local claim approved. USDC transfer is disabled in this test environment.');
  } else {
    updateClaimButton('Claim Approved', true);
  }
}

function updateClaimButton(label, done, href = '') {
  const button = id('claim-reward-btn');
  const link = id('claim-reward-link');
  if (button) {
    button.disabled = !!done;
    button.textContent = label;
  }
  if (link) {
    link.hidden = !href;
    link.href = href || '#';
  }
}

function setStatus(message) {
  const status = id('bot-bounty-status');
  if (status) status.textContent = message;
}

function shortWallet(wallet) {
  if (!wallet) return '';
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
