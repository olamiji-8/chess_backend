const mongoose = require('mongoose');

const UserPuzzleProgressSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  currentStreak: {
    type: Number,
    default: 0
  },
  bestStreak: {
    type: Number,
    default: 0
  },
  lastSolvedDate: {
    type: Date
  },
  puzzlesAttempted: {
    type: Number,
    default: 0
  },
  puzzlesSolved: {
    type: Number,
    default: 0
  },
  easyPuzzlesSolved: {
    type: Number,
    default: 0
  },
  intermediatePuzzlesSolved: {
    type: Number,
    default: 0
  },
  hardPuzzlesSolved: {
    type: Number,
    default: 0
  },
  tokens: {
    type: Number,
    default: 0
  },
  lastPuzzle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChessPuzzle'
  },
  puzzleHistory: [{
    puzzle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChessPuzzle'
    },
    solved: {
      type: Boolean,
      default: false
    },
    attempts: {
      type: Number,
      default: 0
    },
    hintsUsed: {
      type: Boolean,
      default: false
    },
    date: {
      type: Date,
      default: Date.now
    }
  }]
});

// Index for faster queries
UserPuzzleProgressSchema.index({ user: 1 });

module.exports = mongoose.model('UserPuzzleProgress', UserPuzzleProgressSchema);
