const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PuzzleSchema = new Schema({
  fen: {
    type: String,
    required: true
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'expert'],
    default: 'beginner'
  },
  objective: {
    type: String,
    required: true
  },
  solution: {
    type: [String],
    required: true
  },
  hint: {
    type: String,
    required: true
  },
  timeLimit: {
    type: Number,
    default: 300  // Default time limit in seconds (5 minutes)
  },
  points: {
    type: Number,
    default: function() {
      // Calculate points based on difficulty
      switch(this.difficulty) {
        case 'beginner': return 1;
        case 'intermediate': return 2;
        case 'advanced': return 3;
        case 'expert': return 5;
        default: return 1;
      }
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Puzzle', PuzzleSchema);