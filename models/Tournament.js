const mongoose = require('mongoose');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const isBetween = require('dayjs/plugin/isBetween');

// Extend dayjs with timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);

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
  manualStatusOverride: {
    type: Boolean,
    default: false
  },
  actualStartTime: {
    type: Date,
    default: null
  },
  actualEndTime: {
    type: Date,
    default: null
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
  },
  fiveMinuteReminderSent: {
    type: Boolean,
    default: false
  }
});

// Virtual field to calculate real-time status
TournamentSchema.virtual('currentStatus').get(function() {
  if (this.manualStatusOverride || this.status === 'cancelled') {
    return this.status;
  }

  const now = dayjs().utc();
  const startDateTime = this.getStartDateTime();
  const endDateTime = this.getEndDateTime();

  if (!startDateTime || !endDateTime) {
    console.warn(`Tournament ${this._id} has invalid date/time data`);
    return this.status;
  }

  const startDayjs = dayjs(startDateTime).utc();
  const endDayjs = dayjs(endDateTime).utc();

  // FIXED: Add detailed logging for debugging
  console.log(`Tournament ${this._id} status calculation:`);
  console.log(`  Current time: ${now.format('YYYY-MM-DD HH:mm:ss')} UTC`);
  console.log(`  Start time: ${startDayjs.format('YYYY-MM-DD HH:mm:ss')} UTC`);
  console.log(`  End time: ${endDayjs.format('YYYY-MM-DD HH:mm:ss')} UTC`);
  console.log(`  Minutes until start: ${startDayjs.diff(now, 'minute', true)}`);
  console.log(`  Minutes until end: ${endDayjs.diff(now, 'minute', true)}`);

  if (now.isBefore(startDayjs)) {
    console.log(`  Status: upcoming (current time is before start)`);
    return 'upcoming';
  } else if (now.isBetween(startDayjs, endDayjs, null, '[]')) {
    console.log(`  Status: active (current time is between start and end)`);
    return 'active';
  } else {
    console.log(`  Status: completed (current time is after end)`);
    return 'completed';
  }
});


// Fixed helper method to combine startDate and startTime
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

    // Get the date part in YYYY-MM-DD format
    const startDate = new Date(this.startDate);
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
    
    // Create date string in YYYY-MM-DD format (use local date, not UTC)
    const year = startDate.getFullYear();
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const day = String(startDate.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    
    console.log(`Tournament ${this._id} - Processing date: ${dateString}, time: ${this.startTime}, timezone: ${this.timezone}`);
    
    // Handle timezone conversion
    if (this.timezone && this.timezone !== 'UTC') {
      try {
        // Create datetime string in user's timezone
        const datetimeString = `${dateString} ${this.startTime}`;
        console.log(`Creating datetime: ${datetimeString} in timezone: ${this.timezone}`);
        
        // Parse in the specified timezone
        const localDateTime = dayjs.tz(datetimeString, this.timezone);
        
        // Check if the datetime is valid
        if (!localDateTime.isValid()) {
          console.error(`Invalid datetime created for tournament ${this._id}: ${datetimeString} in ${this.timezone}`);
          return null;
        }
        
        // Convert to UTC
        const utcDateTime = localDateTime.utc();
        
        console.log(`Tournament ${this._id} conversion:`);
        console.log(`  Input: ${dateString} ${this.startTime} (${this.timezone})`);
        console.log(`  Local: ${localDateTime.format('YYYY-MM-DD HH:mm:ss')} (${this.timezone})`);
        console.log(`  UTC: ${utcDateTime.format('YYYY-MM-DD HH:mm:ss')} (UTC)`);
        
        return utcDateTime.toDate();
      } catch (timezoneError) {
        console.error(`Error handling timezone ${this.timezone} for tournament ${this._id}:`, timezoneError);
        // Fallback to UTC
        const utcDate = new Date(`${dateString}T${this.startTime}:00.000Z`);
        console.log(`Fallback to UTC: ${utcDate.toISOString()}`);
        return utcDate;
      }
    } else {
      // UTC timezone - create UTC date directly
      const utcDate = new Date(`${dateString}T${this.startTime}:00.000Z`);
      console.log(`Tournament ${this._id} - UTC date: ${utcDate.toISOString()}`);
      return utcDate;
    }
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

    const startDayjs = dayjs(startDateTime);
    const endDayjs = startDayjs.add(this.duration, 'millisecond');
    
    return endDayjs.toDate();
  } catch (error) {
    console.error(`Error calculating end date/time for tournament ${this._id}:`, error);
    return null;
  }
};

// Method to get current time in tournament's timezone
TournamentSchema.methods.getCurrentTimeInTournamentTimezone = function() {
  try {
    const now = dayjs().utc();
    if (this.timezone && this.timezone !== 'UTC') {
      return now.tz(this.timezone);
    }
    return now;
  } catch (error) {
    console.error(`Error getting current time in timezone ${this.timezone}:`, error);
    return dayjs().utc();
  }
};

// Method to update status based on current time
TournamentSchema.methods.updateStatusBasedOnTime = function() {
  if (!this.manualStatusOverride && this.status !== 'cancelled') {
    try {
      const calculatedStatus = this.currentStatus;
      const previousStatus = this.status;
      
      console.log(`Tournament ${this._id} status check: ${previousStatus} → ${calculatedStatus}`);
      
      if (this.status !== calculatedStatus) {
        this.status = calculatedStatus;
        
        const now = dayjs().utc().toDate();
        
        if (calculatedStatus === 'active' && previousStatus === 'upcoming' && !this.actualStartTime) {
          this.actualStartTime = now;
          console.log(`Tournament ${this._id} started at ${dayjs(now).format('YYYY-MM-DD HH:mm:ss')} UTC`);
        } else if (calculatedStatus === 'completed' && previousStatus === 'active' && !this.actualEndTime) {
          this.actualEndTime = now;
          console.log(`Tournament ${this._id} ended at ${dayjs(now).format('YYYY-MM-DD HH:mm:ss')} UTC`);
        }
        
        console.log(`Tournament ${this._id} status updated from ${previousStatus} to ${calculatedStatus}`);
        return true;
      } else {
        console.log(`Tournament ${this._id} status remains ${this.status}`);
      }
    } catch (error) {
      console.error(`Error updating status for tournament ${this._id}:`, error);
    }
  }
  return false;
};

// Method to check if tournament is starting within specified minutes
TournamentSchema.methods.isStartingWithinMinutes = function(minutes) {
  try {
    const now = dayjs().utc();
    const startDateTime = this.getStartDateTime();
    
    if (!startDateTime) {
      return false;
    }
    
    const startDayjs = dayjs(startDateTime).utc();
    const timeDiff = startDayjs.diff(now, 'minute', true); // true for floating point
    
    console.log(`Tournament ${this._id} timing check:`);
    console.log(`  Current time: ${now.format('YYYY-MM-DD HH:mm:ss')} UTC`);
    console.log(`  Start time: ${startDayjs.format('YYYY-MM-DD HH:mm:ss')} UTC`);
    console.log(`  Time difference: ${timeDiff} minutes`);
    console.log(`  Checking if starting within ${minutes} minutes: ${timeDiff >= 0 && timeDiff <= minutes}`);
    
    return timeDiff >= 0 && timeDiff <= minutes;
  } catch (error) {
    console.error(`Error checking if tournament ${this._id} is starting within ${minutes} minutes:`, error);
    return false;
  }
};

// Method to get tournament time information
TournamentSchema.methods.getTimeInfo = function() {
  try {
    const startDateTime = this.getStartDateTime();
    const endDateTime = this.getEndDateTime();
    const now = dayjs().utc();
    
    if (!startDateTime || !endDateTime) {
      return null;
    }
    
    const startDayjs = dayjs(startDateTime).utc();
    const endDayjs = dayjs(endDateTime).utc();
    
    return {
      startDateTime: startDayjs.toDate(),
      endDateTime: endDayjs.toDate(),
      startDateTimeFormatted: startDayjs.format('YYYY-MM-DD HH:mm:ss UTC'),
      endDateTimeFormatted: endDayjs.format('YYYY-MM-DD HH:mm:ss UTC'),
      currentTime: now.toDate(),
      currentTimeFormatted: now.format('YYYY-MM-DD HH:mm:ss UTC'),
      minutesUntilStart: startDayjs.diff(now, 'minute', true),
      minutesUntilEnd: endDayjs.diff(now, 'minute', true),
      durationHours: this.duration / (1000 * 60 * 60),
      timezone: this.timezone
    };
  } catch (error) {
    console.error(`Error getting time info for tournament ${this._id}:`, error);
    return null;
  }
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