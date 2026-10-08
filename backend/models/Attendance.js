const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  orgId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  memberId: {
    type: String
  },
  fingerprintId: {
    type: Number
  },
  rfidUid: {
    type: String
  },
  method: {
    type: String // 'fingerprint' or 'rfid'
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  webhookStatus: {
    type: String,
    enum: ['sent', 'failed', 'none', 'pending'],
    default: 'none'
  },
  webhookResponse: {
    type: String
  }
});

module.exports = mongoose.model('Attendance', attendanceSchema);
