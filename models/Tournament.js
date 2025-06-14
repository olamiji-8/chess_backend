
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
    type: String,
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
      '1st': { type: Number, default: 0 },
      '2nd': { type: Number, default: 0 },
      '3rd': { type: Number, default: 0 },
      '4th': { type: Number, default: 0 },
      '5th': { type: Number, default: 0 },
      additional: [{ position: Number, amount: Number }]
    },
    percentage: {
      basePrizePool: { type: Number },
      '1st': { type: Number, default: 0 },
      '2nd': { type: Number, default: 0 },
      '3rd': { type: Number, default: 0 },
      '4th': { type: Number, default: 0 },
      '5th': { type: Number, default: 0 },
      additional: [{ position: Number, percentage: Number }]
    },
    special: {
      isFixed: { type: Boolean, default: true },
      basePrizePool: { type: Number },
      specialPrizes: [{
        category: String,
        amount: Number,
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
  // Add these new fields for better status management
  manualStatusOverride: {
    type: Boolean,
    default: false // When true, prevents automatic status updates
  },
  actualStartTime: {
    type: Date,
    default: null // Track when tournament actually started
  },
  actualEndTime: {
    type: Date,
    default: null // Track when tournament actually ended
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

// Virtual field to calculate real-time status
TournamentSchema.virtual('currentStatus').get(function() {
  if (this.manualStatusOverride || this.status === 'cancelled') {
    return this.status;
  }

  const now = new Date();
  const startDateTime = this.getStartDateTime();
  const endDateTime = this.getEndDateTime();

  if (now < startDateTime) {
    return 'upcoming';
  } else if (now >= startDateTime && now <= endDateTime) {
    return 'active';
  } else {
    return 'completed';
  }
});

// Helper method to combine startDate and startTime
TournamentSchema.methods.getStartDateTime = function() {
  const startDate = new Date(this.startDate);
  const [hours, minutes] = this.startTime.split(':').map(Number);
  
  startDate.setHours(hours, minutes, 0, 0);
  return startDate;
};

// Helper method to calculate end time
TournamentSchema.methods.getEndDateTime = function() {
  const startDateTime = this.getStartDateTime();
  return new Date(startDateTime.getTime() + this.duration);
};

// Method to update status based on current time
TournamentSchema.methods.updateStatusBasedOnTime = function() {
  if (!this.manualStatusOverride && this.status !== 'cancelled') {
    const calculatedStatus = this.currentStatus;
    
    if (this.status !== calculatedStatus) {
      this.status = calculatedStatus;
      
      // Track actual start/end times
      if (calculatedStatus === 'active' && !this.actualStartTime) {
        this.actualStartTime = new Date();
      } else if (calculatedStatus === 'completed' && !this.actualEndTime) {
        this.actualEndTime = new Date();
      }
      
      return true; // Status was updated
    }
  }
  return false; // No update needed
};

// Pre-save hook to update status automatically
TournamentSchema.pre('save', function(next) {
  this.updateStatusBasedOnTime();
  next();
});

// Ensure virtual fields are included in JSON output
TournamentSchema.set('toJSON', { virtuals: true });
TournamentSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Tournament', TournamentSchema);