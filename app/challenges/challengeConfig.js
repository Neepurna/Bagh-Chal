import { PIECE_TYPES } from '../config/gameConfig.js';

export const SOLANA_CLUSTER = import.meta.env.VITE_SOLANA_CLUSTER || 'mainnet-beta';
export const SOLANA_EXPLORER_CLUSTER = SOLANA_CLUSTER === 'mainnet-beta' ? '' : `?cluster=${SOLANA_CLUSTER}`;

export const USDC_MINTS = {
  'mainnet-beta': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
};

export const ACTIVE_USDC_MINT = import.meta.env.VITE_USDC_MINT
  || USDC_MINTS[SOLANA_CLUSTER]
  || USDC_MINTS['mainnet-beta'];

export const BOT_BOUNTY_SEASON = import.meta.env.VITE_BOT_BOUNTY_SEASON || 'season-1';
export const BOT_BOUNTY_MAX_CLAIMS = Number(import.meta.env.VITE_BOT_BOUNTY_MAX_CLAIMS || 1);

export const BOT_BOUNTY_CHALLENGES = [
  {
    id: 'defeat-tiger-bot',
    season: BOT_BOUNTY_SEASON,
    title: 'Defeat Tiger Bot',
    subtitle: 'Play Goat against Bhairav Apex and trap every tiger.',
    botId: 'bhairav-apex',
    botName: 'Bhairav Apex',
    botSide: PIECE_TYPES.TIGER,
    botSideLabel: 'Tiger',
    botProfile: 'tiger_apex',
    playerSide: PIECE_TYPES.GOAT,
    playerSideLabel: 'Goat',
    prizeUsdc: Number(import.meta.env.VITE_DEFEAT_TIGER_BOT_PRIZE_USDC || 4),
    maxClaims: BOT_BOUNTY_MAX_CLAIMS
  },
  {
    id: 'defeat-goat-bot',
    season: BOT_BOUNTY_SEASON,
    title: 'Defeat Goat Bot',
    subtitle: 'Play Tiger against Patan Chainmaster and capture five goats.',
    botId: 'patan-chain',
    botName: 'Patan Chainmaster',
    botSide: PIECE_TYPES.GOAT,
    botSideLabel: 'Goat',
    botProfile: 'goat_deep_chain',
    playerSide: PIECE_TYPES.TIGER,
    playerSideLabel: 'Tiger',
    prizeUsdc: Number(import.meta.env.VITE_DEFEAT_GOAT_BOT_PRIZE_USDC || 2),
    maxClaims: BOT_BOUNTY_MAX_CLAIMS
  }
];

export function getChallengeConfig(challengeId) {
  return BOT_BOUNTY_CHALLENGES.find((challenge) => challenge.id === challengeId) || null;
}

export function getExplorerTxUrl(signature) {
  if (!signature) return '';
  return `https://explorer.solana.com/tx/${signature}${SOLANA_EXPLORER_CLUSTER}`;
}
