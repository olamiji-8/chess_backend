const mongoose = require('mongoose');

const TournamentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Tournament title is required'],
    trim: true
  },
  category: {
    type: String,
    enum: ['bullet', 'blitz', 'rapid', 'classical'],
    required: [true, 'Tournament category is required']
  },
  banner: {
    type: String, // URL to the uploaded image
    required: [true, 'Tournament banner is required']
  },
  rules: {
    type: String,
    required: [true, 'Tournament rules are required']
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required']
  },
  duration: {
    type: Number, // In milliseconds
    required: [true, 'Tournament duration is required']
  },
  prizeType: {
    type: String,
    enum: ['fixed', 'percentage', 'special'],
    required: [true, 'Prize type is required']
  },
  prizes: {
    fixed: {
      first: { type: Number },
      second: { type: Number },
      third: { type: Number },
      fourth: { type: Number },
      fifth: { type: Number },
      additional: [{ position: Number, amount: Number }]
    },
    percentage: {
      basePrizePool: { type: Number },
      first: { type: Number }, // Percentage
      second: { type: Number }, 
      third: { type: Number },
      fourth: { type: Number },
      fifth: { type: Number },
      additional: [{ position: Number, percentage: Number }]
    },
    special: {
      isFixed: { type: Boolean, default: true },
      basePrizePool: { type: Number }, // Only used if isFixed is false
      specialPrizes: [{
        category: String, // e.g., "Best under 2200"
        amount: Number, // Fixed amount or percentage depending on isFixed
        isPercentage: { type: Boolean, default: false }
      }]
    }
  },
  entryFee: {
    type: Number,
    default: 0
  },
  fundingMethod: {
    type: String,
    enum: ['wallet', 'direct', 'topup'],
    required: [true, 'Funding method is required']
  },
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  status: {
    type: String,
    enum: ['upcoming', 'active', 'completed', 'cancelled'],
    default: 'upcoming'
  },
  tournamentLink: {
    type: String,
    required: true
  },
  password: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Tournament', TournamentSchema);