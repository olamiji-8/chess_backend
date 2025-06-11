const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: [
      'welcome',                    // 🔥 ADDED: Welcome notification type
      'tournament_created',
      'tournament_registration',
      'tournament_reminder',
      'tournament_result',
      'transaction_success',
      'transaction_failed',
      'account_verification',
      'wallet_update',
      'system_message'
    ],
    required: true
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedModel'
  },
  relatedModel: {
    type: String,
    enum: ['Tournament', 'Transaction', 'User', 'VerificationRequest', null]
  },
  isRead: {
    type: Boolean,
    default: false
  },
  emailSent: {
    type: Boolean,
    default: false
  },
  pushSent: {
    type: Boolean,
    default: false
  },
  emailError: {
    type: String,
    default: null
  },
  pushError: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
NotificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);