import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import OrganizationManager from './components/OrganizationManager';
import ApiDocsTester from './components/ApiDocsTester';
import AdminPanel from './components/AdminPanel';
import AttendanceLog from './components/AttendanceLog';

const API_URL = import.meta.env.VITE_API_URL || '';
axios.defaults.baseURL = API_URL;

const socket = io(API_URL || '/', {
  transports: ['websocket', 'polling']
});

function App() {
  const [authType, setAuthType] = useState(null); // 'admin' | 'org' | null
  const [orgData, setOrgData] = useState(null);
  
  const [activeTab, setActiveTab] = useState('api');
  const [isConnected, setIsConnected] = useState(socket.connected);

  // Login States
  const [adminPassword, setAdminPassword] = useState('');
  const [orgToken, setOrgToken] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    return () => {
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminPassword === '12345678') {
      setAuthType('admin');
      setActiveTab('orgs');
      setLoginError('');
      setAdminPassword('');
    } else {
      setLoginError('Incorrect Super Admin password.');
    }
  };

  const handleOrgLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError('');
    try {
      const res = await axios.post('/api/v1/verify-token', { token: orgToken });
      if (res.data.valid) {
        setOrgData(res.data.organization);
        setAuthType('org');
        setActiveTab('api');
        setOrgToken('');
        // Tell socket to join this org's room
        socket.emit('join_org', res.data.organization.token);
      } else {
        setLoginError('Invalid Organization Token.');
      }
    } catch (err) {
      setLoginError('Failed to verify token. Please check the token and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthType(null);
    setOrgData(null);
    setAdminPassword('');
    setOrgToken('');
  };

  // ---------------- LOGIN SCREEN ----------------
  if (!authType) {
    return (
      <div className="min-h-screen w-full flex bg-slate-900 text-white relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-teal-500/20 blur-[120px]"></div>

        <div className="flex-1 flex flex-col justify-center items-center p-8 z-10">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-teal-400 mb-4">
              Smart Attendance Platform
            </h1>
            <p className="text-slate-400 text-lg">Select your portal to continue</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
            {/* Organization Login */}
            <div className="glass-panel bg-slate-800/50 p-8 rounded-2xl border border-slate-700 hover:border-teal-500/50 transition-all shadow-2xl">
              <div className="w-12 h-12 bg-teal-500/20 rounded-xl flex items-center justify-center mb-6">
                <span className="text-2xl">🏢</span>
              </div>
              <h2 className="text-2xl font-bold mb-2">Organization Portal</h2>
              <p className="text-slate-400 mb-6 text-sm">Access your developer APIs, webhooks, and attendance logs.</p>
              
              <form onSubmit={handleOrgLogin}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Secret Token</label>
                  <input 
                    type="text" 
                    value={orgToken}
                    onChange={(e) => setOrgToken(e.target.value)}
                    placeholder="e.g. org_live_..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                    required
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={isLoading}
                  className="w-full bg-teal-600 hover:bg-teal-500 text-white font-semibold py-3 rounded-lg transition-colors flex justify-center items-center gap-2"
                >
                  {isLoading ? 'Verifying...' : 'Access Portal →'}
                </button>
              </form>
            </div>

            {/* Admin Login */}
            <div className="glass-panel bg-slate-800/50 p-8 rounded-2xl border border-slate-700 hover:border-indigo-500/50 transition-all shadow-2xl">
              <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center mb-6">
                <span className="text-2xl">🔒</span>
              </div>
              <h2 className="text-2xl font-bold mb-2">SaaS Admin Portal</h2>
              <p className="text-slate-400 mb-6 text-sm">Manage client organizations, generate tokens, and monitor hardware.</p>
              
              <form onSubmit={handleAdminLogin}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Admin Password</label>
                  <input 
                    type="password" 
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    required
                  />
                </div>
                <button 
                  type="submit" 
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg transition-colors flex justify-center items-center gap-2"
                >
                  Login as Admin →
                </button>
              </form>
            </div>
          </div>

          {loginError && (
            <div className="mt-8 bg-red-500/10 border border-red-500/50 text-red-400 px-6 py-3 rounded-lg flex items-center gap-3">
              <span>⚠️</span>
              {loginError}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------- MAIN DASHBOARD LAYOUT ----------------
  return (
    <div className="flex h-screen bg-slate-50 w-full overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 bg-slate-900 text-slate-300 flex flex-col shadow-2xl z-20">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold text-white flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            SaaS Platform
          </h1>
          <div className="mt-4 flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
            {isConnected ? 'Cloud Connected' : 'Disconnected'}
          </div>
        </div>

        <div className="p-4 border-b border-slate-800 bg-slate-800/50">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Logged in as</p>
          <div className="flex items-center justify-between">
            <p className="font-medium text-white truncate">
              {authType === 'admin' ? 'Super Admin' : orgData?.name}
            </p>
            <button 
              onClick={handleLogout}
              className="text-xs bg-slate-700 hover:bg-red-500/20 hover:text-red-400 text-slate-300 px-2 py-1 rounded transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        <nav className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto">
          {authType === 'admin' && (
            <>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2 mt-2">Admin Tools</p>
              <button 
                onClick={() => setActiveTab('orgs')}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all ${activeTab === 'orgs' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <span className="text-lg">🏢</span>
                Organizations & API Tokens
              </button>
            </>
          )}

          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2 mt-4">Hardware & Data</p>
          <button 
            onClick={() => setActiveTab('api')}
            className={`flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all ${activeTab === 'api' ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20' : 'hover:bg-slate-800 hover:text-white'}`}
          >
            <span className="text-lg">🔌</span>
            Developer API & Webhook
          </button>
          <button 
            onClick={() => setActiveTab('admin')}
            className={`flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all ${activeTab === 'admin' ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20' : 'hover:bg-slate-800 hover:text-white'}`}
          >
            <span className="text-lg">👥</span>
            Member Biometrics
          </button>
          <button 
            onClick={() => setActiveTab('attendance')}
            className={`flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all ${activeTab === 'attendance' ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20' : 'hover:bg-slate-800 hover:text-white'}`}
          >
            <span className="text-lg">⏱️</span>
            Real-time Logs
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-slate-50 relative">
        {/* Top subtle gradient */}
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-slate-200 to-transparent pointer-events-none"></div>
        
        <div className="p-8 max-w-7xl mx-auto relative z-10">
          {activeTab === 'orgs' && authType === 'admin' && <OrganizationManager socket={socket} />}
          {activeTab === 'api' && <ApiDocsTester socket={socket} />}
          {activeTab === 'admin' && <AdminPanel socket={socket} authType={authType} orgData={orgData} />}
          {activeTab === 'attendance' && <AttendanceLog socket={socket} authType={authType} orgData={orgData} />}
        </div>
      </main>
    </div>
  );
}

export default App;
