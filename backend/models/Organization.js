const mongoose = require('mongoose');
const crypto = require('crypto');

const organizationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  token: {
    type: String,
    unique: true,
    required: true,
    default: () => 'org_live_' + crypto.randomBytes(16).toString('hex')
  },
  attendanceCallbackUrl: {
    type: String,
    default: ''
  },
  enrollCallbackUrl: {
    type: String,
    default: ''
  },
  deviceStatusCallbackUrl: {
    type: String,
    default: ''
  },
  deviceState: {
    type: String,
    enum: ['online', 'offline'],
    default: 'offline'
  },
  lastDevicePing: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Organization', organizationSchema);
