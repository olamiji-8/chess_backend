// Online Users model
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const OnlineUserSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  socketId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['online', 'in_game', 'away'],
    default: 'online'
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
});

// Create a compound index on user to ensure one record per user
OnlineUserSchema.index({ user: 1 }, { unique: true });

module.exports = mongoose.model('OnlineUser', OnlineUserSchema);