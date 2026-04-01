import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import { BaghchalAI, DIFFICULTY, PIECE_TYPES } from './BaghchalAI.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    uptime: process.uptime(),
    environment: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// AI Move API endpoint
app.post('/api/get-move', (req, res) => {
  try {
    const { gameState, difficulty = 'medium', aiSide } = req.body;

    // Validate input
    if (!gameState || !gameState.board) {
      return res.status(400).json({ 
        error: 'Invalid game state',
        details: 'gameState.board is required'
      });
    }

    if (!aiSide || (aiSide !== PIECE_TYPES.TIGER && aiSide !== PIECE_TYPES.GOAT)) {
      return res.status(400).json({ 
        error: 'Invalid aiSide',
        details: 'aiSide must be TIGER (1) or GOAT (2)'
      });
    }

    // Validate difficulty
    if (!Object.values(DIFFICULTY).includes(difficulty)) {
      return res.status(400).json({ 
        error: 'Invalid difficulty',
        details: `difficulty must be one of: ${Object.values(DIFFICULTY).join(', ')}`
      });
    }

    console.log(`\n=== AI Move Request ===`);
    console.log(`Difficulty: ${difficulty}`);
    console.log(`AI Side: ${aiSide === PIECE_TYPES.TIGER ? 'TIGER' : 'GOAT'}`);
    console.log(`Phase: ${gameState.phase}`);
    console.log(`Goats Placed: ${gameState.goatsPlaced}, Captured: ${gameState.goatsCaptured}`);

    const moveStart = Date.now();

    // Create fresh AI instance (fresh per request - no memory pollution)
    const ai = new BaghchalAI(difficulty);
    const move = ai.getBestMove(gameState, aiSide);

    const moveTime = Date.now() - moveStart;

    if (!move) {
      return res.status(400).json({ 
        error: 'No valid move found',
        gameState: gameState
      });
    }

    console.log(`Move calculated in: ${moveTime}ms`);
    console.log(`Move: ${JSON.stringify(move)}`);
    console.log(`=== AI Move Complete ===\n`);

    // Return response with metadata
    res.json({
      success: true,
      move: move,
      thinkTime: moveTime,
      difficulty: difficulty,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in /api/get-move:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      stack: NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get AI stats endpoint (for monitoring)
app.post('/api/ai-stats', (req, res) => {
  try {
    const { gameState, difficulty } = req.body;
    
    const ai = new BaghchalAI(difficulty);
    
    res.json({
      difficulty: difficulty,
      simulationCount: ai.simulationCount,
      searchDepth: ai.searchDepth,
      timeBudget: ai.timeBudget,
      phase: gameState.phase,
      boardComplexity: gameState.board.filter(p => p !== 0).length
    });
  } catch (error) {
    console.error('Error in /api/ai-stats:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Test batch moves endpoint (for performance testing)
app.post('/api/batch-moves', (req, res) => {
  try {
    const { moves, difficulty = 'medium' } = req.body;

    if (!Array.isArray(moves)) {
      return res.status(400).json({ error: 'moves must be an array' });
    }

    const startTime = Date.now();
    const results = [];

    for (const moveRequest of moves) {
      const { gameState, aiSide } = moveRequest;
      try {
        const ai = new BaghchalAI(difficulty);
        const move = ai.getBestMove(gameState, aiSide);
        results.push({ success: true, move });
      } catch (err) {
        results.push({ success: false, error: err.message });
      }
    }

    const totalTime = Date.now() - startTime;

    res.json({
      success: true,
      processedMoves: results.length,
      totalTime: totalTime,
      averageTimePerMove: Math.round(totalTime / results.length),
      results: results
    });

  } catch (error) {
    console.error('Error in /api/batch-moves:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    stack: NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🎮 Bagh Chal AI Backend Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Port: ${PORT}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`\n✅ Server running at http://localhost:${PORT}`);
  console.log(`📋 Health Check: http://localhost:${PORT}/health`);
  console.log(`🤖 API Endpoint: POST http://localhost:${PORT}/api/get-move\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  process.exit(0);
});

export default app;
