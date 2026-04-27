# Dataset Documentation

This project includes support for generating Bagh Chal training/self-play datasets.

## Purpose

Datasets can be used for:

- offline analysis
- balancing heuristics
- testing move quality
- future ML or training experiments

## High-level format

Each dataset contains:

- metadata
- game results
- per-position records

Typical fields:

```json
{
  "metadata": {
    "generatedAt": "timestamp",
    "totalGames": 0,
    "totalPositions": 0
  },
  "games": [
    {
      "winner": "tiger",
      "totalMoves": 0,
      "positions": []
    }
  ]
}
```

## Position data

A position record typically stores:

- board state
- current player
- phase
- goats placed
- goats captured
- selected/best move
- optional evaluation data

## Related files

- `app/ai/DatasetGenerator.js`
- `src/DatasetGenerator.js`

## Notes

- Dataset generation is a support tool, not part of normal gameplay.
- The production MVP does not depend on datasets to run the AI.
