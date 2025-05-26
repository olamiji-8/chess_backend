const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const GameSchema = new Schema({
  whitePlayer: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  blackPlayer: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'aborted'],
    default: 'pending'
  },
  winner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  moves: [{
    from: {
      type: String,
      required: true
    },
    to: {
      type: String,
      required: true
    },
    piece: {
      type: String,
      required: true
    },
    captured: {
      type: String,
      default: null
    },
    promotion: {
      type: String,
      default: null
    },
    flags: {
      type: String,
      required: true
    },
    san: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  pgn: {
    type: String,
    default: ''
  },
  fen: {
    type: String,
    default: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' // Initial position
  },
  result: {
    type: String,
    enum: ['1-0', '0-1', '1/2-1/2', '*'],
    default: '*'  // * means game in progress
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastMoveAt: {
    type: Date,
    default: Date.now
  }
});

// Add indexes for better query performance
GameSchema.index({ whitePlayer: 1, status: 1 });
GameSchema.index({ blackPlayer: 1, status: 1 });
GameSchema.index({ status: 1, lastMoveAt: -1 });

module.exports = mongoose.model('Game', GameSchema);