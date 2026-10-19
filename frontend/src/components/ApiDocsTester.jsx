import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function ApiDocsTester({ socket }) {
  const [organizations, setOrganizations] = useState([]);
  const [inputToken, setInputToken] = useState('');
  const [activeOrgData, setActiveOrgData] = useState(null);
  const [tokenError, setTokenError] = useState('');
  
  // Webhook Register Form
  const [attendanceUrl, setAttendanceUrl] = useState('');
  const [enrollUrl, setEnrollUrl] = useState('');
  const [deviceStatusUrl, setDeviceStatusUrl] = useState('');

  // Interactive Remote Enrollment Tester Form
  const [testMemberId, setTestMemberId] = useState('STD-2026-001');
  const [testName, setTestName] = useState('Roni Ahmed');
  const [testEnrollType, setTestEnrollType] = useState('fingerprint');
  const [testFpId, setTestFpId] = useState('1');

  // Live Test Results Window
  const [testResult, setTestResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTabSection, setActiveTabSection] = useState('tester'); // 'tester' | 'docs'

  useEffect(() => {
    axios.get('/api/organizations')
      .then(res => {
        setOrganizations(res.data);
        if (res.data.length > 0 && !inputToken) {
          setInputToken(res.data[0].token);
        }
      })
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('device_status_change', (data) => {
        if (activeOrgData && data.token === activeOrgData.organization.token) {
          setActiveOrgData(prev => prev ? { ...prev, deviceStatus: data.status } : null);
        }
      });
    }
    return () => {
      if (socket) socket.off('device_status_change');
    };
  }, [socket, activeOrgData]);

  const handleVerifyToken = (tokenToVerify) => {
    const targetToken = tokenToVerify || inputToken;
    if (!targetToken.trim()) {
      setTokenError('Please enter your secret Organization Token first!');
      return;
    }
    setIsLoading(true);
    setTokenError('');

    axios.post('/api/v1/verify-token', { token: targetToken })
      .then(res => {
        if (res.data.valid) {
          setActiveOrgData(res.data);
          setAttendanceUrl(res.data.organization.attendanceCallbackUrl || '');
          setEnrollUrl(res.data.organization.enrollCallbackUrl || '');
          setDeviceStatusUrl(res.data.organization.deviceStatusCallbackUrl || '');
          setTestResult({ status: 'success', message: 'Token Validated Successfully!', data: res.data });
        } else {
          setTokenError('Invalid or inactive token.');
          setActiveOrgData(null);
        }
      })
      .catch(err => {
        setTokenError(err.response?.data?.message || 'Token verification failed.');
        setActiveOrgData(null);
      })
      .finally(() => setIsLoading(false));
  };

  const handleRegisterWebhooks = (e) => {
    e.preventDefault();
    if (!inputToken) return alert('Please enter token first!');
    setIsLoading(true);

    axios.post('/api/v1/config/webhook', {
      token: inputToken,
      attendance_callback_url: attendanceUrl,
      enroll_callback_url: enrollUrl,
      device_status_callback_url: deviceStatusUrl
    })
    .then(res => {
      setTestResult({ status: 'success', message: 'Webhooks Updated Successfully!', data: res.data });
      handleVerifyToken(inputToken);
    })
    .catch(err => setTestResult({ status: 'error', data: err.response?.data || err.message }))
    .finally(() => setIsLoading(false));
  };

  const handleTestWebhookDispatch = (eventType) => {
    if (!inputToken) return alert('Please enter token first!');
    setIsLoading(true);

    axios.post('/api/v1/test-webhook', {
      token: inputToken,
      eventType
    })
    .then(res => setTestResult({ status: 'webhook_test_result', eventType, data: res.data }))
    .catch(err => setTestResult({ status: 'error', data: err.response?.data || err.message }))
    .finally(() => setIsLoading(false));
  };

  const handleTestTriggerEnroll = () => {
    if (!inputToken) return alert('Please enter token first!');
    setIsLoading(true);

    axios.post('/api/v1/enroll', {
      token: inputToken,
      memberId: testMemberId,
      name: testName,
      enrollType: testEnrollType,
      fingerprintId: testEnrollType === 'fingerprint' ? testFpId : null,
      callback_url: enrollUrl
    })
    .then(res => setTestResult({ status: 'enroll_triggered', data: res.data }))
    .catch(err => setTestResult({ status: 'error', data: err.response?.data || err.message }))
    .finally(() => setIsLoading(false));
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* SaaS Developer Portal Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 shadow-xl border border-slate-700 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl"></div>
        <div className="relative z-10">
          <h2 className="text-2xl font-bold text-teal-400 mb-3 flex items-center gap-3">
            <span className="text-3xl">🔌</span> Client Developer API & Webhook Portal
          </h2>
          <p className="text-slate-300 text-lg leading-relaxed max-w-3xl">
            Enter your Organization Token below to check your hardware connection status live, register Webhook URLs, test Webhook delivery events, and view integration documentation.
          </p>
        </div>
      </div>

      {/* Token Verification & Portal Entry */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">
          <span>🔑</span> Authenticate Organization Token
        </h2>
        <p className="text-slate-500 mb-5 text-sm">
          Enter or select a valid Organization Token to access live developer settings & webhook controls:
        </p>

        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <input
            type="text"
            value={inputToken}
            onChange={e => setInputToken(e.target.value)}
            placeholder="Paste your secret Token (e.g. org_live_...)"
            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 font-mono text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
          />

          {organizations.length > 0 && (
            <select 
              value={inputToken} 
              onChange={e => {
                setInputToken(e.target.value);
                handleVerifyToken(e.target.value);
              }}
              className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            >
              <option value="">-- Quick Select Org --</option>
              {organizations.map(org => (
                <option key={org._id} value={org.token}>
                  🏢 {org.name}
                </option>
              ))}
            </select>
          )}

          <button 
            type="button" 
            onClick={() => handleVerifyToken(inputToken)}
            disabled={isLoading}
            className="bg-teal-600 hover:bg-teal-700 text-white font-medium py-3 px-6 rounded-lg transition-colors shadow-md shadow-teal-600/20 whitespace-nowrap flex items-center gap-2"
          >
            <span>🔍</span> Verify & Load Portal
          </button>
        </div>

        {tokenError && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg border border-red-200 text-sm font-medium flex items-center gap-2">
            <span>⚠️</span> {tokenError}
          </div>
        )}

        {/* Live Organization Info Header if Token Valid */}
        {activeOrgData && (
          <div className="mt-6 bg-slate-50 rounded-xl border border-slate-200 p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span>🏢</span> {activeOrgData.organization.name}
              </h3>
              <p className="text-sm text-slate-500 mt-1 font-medium">Token Authenticated & Verified</p>
            </div>

            <div>
              {activeOrgData.deviceStatus === 'online' ? (
                <span className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg border border-emerald-200 font-bold text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Hardware Device ONLINE & Connected
                </span>
              ) : (
                <span className="bg-slate-200 text-slate-600 px-4 py-2 rounded-lg border border-slate-300 font-bold text-sm flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                  Hardware Device OFFLINE
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Portal Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          className={`px-6 py-3 font-semibold text-sm transition-all rounded-t-lg ${activeTabSection === 'tester' ? 'bg-white text-teal-600 border border-b-0 border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
          onClick={() => setActiveTabSection('tester')}
        >
          🧪 Live Webhook & Enrollment Tester
        </button>
        <button
          className={`px-6 py-3 font-semibold text-sm transition-all rounded-t-lg ${activeTabSection === 'docs' ? 'bg-white text-teal-600 border border-b-0 border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
          onClick={() => setActiveTabSection('docs')}
        >
          📖 Complete API Specifications
        </button>
      </div>

      {activeTabSection === 'tester' ? (
        <div className="space-y-8 animate-fade-in">
          
          {/* Sandbox Warning Banner */}
          <div className="bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-xl shadow-sm">
            <div className="flex items-start gap-4">
              <span className="text-2xl mt-1">⚠️</span>
              <div>
                <h3 className="text-amber-800 font-bold text-lg mb-1">Developer Sandbox & Testing Environment</h3>
                <p className="text-amber-700 text-sm leading-relaxed mb-2">
                  This section is <strong>strictly for developers to simulate and test</strong> hardware events. Real users or students do <strong>NOT</strong> use this interface. 
                  When you click these buttons, our server pretends a hardware device was used, and dispatches test payloads to your webhooks.
                </p>
                <p className="text-amber-700 text-sm leading-relaxed font-semibold">
                  👉 For actual code examples on how to implement this in your own software, please check the <span className="bg-amber-200 px-2 py-0.5 rounded text-amber-900 cursor-pointer" onClick={() => setActiveTabSection('docs')}>📖 Complete API Specifications</span> tab.
                </p>
              </div>
            </div>
          </div>

          {/* Webhooks Config Form */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">
              <span>⚙️</span> Register Webhook URLs <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-1 rounded ml-2 uppercase tracking-wider">Test Tool</span>
            </h2>
            <p className="text-slate-500 mb-6 text-sm">
              Use this form to test registering your webhook URLs manually. In your actual implementation, your software will call the <code className="bg-slate-100 px-1 py-0.5 rounded border border-slate-200 font-mono text-xs">POST /api/v1/config/webhook</code> API programmatically to set these URLs.
            </p>

            <form onSubmit={handleRegisterWebhooks}>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">1. Daily Attendance Punch Webhook Callback URL</label>
                  <input
                    type="url"
                    value={attendanceUrl}
                    onChange={e => setAttendanceUrl(e.target.value)}
                    placeholder="https://your-school-erp.com/api/attendance-receiver"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/50 font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">2. Remote Enrollment Success Callback URL</label>
                  <input
                    type="url"
                    value={enrollUrl}
                    onChange={e => setEnrollUrl(e.target.value)}
                    placeholder="https://your-school-erp.com/api/enroll-receiver"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/50 font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">3. Hardware Device Online / Offline Status Callback URL</label>
                  <input
                    type="url"
                    value={deviceStatusUrl}
                    onChange={e => setDeviceStatusUrl(e.target.value)}
                    placeholder="https://your-school-erp.com/api/device-status-receiver"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/50 font-mono text-sm"
                  />
                </div>
              </div>

              <div className="mt-6">
                <button type="submit" disabled={isLoading} className="bg-slate-800 hover:bg-slate-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors flex items-center gap-2">
                  <span>💾</span> Save & Register Webhook URLs
                </button>
              </div>
            </form>
          </div>

          {/* Webhook Testing Dispatch Buttons */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">
              <span>🧪</span> Dispatch Mock Webhook Events to Your Receiver
            </h2>
            <p className="text-slate-500 mb-6 text-sm">
              Click any button below to trigger our server to send a live sample HTTP POST Webhook payload directly to your registered Callback URL.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <button
                type="button"
                className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white border-0 font-bold py-4 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-teal-500/30 hover:shadow-teal-500/50 hover:-translate-y-1 flex flex-col items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleTestWebhookDispatch('attendance')}
                disabled={isLoading}
              >
                <span className="text-2xl drop-shadow-md">📡</span> Test Attendance Webhook
              </button>

              <button
                type="button"
                className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white border-0 font-bold py-4 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:-translate-y-1 flex flex-col items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleTestWebhookDispatch('enroll')}
                disabled={isLoading}
              >
                <span className="text-2xl drop-shadow-md">📡</span> Test Enrollment Webhook
              </button>

              <button
                type="button"
                className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white border-0 font-bold py-4 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-1 flex flex-col items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleTestWebhookDispatch('device_status')}
                disabled={isLoading}
              >
                <span className="text-2xl">📡</span> Test Device Status Webhook
              </button>
            </div>
          </div>

          {/* Remote Machine Enrollment Simulator */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">
              <span>📲</span> Simulate Remote Machine Enrollment <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-1 rounded ml-2 uppercase tracking-wider">Test Tool</span>
            </h2>
            <p className="text-slate-500 mb-6 text-sm">
              Use this tool to mock triggering a remote hardware machine. In reality, your own server will make a <code className="bg-slate-100 px-1 py-0.5 rounded border border-slate-200 font-mono text-xs">POST /api/v1/enroll</code> request to our API to trigger this same event.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Student / Employee ID (memberId)</label>
                <input type="text" value={testMemberId} onChange={e => setTestMemberId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/50" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                <input type="text" value={testName} onChange={e => setTestName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/50" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Enrollment Type</label>
                <select value={testEnrollType} onChange={e => setTestEnrollType(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/50">
                  <option value="fingerprint">🖐️ Fingerprint Sensor</option>
                  <option value="rfid">💳 RFID Card Reader</option>
                </select>
              </div>

              {testEnrollType === 'fingerprint' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Fingerprint Slot ID (1-127)</label>
                  <input type="number" value={testFpId} onChange={e => setTestFpId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/50" />
                </div>
              )}
            </div>

            <div className="mt-6">
              <button 
                type="button" 
                onClick={handleTestTriggerEnroll} 
                disabled={isLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors shadow-md shadow-indigo-600/20 flex items-center gap-2"
              >
                <span>🚀</span> Send Live Enrollment Command to Hardware Machine
              </button>
            </div>
          </div>

          {/* Output Display Box */}
          {testResult && (
            <div className="bg-slate-900 rounded-2xl shadow-xl overflow-hidden border border-slate-800 animate-slide-up">
              <div className="bg-slate-800 px-6 py-3 border-b border-slate-700 flex justify-between items-center">
                <h3 className="text-teal-400 font-semibold text-sm flex items-center gap-2">
                  <span>📡</span> Live Server Test Payload & Webhook Response Output
                </h3>
                <button onClick={() => setTestResult(null)} className="text-slate-400 hover:text-white">&times;</button>
              </div>
              <div className="p-6 overflow-x-auto">
                <pre className="text-emerald-400 font-mono text-sm leading-relaxed">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Complete Developer Documentation Tab */
        <div className="space-y-8 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div className="border-b border-slate-200 pb-6 mb-8">
              <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3 mb-2">
                <span>📖</span> Complete SaaS Integration API & Webhooks Specification
              </h2>
              <p className="text-slate-600 text-sm leading-relaxed">
                Connect your School ERP, HR Management System, or Custom Application with our Biometric Attendance SaaS. 
                Below is the full specification for both <strong>Outgoing Webhooks</strong> (events our server sends to your callback URLs) 
                and <strong>Incoming REST APIs</strong> (endpoints your software can call).
              </p>
            </div>

            {/* Quick Summary Navigation Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4">
                <h4 className="text-emerald-800 font-bold text-sm mb-2 flex items-center gap-2">
                  <span>📡</span> Outgoing Webhooks (SaaS Server ➔ Your Server)
                </h4>
                <ul className="text-xs text-emerald-700 space-y-1.5 font-medium">
                  <li>• <strong>1. Daily Attendance Punch Webhook</strong> (attendance_callback_url)</li>
                  <li>• <strong>2. Remote Enrollment Success Webhook</strong> (enroll_callback_url)</li>
                  <li>• <strong>3. Hardware Device Online / Offline Status</strong> (device_status_callback_url)</li>
                </ul>
              </div>

              <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4">
                <h4 className="text-indigo-800 font-bold text-sm mb-2 flex items-center gap-2">
                  <span>⚡</span> Public REST APIs (Your Software ➔ SaaS Server)
                </h4>
                <ul className="text-xs text-indigo-700 space-y-1.5 font-medium">
                  <li>• <strong>POST /api/v1/verify-token</strong> — Authenticate Token & Get Device State</li>
                  <li>• <strong>POST /api/v1/config/webhook</strong> — Register / Update Webhook URLs</li>
                  <li>• <strong>POST /api/v1/enroll</strong> — Trigger Remote Hardware Machine Enrollment</li>
                  <li>• <strong>GET /api/v1/users</strong> — Fetch Enrolled Members/Students List</li>
                  <li>• <strong>GET /api/v1/logs</strong> — Fetch Recent Attendance Punch Logs</li>
                  <li>• <strong>POST /api/v1/test-webhook</strong> — Dispatch Mock Test Webhooks</li>
                </ul>
              </div>
            </div>

            <div className="space-y-14">
              
              {/* ==================================================== */}
              {/* SECTION A: WEBHOOK SPECIFICATIONS */}
              {/* ==================================================== */}
              <div>
                <div className="flex items-center gap-3 border-b-2 border-emerald-500 pb-3 mb-8">
                  <span className="bg-emerald-500 text-white text-xs font-black px-2.5 py-1 rounded-md uppercase tracking-wider">SECTION A</span>
                  <h3 className="text-xl font-bold text-slate-900">Outgoing Webhooks (Callbacks to Your Server)</h3>
                </div>

                <div className="space-y-10">
                  {/* Webhook 1: Attendance Punch */}
                  <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50/50">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs uppercase tracking-wider font-bold">Webhook 1</span>
                        Daily Attendance Punch Webhook
                      </h4>
                      <code className="text-xs font-mono bg-slate-200/70 text-slate-700 px-2 py-1 rounded">Target: attendance_callback_url</code>
                    </div>
                    <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                      Triggered instantaneously when an enrolled student or employee places their finger on the biometric scanner or scans their RFID card. 
                      If your receiver returns a JSON response containing <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">{"{ \"name\": \"Student Name\" }"}</code>, the hardware OLED screen will immediately greet the person with <strong>"WELCOME! Hello Student Name"</strong>!
                    </p>
                    <div className="bg-slate-900 rounded-xl p-5 overflow-x-auto border border-slate-800">
                      <pre className="text-slate-300 font-mono text-sm leading-relaxed">
<span className="text-slate-500">{"// HTTP POST Payload sent to your attendance_callback_url:\n"}</span>
{"{\n"}
{'  "event": "attendance_punch",\n'}
{'  "organization": "Oxford International School",\n'}
{`  "token": "${inputToken || 'YOUR_ORGANIZATION_TOKEN'}",\n`}
{'  "memberId": "STD-2026-001",\n'}
{'  "name": "Roni Ahmed",\n'}
{'  "fingerprintId": 1,\n'}
{'  "rfidUid": null, '}
<span className="text-slate-500">{"// or \"A1B2C3D4\" if RFID card was scanned\n"}</span>
{'  "timestamp": "2026-10-08T08:30:00.000Z"\n'}
{"}\n\n"}
<span className="text-slate-500">{"// Expected HTTP 200 OK Response from your server (shown on Machine OLED screen):\n"}</span>
{"{\n"}
{'  "status": "success",\n'}
{'  "name": "Roni Ahmed"\n'}
{"}"}
                      </pre>
                    </div>
                  </div>

                  {/* Webhook 2: Remote Enrollment Success */}
                  <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50/50">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs uppercase tracking-wider font-bold">Webhook 2</span>
                        Remote Enrollment Success Callback Webhook
                      </h4>
                      <code className="text-xs font-mono bg-slate-200/70 text-slate-700 px-2 py-1 rounded">Target: enroll_callback_url</code>
                    </div>
                    <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                      Triggered as soon as a user successfully completes the hardware enrollment process on the machine (e.g., placing the same finger twice or tapping an RFID card). 
                      Your server can listen to this webhook to instantly link the biometric slot ID or RFID UID to the student/employee profile in your database.
                    </p>
                    <div className="bg-slate-900 rounded-xl p-5 overflow-x-auto border border-slate-800">
                      <pre className="text-slate-300 font-mono text-sm leading-relaxed">
<span className="text-slate-500">{"// HTTP POST Payload sent to your enroll_callback_url:\n"}</span>
{"{\n"}
{'  "event": "enroll_success",\n'}
{'  "status": "success",\n'}
{'  "organization": "Oxford International School",\n'}
{`  "token": "${inputToken || 'YOUR_ORGANIZATION_TOKEN'}",\n`}
{'  "memberId": "STD-2026-001",\n'}
{'  "name": "Roni Ahmed",\n'}
{'  "enrollType": "fingerprint", '}
<span className="text-slate-500">{"// \"fingerprint\" or \"rfid\"\n"}</span>
{'  "fingerprintId": 1, '}
<span className="text-slate-500">{"// integer slot (1-127), null if RFID\n"}</span>
{'  "rfidUid": null, '}
<span className="text-slate-500">{"// hex string e.g. \"A1B2C3D4\", null if fingerprint\n"}</span>
{'  "timestamp": "2026-10-08T08:35:00.000Z"\n'}
{"}\n\n"}
<span className="text-slate-500">{"// Expected Response: HTTP 200 OK"}</span>
                      </pre>
                    </div>
                  </div>

                  {/* Webhook 3: Device Online/Offline Status */}
                  <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50/50">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs uppercase tracking-wider font-bold">Webhook 3</span>
                        Hardware Device Online / Offline Status Change
                      </h4>
                      <code className="text-xs font-mono bg-slate-200/70 text-slate-700 px-2 py-1 rounded">Target: device_status_callback_url</code>
                    </div>
                    <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                      Our central server sends an HTTP POST Webhook whenever your physical ESP8266 attendance hardware connects/boots up (<code className="text-emerald-600 font-bold">online</code>) or stops pinging the heartbeat for more than 45 seconds due to power loss or WiFi disconnection (<code className="text-rose-600 font-bold">offline</code>).
                    </p>
                    <div className="bg-slate-900 rounded-xl p-5 overflow-x-auto border border-slate-800">
                      <pre className="text-slate-300 font-mono text-sm leading-relaxed">
<span className="text-slate-500">{"// HTTP POST Payload sent to your device_status_callback_url:\n"}</span>
{"{\n"}
{'  "event": "device_status",\n'}
{'  "status": "online", '}
<span className="text-slate-500">{"// or \"offline\"\n"}</span>
{'  "organization": "Oxford International School",\n'}
{`  "token": "${inputToken || 'YOUR_ORGANIZATION_TOKEN'}",\n`}
{'  "timestamp": "2026-10-08T08:00:00.000Z"\n'}
{"}"}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>


              {/* ==================================================== */}
              {/* SECTION B: REST APIS SPECIFICATION */}
              {/* ==================================================== */}
              <div>
                <div className="flex items-center gap-3 border-b-2 border-indigo-500 pb-3 mb-8">
                  <span className="bg-indigo-600 text-white text-xs font-black px-2.5 py-1 rounded-md uppercase tracking-wider">SECTION B</span>
                  <h3 className="text-xl font-bold text-slate-900">Public REST APIs (Called by Your Software)</h3>
                </div>

                <div className="space-y-10">

                  {/* API 1: Verify Token */}
                  <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50/50">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs uppercase tracking-wider font-bold">POST</span>
                        1. Verify Token & Fetch Device Status (`/api/v1/verify-token`)
                      </h4>
                      <code className="text-xs font-mono bg-slate-200/70 text-slate-700 px-2 py-1 rounded">Auth: Token in Body or Header</code>
                    </div>
                    <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                      Use this API to validate that your Organization Token is active and retrieve the current real-time online/offline status of your hardware device along with registered webhook configuration.
                    </p>
                    <div className="bg-slate-900 rounded-xl p-5 overflow-x-auto border border-slate-800">
                      <pre className="text-slate-300 font-mono text-sm leading-relaxed">
<span className="text-emerald-400">curl</span> -X POST "{axios.defaults.baseURL || window.location.origin}/api/v1/verify-token" \
  -H "Content-Type: application/json" \
  -d '{"{"}
    "token": "{inputToken || 'YOUR_ORGANIZATION_TOKEN'}"
  {"}"}'

<span className="text-slate-500">{"\n// Response:\n"}</span>
{"{\n"}
{'  "valid": true,\n'}
{'  "organization": {\n'}
{'    "id": "6704981a2b...",\n'}
{'    "name": "Oxford International School",\n'}
{`    "token": "${inputToken || 'YOUR_ORGANIZATION_TOKEN'}",\n`}
{'    "attendanceCallbackUrl": "https://your-school-erp.com/api/attendance-receiver",\n'}
{'    "enrollCallbackUrl": "https://your-school-erp.com/api/enroll-receiver",\n'}
{'    "deviceStatusCallbackUrl": "https://your-school-erp.com/api/device-status-receiver"\n'}
{'  },\n'}
{'  "deviceStatus": "online",\n'}
{'  "lastDevicePing": "2026-10-08T08:29:45.000Z"\n'}
{"}"}
                      </pre>
                    </div>
                  </div>

                  {/* API 2: Register Webhooks */}
                  <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50/50">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs uppercase tracking-wider font-bold">POST</span>
                        2. Configure / Register Webhook URLs (`/api/v1/config/webhook`)
                      </h4>
                      <code className="text-xs font-mono bg-slate-200/70 text-slate-700 px-2 py-1 rounded">Auth: Token in Body</code>
                    </div>
                    <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                      Programmatically set or update the 3 webhook callback URLs for your organization.
                    </p>

                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
                      <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 font-bold text-xs text-slate-700 uppercase">Parameters</div>
                      <ul className="divide-y divide-slate-100 text-xs">
                        <li className="p-3"><code className="font-bold text-indigo-600">token</code> <span className="text-red-500 font-bold">(Required)</span> — Your Organization Token</li>
                        <li className="p-3"><code className="font-bold text-slate-700">attendance_callback_url</code> (Optional) — Receiver for daily attendance punches</li>
                        <li className="p-3"><code className="font-bold text-slate-700">enroll_callback_url</code> (Optional) — Receiver for remote enrollment confirmations</li>
                        <li className="p-3"><code className="font-bold text-slate-700">device_status_callback_url</code> (Optional) — Receiver for device online/offline alerts</li>
                      </ul>
                    </div>

                    <div className="bg-slate-900 rounded-xl p-5 overflow-x-auto border border-slate-800">
                      <pre className="text-slate-300 font-mono text-sm leading-relaxed">
<span className="text-emerald-400">curl</span> -X POST "{axios.defaults.baseURL || window.location.origin}/api/v1/config/webhook" \
  -H "Content-Type: application/json" \
  -d '{"{"}
    "token": "{inputToken || 'YOUR_ORGANIZATION_TOKEN'}",
    "attendance_callback_url": "https://your-school-erp.com/api/attendance-receiver",
    "enroll_callback_url": "https://your-school-erp.com/api/enroll-receiver",
    "device_status_callback_url": "https://your-school-erp.com/api/device-status-receiver"
  {"}"}'
                      </pre>
                    </div>
                  </div>

                  {/* API 3: Remote Enroll */}
                  <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50/50">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs uppercase tracking-wider font-bold">POST</span>
                        3. Trigger Remote Hardware Machine Enrollment (`/api/v1/enroll`)
                      </h4>
                      <code className="text-xs font-mono bg-slate-200/70 text-slate-700 px-2 py-1 rounded">Auth: Token in Body</code>
                    </div>
                    <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                      Put the biometric hardware device into enrollment mode remotely from your ERP software. The machine OLED display will prompt the user to place their finger or scan RFID.
                    </p>

                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
                      <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 font-bold text-xs text-slate-700 uppercase">Parameters</div>
                      <ul className="divide-y divide-slate-100 text-xs">
                        <li className="p-3"><code className="font-bold text-indigo-600">token</code> <span className="text-red-500 font-bold">(Required)</span> — Organization Token</li>
                        <li className="p-3"><code className="font-bold text-indigo-600">enrollType</code> <span className="text-red-500 font-bold">(Required)</span> — <code className="text-slate-700">"fingerprint"</code> or <code className="text-slate-700">"rfid"</code></li>
                        <li className="p-3"><code className="font-bold text-slate-700">memberId</code> (Optional) — Your internal user/student ID</li>
                        <li className="p-3"><code className="font-bold text-slate-700">name</code> (Optional) — Full name of user</li>
                        <li className="p-3"><code className="font-bold text-slate-700">fingerprintId</code> (Optional) — Slot ID (1-127). Auto-assigned if omitted</li>
                        <li className="p-3"><code className="font-bold text-slate-700">callback_url</code> (Optional) — Custom webhook URL for this specific enroll session</li>
                      </ul>
                    </div>

                    <div className="bg-slate-900 rounded-xl p-5 overflow-x-auto border border-slate-800">
                      <pre className="text-slate-300 font-mono text-sm leading-relaxed">
<span className="text-emerald-400">curl</span> -X POST "{axios.defaults.baseURL || window.location.origin}/api/v1/enroll" \
  -H "Content-Type: application/json" \
  -d '{"{"}
    "token": "{inputToken || 'YOUR_ORGANIZATION_TOKEN'}",
    "memberId": "STD-2026-001",
    "name": "Roni Ahmed",
    "enrollType": "fingerprint",
    "fingerprintId": 1
  {"}"}'
                      </pre>
                    </div>
                  </div>

                  {/* API 4: Fetch Enrolled Users */}
                  <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50/50">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs uppercase tracking-wider font-bold">GET</span>
                        4. Fetch Enrolled Users / Members List (`/api/v1/users`)
                      </h4>
                      <code className="text-xs font-mono bg-slate-200/70 text-slate-700 px-2 py-1 rounded">Header: x-device-token</code>
                    </div>
                    <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                      Retrieve the list of all members, students, or employees registered for your organization along with their fingerprint slot IDs and RFID UIDs.
                    </p>
                    <div className="bg-slate-900 rounded-xl p-5 overflow-x-auto border border-slate-800">
                      <pre className="text-slate-300 font-mono text-sm leading-relaxed">
<span className="text-emerald-400">curl</span> -X GET "{axios.defaults.baseURL || window.location.origin}/api/v1/users" \
  -H "x-device-token: {inputToken || 'YOUR_ORGANIZATION_TOKEN'}"

<span className="text-slate-500">{"\n// Response (Array of Users):\n"}</span>
{"[\n"}
{'  {\n'}
{'    "_id": "670499b2...",\n'}
{'    "memberId": "STD-2026-001",\n'}
{'    "name": "Roni Ahmed",\n'}
{'    "roll": "10",\n'}
{'    "fingerprintId": 1,\n'}
{'    "rfidUid": "A1B2C3D4",\n'}
{'    "createdAt": "2026-10-08T08:35:00.000Z"\n'}
{'  }\n'}
{"]"}
                      </pre>
                    </div>
                  </div>

                  {/* API 5: Fetch Attendance Logs */}
                  <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50/50">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs uppercase tracking-wider font-bold">GET</span>
                        5. Fetch Recent Attendance Punch Logs (`/api/v1/logs`)
                      </h4>
                      <code className="text-xs font-mono bg-slate-200/70 text-slate-700 px-2 py-1 rounded">Header: x-device-token</code>
                    </div>
                    <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                      Fetch the latest 100 attendance punch logs registered on the server.
                    </p>
                    <div className="bg-slate-900 rounded-xl p-5 overflow-x-auto border border-slate-800">
                      <pre className="text-slate-300 font-mono text-sm leading-relaxed">
<span className="text-emerald-400">curl</span> -X GET "{axios.defaults.baseURL || window.location.origin}/api/v1/logs" \
  -H "x-device-token: {inputToken || 'YOUR_ORGANIZATION_TOKEN'}"

<span className="text-slate-500">{"\n// Response (Array of Attendance Logs):\n"}</span>
{"[\n"}
{'  {\n'}
{'    "_id": "67049ab4...",\n'}
{'    "memberId": "STD-2026-001",\n'}
{'    "fingerprintId": 1,\n'}
{'    "rfidUid": null,\n'}
{'    "method": "fingerprint",\n'}
{'    "timestamp": "2026-10-08T08:30:00.000Z"\n'}
{'  }\n'}
{"]"}
                      </pre>
                    </div>
                  </div>

                  {/* API 6: Test Webhook Dispatch */}
                  <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50/50">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs uppercase tracking-wider font-bold">POST</span>
                        6. Test Webhook Dispatcher API (`/api/v1/test-webhook`)
                      </h4>
                      <code className="text-xs font-mono bg-slate-200/70 text-slate-700 px-2 py-1 rounded">Auth: Token in Body</code>
                    </div>
                    <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                      Programmatically trigger our server to send a mock test webhook payload to your registered callback URL to test your receiver endpoints.
                    </p>
                    <div className="bg-slate-900 rounded-xl p-5 overflow-x-auto border border-slate-800">
                      <pre className="text-slate-300 font-mono text-sm leading-relaxed">
<span className="text-emerald-400">curl</span> -X POST "{axios.defaults.baseURL || window.location.origin}/api/v1/test-webhook" \
  -H "Content-Type: application/json" \
  -d '{"{"}
    "token": "{inputToken || 'YOUR_ORGANIZATION_TOKEN'}",
    "eventType": "attendance" <span className="text-slate-500">{"// \"attendance\" | \"enroll\" | \"device_status\""}</span>
  {"}"}'
                      </pre>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
