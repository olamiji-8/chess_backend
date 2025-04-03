const mongoose = require('mongoose');

const VerificationRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fullName: {
    type: String,
    required: [true, 'Full name as on ID is required'],
    trim: true
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true
  },
  idType: {
    type: String,
    required: [true, 'ID type is required'],
    enum: ['nationalId', 'driversLicense', 'passport', 'other'],
    trim: true
  },
  idNumber: {
    type: String,
    required: [true, 'ID number/serial is required'],
    trim: true
  },
  idCardImage: {
    type: String,
    required: [true, 'ID card image is required']
  },
  selfieImage: {
    type: String,
    required: [true, 'Selfie image is required']
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  rejectionReason: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the "updatedAt" field on save
VerificationRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('VerificationRequest', VerificationRequestSchema);