const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const axios = require('axios');




const Organization = require('./models/Organization');
const User = require('./models/User');
const Attendance = require('./models/Attendance');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' },
  allowEIO3: true
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
// mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/attendanceDB')
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://organicUser:roni9843@cluster0.tibcl.mongodb.net/attendanceDB')
  .then(() => console.log('✅ MongoDB Connected (SaaS Platform)'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Global state for per-token ESP8266 commands
const tokenCommands = new Map();

// Hardware Heartbeat Tracker maps
const lastPingMap = new Map(); // token -> timestamp (number)
const deviceStateMap = new Map(); // token -> 'online' | 'offline'

function getOrgCommand(token) {
  if (!tokenCommands.has(token)) {
    tokenCommands.set(token, { mode: 'attendance', id: null, enrollType: null });
  }
  return tokenCommands.get(token);
}

function setOrgCommand(token, command) {
  tokenCommands.set(token, command);
  io.to(`org_${token}`).emit('esp_command', command);
}

// Extract token helper from request (headers, query, or body)
async function authenticateToken(req) {
  const token = req.headers['x-device-token'] || req.headers['authorization']?.replace('Bearer ', '') || req.query.token || req.body.token;
  if (!token) return null;
  const org = await Organization.findOne({ token, isActive: true });
  return org;
}

// Helper for sending Webhooks to 3rd party client servers
async function sendWebhook(url, payload) {
  if (!url || !url.startsWith('http')) return null;
  try {
    console.log(`🌐 Dispatching Webhook to ${url}:`, payload);
    const response = await axios.post(url, payload, {
      timeout: 4000,
      headers: { 'Content-Type': 'application/json' }
    });
    console.log(`✅ Webhook response from ${url}:`, response.data);
    return { status: response.status, data: response.data };
  } catch (err) {
    console.error(`⚠️ Webhook delivery failed to ${url}:`, err.message);
    return { status: err.response ? err.response.status : 500, error: err.message, data: err.response ? err.response.data : null };
  }
}

// Hardware Device Status Heartbeat Handler
async function touchDeviceHeartbeat(org) {
  const token = org.token;
  const now = Date.now();
  lastPingMap.set(token, now);

  const prevState = deviceStateMap.get(token) || org.deviceState || 'offline';
  deviceStateMap.set(token, 'online');

  if (prevState !== 'online') {
    console.log(`🟢 Hardware Device for "${org.name}" came ONLINE`);
    org.deviceState = 'online';
    org.lastDevicePing = new Date();
    await org.save();

    // Broadcast online status change to sockets
    io.to(`org_${token}`).emit('device_status_change', { token, status: 'online', orgName: org.name });

    // Send Webhook to 3rd party server if device_status_callback_url is configured
    if (org.deviceStatusCallbackUrl) {
      sendWebhook(org.deviceStatusCallbackUrl, {
        event: 'device_status',
        status: 'online',
        organization: org.name,
        token: org.token,
        timestamp: new Date()
      });
    }
  }
}

// Background Health Checker to detect hardware offline disconnection
setInterval(async () => {
  try {
    const orgs = await Organization.find({ isActive: true });
    const now = Date.now();

    for (const org of orgs) {
      const token = org.token;
      const lastPing = lastPingMap.get(token) || (org.lastDevicePing ? new Date(org.lastDevicePing).getTime() : 0);
      const currentState = deviceStateMap.get(token) || org.deviceState || 'offline';

      // If no ping received for > 45 seconds, mark as offline
      if (now - lastPing > 45000 && currentState === 'online') {
        console.log(`🔴 Hardware Device for "${org.name}" went OFFLINE (No ping for 45s)`);
        deviceStateMap.set(token, 'offline');
        org.deviceState = 'offline';
        await org.save();

        // Broadcast offline status change to sockets
        io.to(`org_${token}`).emit('device_status_change', { token, status: 'offline', orgName: org.name });

        // Dispatch Webhook to 3rd party server
        if (org.deviceStatusCallbackUrl) {
          sendWebhook(org.deviceStatusCallbackUrl, {
            event: 'device_status',
            status: 'offline',
            organization: org.name,
            token: org.token,
            timestamp: new Date()
          });
        }
      }
    }
  } catch (err) {
    console.error('Error checking device health:', err.message);
  }
}, 4000);

// --- WebSockets (Frontend & Hardware to Central Server) ---
io.on('connection', (socket) => {
  console.log('🔌 Socket client connected:', socket.id);

  socket.on('join_org', async (data) => {
    const token = typeof data === 'string' ? data : data?.token;
    if (token) {
      const org = await Organization.findOne({ token, isActive: true });
      if (org) {
        socket.join(`org_${token}`);
        socket.orgToken = token;
        socket.emit('joined_org', {
          success: true,
          orgName: org.name,
          deviceState: deviceStateMap.get(token) || org.deviceState || 'offline'
        });
      } else {
        socket.emit('joined_org', { success: false, message: 'Invalid token' });
      }
    }
  });

  socket.on('start_enroll', async (data) => {
    const { token, memberId, name, roll, email, phone, address, fingerprintId, rfidUid, enrollType, targetUserId } = data;
    const org = await Organization.findOne({ token, isActive: true });
    if (!org) {
      socket.emit('enroll_error', { message: 'Invalid or missing organization token' });
      return;
    }

    const userData = { memberId, name, roll, email, phone, address };

    if (enrollType === 'fingerprint') {
      const parsedFpId = parseInt(fingerprintId);
      const existing = await User.findOne({ orgId: org._id, fingerprintId: parsedFpId });
      if (existing && existing._id.toString() !== targetUserId) {
        socket.emit('enroll_error', { message: `Fingerprint ID ${parsedFpId} is already registered to ${existing.name}` });
        return;
      }
      const command = {
        mode: 'enroll',
        id: parsedFpId,
        userData,
        userId: targetUserId || null,
        name: name || 'New User',
        enrollType: 'fingerprint'
      };
      setOrgCommand(token, command);
      io.to(`org_${token}`).emit('enroll_status', { message: `Please place finger on sensor for ${name || 'user'}...` });
    } else if (enrollType === 'rfid') {
      const command = {
        mode: 'enroll',
        id: null,
        userData,
        userId: targetUserId || null,
        name: name || 'New User',
        enrollType: 'rfid'
      };
      setOrgCommand(token, command);
      io.to(`org_${token}`).emit('enroll_status', { message: `Please tap RFID card on reader for ${name || 'user'}...` });
    }
  });

  socket.on('cancel_enroll', (data) => {
    const token = data?.token || socket.orgToken;
    if (token) {
      setOrgCommand(token, { mode: 'attendance', id: null, enrollType: null });
      io.to(`org_${token}`).emit('enroll_status', { message: 'Enrollment cancelled.' });
    }
  });

  socket.on('hardware_join', async (data) => {
    const token = data?.token;
    if (token) {
      const org = await Organization.findOne({ token, isActive: true });
      if (org) {
        socket.join(`org_${token}`);
        socket.isHardware = true;
        socket.orgToken = token;
        await touchDeviceHeartbeat(org);
        socket.emit('hardware_joined', { success: true, command: getOrgCommand(token) });
      }
    }
  });

  socket.on('hardware_attendance', async (data) => {
    const token = socket.orgToken || data?.token;
    const { fingerprintId, rfidUid } = data;
    if (!token) return;
    try {
      const org = await Organization.findOne({ token, isActive: true });
      if (!org) return;
      await touchDeviceHeartbeat(org);

      let user = null;
      if (fingerprintId) {
        user = await User.findOne({ orgId: org._id, fingerprintId: parseInt(fingerprintId) });
      } else if (rfidUid) {
        user = await User.findOne({ orgId: org._id, rfidUid: rfidUid.toUpperCase() });
      }

      const attendanceLog = new Attendance({
        orgId: org._id,
        userId: user ? user._id : null,
        memberId: user ? user.memberId : null,
        fingerprintId: fingerprintId ? parseInt(fingerprintId) : null,
        rfidUid: rfidUid ? rfidUid.toUpperCase() : null,
        method: fingerprintId ? 'fingerprint' : 'rfid',
        timestamp: new Date()
      });

      const webhookPayload = {
        event: 'attendance_punch',
        organization: org.name,
        token: org.token,
        memberId: user ? user.memberId : null,
        name: user ? user.name : 'Unknown',
        fingerprintId: fingerprintId ? parseInt(fingerprintId) : null,
        rfidUid: rfidUid ? rfidUid.toUpperCase() : null,
        timestamp: attendanceLog.timestamp
      };

      let displayStudentName = user ? user.name : 'Student!';

      if (org.attendanceCallbackUrl) {
        const webhookRes = await sendWebhook(org.attendanceCallbackUrl, webhookPayload);
        if (webhookRes && webhookRes.data) {
          attendanceLog.webhookStatus = 'sent';
          attendanceLog.webhookResponse = JSON.stringify(webhookRes.data);
          if (webhookRes.data.name) displayStudentName = webhookRes.data.name;
          else if (webhookRes.data.studentName) displayStudentName = webhookRes.data.studentName;
          else if (webhookRes.data.user?.name) displayStudentName = webhookRes.data.user.name;
        } else {
          attendanceLog.webhookStatus = 'failed';
        }
      }

      await attendanceLog.save();

      const record = {
        _id: attendanceLog._id,
        orgId: org._id,
        orgName: org.name,
        memberId: user ? user.memberId : 'N/A',
        name: displayStudentName,
        method: fingerprintId ? `Fingerprint ID: ${fingerprintId}` : `RFID: ${rfidUid}`,
        timestamp: attendanceLog.timestamp,
        webhookStatus: attendanceLog.webhookStatus
      };
      io.to(`org_${org.token}`).emit('new_attendance', record);
      console.log(`🎯 Attendance Recorded for ${org.name}:`, record);

      socket.emit('attendance_result', { success: true, name: displayStudentName });
    } catch (err) {
      console.error(err);
      socket.emit('attendance_result', { success: false });
    }
  });

  socket.on('hardware_enroll_progress', async (data) => {
    const token = socket.orgToken || data?.token;
    if (token && data.message) {
      io.to(`org_${token}`).emit('enroll_status', { message: data.message });
      const org = await Organization.findOne({ token, isActive: true });
      if (org) await touchDeviceHeartbeat(org);
    }
  });

  socket.on('hardware_enroll_success', async (data) => {
    const token = socket.orgToken || data?.token;
    const { fingerprintId, rfidUid } = data;
    if (!token) return;

    const org = await Organization.findOne({ token, isActive: true });
    if (!org) return;
    await touchDeviceHeartbeat(org);

    const currentCmd = getOrgCommand(token);
    if (currentCmd.mode === 'enroll') {
      try {
        let targetUser;
        const uData = currentCmd.userData || {};
        const targetUserId = currentCmd.userId;

        if (targetUserId) {
          targetUser = await User.findById(targetUserId);
          if (targetUser) {
            if (currentCmd.enrollType === 'fingerprint' && fingerprintId) targetUser.fingerprintId = parseInt(fingerprintId);
            else if (currentCmd.enrollType === 'rfid' && rfidUid) targetUser.rfidUid = rfidUid.toUpperCase();
            if (uData.memberId) targetUser.memberId = uData.memberId;
            if (uData.name) targetUser.name = uData.name;
            if (uData.roll) targetUser.roll = uData.roll;
            if (uData.email) targetUser.email = uData.email;
            if (uData.phone) targetUser.phone = uData.phone;
            if (uData.address) targetUser.address = uData.address;
            await targetUser.save();
          }
        } else {
          targetUser = new User({
            orgId: org._id,
            memberId: uData.memberId || '',
            fingerprintId: currentCmd.enrollType === 'fingerprint' && fingerprintId ? parseInt(fingerprintId) : undefined,
            rfidUid: currentCmd.enrollType === 'rfid' && rfidUid ? rfidUid.toUpperCase() : undefined,
            name: uData.name || 'Enrolled Member',
            roll: uData.roll || '',
            email: uData.email || '',
            phone: uData.phone || '',
            address: uData.address || ''
          });
          await targetUser.save();
        }

        setOrgCommand(token, { mode: 'attendance', id: null, enrollType: null });

        io.to(`org_${token}`).emit('enroll_success', {
          name: targetUser ? targetUser.name : 'User',
          memberId: targetUser ? targetUser.memberId : '',
          idInfo: fingerprintId ? `Fingerprint ID: ${fingerprintId}` : `RFID: ${rfidUid}`
        });

        const webhookTarget = currentCmd.customCallbackUrl || org.enrollCallbackUrl;
        if (webhookTarget) {
          sendWebhook(webhookTarget, {
            event: 'enroll_success',
            status: 'success',
            organization: org.name,
            token: org.token,
            memberId: targetUser ? targetUser.memberId : '',
            name: targetUser ? targetUser.name : '',
            enrollType: currentCmd.enrollType,
            fingerprintId: fingerprintId ? parseInt(fingerprintId) : null,
            rfidUid: rfidUid ? rfidUid.toUpperCase() : null,
            timestamp: new Date()
          });
        }
        socket.emit('enroll_result', { success: true });
      } catch (err) {
        console.error(err);
        setOrgCommand(token, { mode: 'attendance', id: null, enrollType: null });
        io.to(`org_${token}`).emit('enroll_error', { message: 'Database error.' });
        socket.emit('enroll_result', { success: false });
      }
    }
  });

  socket.on('hardware_delete_success', async (data) => {
    const token = socket.orgToken || data?.token;
    if (token) {
      setOrgCommand(token, { mode: 'attendance', id: null, enrollType: null });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ==========================================
// 1. SAAS MANAGEMENT API (For SaaS Admin)
// ==========================================

// Create new Organization
app.post('/api/organizations', async (req, res) => {
  try {
    const { name, phone, address, attendanceCallbackUrl, enrollCallbackUrl, deviceStatusCallbackUrl } = req.body;
    if (!name) return res.status(400).json({ error: 'Organization name is required' });

    const org = new Organization({
      name,
      phone,
      address,
      attendanceCallbackUrl: attendanceCallbackUrl || '',
      enrollCallbackUrl: enrollCallbackUrl || '',
      deviceStatusCallbackUrl: deviceStatusCallbackUrl || ''
    });
    await org.save();
    res.status(201).json(org);
  } catch (err) {
    console.error('Error creating organization:', err);
    res.status(500).json({ error: 'Server Error' });
  }
});

// List all Organizations
app.get('/api/organizations', async (req, res) => {
  try {
    const orgs = await Organization.find().sort({ createdAt: -1 });
    const result = orgs.map(org => {
      const cmd = getOrgCommand(org.token);
      const state = deviceStateMap.get(org.token) || org.deviceState || 'offline';
      return {
        ...org.toObject(),
        deviceState: state,
        currentCommand: cmd
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
});

// Update Organization / Webhooks
app.put('/api/organizations/:id', async (req, res) => {
  try {
    const { name, phone, address, attendanceCallbackUrl, enrollCallbackUrl, deviceStatusCallbackUrl, isActive } = req.body;
    const org = await Organization.findByIdAndUpdate(
      req.params.id,
      { name, phone, address, attendanceCallbackUrl, enrollCallbackUrl, deviceStatusCallbackUrl, isActive },
      { new: true }
    );
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    res.json(org);
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
});

// Delete Organization
app.delete('/api/organizations/:id', async (req, res) => {
  try {
    const org = await Organization.findByIdAndDelete(req.params.id);
    if (org) {
      await User.deleteMany({ orgId: org._id });
      await Attendance.deleteMany({ orgId: org._id });
      tokenCommands.delete(org.token);
      lastPingMap.delete(org.token);
      deviceStateMap.delete(org.token);
    }
    res.json({ message: 'Organization deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
});

// Regenerate Token for an Organization
app.post('/api/organizations/:id/regenerate-token', async (req, res) => {
  try {
    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    const crypto = require('crypto');
    org.token = 'org_live_' + crypto.randomBytes(16).toString('hex');
    await org.save();
    res.json(org);
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
});

// ==========================================
// 2. THIRD-PARTY PUBLIC API (/api/v1/...)
// ==========================================

// Verify Token API
app.post('/api/v1/verify-token', async (req, res) => {
  const org = await authenticateToken(req);
  if (!org) return res.status(401).json({ valid: false, message: 'Invalid or inactive organization token' });

  const state = deviceStateMap.get(org.token) || org.deviceState || 'offline';
  res.json({
    valid: true,
    organization: {
      id: org._id,
      name: org.name,
      token: org.token,
      phone: org.phone,
      address: org.address,
      attendanceCallbackUrl: org.attendanceCallbackUrl,
      enrollCallbackUrl: org.enrollCallbackUrl,
      deviceStatusCallbackUrl: org.deviceStatusCallbackUrl
    },
    deviceStatus: state,
    lastDevicePing: org.lastDevicePing || null
  });
});

// Config Webhook API for 3rd party software
app.post('/api/v1/config/webhook', async (req, res) => {
  const org = await authenticateToken(req);
  if (!org) return res.status(401).json({ error: 'Invalid organization token' });

  const { attendance_callback_url, enroll_callback_url, device_status_callback_url } = req.body;

  if (attendance_callback_url !== undefined) org.attendanceCallbackUrl = attendance_callback_url;
  if (enroll_callback_url !== undefined) org.enrollCallbackUrl = enroll_callback_url;
  if (device_status_callback_url !== undefined) org.deviceStatusCallbackUrl = device_status_callback_url;

  await org.save();

  res.json({
    status: 'success',
    message: 'Webhook URLs registered successfully',
    organization: org.name,
    attendanceCallbackUrl: org.attendanceCallbackUrl,
    enrollCallbackUrl: org.enrollCallbackUrl,
    deviceStatusCallbackUrl: org.deviceStatusCallbackUrl
  });
});

// Test Webhook Dispatcher API (For Developers to test their receiver endpoints)
app.post('/api/v1/test-webhook', async (req, res) => {
  const org = await authenticateToken(req);
  if (!org) return res.status(401).json({ error: 'Invalid organization token' });

  const { eventType, custom_url } = req.body; // 'attendance' | 'enroll' | 'device_status'

  let targetUrl = custom_url;
  let payload = {};

  if (eventType === 'attendance') {
    targetUrl = targetUrl || org.attendanceCallbackUrl;
    payload = {
      event: 'attendance_punch',
      organization: org.name,
      token: org.token,
      memberId: 'STD-TEST-001',
      name: 'Roni Ahmed (Test)',
      fingerprintId: 1,
      rfidUid: '4F717AFC',
      timestamp: new Date()
    };
  } else if (eventType === 'enroll') {
    targetUrl = targetUrl || org.enrollCallbackUrl;
    payload = {
      event: 'enroll_success',
      status: 'success',
      organization: org.name,
      token: org.token,
      memberId: 'STD-TEST-001',
      name: 'Roni Ahmed (Test)',
      enrollType: 'fingerprint',
      fingerprintId: 1,
      rfidUid: null,
      timestamp: new Date()
    };
  } else if (eventType === 'device_status') {
    targetUrl = targetUrl || org.deviceStatusCallbackUrl;
    payload = {
      event: 'device_status',
      status: 'online',
      organization: org.name,
      token: org.token,
      timestamp: new Date()
    };
  } else {
    return res.status(400).json({ error: 'Invalid eventType. Must be attendance, enroll, or device_status' });
  }

  if (!targetUrl) {
    return res.status(400).json({ error: `No webhook URL registered for event type "${eventType}". Please register a URL first.` });
  }

  const result = await sendWebhook(targetUrl, payload);
  res.json({
    status: 'completed',
    targetUrl,
    payloadSent: payload,
    responseReceived: result
  });
});

// Remote Enroll API (Triggered by 3rd party server)
app.post('/api/v1/enroll', async (req, res) => {
  const org = await authenticateToken(req);
  if (!org) return res.status(401).json({ error: 'Invalid organization token' });

  const { memberId, enrollType, fingerprintId, name, roll, email, phone, address, callback_url } = req.body;

  if (!enrollType || !['fingerprint', 'rfid'].includes(enrollType)) {
    return res.status(400).json({ error: 'enrollType must be "fingerprint" or "rfid"' });
  }

  let assignedFpId = null;
  if (enrollType === 'fingerprint') {
    if (fingerprintId) {
      assignedFpId = parseInt(fingerprintId);
    } else {
      const existingUsers = await User.find({ orgId: org._id }).select('fingerprintId');
      const usedIds = existingUsers.map(u => u.fingerprintId).filter(Boolean);
      for (let i = 1; i <= 127; i++) {
        if (!usedIds.includes(i)) {
          assignedFpId = i;
          break;
        }
      }
    }
  }

  const userData = {
    memberId: memberId || '',
    name: name || memberId || 'New Member',
    roll: roll || '',
    email: email || '',
    phone: phone || '',
    address: address || ''
  };

  const command = {
    mode: 'enroll',
    id: assignedFpId,
    enrollType,
    userData,
    customCallbackUrl: callback_url || org.enrollCallbackUrl
  };

  setOrgCommand(org.token, command);

  io.to(`org_${org.token}`).emit('enroll_status', {
    message: `Remote enroll command triggered for ${userData.name} (${enrollType.toUpperCase()})`
  });

  res.json({
    status: 'success',
    message: `Machine set to enroll mode. Please tap finger/card on reader.`,
    token: org.token,
    enrollType,
    assignedFingerprintId: assignedFpId,
    memberId: userData.memberId
  });
});

// Fetch Users for an Org (3rd party API)
app.get('/api/v1/users', async (req, res) => {
  const org = await authenticateToken(req);
  if (!org) return res.status(401).json({ error: 'Invalid organization token' });
  const users = await User.find({ orgId: org._id }).sort({ createdAt: -1 });
  res.json(users);
});

// Fetch Logs for an Org (3rd party API)
app.get('/api/v1/logs', async (req, res) => {
  const org = await authenticateToken(req);
  if (!org) return res.status(401).json({ error: 'Invalid organization token' });
  const logs = await Attendance.find({ orgId: org._id }).populate('userId').sort({ timestamp: -1 }).limit(100);
  res.json(logs);
});

// ==========================================
// 3. ESP8266 HARDWARE INTERFACE API
// ==========================================

// 1. ESP8266 polls to check active mode/command
app.get('/api/command', async (req, res) => {
  const token = req.headers['x-device-token'] || req.query.token;
  if (!token) return res.status(400).json({ error: 'Token missing' });

  const org = await Organization.findOne({ token, isActive: true });
  if (!org) return res.status(401).json({ error: 'Unauthorized token' });

  // Update hardware live heartbeat
  await touchDeviceHeartbeat(org);

  const command = getOrgCommand(token);
  res.json({ ...command, orgName: org.name });
});

// 2. ESP8266 reports real-time attendance scan
app.post('/api/attendance', async (req, res) => {
  const token = req.headers['x-device-token'] || req.query.token || req.body.token;
  const { fingerprintId, rfidUid } = req.body;

  if (!token) return res.status(400).send('Token required');
  if (!fingerprintId && !rfidUid) return res.status(400).send('No Fingerprint ID or RFID UID');

  try {
    const org = await Organization.findOne({ token, isActive: true });
    if (!org) return res.status(401).send('Unauthorized token');

    // Touch hardware heartbeat
    await touchDeviceHeartbeat(org);

    let user = null;
    if (fingerprintId) {
      user = await User.findOne({ orgId: org._id, fingerprintId: parseInt(fingerprintId) });
    } else if (rfidUid) {
      user = await User.findOne({ orgId: org._id, rfidUid: rfidUid.toUpperCase() });
    }

    const attendanceLog = new Attendance({
      orgId: org._id,
      userId: user ? user._id : null,
      memberId: user ? user.memberId : null,
      fingerprintId: fingerprintId ? parseInt(fingerprintId) : null,
      rfidUid: rfidUid ? rfidUid.toUpperCase() : null,
      method: fingerprintId ? 'fingerprint' : 'rfid',
      timestamp: new Date()
    });

    const webhookPayload = {
      event: 'attendance_punch',
      organization: org.name,
      token: org.token,
      memberId: user ? user.memberId : null,
      name: user ? user.name : 'Unknown',
      fingerprintId: fingerprintId ? parseInt(fingerprintId) : null,
      rfidUid: rfidUid ? rfidUid.toUpperCase() : null,
      timestamp: attendanceLog.timestamp
    };

    let displayStudentName = user ? user.name : 'Student!';

    if (org.attendanceCallbackUrl) {
      const webhookRes = await sendWebhook(org.attendanceCallbackUrl, webhookPayload);
      if (webhookRes && webhookRes.data) {
        attendanceLog.webhookStatus = 'sent';
        attendanceLog.webhookResponse = JSON.stringify(webhookRes.data);
        if (webhookRes.data.name) displayStudentName = webhookRes.data.name;
        else if (webhookRes.data.studentName) displayStudentName = webhookRes.data.studentName;
        else if (webhookRes.data.user?.name) displayStudentName = webhookRes.data.user.name;
      } else {
        attendanceLog.webhookStatus = 'failed';
      }
    }

    await attendanceLog.save();

    const record = {
      _id: attendanceLog._id,
      orgId: org._id,
      orgName: org.name,
      memberId: user ? user.memberId : 'N/A',
      name: displayStudentName,
      method: fingerprintId ? `Fingerprint ID: ${fingerprintId}` : `RFID: ${rfidUid}`,
      timestamp: attendanceLog.timestamp,
      webhookStatus: attendanceLog.webhookStatus
    };
    io.to(`org_${org.token}`).emit('new_attendance', record);
    console.log(`🎯 Attendance Recorded for ${org.name}:`, record);

    res.json({ name: displayStudentName, roll: user ? user.roll || '' : '' });
  } catch (err) {
    console.error('Error recording attendance:', err);
    res.status(500).send('Server Error');
  }
});

// 3. ESP8266 reports real-time step progress
app.post('/api/enroll_progress', async (req, res) => {
  const token = req.headers['x-device-token'] || req.query.token || req.body.token;
  const { message } = req.body;
  if (token && message) {
    io.to(`org_${token}`).emit('enroll_status', { message });
    const org = await Organization.findOne({ token, isActive: true });
    if (org) await touchDeviceHeartbeat(org);
  }
  res.send('OK');
});

// 4. ESP8266 reports successful enrollment
app.post('/api/enroll_success', async (req, res) => {
  const token = req.headers['x-device-token'] || req.query.token || req.body.token;
  const { fingerprintId, rfidUid } = req.body;

  if (!token) return res.status(400).send('Token required');

  const org = await Organization.findOne({ token, isActive: true });
  if (!org) return res.status(401).send('Unauthorized token');

  await touchDeviceHeartbeat(org);

  const currentCmd = getOrgCommand(token);

  if (currentCmd.mode === 'enroll') {
    try {
      let targetUser;
      const uData = currentCmd.userData || {};
      const targetUserId = currentCmd.userId;

      if (targetUserId) {
        targetUser = await User.findById(targetUserId);
        if (targetUser) {
          if (currentCmd.enrollType === 'fingerprint' && fingerprintId) {
            targetUser.fingerprintId = parseInt(fingerprintId);
          } else if (currentCmd.enrollType === 'rfid' && rfidUid) {
            targetUser.rfidUid = rfidUid.toUpperCase();
          }
          if (uData.memberId) targetUser.memberId = uData.memberId;
          if (uData.name) targetUser.name = uData.name;
          if (uData.roll) targetUser.roll = uData.roll;
          if (uData.email) targetUser.email = uData.email;
          if (uData.phone) targetUser.phone = uData.phone;
          if (uData.address) targetUser.address = uData.address;
          await targetUser.save();
        }
      } else {
        targetUser = new User({
          orgId: org._id,
          memberId: uData.memberId || '',
          fingerprintId: currentCmd.enrollType === 'fingerprint' && fingerprintId ? parseInt(fingerprintId) : undefined,
          rfidUid: currentCmd.enrollType === 'rfid' && rfidUid ? rfidUid.toUpperCase() : undefined,
          name: uData.name || 'Enrolled Member',
          roll: uData.roll || '',
          email: uData.email || '',
          phone: uData.phone || '',
          address: uData.address || ''
        });
        await targetUser.save();
      }

      setOrgCommand(token, { mode: 'attendance', id: null, enrollType: null });

      io.to(`org_${token}`).emit('enroll_success', {
        name: targetUser ? targetUser.name : 'User',
        memberId: targetUser ? targetUser.memberId : '',
        idInfo: fingerprintId ? `Fingerprint ID: ${fingerprintId}` : `RFID: ${rfidUid}`
      });

      const webhookTarget = currentCmd.customCallbackUrl || org.enrollCallbackUrl;
      if (webhookTarget) {
        sendWebhook(webhookTarget, {
          event: 'enroll_success',
          status: 'success',
          organization: org.name,
          token: org.token,
          memberId: targetUser ? targetUser.memberId : '',
          name: targetUser ? targetUser.name : '',
          enrollType: currentCmd.enrollType,
          fingerprintId: fingerprintId ? parseInt(fingerprintId) : null,
          rfidUid: rfidUid ? rfidUid.toUpperCase() : null,
          timestamp: new Date()
        });
      }

      res.send('Enrollment saved successfully');
    } catch (err) {
      console.error('Error processing enroll success:', err);
      setOrgCommand(token, { mode: 'attendance', id: null, enrollType: null });
      io.to(`org_${token}`).emit('enroll_error', { message: 'Database error during enrollment.' });
      res.status(500).send('Server Error');
    }
  } else {
    res.status(400).send('Invalid command state');
  }
});

// 5. ESP8266 reports delete success
app.post('/api/delete_success', async (req, res) => {
  const token = req.headers['x-device-token'] || req.query.token || req.body.token;
  if (token) {
    setOrgCommand(token, { mode: 'attendance', id: null, enrollType: null });
  }
  res.send('Deleted from sensor');
});

// ==========================================
// 4. GENERAL USER & LOG APIs (For Dashboard)
// ==========================================

app.get('/api/users', async (req, res) => {
  const { orgId } = req.query;
  const filter = orgId ? { orgId } : {};
  const users = await User.find(filter).populate('orgId').sort({ createdAt: -1 });
  res.json(users);
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { name, memberId, roll, email, phone, address, fingerprintId, rfidUid } = req.body;
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      {
        name,
        memberId,
        roll,
        email,
        phone,
        address,
        fingerprintId: fingerprintId ? parseInt(fingerprintId) : undefined,
        rfidUid: rfidUid || undefined
      },
      { new: true }
    );
    res.json(updatedUser);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (user && user.fingerprintId) {
      const org = await Organization.findById(user.orgId);
      if (org) {
        setOrgCommand(org.token, { mode: 'delete', id: user.fingerprintId });
      }
    }
    res.send('Deleted');
  } catch (err) {
    res.status(500).send('Error');
  }
});

app.get('/api/logs', async (req, res) => {
  const { orgId } = req.query;
  const filter = orgId ? { orgId } : {};
  const logs = await Attendance.find(filter).populate('userId').populate('orgId').sort({ timestamp: -1 }).limit(100);
  res.json(logs);
});

app.delete('/api/logs/:id', async (req, res) => {
  try {
    await Attendance.findByIdAndDelete(req.params.id);
    res.send('Log deleted');
  } catch (err) {
    res.status(500).send('Error deleting log');
  }
});

app.delete('/api/logs', async (req, res) => {
  try {
    await Attendance.deleteMany({});
    res.send('All logs cleared');
  } catch (err) {
    res.status(500).send('Error clearing logs');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 SaaS Attendance Cloud Server running on http://localhost:${PORT}`);
});
