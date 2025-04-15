const mongoose = require('mongoose');

const ChessPuzzleSchema = new mongoose.Schema({
  fen: {
    type: String,
    required: [true, 'FEN position is required'],
    trim: true
  },
  solution: {
    type: [String],
    required: [true, 'Solution moves are required']
  },
  difficulty: {
    type: String,
    enum: ['easy', 'intermediate', 'hard'],
    required: [true, 'Difficulty level is required']
  },
  description: {
    type: String,
    trim: true
  },
  hints: {
    type: [String],
    default: []
  },
  tags: {
    type: [String],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ChessPuzzle', ChessPuzzleSchema);
