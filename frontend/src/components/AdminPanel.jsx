import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function AdminPanel({ socket, authType, orgData }) {
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [users, setUsers] = useState([]);

  // New User Form fields
  const [memberId, setMemberId] = useState('');
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [fingerprintId, setFingerprintId] = useState('');

  // Scanner state
  const [enrollType, setEnrollType] = useState('fingerprint');
  const [status, setStatus] = useState({ message: '', type: '' });
  const [isScanning, setIsScanning] = useState(false);

  // Edit User state
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    memberId: '',
    roll: '',
    email: '',
    phone: '',
    address: '',
    fingerprintId: '',
    rfidUid: ''
  });

  const fetchOrganizations = () => {
    axios.get('/api/organizations')
      .then(res => {
        setOrganizations(res.data);
        if (res.data.length > 0 && !selectedOrgId) {
          setSelectedOrgId(res.data[0]._id);
        }
      })
      .catch(err => console.error(err));
  };

  const fetchUsers = (orgId) => {
    const url = orgId ? `/api/users?orgId=${orgId}` : '/api/users';
    axios.get(url)
      .then(res => setUsers(res.data))
      .catch(err => console.error('Error fetching users:', err));
  };

  useEffect(() => {
    if (authType === 'admin') {
      fetchOrganizations();
    } else if (authType === 'org' && orgData) {
      setOrganizations([orgData]);
      setSelectedOrgId(orgData._id);
    }
  }, [authType, orgData]);

  useEffect(() => {
    if (selectedOrgId) {
      fetchUsers(selectedOrgId);
      const selectedOrg = organizations.find(o => o._id === selectedOrgId);
      if (selectedOrg && socket) {
        socket.emit('join_org', { token: selectedOrg.token });
      }
    }
  }, [selectedOrgId, organizations, socket]);

  useEffect(() => {
    if (socket) {
      socket.on('enroll_status', (data) => {
        setStatus({ message: data.message, type: 'info' });
        setIsScanning(true);
      });

      socket.on('enroll_success', (data) => {
        setStatus({ message: `Successfully enrolled ${data.name} (${data.idInfo})!`, type: 'success' });
        setIsScanning(false);
        setMemberId('');
        setName('');
        setRoll('');
        setEmail('');
        setPhone('');
        setAddress('');
        setFingerprintId('');
        fetchUsers(selectedOrgId);
      });

      socket.on('enroll_error', (data) => {
        setStatus({ message: `Error: ${data.message}`, type: 'error' });
        setIsScanning(false);
      });
    }

    return () => {
      if (socket) {
        socket.off('enroll_status');
        socket.off('enroll_success');
        socket.off('enroll_error');
      }
    };
  }, [socket, selectedOrgId]);

  const generateUniqueFpId = () => {
    const usedIds = users.map(u => u.fingerprintId).filter(Boolean);
    for (let i = 1; i <= 127; i++) {
      if (!usedIds.includes(i)) return i;
    }
    return Math.floor(Math.random() * 127) + 1;
  };

  const handleStartEnroll = (selectedType, existingUser = null) => {
    const targetOrg = organizations.find(o => o._id === selectedOrgId);
    if (!targetOrg) {
      setStatus({ message: 'Please select an Organization first!', type: 'error' });
      return;
    }

    setEnrollType(selectedType);

    const targetMemberId = existingUser ? existingUser.memberId : memberId;
    const targetName = existingUser ? existingUser.name : name;
    const targetRoll = existingUser ? existingUser.roll : roll;
    const targetEmail = existingUser ? existingUser.email : email;
    const targetPhone = existingUser ? existingUser.phone : phone;
    const targetAddress = existingUser ? existingUser.address : address;
    let targetFpId = existingUser ? existingUser.fingerprintId : fingerprintId;

    if (!targetName.trim()) {
      setStatus({ message: 'Please enter student/staff full name first!', type: 'error' });
      return;
    }

    if (selectedType === 'fingerprint' && !targetFpId) {
      targetFpId = generateUniqueFpId();
      setFingerprintId(targetFpId);
    }

    setStatus({
      message: `Activating ${selectedType.toUpperCase()} scanner for ${targetName}... Please place finger/card on sensor.`,
      type: 'info'
    });
    setIsScanning(true);

    if (socket) {
      socket.emit('start_enroll', {
        token: targetOrg.token,
        targetUserId: existingUser ? existingUser._id : null,
        memberId: targetMemberId,
        name: targetName,
        roll: targetRoll,
        email: targetEmail,
        phone: targetPhone,
        address: targetAddress,
        fingerprintId: selectedType === 'fingerprint' ? parseInt(targetFpId) : null,
        enrollType: selectedType
      });
    }
  };

  const handleCancelEnroll = () => {
    const targetOrg = organizations.find(o => o._id === selectedOrgId);
    if (socket && targetOrg) {
      socket.emit('cancel_enroll', { token: targetOrg.token });
    }
    setIsScanning(false);
    setStatus({ message: 'Enrollment cancelled.', type: 'info' });
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      axios.delete(`/api/users/${id}`)
        .then(() => fetchUsers(selectedOrgId))
        .catch(err => console.error(err));
    }
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setEditForm({
      name: user.name || '',
      memberId: user.memberId || '',
      roll: user.roll || '',
      email: user.email || '',
      phone: user.phone || '',
      address: user.address || '',
      fingerprintId: user.fingerprintId ? user.fingerprintId.toString() : '',
      rfidUid: user.rfidUid || ''
    });
  };

  const handleUpdateUser = (e) => {
    e.preventDefault();
    if (!editingUser) return;

    axios.put(`/api/users/${editingUser._id}`, editForm)
      .then(() => {
        setEditingUser(null);
        fetchUsers(selectedOrgId);
      })
      .catch(err => console.error(err));
  };

  const activeOrg = organizations.find(o => o._id === selectedOrgId);

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Organization Switcher Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex-1 max-w-sm">
          {authType === 'admin' ? (
            <>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Select Client Organization
              </label>
              <select
                value={selectedOrgId}
                onChange={e => setSelectedOrgId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                <option value="">-- All Organizations --</option>
                {organizations.map(org => (
                  <option key={org._id} value={org._id}>
                    🏢 {org.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Your Organization
              </label>
              <div className="w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-2.5 font-bold text-slate-700">
                🏢 {orgData?.name}
              </div>
            </>
          )}
        </div>

        {activeOrg && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2.5 flex flex-col items-end">
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-1">Active Token</span>
            <span className="text-indigo-700 font-mono text-sm font-bold">
              🔑 {activeOrg.token.substring(0, 16)}...
            </span>
          </div>
        )}
      </div>

      {/* Enroll Form Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
        {/* Animated scanning overlay */}
        {isScanning && (
          <div className="absolute inset-0 bg-indigo-50/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center border-2 border-indigo-400">
            <div className="w-16 h-16 rounded-full bg-indigo-100 border-4 border-indigo-500 flex items-center justify-center animate-pulse mb-4 shadow-lg shadow-indigo-500/30">
              <span className="text-2xl">{enrollType === 'fingerprint' ? '🖐️' : '💳'}</span>
            </div>
            <h3 className="text-xl font-bold text-indigo-900 mb-2">{enrollType === 'fingerprint' ? 'Scanning Fingerprint' : 'Reading RFID Card'}</h3>
            <p className="text-indigo-700 font-medium">{status.message}</p>
            <button 
              onClick={handleCancelEnroll}
              className="mt-6 bg-red-100 hover:bg-red-200 text-red-700 font-bold py-2 px-6 rounded-full transition-colors"
            >
              Cancel Scanning
            </button>
          </div>
        )}

        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span>👤</span> Register Student / Employee
          </h2>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Roni Ahmed"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Third-Party Member ID</label>
              <input
                type="text"
                value={memberId}
                onChange={e => setMemberId(e.target.value)}
                placeholder="e.g. STD-2026-001"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Roll Number</label>
              <input
                type="text"
                value={roll}
                onChange={e => setRoll(e.target.value)}
                placeholder="e.g. 101"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="e.g. 01700000000"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
              />
            </div>

            <div className="col-span-1 md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Email & Address</label>
              <input
                type="text"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="e.g. roni@example.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="mt-8 flex gap-4 flex-wrap">
            <button
              type="button"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-6 rounded-xl transition-colors shadow-lg shadow-indigo-600/20 flex items-center gap-2"
              onClick={() => handleStartEnroll('fingerprint')}
              disabled={isScanning}
            >
              <span className="text-xl">🖐️</span> Trigger Fingerprint Scan
            </button>
            <button
              type="button"
              className="bg-teal-500 hover:bg-teal-600 text-white font-medium py-3 px-6 rounded-xl transition-colors shadow-lg shadow-teal-500/20 flex items-center gap-2"
              onClick={() => handleStartEnroll('rfid')}
              disabled={isScanning}
            >
              <span className="text-xl">💳</span> Trigger RFID Scan
            </button>
          </div>

          {status.message && !isScanning && (
            <div className={`mt-6 p-4 rounded-lg flex items-center gap-3 font-medium text-sm ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              <span>{status.type === 'success' ? '✅' : '⚠️'}</span>
              {status.message}
            </div>
          )}
        </div>
      </div>

      {/* User List */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span>📋</span> Registered Members <span className="bg-slate-200 text-slate-600 text-sm py-0.5 px-2.5 rounded-full">{users.length}</span>
        </h2>

        {users.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
            No users registered for this organization yet. Register a user or trigger API enrollment above!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {users.map(user => (
              <div key={user._id} className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-lg transition-shadow flex flex-col justify-between">
                <div>
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-xl font-bold shadow-sm">
                      {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg leading-tight">
                        {user.name}
                      </h3>
                      {user.memberId && <p className="text-xs font-semibold text-indigo-600 mt-0.5">ID: {user.memberId}</p>}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-6">
                    {user.fingerprintId ? (
                      <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1">
                        <span>🖐️</span> FP ID: {user.fingerprintId}
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-500 border border-slate-200 text-xs font-medium px-2.5 py-1 rounded-md flex items-center gap-1">
                        <span>🖐️</span> No Fingerprint
                      </span>
                    )}

                    {user.rfidUid ? (
                      <span className="bg-teal-50 text-teal-700 border border-teal-100 text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1">
                        <span>💳</span> RFID: {user.rfidUid}
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-500 border border-slate-200 text-xs font-medium px-2.5 py-1 rounded-md flex items-center gap-1">
                        <span>💳</span> No RFID
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => handleStartEnroll('fingerprint', user)}
                    disabled={isScanning}
                    className="flex-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-bold py-2 rounded transition-colors"
                  >
                    + 🖐️ FP
                  </button>
                  <button
                    onClick={() => handleStartEnroll('rfid', user)}
                    disabled={isScanning}
                    className="flex-1 bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 text-xs font-bold py-2 rounded transition-colors"
                  >
                    + 💳 RFID
                  </button>
                  <button
                    onClick={() => openEditModal(user)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded transition-colors"
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(user._id)}
                    className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded transition-colors"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold text-slate-800">✏️ Edit User Credentials</h2>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleUpdateUser} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">3rd-Party Member ID</label>
                  <input
                    type="text"
                    value={editForm.memberId}
                    onChange={e => setEditForm({ ...editForm, memberId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Fingerprint Slot ID</label>
                    <input
                      type="number"
                      value={editForm.fingerprintId}
                      onChange={e => setEditForm({ ...editForm, fingerprintId: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">RFID Card Hex UID</label>
                    <input
                      type="text"
                      value={editForm.rfidUid}
                      onChange={e => setEditForm({ ...editForm, rfidUid: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono"
                    />
                  </div>
                </div>
              </div>
              <div className="mt-8 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingUser(null)} className="px-5 py-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2.5 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium transition-colors shadow-lg shadow-indigo-600/20">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
