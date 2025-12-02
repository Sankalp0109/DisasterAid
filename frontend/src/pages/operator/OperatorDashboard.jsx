import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import axios from 'axios';
import {
  Users,
  LogOut,
  AlertTriangle,
  CheckCircle,
  Clock,
  MapPin,
  Filter,
  Search,
  RefreshCw,
  UserPlus,
  TrendingUp,
  Package,
  X
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function OperatorDashboard() {
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('triage');
  const [requests, setRequests] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [ngos, setNgos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [assignmentModal, setAssignmentModal] = useState(false);
  const [selectedNgo, setSelectedNgo] = useState('');
  const [assignmentNotes, setAssignmentNotes] = useState('');
  
  // Operator Features State
  const [duplicates, setDuplicates] = useState([]);
  const [matches, setMatches] = useState([]);
  const [escalations, setEscalations] = useState([]);
  const [operatorLoading, setOperatorLoading] = useState(false);
  const [mergeModal, setMergeModal] = useState(false);
  const [selectedDuplicate, setSelectedDuplicate] = useState(null);
  const [mergeNotes, setMergeNotes] = useState('');
  const [escalationModal, setEscalationModal] = useState(false);
  const [selectedEscalation, setSelectedEscalation] = useState(null);
  const [escalationAction, setEscalationAction] = useState('');
  const [escalationNotes, setEscalationNotes] = useState('');
  const [newPriority, setNewPriority] = useState('');

  useEffect(() => {
    fetchRequests();
    fetchClusters();
    fetchNgos();
  }, []);
  
  // Fetch operator-specific data when switching tabs
  useEffect(() => {
    if (activeTab === 'duplicates') {
      fetchDuplicates();
    } else if (activeTab === 'matches') {
      fetchMatches();
    } else if (activeTab === 'escalations') {
      fetchEscalations();
    }
  }, [activeTab]);

  useEffect(() => {
    if (socket && connected) {
      socket.on('request:created', (data) => setRequests(prev => [data.request, ...prev]));
      socket.on('request:updated', (data) => {
        setRequests(prev => prev.map(r => r._id === data.requestId ? { ...r, ...data.updates } : r));
      });
      
      // Operator-specific events
      socket.on('duplicate:resolved', (data) => {
        if (activeTab === 'duplicates') {
          fetchDuplicates();
        }
      });
      
      socket.on('match:confirmed', (data) => {
        if (activeTab === 'matches') {
          fetchMatches();
        }
        fetchRequests(); // Refresh main requests
      });
      
      socket.on('escalation:created', (data) => {
        if (activeTab === 'escalations') {
          fetchEscalations();
        }
        // Show notification
        console.log('New escalation created:', data.ticketNumber, data.reason);
      });
      
      socket.on('escalation:handled', (data) => {
        if (activeTab === 'escalations') {
          fetchEscalations();
        }
      });
      
      return () => {
        socket.off('request:created');
        socket.off('request:updated');
        socket.off('duplicate:resolved');
        socket.off('match:confirmed');
        socket.off('escalation:created');
        socket.off('escalation:handled');
      };
    }
  }, [socket, connected, activeTab]);

  const fetchRequests = async () => {
    try {
      const response = await axios.get(`${API_URL}/requests`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.data.success) {
        setRequests(response.data.requests);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClusters = async () => {
    try {
      const response = await axios.get(`${API_URL}/clusters`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.data.success) {
        setClusters(response.data.clusters);
      }
    } catch (error) {
      console.error('Error fetching clusters:', error);
    }
  };

  const fetchNgos = async () => {
    try {
      const response = await axios.get(`${API_URL}/ngos`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.data.success) {
        setNgos(response.data.ngos);
      }
    } catch (error) {
      console.error('Error fetching NGOs:', error);
    }
  };

  const updatePriority = async (requestId, newPriority) => {
    try {
      const response = await axios.patch(
        `${API_URL}/requests/${requestId}/priority`,
        { priority: newPriority },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      if (response.data.success) {
        fetchRequests();
        alert('Priority updated successfully!');
      }
    } catch (error) {
      alert('Error updating priority: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };

  const updateStatus = async (requestId, newStatus) => {
    try {
      const response = await axios.patch(
        `${API_URL}/requests/${requestId}/status`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      if (response.data.success) {
        fetchRequests();
        alert('Status updated successfully!');
      }
    } catch (error) {
      alert('Error updating status: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };

  const createAssignment = async () => {
    if (!selectedRequest || !selectedNgo) {
      alert('Please select an NGO');
      return;
    }

    try {
      const response = await axios.post(
        `${API_URL}/assignments`,
        {
          requestId: selectedRequest._id,
          ngoId: selectedNgo,
          category: 'general',
          quantity: 1,
          notes: assignmentNotes
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      if (response.data.success) {
        alert('Assignment created successfully!');
        setAssignmentModal(false);
        setSelectedRequest(null);
        setSelectedNgo('');
        setAssignmentNotes('');
        fetchRequests();
      }
    } catch (error) {
      alert('Error creating assignment: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };
  
  // Operator Feature Functions
  const fetchDuplicates = async () => {
    setOperatorLoading(true);
    try {
      const response = await axios.get(`${API_URL}/operator/duplicates?threshold=0.7`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.data.success) {
        setDuplicates(response.data.duplicates || []);
      }
    } catch (error) {
      console.error('Error fetching duplicates:', error);
      if (error.response?.status !== 403) {
        alert('Error fetching duplicates: ' + (error.response?.data?.message || 'Unknown error'));
      }
    } finally {
      setOperatorLoading(false);
    }
  };
  
  const fetchMatches = async () => {
    setOperatorLoading(true);
    try {
      const response = await axios.get(`${API_URL}/operator/matches?minScore=0.6`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.data.success) {
        setMatches(response.data.matches || []);
      }
    } catch (error) {
      console.error('Error fetching matches:', error);
      if (error.response?.status !== 403) {
        alert('Error fetching matches: ' + (error.response?.data?.message || 'Unknown error'));
      }
    } finally {
      setOperatorLoading(false);
    }
  };
  
  const fetchEscalations = async () => {
    setOperatorLoading(true);
    try {
      const response = await axios.get(`${API_URL}/operator/escalations?status=pending`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.data.success) {
        setEscalations(response.data.escalations || []);
      }
    } catch (error) {
      console.error('Error fetching escalations:', error);
      if (error.response?.status !== 403) {
        alert('Error fetching escalations: ' + (error.response?.data?.message || 'Unknown error'));
      }
    } finally {
      setOperatorLoading(false);
    }
  };
  
  const resolveDuplicate = async (action, keepId = null) => {
    if (!selectedDuplicate) return;
    
    try {
      const response = await axios.post(
        `${API_URL}/operator/duplicates/resolve`,
        {
          request1Id: selectedDuplicate.request1._id,
          request2Id: selectedDuplicate.request2._id,
          action,
          keepId,
          notes: mergeNotes
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      
      if (response.data.success) {
        alert(action === 'merge' ? 'Requests merged successfully!' : 'Marked as not duplicate');
        setMergeModal(false);
        setSelectedDuplicate(null);
        setMergeNotes('');
        fetchDuplicates();
      }
    } catch (error) {
      alert('Error: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };
  
  const confirmMatch = async (requestId, ngoId, notes) => {
    try {
      const response = await axios.post(
        `${API_URL}/operator/matches/confirm`,
        { requestId, ngoId, notes },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      
      if (response.data.success) {
        alert('Match confirmed and assignment created!');
        fetchMatches();
        fetchRequests();
      }
    } catch (error) {
      alert('Error: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };
  
  const handleEscalationAction = async () => {
    if (!selectedEscalation || !escalationAction) {
      alert('Please select an action');
      return;
    }
    
    try {
      const payload = {
        action: escalationAction,
        notes: escalationNotes
      };
      
      if (escalationAction === 'increase-priority' && newPriority) {
        payload.newPriority = newPriority;
      }
      
      const response = await axios.post(
        `${API_URL}/operator/escalations/${selectedEscalation._id}/handle`,
        payload,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      
      if (response.data.success) {
        alert('Escalation handled successfully!');
        setEscalationModal(false);
        setSelectedEscalation(null);
        setEscalationAction('');
        setEscalationNotes('');
        setNewPriority('');
        fetchEscalations();
      }
    } catch (error) {
      alert('Error: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };

  const getPriorityColor = (priority) => {
    const colors = {
      critical: 'bg-red-100 text-red-800 border-red-300',
      high: 'bg-orange-100 text-orange-800 border-orange-300',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      low: 'bg-green-100 text-green-800 border-green-300',
    };
    return colors[priority] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const getStatusColor = (status) => {
    const colors = {
      new: 'bg-blue-100 text-blue-800',
      triaged: 'bg-purple-100 text-purple-800',
      assigned: 'bg-indigo-100 text-indigo-800',
      'in-progress': 'bg-yellow-100 text-yellow-800',
      fulfilled: 'bg-green-100 text-green-800',
      closed: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredRequests = requests.filter(req => {
    const matchesSearch = req.location?.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         req.submittedBy?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPriority = priorityFilter === 'all' || req.priority === priorityFilter;
    return matchesSearch && matchesPriority;
  });

  const triageQueue = filteredRequests.filter(r => r.status === 'new' || r.status === 'triaged');
  const stats = {
    total: requests.length,
    new: requests.filter(r => r.status === 'new').length,
    triaged: requests.filter(r => r.status === 'triaged').length,
    assigned: requests.filter(r => r.status === 'assigned').length,
    sos: requests.filter(r => r.sosDetected).length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-500" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Operator Dashboard</h1>
              <p className="text-sm text-gray-500">Welcome, {user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-600">{connected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <button onClick={() => navigate('/')} className="px-4 py-2 text-gray-600 hover:text-gray-800">
              Home
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Requests</p>
                <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
              </div>
              <Package className="w-10 h-10 text-blue-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">New</p>
                <p className="text-2xl font-bold text-blue-600">{stats.new}</p>
              </div>
              <Clock className="w-10 h-10 text-blue-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Triaged</p>
                <p className="text-2xl font-bold text-purple-600">{stats.triaged}</p>
              </div>
              <TrendingUp className="w-10 h-10 text-purple-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Assigned</p>
                <p className="text-2xl font-bold text-green-600">{stats.assigned}</p>
              </div>
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">SoS</p>
                <p className="text-2xl font-bold text-red-600">{stats.sos}</p>
              </div>
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="flex border-b overflow-x-auto">
            <button
              onClick={() => setActiveTab('triage')}
              className={`px-6 py-3 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'triage'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Triage Queue
            </button>
            <button
              onClick={() => setActiveTab('duplicates')}
              className={`px-6 py-3 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'duplicates'
                  ? 'border-b-2 border-purple-500 text-purple-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Resolve Duplicates {duplicates.length > 0 && `(${duplicates.length})`}
            </button>
            <button
              onClick={() => setActiveTab('matches')}
              className={`px-6 py-3 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'matches'
                  ? 'border-b-2 border-green-500 text-green-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Confirm Matches {matches.length > 0 && `(${matches.length})`}
            </button>
            <button
              onClick={() => setActiveTab('escalations')}
              className={`px-6 py-3 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'escalations'
                  ? 'border-b-2 border-red-500 text-red-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Handle Escalations {escalations.length > 0 && `(${escalations.length})`}
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`px-6 py-3 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'all'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              All Requests
            </button>
            <button
              onClick={() => setActiveTab('clusters')}
              className={`px-6 py-3 font-medium transition-colors whitespace-nowrap ${
                activeTab === 'clusters'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Clusters
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by location or name..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-600" />
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <button
              onClick={fetchRequests}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          </div>
        ) : (
          <>
            {activeTab === 'triage' && (
              <div className="space-y-4">
                {triageQueue.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-12 text-center">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <p className="text-gray-600">No requests in triage queue</p>
                  </div>
                ) : (
                  triageQueue.map((request) => (
                    <div key={request._id} className="bg-white rounded-lg shadow p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-800">
                              Request #{request.ticketNumber}
                            </h3>
                            {request.sosDetected && (
                              <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                SoS
                              </span>
                            )}
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                              {request.status}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(request.priority)}`}>
                              {request.priority}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              <span>{request.location?.address || 'Location not specified'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              <span>{request.beneficiaries?.total || 0} beneficiaries</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              <span>{new Date(request.createdAt).toLocaleString()}</span>
                            </div>
                          </div>
                          {request.description && (
                            <p className="text-sm text-gray-700 mb-3">{request.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {request.status === 'new' && (
                          <button
                            onClick={() => updateStatus(request._id, 'triaged')}
                            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                          >
                            Mark as Triaged
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSelectedRequest(request);
                            setAssignmentModal(true);
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                        >
                          <UserPlus className="w-4 h-4" />
                          Assign to NGO
                        </button>
                        <select
                          value={request.priority}
                          onChange={(e) => updatePriority(request._id, e.target.value)}
                          className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="low">Low Priority</option>
                          <option value="medium">Medium Priority</option>
                          <option value="high">High Priority</option>
                          <option value="critical">Critical Priority</option>
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'all' && (
              <div className="space-y-4">
                {filteredRequests.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-12 text-center">
                    <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No requests found</p>
                  </div>
                ) : (
                  filteredRequests.map((request) => (
                    <div key={request._id} className="bg-white rounded-lg shadow p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-800">
                              Request #{request.ticketNumber}
                            </h3>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                              {request.status}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(request.priority)}`}>
                              {request.priority}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              <span>{request.location?.address || 'Location not specified'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              <span>{new Date(request.createdAt).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Duplicates Tab */}
            {activeTab === 'duplicates' && (
              <div className="space-y-4">
                {operatorLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Detecting duplicates...</p>
                  </div>
                ) : duplicates.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-12 text-center">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <p className="text-gray-600">No duplicate requests detected</p>
                  </div>
                ) : (
                  duplicates.map((dup, index) => (
                    <div key={index} className="bg-white rounded-lg shadow p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-purple-800">
                          Potential Duplicate ({dup.score}% similarity • {dup.distance}m apart)
                        </h3>
                        <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                          {dup.score >= 90 ? 'High' : dup.score >= 75 ? 'Medium' : 'Low'} Confidence
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        {/* Request 1 */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold">Request #{dup.request1.ticketNumber}</h4>
                            {dup.request1.sosDetected && (
                              <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">SOS</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{dup.request1.location?.address}</p>
                          <p className="text-sm mb-2">{dup.request1.description}</p>
                          <div className="text-xs text-gray-500">
                            <div>Priority: <span className="font-medium">{dup.request1.priority}</span></div>
                            <div>Beneficiaries: {dup.request1.beneficiaries?.total || 0}</div>
                            <div>Created: {new Date(dup.request1.createdAt).toLocaleString()}</div>
                          </div>
                        </div>
                        
                        {/* Request 2 */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold">Request #{dup.request2.ticketNumber}</h4>
                            {dup.request2.sosDetected && (
                              <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">SOS</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{dup.request2.location?.address}</p>
                          <p className="text-sm mb-2">{dup.request2.description}</p>
                          <div className="text-xs text-gray-500">
                            <div>Priority: <span className="font-medium">{dup.request2.priority}</span></div>
                            <div>Beneficiaries: {dup.request2.beneficiaries?.total || 0}</div>
                            <div>Created: {new Date(dup.request2.createdAt).toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedDuplicate(dup);
                            setMergeModal(true);
                          }}
                          className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                        >
                          Merge Requests
                        </button>
                        <button
                          onClick={() => {
                            setSelectedDuplicate(dup);
                            resolveDuplicate('not-duplicate');
                          }}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                        >
                          Not a Duplicate
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            
            {/* Matches Tab */}
            {activeTab === 'matches' && (
              <div className="space-y-4">
                {operatorLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading matches...</p>
                  </div>
                ) : matches.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-12 text-center">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <p className="text-gray-600">No pending matches to confirm</p>
                  </div>
                ) : (
                  matches.map((match) => (
                    <div key={match._id} className="bg-white rounded-lg shadow p-6">
                      <div className="mb-4">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-800">
                            Request #{match.ticketNumber}
                          </h3>
                          {match.sosDetected && (
                            <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs">SOS</span>
                          )}
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(match.priority)}`}>
                            {match.priority}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{match.location?.address}</p>
                        <p className="text-sm">{match.description}</p>
                      </div>
                      
                      <div className="border-t pt-4">
                        <h4 className="font-semibold mb-3">Suggested NGO Matches:</h4>
                        <div className="space-y-3">
                          {match.suggestedMatches?.map((sugMatch, idx) => (
                            <div key={idx} className="border rounded-lg p-4 flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h5 className="font-medium">{sugMatch.ngo?.name}</h5>
                                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                                    {Math.round(sugMatch.score * 100)}% match
                                  </span>
                                  <span className="text-xs text-gray-500">{Math.round(sugMatch.distance)}m away</span>
                                </div>
                                <p className="text-sm text-gray-600">{sugMatch.ngo?.city}</p>
                                {sugMatch.reason && (
                                  <p className="text-xs text-gray-500 mt-1">{sugMatch.reason}</p>
                                )}
                              </div>
                              <button
                                onClick={() => confirmMatch(match._id, sugMatch.ngo._id, `Match score: ${Math.round(sugMatch.score * 100)}%`)}
                                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 ml-4"
                              >
                                Confirm Match
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            
            {/* Escalations Tab */}
            {activeTab === 'escalations' && (
              <div className="space-y-4">
                {operatorLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading escalations...</p>
                  </div>
                ) : escalations.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-12 text-center">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <p className="text-gray-600">No pending escalations</p>
                  </div>
                ) : (
                  escalations.map((esc) => (
                    <div key={esc._id} className="bg-white rounded-lg shadow p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-800">
                              Request #{esc.ticketNumber}
                            </h3>
                            <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Escalated
                            </span>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(esc.priority)}`}>
                              {esc.priority}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{esc.location?.address}</p>
                          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-3">
                            <p className="text-sm font-medium text-yellow-800">Escalation Reason:</p>
                            <p className="text-sm text-yellow-700">{esc.escalationReason}</p>
                          </div>
                          <div className="text-xs text-gray-500">
                            <div>Escalated by: {esc.escalatedBy?.name || 'Unknown'} ({esc.escalatedBy?.role})</div>
                            <div>Escalated at: {new Date(esc.escalatedAt).toLocaleString()}</div>
                            {esc.assignments?.length > 0 && (
                              <div className="mt-2">
                                <p className="font-medium">Current Assignment:</p>
                                {esc.assignments.map((assign, idx) => (
                                  <div key={idx}>NGO: {assign.ngo?.name}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => {
                          setSelectedEscalation(esc);
                          setEscalationModal(true);
                        }}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                      >
                        Handle Escalation
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'clusters' && (
              <div className="space-y-4">
                {clusters.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-12 text-center">
                    <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No clusters found</p>
                  </div>
                ) : (
                  clusters.map((cluster) => (
                    <div key={cluster._id} className="bg-white rounded-lg shadow p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-800">
                            Cluster #{cluster.clusterNumber}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {cluster.requests?.length || 0} requests • {cluster.totalBeneficiaries?.total || 0} beneficiaries
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(cluster.status)}`}>
                          {cluster.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <MapPin className="w-4 h-4" />
                        <span>{cluster.centerLocation?.address || 'Location not specified'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Merge Modal */}
      {mergeModal && selectedDuplicate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-purple-800">Merge Duplicate Requests</h3>
              <button
                onClick={() => {
                  setMergeModal(false);
                  setSelectedDuplicate(null);
                  setMergeNotes('');
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <p className="text-sm text-purple-800 mb-2">
                  <strong>Similarity:</strong> {selectedDuplicate.score}% • <strong>Distance:</strong> {selectedDuplicate.distance}m
                </p>
                <p className="text-sm text-gray-600">
                  Select which request to keep. The other will be marked as duplicate and closed.
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="border-2 border-gray-300 rounded-lg p-4">
                  <h4 className="font-semibold mb-2">Request #{selectedDuplicate.request1.ticketNumber}</h4>
                  <p className="text-sm text-gray-600 mb-2">{selectedDuplicate.request1.location?.address}</p>
                  <p className="text-xs text-gray-500">
                    Priority: {selectedDuplicate.request1.priority} • 
                    Beneficiaries: {selectedDuplicate.request1.beneficiaries?.total || 0}
                  </p>
                </div>
                
                <div className="border-2 border-gray-300 rounded-lg p-4">
                  <h4 className="font-semibold mb-2">Request #{selectedDuplicate.request2.ticketNumber}</h4>
                  <p className="text-sm text-gray-600 mb-2">{selectedDuplicate.request2.location?.address}</p>
                  <p className="text-xs text-gray-500">
                    Priority: {selectedDuplicate.request2.priority} • 
                    Beneficiaries: {selectedDuplicate.request2.beneficiaries?.total || 0}
                  </p>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={mergeNotes}
                  onChange={(e) => setMergeNotes(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Add any notes about this merge..."
                />
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => resolveDuplicate('merge', selectedDuplicate.request1._id)}
                  className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                >
                  Keep Request 1
                </button>
                <button
                  onClick={() => resolveDuplicate('merge', selectedDuplicate.request2._id)}
                  className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                >
                  Keep Request 2
                </button>
                <button
                  onClick={() => {
                    setMergeModal(false);
                    setSelectedDuplicate(null);
                    setMergeNotes('');
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Escalation Handling Modal */}
      {escalationModal && selectedEscalation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-red-800">Handle Escalation</h3>
              <button
                onClick={() => {
                  setEscalationModal(false);
                  setSelectedEscalation(null);
                  setEscalationAction('');
                  setEscalationNotes('');
                  setNewPriority('');
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-semibold mb-1">Request #{selectedEscalation.ticketNumber}</h4>
                <p className="text-sm text-gray-600">{selectedEscalation.escalationReason}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Action
                </label>
                <select
                  value={escalationAction}
                  onChange={(e) => setEscalationAction(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Select action...</option>
                  <option value="resolve">Resolve Escalation</option>
                  <option value="increase-priority">Increase Priority</option>
                  <option value="reassign">Flag for Reassignment</option>
                  <option value="forward-to-authority">Forward to Authority</option>
                </select>
              </div>
              
              {escalationAction === 'increase-priority' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Priority
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">Select priority...</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={escalationNotes}
                  onChange={(e) => setEscalationNotes(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Add notes about your action..."
                />
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={handleEscalationAction}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  Submit
                </button>
                <button
                  onClick={() => {
                    setEscalationModal(false);
                    setSelectedEscalation(null);
                    setEscalationAction('');
                    setEscalationNotes('');
                    setNewPriority('');
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {assignmentModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Assign to NGO</h3>
              <button
                onClick={() => {
                  setAssignmentModal(false);
                  setSelectedRequest(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Request: #{selectedRequest.ticketNumber}
                </label>
                <p className="text-sm text-gray-600">{selectedRequest.location?.address}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select NGO
                </label>
                <select
                  value={selectedNgo}
                  onChange={(e) => setSelectedNgo(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose an NGO...</option>
                  {ngos.map((ngo) => (
                    <option key={ngo._id} value={ngo._id}>
                      {ngo.name} - {ngo.city}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={assignmentNotes}
                  onChange={(e) => setAssignmentNotes(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Add any special instructions..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={createAssignment}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Create Assignment
                </button>
                <button
                  onClick={() => {
                    setAssignmentModal(false);
                    setSelectedRequest(null);
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
