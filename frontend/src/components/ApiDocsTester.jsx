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
            <h2 className="text-2xl font-bold text-slate-800 mb-8 border-b border-slate-100 pb-4">📖 Complete SaaS Integration API & Webhooks Specification</h2>

            <div className="space-y-12">
              
              {/* 1. Device Status Webhook */}
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-3 mb-2">
                  <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs uppercase tracking-wider font-bold">Webhook</span>
                  1. Hardware Device Online / Offline Status Change
                </h3>
                <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                  Our central server automatically sends an HTTP POST Webhook payload to your <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">device_status_callback_url</code> whenever your attendance hardware connects (online) or loses heartbeat disconnection (offline).
                </p>
                <div className="bg-slate-900 rounded-xl p-5 overflow-x-auto border border-slate-800">
                  <pre className="text-slate-300 font-mono text-sm leading-relaxed">
<span className="text-slate-500">{"// Sent to your device_status_callback_url\n"}</span>
{"{\n"}
{'  "event": "device_status",\n'}
{'  "status": "online", '}
<span className="text-slate-500">{"// or \"offline\"\n"}</span>
{'  "organization": "Oxford International School",\n'}
{`  "token": "${inputToken || 'YOUR_ORGANIZATION_TOKEN'}",\n`}
{'  "timestamp": "2026-10-02T14:00:00.000Z"\n'}
{"}"}
                  </pre>
                </div>
              </div>

              {/* 2. Attendance Punch Webhook */}
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-3 mb-2">
                  <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs uppercase tracking-wider font-bold">Webhook</span>
                  2. Real-Time Daily Attendance Punch Webhook
                </h3>
                <p className="text-slate-600 mb-4 text-sm leading-relaxed">
                  When a student/employee scans their finger or RFID card, our server posts this payload to your <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">attendance_callback_url</code>. If your server returns <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">{"{ \"name\": \"Roni Ahmed\" }"}</code> in response, the hardware OLED screen will immediately display <strong>"WELCOME! Hello Roni Ahmed"</strong>!
                </p>
                <div className="bg-slate-900 rounded-xl p-5 overflow-x-auto border border-slate-800">
                  <pre className="text-slate-300 font-mono text-sm leading-relaxed">
<span className="text-slate-500">{"// Sent to your attendance_callback_url\n"}</span>
{"{\n"}
{'  "event": "attendance_punch",\n'}
{'  "organization": "Oxford International School",\n'}
{`  "token": "${inputToken || 'YOUR_ORGANIZATION_TOKEN'}",\n`}
{'  "memberId": "STD-2026-001",\n'}
{'  "name": "Roni Ahmed",\n'}
{'  "fingerprintId": 1,\n'}
{'  "rfidUid": null,\n'}
{'  "timestamp": "2026-10-02T14:05:00.000Z"\n'}
{"}\n\n"}
<span className="text-slate-500">{"// Your Server Expected Response (Status 200 OK):\n"}</span>
{"{\n"}
{'  "status": "success",\n'}
{'  "name": "Roni Ahmed"\n'}
{"}"}
                  </pre>
                </div>
              </div>

              {/* 3. Register Webhooks Endpoint */}
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-3 mb-4">
                  <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-xs uppercase tracking-wider font-bold">POST</span>
                  3. Configure / Register Webhook URLs API (`/api/v1/config/webhook`)
                </h3>
                
                <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden mb-4">
                  <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 font-bold text-sm text-slate-700">Request Body Parameters</div>
                  <ul className="divide-y divide-slate-200">
                    <li className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-indigo-600 font-bold text-sm bg-indigo-50 px-1.5 py-0.5 rounded">token</code>
                        <span className="bg-red-100 text-red-700 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">Required</span>
                        <span className="text-slate-500 text-xs">string</span>
                      </div>
                      <p className="text-sm text-slate-600">The secret Organization API Token generated from the SaaS Admin Panel.</p>
                    </li>
                    <li className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-slate-700 font-bold text-sm bg-slate-100 px-1.5 py-0.5 rounded">attendance_callback_url</code>
                        <span className="bg-slate-200 text-slate-600 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">Optional</span>
                        <span className="text-slate-500 text-xs">string (URL)</span>
                      </div>
                      <p className="text-sm text-slate-600">The URL on your server to receive real-time daily attendance punch data.</p>
                    </li>
                    <li className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-slate-700 font-bold text-sm bg-slate-100 px-1.5 py-0.5 rounded">enroll_callback_url</code>
                        <span className="bg-slate-200 text-slate-600 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">Optional</span>
                        <span className="text-slate-500 text-xs">string (URL)</span>
                      </div>
                      <p className="text-sm text-slate-600">The URL on your server to receive successful remote enrollment data.</p>
                    </li>
                    <li className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-slate-700 font-bold text-sm bg-slate-100 px-1.5 py-0.5 rounded">device_status_callback_url</code>
                        <span className="bg-slate-200 text-slate-600 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">Optional</span>
                        <span className="text-slate-500 text-xs">string (URL)</span>
                      </div>
                      <p className="text-sm text-slate-600">The URL on your server to receive hardware device online/offline status alerts.</p>
                    </li>
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

              {/* 4. Remote Enroll Endpoint */}
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-3 mb-4">
                  <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-xs uppercase tracking-wider font-bold">POST</span>
                  4. Trigger Remote Machine Enrollment API (`/api/v1/enroll`)
                </h3>
                
                <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden mb-4">
                  <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 font-bold text-sm text-slate-700">Request Body Parameters</div>
                  <ul className="divide-y divide-slate-200">
                    <li className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-indigo-600 font-bold text-sm bg-indigo-50 px-1.5 py-0.5 rounded">token</code>
                        <span className="bg-red-100 text-red-700 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">Required</span>
                        <span className="text-slate-500 text-xs">string</span>
                      </div>
                      <p className="text-sm text-slate-600">The secret Organization API Token.</p>
                    </li>
                    <li className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-indigo-600 font-bold text-sm bg-indigo-50 px-1.5 py-0.5 rounded">enrollType</code>
                        <span className="bg-red-100 text-red-700 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">Required</span>
                        <span className="text-slate-500 text-xs">string ("fingerprint" | "rfid")</span>
                      </div>
                      <p className="text-sm text-slate-600">The type of enrollment to trigger on the hardware machine.</p>
                    </li>
                    <li className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-slate-700 font-bold text-sm bg-slate-100 px-1.5 py-0.5 rounded">memberId</code>
                        <span className="bg-slate-200 text-slate-600 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">Optional</span>
                        <span className="text-slate-500 text-xs">string</span>
                      </div>
                      <p className="text-sm text-slate-600">Your system's unique identifier for the user (e.g., student ID or employee ID).</p>
                    </li>
                    <li className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-slate-700 font-bold text-sm bg-slate-100 px-1.5 py-0.5 rounded">name</code>
                        <span className="bg-slate-200 text-slate-600 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">Optional</span>
                        <span className="text-slate-500 text-xs">string</span>
                      </div>
                      <p className="text-sm text-slate-600">The full name of the user being enrolled.</p>
                    </li>
                    <li className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-slate-700 font-bold text-sm bg-slate-100 px-1.5 py-0.5 rounded">fingerprintId</code>
                        <span className="bg-slate-200 text-slate-600 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">Optional</span>
                        <span className="text-slate-500 text-xs">number (1-127)</span>
                      </div>
                      <p className="text-sm text-slate-600">Specific slot to save the fingerprint. If omitted, the server auto-assigns the next available slot.</p>
                    </li>
                    <li className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-slate-700 font-bold text-sm bg-slate-100 px-1.5 py-0.5 rounded">callback_url</code>
                        <span className="bg-slate-200 text-slate-600 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">Optional</span>
                        <span className="text-slate-500 text-xs">string (URL)</span>
                      </div>
                      <p className="text-sm text-slate-600">A custom webhook URL specifically for this enroll event. Overrides the default `enroll_callback_url`.</p>
                    </li>
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

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
