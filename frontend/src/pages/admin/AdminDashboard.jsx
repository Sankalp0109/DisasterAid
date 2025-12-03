import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSocket } from "../../context/SocketContext";
import axios from "axios";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const [activeTab, setActiveTab] = useState("verification");
  const [loading, setLoading] = useState(false);

  // Verification state
  const [pendingVerifications, setPendingVerifications] = useState([]);
  const [verifiedUsers, setVerifiedUsers] = useState([]);

  // Role management state
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [roleForm, setRoleForm] = useState({ newRole: "", permissions: {} });

  // Data retention state
  const [retentionPolicy, setRetentionPolicy] = useState(null);
  const [policyForm, setPolicyForm] = useState({});

  // Export state
  const [exportFilters, setExportFilters] = useState({
    startDate: "",
    endDate: "",
    status: "",
    format: "json",
  });
  const [exportDebug, setExportDebug] = useState(null);

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

  // Fetch pending verifications
  const fetchPendingVerifications = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/admin/pending-verifications`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      setPendingVerifications(response.data.data || []);
    } catch (error) {
      console.error("Failed to fetch pending verifications:", error);
      alert("Failed to fetch pending verifications");
    } finally {
      setLoading(false);
    }
  };

  // Fetch verified users
  const fetchVerifiedUsers = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/admin/verified-users`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      setVerifiedUsers(response.data.data || []);
    } catch (error) {
      console.error("Failed to fetch verified users:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch all users for role management
  const fetchAllUsers = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/admin/all-users`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      setAllUsers(response.data.data || []);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch data retention policy
  const fetchRetentionPolicy = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/admin/retention-policy`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      setRetentionPolicy(response.data.policy);
      setPolicyForm(response.data.policy);
    } catch (error) {
      console.error("Failed to fetch retention policy:", error);
    } finally {
      setLoading(false);
    }
  };

  // Verify user
  const handleVerifyUser = async (userId, verify) => {
    try {
      const response = await axios.post(
        `${API_URL}/admin/verify-user`,
        { userId, status: verify },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      alert(response.data.message);
      fetchPendingVerifications();
      fetchVerifiedUsers();
    } catch (error) {
      alert("Verification failed: " + error.response?.data?.message);
    }
  };

  // Handle role change
  const handleRoleChange = async () => {
    if (!selectedUser || !roleForm.newRole) {
      alert("Select user and new role");
      return;
    }

    try {
      const response = await axios.post(
        `${API_URL}/admin/manage-role`,
        {
          userId: selectedUser._id,
          newRole: roleForm.newRole,
          permissions: roleForm.permissions,
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      alert(response.data.message);
      setSelectedUser(null);
      setRoleForm({ newRole: "", permissions: {} });
      fetchAllUsers();
    } catch (error) {
      alert("Role change failed: " + error.response?.data?.message);
    }
  };

  // Update retention policy
  const handleUpdatePolicy = async () => {
    try {
      const response = await axios.post(
        `${API_URL}/admin/retention-policy`,
        policyForm,
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      alert(response.data.message);
      fetchRetentionPolicy();
    } catch (error) {
      alert("Policy update failed: " + error.response?.data?.message);
    }
  };

  // Execute cleanup
  const handleExecuteCleanup = async () => {
    if (!confirm("This will permanently delete old data. Continue?")) return;

    try {
      setLoading(true);
      const response = await axios.post(
        `${API_URL}/admin/execute-cleanup`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      alert(`Cleanup completed:\n${JSON.stringify(response.data.stats, null, 2)}`);
    } catch (error) {
      alert("Cleanup failed: " + error.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  // Export data
  const handleExport = async (type) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (exportFilters.startDate) params.append("startDate", exportFilters.startDate);
      if (exportFilters.endDate) params.append("endDate", exportFilters.endDate);
      if (exportFilters.status) params.append("status", exportFilters.status);
      params.append("format", exportFilters.format);

      const endpoint = {
        incidents: "export/incidents",
        assignments: "export/assignments",
        ngos: "export/ngo-metrics",
        'audit-logs': "audit-logs",
      }[type];

      // If requesting CSV, ask axios to return a blob so we can download it.
      const axiosOptions = {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      };

      if (exportFilters.format === "csv") {
        axiosOptions.responseType = "blob";
      }

      const response = await axios.get(`${API_URL}/admin/${endpoint}?${params}`, axiosOptions);

      // Save basic debug info
      const debugBase = {
        status: response.status,
        headers: response.headers,
      };

      setExportDebug({ ...debugBase, note: 'received response' });

      if (exportFilters.format === "csv") {
        // response.data should be a Blob when responseType='blob'
        const blobData = response.data instanceof Blob ? response.data : new Blob([response.data]);

        // Try to extract filename from content-disposition header if provided
        const disposition = response.headers?.["content-disposition"] || response.headers?.["Content-Disposition"];
        let filename = `${type}-export.csv`;
        if (disposition) {
          const match = /filename=\"?([^\";]+)\"?/.exec(disposition);
          if (match && match[1]) filename = match[1];
        }

        // If the server returned JSON (error), detect and show it instead of downloading
        const contentType = blobData.type || '';

        // gather size & preview
        let size = blobData.size || null;
        let preview = null;
        try {
          if (size && size < 2000000) {
            // only read small blobs to preview
            preview = await blobData.text();
            if (preview.length > 1000) preview = preview.slice(0, 1000) + '...';
          }
        } catch (e) {
          console.warn('Failed to read blob for preview', e);
        }

        // Update debug info
        setExportDebug({ ...debugBase, filename, contentType, size, preview });

        if (contentType.includes('application/json') || contentType.includes('text')) {
          try {
            const text = preview ?? (await blobData.text());
            const parsed = JSON.parse(text);
            // If backend returned an error structure, show it
            if (parsed && parsed.success === false) {
              alert('Export failed: ' + (parsed.message || parsed.error || JSON.stringify(parsed)));
              console.error('Export error response:', parsed);
              return;
            }
            // Otherwise fall through and download as plain text
          } catch (err) {
            console.warn('Failed to parse error blob as JSON', err);
          }
        }

        const url = window.URL.createObjectURL(blobData);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        // Cleanup
        setTimeout(() => {
          link.remove();
          window.URL.revokeObjectURL(url);
        }, 1000);
      } else {
        // JSON response: either { success: true, data } or direct array/object
        const payload = response.data && response.data.data !== undefined ? response.data.data : response.data;

        const jsonCount = Array.isArray(payload) ? payload.length : (payload && typeof payload === 'object' && payload.length ? payload.length : null);
        setExportDebug({ ...debugBase, jsonCount });

        try {
          // Prepare filename (server may provide Content-Disposition header even for JSON)
          const disposition = response.headers?.["content-disposition"] || response.headers?.["Content-Disposition"];
          let filename = `${type}-export.json`;
          if (disposition) {
            const match = /filename="?([^";]+)"?/.exec(disposition);
            if (match && match[1]) filename = match[1];
          }

          const jsonText = JSON.stringify(payload, null, 2);
          const blob = new Blob([jsonText], { type: "application/json" });

          // preview (small)
          let preview = jsonText;
          if (preview && preview.length > 1000) preview = preview.slice(0, 1000) + "...";

          setExportDebug((d) => ({ ...d, filename, contentType: blob.type, size: blob.size, preview }));

          // Trigger download
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.setAttribute("download", filename);
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            link.remove();
            window.URL.revokeObjectURL(url);
          }, 1000);

        } catch (err) {
          console.error('Failed to prepare JSON download', err);
          alert(`Exported ${jsonCount ?? 0} records`);
        }
      }
    } catch (error) {
      console.error('Export error', error);
      const status = error.response?.status;
      const errMsg = error.response?.data?.message || error.message || 'Unknown error';
      if (status === 404) {
        alert('Export endpoint not found on the server (404). The backend may not provide audit log export. Please add a /admin/audit-logs endpoint or contact backend developer.');
      }
      // If error response is a blob (CORS/server), try to read
      try {
        if (error.response?.data && typeof error.response.data.text === 'function') {
          const txt = await error.response.data.text();
          setExportDebug({ status: error.response.status, headers: error.response.headers, preview: txt.slice(0,1000) });
        } else {
          setExportDebug({ error: errMsg, status: error.response?.status });
        }
      } catch (e) {
        setExportDebug({ error: errMsg });
      }

      alert("Export failed: " + errMsg);
    } finally {
      setLoading(false);
    }
  };

  // Load data when tab changes
  useEffect(() => {
    if (activeTab === "verification") {
      fetchPendingVerifications();
      fetchVerifiedUsers();
    } else if (activeTab === "roles") {
      fetchAllUsers();
    } else if (activeTab === "retention") {
      fetchRetentionPolicy();
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-600">{connected ? 'Connected' : 'Disconnected'}</span>
            </div>
            {user && (
              <div className="text-sm text-gray-700 mr-2">
                Signed in as <span className="font-medium">{user.name}</span>
              </div>
            )}

            <button
              onClick={() => navigate('/admin/create-user')}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-5 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New User
            </button>

            <button
              onClick={async () => {
                try {
                  await logout();
                  navigate('/login');
                } catch (err) {
                  console.error('Logout failed', err);
                  alert('Logout failed. Please try again.');
                }
              }}
              className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-3 px-4 rounded-lg transition-colors"
              title="Logout"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" />
              </svg>
              Logout
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-8">
          {[
            { id: "verification", label: "Verification" },
            { id: "roles", label: "Role Management" },
            { id: "retention", label: "Data Retention" },
            { id: "export", label: "Export" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-medium border-b-2 transition ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Verification Tab */}
        {activeTab === "verification" && (
          <div className="space-y-8">
            {/* Pending Verifications */}
            {/* <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Pending Verifications</h2>
              {loading ? (
                <p className="text-gray-500">Loading...</p>
              ) : pendingVerifications.length === 0 ? (
                <p className="text-gray-500">No pending verifications</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left">Name</th>
                        <th className="px-4 py-2 text-left">Email</th>
                        <th className="px-4 py-2 text-left">Role</th>
                        <th className="px-4 py-2 text-left">Organization</th>
                        <th className="px-4 py-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingVerifications.map((user) => (
                        <tr key={user._id} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-2">{user.name}</td>
                          <td className="px-4 py-2">{user.email}</td>
                          <td className="px-4 py-2 capitalize">{user.role}</td>
                          <td className="px-4 py-2">{user.organizationName || "-"}</td>
                          <td className="px-4 py-2 text-center space-x-2">
                            <button
                              onClick={() => handleVerifyUser(user._id, true)}
                              className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-xs"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleVerifyUser(user._id, false)}
                              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs"
                            >
                              Reject
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div> */}

            {/* Verified Users */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Verified Users</h2>
              {verifiedUsers.length === 0 ? (
                <p className="text-gray-500">No verified users</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left">Name</th>
                        <th className="px-4 py-2 text-left">Email</th>
                        <th className="px-4 py-2 text-left">Role</th>
                        <th className="px-4 py-2 text-left">Organization</th>
                        <th className="px-4 py-2 text-left">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verifiedUsers.map((user) => (
                        <tr key={user._id} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-2">{user.name}</td>
                          <td className="px-4 py-2">{user.email}</td>
                          <td className="px-4 py-2 capitalize">{user.role}</td>
                          <td className="px-4 py-2">{user.organizationName || "-"}</td>
                          <td className="px-4 py-2 text-xs text-gray-500">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Role Management Tab */}
        {activeTab === "roles" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-6">Manage User Roles & Permissions</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* User Selection */}
              <div>
                <h3 className="font-medium mb-3">Select User</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto border border-gray-200 rounded p-3">
                  {allUsers.map((user) => (
                    <button
                      key={user._id}
                      onClick={() => {
                        setSelectedUser(user);
                        setRoleForm({ newRole: user.role, permissions: {} });
                      }}
                      className={`w-full text-left px-3 py-2 rounded ${
                        selectedUser?._id === user._id
                          ? "bg-blue-100 border border-blue-500"
                          : "bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      <div className="font-medium">{user.name}</div>
                      <div className="text-xs text-gray-600">{user.email} • {user.role}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Role Update Form */}
              <div>
                {selectedUser ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">New Role</label>
                      <select
                        value={roleForm.newRole}
                        onChange={(e) => setRoleForm({ ...roleForm, newRole: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded"
                      >
                        <option value="victim">Victim</option>
                        <option value="ngo">NGO</option>
                        <option value="authority">Authority</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>

                    <button
                      onClick={handleRoleChange}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium"
                    >
                      Update Role
                    </button>
                  </div>
                ) : (
                  <p className="text-gray-500">Select a user to modify their role</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Data Retention Tab */}
        {activeTab === "retention" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-6">Data Retention Policy</h2>
            {retentionPolicy ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Request Retention (days)</label>
                    <input
                      type="number"
                      min="30"
                      max="2555"
                      value={policyForm.requestRetentionDays || 365}
                      onChange={(e) => setPolicyForm({ ...policyForm, requestRetentionDays: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Assignment Retention (days)</label>
                    <input
                      type="number"
                      min="30"
                      max="2555"
                      value={policyForm.assignmentRetentionDays || 180}
                      onChange={(e) => setPolicyForm({ ...policyForm, assignmentRetentionDays: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Audit Log Retention (days)</label>
                    <input
                      type="number"
                      min="30"
                      max="2555"
                      value={policyForm.auditLogRetentionDays || 90}
                      onChange={(e) => setPolicyForm({ ...policyForm, auditLogRetentionDays: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Cleanup Schedule</label>
                    <select
                      value={policyForm.cleanupSchedule || "weekly"}
                      onChange={(e) => setPolicyForm({ ...policyForm, cleanupSchedule: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={policyForm.autoCleanupEnabled || false}
                    onChange={(e) => setPolicyForm({ ...policyForm, autoCleanupEnabled: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label className="text-sm">Enable automatic cleanup</label>
                </div>

                <div className="space-y-2">
                  <h3 className="font-medium">Exceptions</h3>
                  <div className="space-y-2">
                    {["keepCriticalRequests", "keepCompletedAssignments", "keepFailedAssignments"].map((exc) => (
                      <label key={exc} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={policyForm.exceptions?.[exc] || false}
                          onChange={(e) =>
                            setPolicyForm({
                              ...policyForm,
                              exceptions: { ...policyForm.exceptions, [exc]: e.target.checked },
                            })
                          }
                          className="w-4 h-4"
                        />
                        <span className="text-sm">{exc.replace(/keep|Assignments|Requests/g, " ").trim()}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={handleUpdatePolicy}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium"
                  >
                    Update Policy
                  </button>
                  <button
                    onClick={handleExecuteCleanup}
                    disabled={loading}
                    className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-medium disabled:opacity-50"
                  >
                    {loading ? "Executing..." : "Execute Cleanup Now"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">Loading policy...</p>
            )}
          </div>
        )}

        {/* Export Tab */}
        {activeTab === "export" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-6">Export Data</h2>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Start Date</label>
                  <input
                    type="date"
                    value={exportFilters.startDate}
                    onChange={(e) => setExportFilters({ ...exportFilters, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">End Date</label>
                  <input
                    type="date"
                    value={exportFilters.endDate}
                    onChange={(e) => setExportFilters({ ...exportFilters, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Status (optional)</label>
                  <select
                    value={exportFilters.status}
                    onChange={(e) => setExportFilters({ ...exportFilters, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  >
                    <option value="">All</option>
                    <option value="new">New</option>
                    <option value="assigned">Assigned</option>
                    <option value="fulfilled">Fulfilled</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Format</label>
                  <select
                    value={exportFilters.format}
                    onChange={(e) => setExportFilters({ ...exportFilters, format: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  >
                    <option value="json">JSON</option>
                    <option value="csv">CSV</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => handleExport("incidents")}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium disabled:opacity-50"
                >
                  {loading ? "Exporting..." : "Export Incidents"}
                </button>
                <button
                  onClick={() => handleExport("assignments")}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium disabled:opacity-50"
                >
                  {loading ? "Exporting..." : "Export Assignments"}
                </button>
                <button
                  onClick={() => handleExport("ngos")}
                  disabled={loading}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded font-medium disabled:opacity-50"
                >
                  {loading ? "Exporting..." : "Export NGO Metrics"}
                </button>
                <button
                  onClick={() => handleExport("audit-logs")}
                  disabled={loading}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded font-medium disabled:opacity-50"
                  title="Export audit logs from the server (requires backend /admin/audit-logs endpoint)"
                >
                  {loading ? "Exporting..." : "Export Audit Logs"}
                </button>
              </div>

              {/* Export diagnostics (visible when present) */}
              {exportDebug && (
                <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded text-sm">
                  <h4 className="font-medium mb-2">Export debug</h4>
                  <div className="text-xs text-gray-600">
                    <div>Status: {exportDebug.status ?? 'n/a'}</div>
                    {exportDebug.filename && <div>Filename: {exportDebug.filename}</div>}
                    {exportDebug.contentType && <div>Content-Type: {exportDebug.contentType}</div>}
                    {exportDebug.size !== undefined && <div>Size: {exportDebug.size} bytes</div>}
                    {exportDebug.jsonCount !== undefined && <div>JSON records: {exportDebug.jsonCount}</div>}
                    {exportDebug.error && <div className="text-red-600">Error: {exportDebug.error}</div>}
                    {exportDebug.preview && (
                      <div className="mt-2">
                        <div className="font-medium">Preview:</div>
                        <pre className="whitespace-pre-wrap max-h-40 overflow-auto bg-white p-2 border rounded text-xs">{exportDebug.preview}</pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
