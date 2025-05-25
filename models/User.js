const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false
  },
  profilePic: {
    type: String,
    default: 'https://res.cloudinary.com/dxd1j0yzt/image/upload/v1743781047/IMG-20250404-WA0131_tvlbpz.jpg',
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  lichessUsername: {
    type: String,
    trim: true,
    sparse: true, 
    index: true
  },
  lichessAccessToken: {
    type: String,
    select: false // hide in queries unless needed
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  hasPin: {
    type: Boolean,
    default: false
  },  
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  walletBalance: {
    type: Number,
    default: 0
  },
  pin: {
    type: String,
    select: false 
  },
  bankDetails: {
    accountNumber: String,
    accountName: String,
    bankCode: String,
    bankName: String
  },
  bankVerification: {
    code: String,
    createdAt: Date,
    verified: Boolean
  },
  registeredTournaments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tournament'
  }],
  createdTournaments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tournament'
  }],
  
  // ==================== NOTIFICATION PREFERENCES ====================
  // Global notification settings
  emailNotifications: {
    type: Boolean,
    default: true
  },
  pushNotifications: {
    type: Boolean,
    default: true
  },
  
  // Push notification subscription data
  pushSubscription: {
    endpoint: String,
    keys: {
      p256dh: String,
      auth: String
    }
  },
  
  // Specific notification type preferences
  notificationTypes: {
    // Account related
    welcome: {
      type: Boolean,
      default: true
    },
    verification: {
      type: Boolean,
      default: true
    },
    
    // Tournament related
    tournamentCreated: {
      type: Boolean,
      default: true
    },
    tournamentRegistration: {
      type: Boolean,
      default: true
    },
    tournamentReminder: {
      type: Boolean,
      default: true
    },
    tournamentStarting: {
      type: Boolean,
      default: true // 5-minute warning
    },
    tournamentResult: {
      type: Boolean,
      default: true
    },
    tournamentWinner: {
      type: Boolean,
      default: true
    },
    
    // Transaction related
    transactionSuccess: {
      type: Boolean,
      default: true
    },
    transactionFailed: {
      type: Boolean,
      default: true
    },
    
    // Wallet related
    walletUpdate: {
      type: Boolean,
      default: true
    },
    lowBalance: {
      type: Boolean,
      default: true
    },
    
    // System messages
    systemMessage: {
      type: Boolean,
      default: true
    }
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash the password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare passwords
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method to check if user wants specific notification type
UserSchema.methods.wantsNotification = function(notificationType) {
  // Check global settings first
  if (!this.emailNotifications && !this.pushNotifications) {
    return false;
  }
  
  // Check specific notification type preference
  if (this.notificationTypes && this.notificationTypes[notificationType] !== undefined) {
    return this.notificationTypes[notificationType];
  }
  
  // Default to true if not specified
  return true;
};

module.exports = mongoose.model('User', UserSchema);