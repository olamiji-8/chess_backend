const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PuzzleUserSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  points: {
    type: Number,
    default: 0
  },
  streak: {
    type: Number,
    default: 0
  },
  lastStreakUpdate: {
    type: Date,
    default: null
  },
  lastPuzzleDate: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  playedGames: {
    type: Number,
    default: 0
  },
  wonGames: {
    type: Number,
    default: 0
  }
});

// Method to check if user can play puzzle today
PuzzleUserSchema.methods.canPlayPuzzleToday = function() {
  if (!this.lastPuzzleDate) return true;
  
  const lastPuzzle = new Date(this.lastPuzzleDate);
  const now = new Date();
  
  // Check if the last puzzle was played more than 24 hours ago
  const hoursDiff = (now - lastPuzzle) / (1000 * 60 * 60);
  return hoursDiff >= 24;
};

// Method to update user streak
PuzzleUserSchema.methods.updateStreak = function() {
  const now = new Date();
  
  // If no previous streak or it was updated more than 48 hours ago, reset streak
  if (!this.lastStreakUpdate || 
      (now - new Date(this.lastStreakUpdate)) / (1000 * 60 * 60) > 48) {
    this.streak = 1;
  } else {
    // If last streak update was within 24-48 hours, increment streak
    if ((now - new Date(this.lastStreakUpdate)) / (1000 * 60 * 60) >= 24) {
      this.streak += 1;
    }
    // If less than 24 hours, the streak remains the same (already played today)
  }
  
  this.lastStreakUpdate = now;
  return this.streak;
};

// Using a different model name to avoid conflicts
module.exports = mongoose.model('PuzzleUser', PuzzleUserSchema);