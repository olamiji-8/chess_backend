// PuzzleAttempt model
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PuzzleAttemptSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  puzzle: {
    type: Schema.Types.ObjectId,
    ref: 'Puzzle',
    required: true
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  },
  moves: [{
    move: String,
    timestamp: Date
  }],
  usedHint: {
    type: Boolean,
    default: false
  },
  completed: {
    type: Boolean,
    default: false
  },
  successful: {
    type: Boolean,
    default: false
  },
  pointsEarned: {
    type: Number,
    default: 0
  },
  timeSpent: {
    type: Number,  // Time spent in seconds
    default: 0
  }
});

module.exports = mongoose.model('PuzzleAttempt', PuzzleAttemptSchema);