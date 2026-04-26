import { BaghchalAI } from './app/ai/BaghchalAI.js';

self.onmessage = function(event) {
  const { board, phase, goatsPlaced, goatsCaptured, aiSide, difficulty } = event.data;

  try {
    const gameState = {
      board,
      phase,
      goatsPlaced,
      goatsCaptured,
      currentPlayer: aiSide
    };

    const startTime = Date.now();
    const ai = new BaghchalAI(difficulty);
    const bestMove = ai.getBestMove(gameState, aiSide);
    const timeSpent = Date.now() - startTime;

    self.postMessage({
      success: true,
      move: bestMove,
      stats: {
        timeSpent,
        difficulty
      }
    });
  } catch (error) {
    self.postMessage({
      success: false,
      error: error.message
    });
  }
};
