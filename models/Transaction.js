const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tournament: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tournament'
  },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'tournament_entry', 'tournament_funding', 'prize_payout', 'refund'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  reference: {
    type: String,
    required: true,
    unique: true
  },
  paymentMethod: {
    type: String,
    enum: ['paystack', 'wallet', 'bank_transfer', "titan"]
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'disputed', 'refunded'],
    default: 'pending'
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  webhookData: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add index for faster queries
TransactionSchema.index({ reference: 1 });
TransactionSchema.index({ user: 1, createdAt: -1 });
TransactionSchema.index({ status: 1, type: 1 });

// Update lastUpdated timestamp when transaction is modified
TransactionSchema.pre('save', function(next) {
  this.lastUpdated = Date.now();
  next();
});

module.exports = mongoose.model('Transaction', TransactionSchema);