const mongoose = require('mongoose');

const RewardSchema = new mongoose.Schema({
  streakMilestone: {
    type: Number,
    required: true
  },
  tokenAmount: {
    type: Number,
    required: true
  },
  description: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Reward', RewardSchema);
