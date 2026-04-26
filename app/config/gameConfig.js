export const GRID_SIZE = 5;

export const PIECE_TYPES = {
  EMPTY: 0,
  TIGER: 1,
  GOAT: 2
};

export const PHASE = {
  PLACEMENT: 'placement',
  MOVEMENT: 'movement'
};

export const TIME_PER_MOVE = 30;
export const TIME_INCREMENT = 3;

export const AI_CONFIG = {
  easy: {
    depth: 0,
    thinkTime: 300
  },
  hard: {
    tigerPlacementDepth: 1,
    tigerMovementDepth: 2,
    goatPlacementDepth: 2,
    goatMovementDepth: 2,
    thinkTime: 400
  }
};
