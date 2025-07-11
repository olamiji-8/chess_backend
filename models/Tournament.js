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
  timezone: {
  type: String,
  default: 'UTC'
},
originalStartDateTime: {
  type: String // Store original input for reference
},
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required'],
    validate: {
      validator: function(v) {
        return /^\d{1,2}:\d{2}$/.test(v);
      },
      message: 'Start time must be in HH:MM format'
    }
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

  // Handle case where startDateTime is null
  if (!startDateTime || !endDateTime) {
    console.warn(`Tournament ${this._id} has invalid date/time data`);
    return this.status; // Return current status as fallback
  }

  if (now < startDateTime) {
    return 'upcoming';
  } else if (now >= startDateTime && now <= endDateTime) {
    return 'active';
  } else {
    return 'completed';
  }
});

// Helper method to combine startDate and startTime with proper error handling
TournamentSchema.methods.getStartDateTime = function() {
  try {
    // Validate inputs
    if (!this.startDate) {
      console.error(`Tournament ${this._id} has no startDate`);
      return null;
    }

    if (!this.startTime || typeof this.startTime !== 'string') {
      console.error(`Tournament ${this._id} has invalid startTime:`, this.startTime);
      return null;
    }

    // Validate startTime format
    if (!/^\d{1,2}:\d{2}$/.test(this.startTime)) {
      console.error(`Tournament ${this._id} has malformed startTime:`, this.startTime);
      return null;
    }

    const startDate = new Date(this.startDate);
    
    // Check if startDate is valid
    if (isNaN(startDate.getTime())) {
      console.error(`Tournament ${this._id} has invalid startDate:`, this.startDate);
      return null;
    }

    const [hours, minutes] = this.startTime.split(':').map(Number);
    
    // Validate parsed time values
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      console.error(`Tournament ${this._id} has invalid time values - hours: ${hours}, minutes: ${minutes}`);
      return null;
    }
    
    startDate.setHours(hours, minutes, 0, 0);
    return startDate;
  } catch (error) {
    console.error(`Error calculating start date/time for tournament ${this._id}:`, error);
    return null;
  }
};

// Helper method to calculate end time with error handling
TournamentSchema.methods.getEndDateTime = function() {
  try {
    const startDateTime = this.getStartDateTime();
    
    if (!startDateTime) {
      return null;
    }

    if (!this.duration || typeof this.duration !== 'number' || this.duration <= 0) {
      console.error(`Tournament ${this._id} has invalid duration:`, this.duration);
      return null;
    }

    return new Date(startDateTime.getTime() + this.duration);
  } catch (error) {
    console.error(`Error calculating end date/time for tournament ${this._id}:`, error);
    return null;
  }
};

// Method to update status based on current time
TournamentSchema.methods.updateStatusBasedOnTime = function() {
  if (!this.manualStatusOverride && this.status !== 'cancelled') {
    try {
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
    } catch (error) {
      console.error(`Error updating status for tournament ${this._id}:`, error);
    }
  }
  return false; // No update needed
};

// Pre-save hook to update status automatically
TournamentSchema.pre('save', function(next) {
  try {
    this.updateStatusBasedOnTime();
    next();
  } catch (error) {
    console.error(`Error in pre-save hook for tournament ${this._id}:`, error);
    next(error);
  }
});

// Ensure virtual fields are included in JSON output
TournamentSchema.set('toJSON', { virtuals: true });
TournamentSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Tournament', TournamentSchema);