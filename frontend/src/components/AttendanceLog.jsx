import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function AttendanceLog({ socket, authType, orgData }) {
  const [logs, setLogs] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');

  const fetchOrganizations = () => {
    axios.get('/api/organizations')
      .then(res => setOrganizations(res.data))
      .catch(err => console.error(err));
  };

  const fetchLogs = (orgId) => {
    const url = orgId ? `/api/logs?orgId=${orgId}` : '/api/logs';
    axios.get(url)
      .then(res => setLogs(res.data))
      .catch(err => console.error('Error fetching logs:', err));
  };

  useEffect(() => {
    if (authType === 'admin') {
      fetchOrganizations();
      fetchLogs(selectedOrgId);
    } else if (authType === 'org' && orgData) {
      setOrganizations([orgData]);
      setSelectedOrgId(orgData._id);
      fetchLogs(orgData._id);
    }
  }, [selectedOrgId, authType, orgData]);

  useEffect(() => {
    if (socket) {
      socket.on('new_attendance', (data) => {
        if (!selectedOrgId || data.orgId === selectedOrgId) {
          setLogs(prev => [{ ...data, isNew: true }, ...prev]);
        }
      });
    }

    return () => {
      if (socket) {
        socket.off('new_attendance');
      }
    };
  }, [socket, selectedOrgId]);

  const handleDeleteSingleLog = (id) => {
    axios.delete(`/api/logs/${id}`)
      .then(() => fetchLogs(selectedOrgId))
      .catch(err => console.error(err));
  };

  const handleClearAllLogs = () => {
    if (window.confirm('Are you sure you want to delete ALL attendance logs?')) {
      axios.delete('/api/logs')
        .then(() => setLogs([]))
        .catch(err => console.error(err));
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Filter Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex-1 max-w-sm">
          {authType === 'admin' ? (
            <>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Filter Attendance Logs
              </label>
              <select
                value={selectedOrgId}
                onChange={e => setSelectedOrgId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                <option value="">-- All Client Organizations --</option>
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

        {logs.length > 0 && (
          <button
            onClick={handleClearAllLogs}
            className="bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-2.5 px-5 rounded-lg border border-red-200 transition-colors flex items-center gap-2 text-sm"
          >
            <span>🗑️</span> Clear All Logs
          </button>
        )}
      </div>

      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <span>⏱️</span> Real-time Attendance Scans & Webhook Stream 
          <span className="bg-slate-200 text-slate-600 text-sm py-0.5 px-2.5 rounded-full ml-2">{logs.length}</span>
        </h2>
      </div>

      {logs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
          <div className="text-5xl mb-4 opacity-50">📡</div>
          <h3 className="text-lg font-bold text-slate-700 mb-1">Waiting for Scans...</h3>
          <p className="text-slate-500 max-w-md mx-auto">No attendance activity logged yet. Scan a fingerprint or RFID card on any hardware device to see it appear here instantly.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {logs.map((log, idx) => (
            <div 
              key={log._id || idx} 
              className={`bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all duration-500 ${log.isNew ? 'bg-indigo-50/50 border-indigo-200 shadow-md shadow-indigo-500/10 scale-[1.01]' : 'hover:border-slate-300'}`}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-lg font-bold shadow-sm shrink-0">
                  {log.name ? log.name.charAt(0).toUpperCase() : '?'}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2 flex-wrap">
                    {log.name || 'Unknown User'}
                    {log.memberId && <span className="bg-slate-100 text-slate-600 border border-slate-200 text-xs px-2 py-0.5 rounded font-semibold">ID: {log.memberId}</span>}
                    {log.orgName && <span className="text-indigo-600 text-xs font-bold border border-indigo-100 bg-indigo-50 px-2 py-0.5 rounded flex items-center gap-1">🏢 {log.orgName}</span>}
                  </h3>
                  
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-2 py-1 rounded border border-slate-200">
                      {log.method || `ID: ${log.fingerprintId}`}
                    </span>
                    
                    {log.webhookStatus === 'sent' && (
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                        <span>🌐</span> Webhook Delivered
                      </span>
                    )}
                    {log.webhookStatus === 'failed' && (
                      <span className="bg-red-50 text-red-700 border border-red-200 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                        <span>⚠️</span> Webhook Failed
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 w-full sm:w-auto justify-end">
                <div className="text-right">
                  <div className="text-slate-800 font-bold font-mono">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                  <div className="text-slate-400 text-xs font-medium">
                    {new Date(log.timestamp).toLocaleDateString()}
                  </div>
                </div>
                
                {log._id && (
                  <button
                    className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition-colors"
                    title="Delete log"
                    onClick={() => handleDeleteSingleLog(log._id)}
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
