const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  orgId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  memberId: {
    type: String,
    trim: true,
    description: 'Third-party system ID (e.g. Student ID or Employee ID)'
  },
  fingerprintId: {
    type: Number,
    sparse: true
  },
  rfidUid: {
    type: String,
    sparse: true
  },
  name: {
    type: String,
    required: true
  },
  roll: {
    type: String
  },
  email: {
    type: String
  },
  phone: {
    type: String
  },
  address: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure fingerprintId and rfidUid are unique within each Organization
userSchema.index({ orgId: 1, fingerprintId: 1 }, { unique: true, sparse: true });
userSchema.index({ orgId: 1, rfidUid: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('User', userSchema);
