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
    default: function() {
      // Set time limit based on difficulty
      switch(this.difficulty) {
        case 'beginner': return 300;     // 5 minutes
        case 'intermediate': return 600; // 10 minutes
        case 'advanced': return 900;     // 15 minutes
        case 'expert': return 1200;      // 20 minutes
        default: return 300;
      }
    }
  },
  points: {
    type: Number,
    default: function() {
      // Calculate points based on difficulty
      switch(this.difficulty) {
        case 'beginner': return 1;
        case 'intermediate': return 3;
        case 'advanced': return 5;
        case 'expert': return 7;
        default: return 1;
      }
    }
  },
  // New fields for automated puzzle system
  createdFor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Not required for manually created puzzles
  },
  dateKey: {
    type: String,
    required: false, // Format: "YYYY-MM-DD"
    index: true // Index for faster queries
  },
  isGenerated: {
    type: Boolean,
    default: false // true for auto-generated puzzles, false for manual ones
  },
  generatedAt: {
    type: Date,
    required: false // When the puzzle was auto-generated
  },
  // Metadata for puzzle generation
  category: {
    type: String,
    enum: ['tactics', 'endgame', 'opening', 'middlegame', 'checkmate'],
    default: 'tactics'
  },
  tags: [{
    type: String // e.g., ['fork', 'pin', 'skewer', 'discovery']
  }],
  rating: {
    type: Number,
    min: 800,
    max: 3000,
    required: false // Puzzle rating/difficulty in ELO-like system
  },
  // Usage statistics for auto-generated puzzles
  timesAttempted: {
    type: Number,
    default: 0
  },
  timesCompleted: {
    type: Number,
    default: 0
  },
  averageCompletionTime: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for efficient daily puzzle queries
PuzzleSchema.index({ createdFor: 1, dateKey: 1 });
PuzzleSchema.index({ isGenerated: 1, createdAt: 1 });
PuzzleSchema.index({ difficulty: 1, category: 1 });

// Pre-save middleware to update timestamps
PuzzleSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Instance method to update puzzle statistics
PuzzleSchema.methods.updateStats = function(completed, completionTime) {
  this.timesAttempted += 1;
  
  if (completed) {
    this.timesCompleted += 1;
    
    // Update average completion time
    const totalTime = this.averageCompletionTime * (this.timesCompleted - 1) + completionTime;
    this.averageCompletionTime = Math.round(totalTime / this.timesCompleted);
  }
  
  return this.save();
};

// Static method to get puzzle success rate
PuzzleSchema.statics.getSuccessRate = function(puzzleId) {
  return this.findById(puzzleId).then(puzzle => {
    if (!puzzle || puzzle.timesAttempted === 0) return 0;
    return Math.round((puzzle.timesCompleted / puzzle.timesAttempted) * 100);
  });
};

// Static method to find puzzles for cleanup
PuzzleSchema.statics.findOldGeneratedPuzzles = function(daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  return this.find({
    isGenerated: true,
    createdAt: { $lt: cutoffDate }
  });
};

// Virtual for puzzle age in days
PuzzleSchema.virtual('ageInDays').get(function() {
  const now = new Date();
  const diffTime = Math.abs(now - this.createdAt);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for success rate
PuzzleSchema.virtual('successRate').get(function() {
  if (this.timesAttempted === 0) return 0;
  return Math.round((this.timesCompleted / this.timesAttempted) * 100);
});

// Ensure virtual fields are serialized
PuzzleSchema.set('toJSON', { virtuals: true });
PuzzleSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Puzzle', PuzzleSchema);