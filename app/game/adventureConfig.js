export const ADVENTURE_BOTS = [
  {
    id: 'simal-edge',
    name: 'Simal Edgeguard',
    side: 'goat',
    difficulty: 'medium',
    profile: 'goat_edge_guard',
    title: 'Border formation specialist',
    unlockLevel: 0
  },
  {
    id: 'kali-fang',
    name: 'Kali Fang',
    side: 'tiger',
    difficulty: 'medium',
    profile: 'tiger_fork_hunter',
    title: 'Fork pressure hunter',
    unlockLevel: 1
  },
  {
    id: 'seti-wall',
    name: 'Seti Wall',
    side: 'goat',
    difficulty: 'hard',
    profile: 'goat_cantonment',
    title: 'Cantonment defender',
    unlockLevel: 2
  },
  {
    id: 'rato-stalker',
    name: 'Rato Stalker',
    side: 'tiger',
    difficulty: 'hard',
    profile: 'tiger_center_predator',
    title: 'Center-control attacker',
    unlockLevel: 3
  },
  {
    id: 'patan-chain',
    name: 'Patan Chainmaster',
    side: 'goat',
    difficulty: 'hard',
    profile: 'goat_deep_chain',
    title: 'Deep-chain trap builder',
    unlockLevel: 4
  },
  {
    id: 'bhairav-apex',
    name: 'Bhairav Apex',
    side: 'tiger',
    difficulty: 'hard',
    profile: 'tiger_apex',
    title: 'Apex MCTS finisher',
    unlockLevel: 5
  }
];

export function getAdventureBot(botId) {
  return ADVENTURE_BOTS.find((bot) => bot.id === botId) || ADVENTURE_BOTS[0];
}

export function getUnlockedAdventureBots(level = 0) {
  return ADVENTURE_BOTS.filter((bot) => bot.unlockLevel <= level);
}

export function isFinalAdventureBot(botId) {
  const bot = getAdventureBot(botId);
  return bot.unlockLevel >= ADVENTURE_BOTS.length - 1;
}
