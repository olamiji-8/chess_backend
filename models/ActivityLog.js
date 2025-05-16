const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Player Management', 'Tournament Management', 'Verification', 'Withdrawal', 'System'],
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  adminUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  action: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'verified', 'declined', 'approved', 'rejected', 'completed', 'failed', 'cancelled'],
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
ActivityLogSchema.index({ type: 1, createdAt: -1 });
ActivityLogSchema.index({ user: 1 });
ActivityLogSchema.index({ adminUser: 1 });
ActivityLogSchema.index({ status: 1 });

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);