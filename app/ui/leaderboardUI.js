import { playSound } from '../audio/audioSystem.js';
import { loadLeaderboard } from '../game/ratingService.js';
import { id, on, showOverlay, hideOverlay } from './dom.js';

export function initLeaderboardUI() {
  on('profile-leaderboard-btn', 'click', async () => {
    id('profile-dropdown')?.classList.remove('show');
    showOverlay('leaderboard-overlay');
    playSound('buttonClick');
    await renderLeaderboard();
  });
  on('leaderboard-close', 'click', () => hideOverlay('leaderboard-overlay'));
}

async function renderLeaderboard() {
  const list = id('leaderboard-list');
  if (!list) return;
  list.innerHTML = '<p class="friends-empty">Loading leaderboard...</p>';

  const rows = await loadLeaderboard(10);
  if (!rows.length) {
    list.innerHTML = '<p class="friends-empty">Leaderboard will appear after the first Supabase sync.</p>';
    return;
  }

  list.innerHTML = rows.map((row, index) => `
    <div class="leaderboard-row">
      <span class="leaderboard-rank">${index + 1}</span>
      <span class="leaderboard-name">${escapeHtml(row.display_name || 'Player')}</span>
      <span class="leaderboard-score">${row.leaderboard_score || row.rating || 500}</span>
      <span class="leaderboard-meta">R ${row.rating || 500} · G ${row.games_played || 0} · A ${row.adventure_completed || 0}/6</span>
    </div>
  `).join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
