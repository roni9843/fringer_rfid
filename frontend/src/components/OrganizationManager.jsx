import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function OrganizationManager({ socket }) {
  const [organizations, setOrganizations] = useState([]);
  
  // New Org Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [attendanceCallbackUrl, setAttendanceCallbackUrl] = useState('');
  const [enrollCallbackUrl, setEnrollCallbackUrl] = useState('');
  const [deviceStatusCallbackUrl, setDeviceStatusCallbackUrl] = useState('');
  
  const [status, setStatus] = useState({ message: '', type: '' });
  const [visibleTokenId, setVisibleTokenId] = useState(null);

  // Edit Org Modal State
  const [editingOrg, setEditingOrg] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    address: '',
    attendanceCallbackUrl: '',
    enrollCallbackUrl: '',
    deviceStatusCallbackUrl: ''
  });

  const fetchOrganizations = () => {
    axios.get('/api/organizations')
      .then(res => setOrganizations(res.data))
      .catch(err => console.error('Error fetching organizations:', err));
  };

  useEffect(() => {
    fetchOrganizations();
    const interval = setInterval(fetchOrganizations, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('device_status_change', () => {
        fetchOrganizations();
      });
    }
    return () => {
      if (socket) socket.off('device_status_change');
    };
  }, [socket]);

  const handleCreateOrg = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setStatus({ message: 'Organization name is required!', type: 'error' });
      return;
    }

    axios.post('/api/organizations', {
      name,
      phone,
      address,
      attendanceCallbackUrl,
      enrollCallbackUrl,
      deviceStatusCallbackUrl
    })
    .then(res => {
      setStatus({ message: `Organization "${res.data.name}" created! Secret API Token generated.`, type: 'success' });
      setName('');
      setPhone('');
      setAddress('');
      setAttendanceCallbackUrl('');
      setEnrollCallbackUrl('');
      setDeviceStatusCallbackUrl('');
      fetchOrganizations();
    })
    .catch(err => {
      setStatus({ message: 'Error creating organization', type: 'error' });
    });
  };

  const handleCopyToken = (token) => {
    navigator.clipboard.writeText(token);
    alert('Token copied to clipboard! Paste this token in your ESP8266 Firmware or 3rd Party API Header.');
  };

  const handleRegenerateToken = (orgId) => {
    if (window.confirm('Are you sure you want to regenerate token? Old hardware devices using previous token will be disconnected.')) {
      axios.post(`/api/organizations/${orgId}/regenerate-token`)
        .then(() => fetchOrganizations())
        .catch(err => console.error(err));
    }
  };

  const handleDeleteOrg = (orgId) => {
    if (window.confirm('Are you sure? This will delete the organization and all associated users & attendance logs.')) {
      axios.delete(`/api/organizations/${orgId}`)
        .then(() => fetchOrganizations())
        .catch(err => console.error(err));
    }
  };

  const openEditModal = (org) => {
    setEditingOrg(org);
    setEditForm({
      name: org.name || '',
      phone: org.phone || '',
      address: org.address || '',
      attendanceCallbackUrl: org.attendanceCallbackUrl || '',
      enrollCallbackUrl: org.enrollCallbackUrl || '',
      deviceStatusCallbackUrl: org.deviceStatusCallbackUrl || ''
    });
  };

  const handleUpdateOrg = (e) => {
    e.preventDefault();
    if (!editingOrg) return;

    axios.put(`/api/organizations/${editingOrg._id}`, editForm)
      .then(() => {
        setEditingOrg(null);
        fetchOrganizations();
      })
      .catch(err => console.error('Error updating organization:', err));
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Create Organization Form */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span className="text-indigo-500">🏢</span> Register New Client Organization & Webhook Endpoints
          </h2>
        </div>

        <form onSubmit={handleCreateOrg} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="col-span-1 md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Organization / School Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Oxford International School"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Contact Phone</label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="e.g. +8801700000000"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Address</label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="e.g. Dhaka, Bangladesh"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Daily Attendance Webhook URL</label>
              <input
                type="url"
                value={attendanceCallbackUrl}
                onChange={e => setAttendanceCallbackUrl(e.target.value)}
                placeholder="https://client-school-erp.com/api/v1/attendance"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Remote Enrollment Webhook URL</label>
              <input
                type="url"
                value={enrollCallbackUrl}
                onChange={e => setEnrollCallbackUrl(e.target.value)}
                placeholder="https://client-school-erp.com/api/v1/enroll"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm font-mono"
              />
            </div>

            <div className="col-span-1 md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Device Online/Offline Status Webhook URL</label>
              <input
                type="url"
                value={deviceStatusCallbackUrl}
                onChange={e => setDeviceStatusCallbackUrl(e.target.value)}
                placeholder="https://client-school-erp.com/api/v1/device-status"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm font-mono"
              />
            </div>
          </div>

          <div className="mt-6">
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors shadow-md shadow-indigo-600/20 flex items-center gap-2">
              <span>➕</span> Create Organization & Issue API Token
            </button>
          </div>
        </form>

        {status.message && (
          <div className={`mx-6 mb-6 p-4 rounded-lg flex items-center gap-3 font-medium text-sm ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            <span>{status.type === 'success' ? '✅' : '⚠️'}</span>
            {status.message}
          </div>
        )}
      </div>

      {/* Organization List */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="text-indigo-500">📋</span> Client Organizations & API Tokens <span className="bg-slate-200 text-slate-600 text-sm py-0.5 px-2.5 rounded-full">{organizations.length}</span>
        </h2>

        {organizations.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
            No client organizations registered yet. Create one above to issue a hardware token!
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {organizations.map(org => {
              const isTokenVisible = visibleTokenId === org._id;
              const isOnline = org.deviceState === 'online';

              return (
                <div key={org._id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-lg hover:border-slate-300 transition-all duration-300">
                  <div className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-inner ${isOnline ? 'bg-gradient-to-br from-emerald-400 to-teal-500' : 'bg-gradient-to-br from-slate-400 to-slate-500'}`}>
                        {org.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          {org.name}
                          {isOnline ? (
                            <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Online
                            </span>
                          ) : (
                            <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Offline
                            </span>
                          )}
                        </h3>
                        <div className="flex flex-wrap items-center gap-4 mt-1.5 text-sm text-slate-500">
                          {org.phone && <span className="flex items-center gap-1">📞 {org.phone}</span>}
                          {org.address && <span className="flex items-center gap-1">📍 {org.address}</span>}
                          <span className="flex items-center gap-1">📅 Created {new Date(org.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto">
                      <button onClick={() => openEditModal(org)} className="flex-1 md:flex-none px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded transition-colors">
                        ✏️ Edit Webhooks
                      </button>
                      <button onClick={() => handleRegenerateToken(org._id)} className="flex-1 md:flex-none px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded transition-colors" title="Generate new secret token">
                        🔑 Reset
                      </button>
                      <button onClick={() => handleDeleteOrg(org._id)} className="flex-1 md:flex-none px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded transition-colors">
                        🗑️ Delete
                      </button>
                    </div>
                  </div>

                  {/* Token & Webhooks Section */}
                  <div className="bg-slate-50 px-6 py-5 border-t border-slate-100">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        🔑 Hardware & API Secret Access Token
                      </span>
                      <button
                        onClick={() => setVisibleTokenId(isTokenVisible ? null : org._id)}
                        className="text-indigo-600 hover:text-indigo-800 text-sm font-semibold flex items-center gap-1"
                      >
                        {isTokenVisible ? '👁️ Hide' : '👁️ Show'} Token
                      </button>
                    </div>

                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex-1 bg-slate-800 text-emerald-400 font-mono text-sm px-4 py-2.5 rounded-lg border border-slate-700 overflow-x-auto whitespace-nowrap">
                        {isTokenVisible ? org.token : `${org.token.substring(0, 12)}••••••••••••••••••••••••••••••`}
                      </div>
                      <button 
                        onClick={() => handleCopyToken(org.token)}
                        className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2.5 rounded-lg border border-slate-700 transition-colors text-sm font-medium whitespace-nowrap flex items-center gap-2"
                      >
                        📋 Copy
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div className="bg-white p-3 rounded border border-slate-200">
                        <p className="text-xs font-semibold text-slate-500 mb-1">Attendance Webhook</p>
                        {org.attendanceCallbackUrl ? (
                          <p className="font-mono text-xs text-slate-700 truncate" title={org.attendanceCallbackUrl}>{org.attendanceCallbackUrl}</p>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Not Configured</p>
                        )}
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-200">
                        <p className="text-xs font-semibold text-slate-500 mb-1">Enroll Success Webhook</p>
                        {org.enrollCallbackUrl ? (
                          <p className="font-mono text-xs text-slate-700 truncate" title={org.enrollCallbackUrl}>{org.enrollCallbackUrl}</p>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Not Configured</p>
                        )}
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-200">
                        <p className="text-xs font-semibold text-slate-500 mb-1">Device Status Webhook</p>
                        {org.deviceStatusCallbackUrl ? (
                          <p className="font-mono text-xs text-slate-700 truncate" title={org.deviceStatusCallbackUrl}>{org.deviceStatusCallbackUrl}</p>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Not Configured</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Organization Modal */}
      {editingOrg && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold text-slate-800">✏️ Edit Organization & Webhooks</h2>
              <button onClick={() => setEditingOrg(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleUpdateOrg} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Organization Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={editForm.address}
                    onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Daily Attendance Webhook URL</label>
                  <input
                    type="url"
                    value={editForm.attendanceCallbackUrl}
                    onChange={e => setEditForm({ ...editForm, attendanceCallbackUrl: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono text-sm"
                  />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Remote Enrollment Callback URL</label>
                  <input
                    type="url"
                    value={editForm.enrollCallbackUrl}
                    onChange={e => setEditForm({ ...editForm, enrollCallbackUrl: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono text-sm"
                  />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Device Status Webhook URL</label>
                  <input
                    type="url"
                    value={editForm.deviceStatusCallbackUrl}
                    onChange={e => setEditForm({ ...editForm, deviceStatusCallbackUrl: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono text-sm"
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingOrg(null)} className="px-5 py-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2.5 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium transition-colors shadow-lg shadow-indigo-600/20">
                  Save Webhook Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
