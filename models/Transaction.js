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
    enum: ['deposit', 'withdrawal', 'tournament_entry', 'tournament_funding', 'prize_payout'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  reference: {
    type: String
  },
  paymentMethod: {
    type: String,
    enum: ['paystack', 'wallet', 'bank_transfer']
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Transaction', TransactionSchema);