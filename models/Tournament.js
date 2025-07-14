const mongoose = require('mongoose');
const moment = require('moment-timezone');

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
    required: [true, 'Start time is required'],
    validate: {
      validator: function(v) {
        return /^\d{1,2}:\d{2}$/.test(v);
      },
      message: 'Start time must be in HH:MM format'
    }
  },
  timezone: {
    type: String,
    default: 'UTC',
    required: [true, 'Timezone is required']
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
    
    // If timezone is specified and not UTC, we need to handle timezone conversion
    if (this.timezone && this.timezone !== 'UTC') {
      try {
        // Create a moment object in the user's timezone
        const dateString = `${startDate.toISOString().split('T')[0]}T${this.startTime}:00`;
        const userTimezoneMoment = moment.tz(dateString, this.timezone);
        
        // Convert to UTC for storage and comparison
        const utcMoment = userTimezoneMoment.utc();
        
        console.log(`Tournament ${this._id} - User timezone: ${this.timezone}, Local time: ${userTimezoneMoment.format()}, UTC: ${utcMoment.format()}`);
        return utcMoment.toDate();
      } catch (timezoneError) {
        console.error(`Error handling timezone ${this.timezone} for tournament ${this._id}:`, timezoneError);
        // Fallback to simple date creation
        startDate.setHours(hours, minutes, 0, 0);
        return startDate;
      }
    } else {
      // UTC timezone - use simple date creation
      startDate.setHours(hours, minutes, 0, 0);
      return startDate;
    }
  } catch (error) {
    console.error(`Error calculating start date/time for tournament ${this._id}:`, error);
    return null;
  }
};

// Helper method to get timezone offset string
TournamentSchema.methods.getTimezoneOffset = function() {
  // Common timezone offsets (you can expand this)
  const timezoneOffsets = {
    'Africa/Lagos': '+01:00', // WAT
    'Africa/Cairo': '+02:00', // EAT
    'Europe/London': '+00:00', // GMT
    'America/New_York': '-05:00', // EST
    'America/Los_Angeles': '-08:00', // PST
    'Asia/Tokyo': '+09:00', // JST
    'Australia/Sydney': '+10:00', // AEST
    'UTC': '+00:00'
  };
  
  return timezoneOffsets[this.timezone] || '+00:00';
};

// Helper method to convert UTC time back to user's timezone for display
TournamentSchema.methods.getDisplayTime = function() {
  try {
    if (!this.startTime || !this.timezone) {
      return this.startTime;
    }

    // If timezone is UTC, return as-is
    if (this.timezone === 'UTC') {
      return this.startTime;
    }

    // Convert the stored time back to user's timezone
    const startDateTime = this.getStartDateTime();
    if (!startDateTime) {
      return this.startTime;
    }

    // Use moment-timezone to convert UTC to user's timezone
    const utcMoment = moment.utc(startDateTime);
    const userTimezoneMoment = utcMoment.tz(this.timezone);
    
    // Format the time in the user's timezone
    return userTimezoneMoment.format('HH:mm');
  } catch (error) {
    console.error(`Error converting display time for tournament ${this._id}:`, error);
    return this.startTime;
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

// Helper method to get tournament time in user's timezone for display
TournamentSchema.methods.getUserTimezoneTime = function(userTimezone) {
  try {
    if (!this.startTime || !userTimezone) {
      return this.startTime;
    }

    // If timezone is UTC, return as-is
    if (userTimezone === 'UTC') {
      return this.startTime;
    }

    // Get the start date time in UTC
    const startDateTime = this.getStartDateTime();
    if (!startDateTime) {
      return this.startTime;
    }

    // Convert UTC to user's timezone
    const utcMoment = moment.utc(startDateTime);
    const userTimezoneMoment = utcMoment.tz(userTimezone);
    
    // Format the time in the user's timezone
    return userTimezoneMoment.format('HH:mm');
  } catch (error) {
    console.error(`Error converting time to user timezone ${userTimezone} for tournament ${this._id}:`, error);
    return this.startTime;
  }
};

module.exports = mongoose.model('Tournament', TournamentSchema);