import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import AdvisoriesBanner from '../../components/AdvisoriesBanner';
import SmsModal from '../../components/SmsModal';
import BulkSmsModal from '../../components/BulkSmsModal';
import SmsHistory from '../../components/SmsHistory';
import EvidenceViewer from '../../components/EvidenceViewer';
import { useSms } from '../../hooks/useSms';
import axios from 'axios';
import { 
  Heart, 
  LogOut, 
  Package, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  MessageSquare,
  MapPin,
  Users,
  Send,
  Filter,
  RefreshCw,
  X,
  Phone,
  PhoneOff,
  Loader
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function NGODashboard() {
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('assignments');
  const [assignments, setAssignments] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [deliveryDialog, setDeliveryDialog] = useState(null);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [photoModal, setPhotoModal] = useState(null); // { photo, index, totalPhotos, allPhotos }
  
  // SMS State
  const { sendSMS, sendBulkSMS, loading: smsLoading, error: smsError, success: smsSuccess, clearMessages: clearSmsMessages } = useSms();
  const [smsModal, setSmsModal] = useState(null); // { isOpen, phoneNumber, recipientName, requestId }
  const [bulkSmsModal, setBulkSmsModal] = useState(null); // { isOpen, recipients }
  const [smsHistoryModal, setSmsHistoryModal] = useState(null); // { isOpen, phoneNumber, requestId }
  
  // Location update state
  const [locationModal, setLocationModal] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [newLocation, setNewLocation] = useState(null);

  useEffect(() => {
    fetchAssignments();
    fetchOffers();
    fetchNGOLocation();
  }, []);

  const fetchNGOLocation = async () => {
    try {
      const response = await axios.get(`${API_URL}/ngos/me`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.data.success && response.data.ngo?.location) {
        setCurrentLocation(response.data.ngo.location);
      }
    } catch (error) {
      console.error('Error fetching NGO location:', error);
    }
  };

  const getGPSLocation = () => {
    setLocationLoading(true);

    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      setLocationLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          const data = await response.json();
          const address = data.display_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
          
          setNewLocation({
            type: 'Point',
            coordinates: [longitude, latitude],
            address: address
          });
        } catch (err) {
          setNewLocation({
            type: 'Point',
            coordinates: [longitude, latitude],
            address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
          });
        }
        
        setLocationLoading(false);
      },
      (error) => {
        console.error('GPS Error:', error);
        alert(`Location error: ${error.message}`);
        setLocationLoading(false);
      }
    );
  };

  const updateLocation = async () => {
    if (!newLocation) {
      alert('Please capture a new location first');
      return;
    }

    try {
      const response = await axios.patch(
        `${API_URL}/ngos/me/location`,
        { location: newLocation },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      
      if (response.data.success) {
        setCurrentLocation(newLocation);
        setLocationModal(false);
        setNewLocation(null);
        alert('✅ Location updated successfully!');
      }
    } catch (error) {
      alert('Error updating location: ' + (error.response?.data?.message || error.message));
    }
  };

  useEffect(() => {
    if (socket && connected) {
      socket.on('assignment:updated', handleAssignmentUpdate);
      
      // Listen for assignment status changes (real-time updates)
      socket.on('assignment:status-changed', (data) => {
        console.log('📍 Assignment status changed:', data);
        setAssignments(prev =>
          prev.map(a =>
            a._id === data.assignmentId
              ? { ...a, status: data.status, updatedAt: data.timestamp }
              : a
          )
        );
      });

      // Listen for request updates
      socket.on('request:in-progress', (data) => {
        console.log('📋 Request in progress:', data);
        setAssignments(prev =>
          prev.map(a =>
            a._id === data.assignmentId
              ? { ...a, status: 'in-progress' }
              : a
          )
        );
      });
      
      return () => {
        socket.off('assignment:updated', handleAssignmentUpdate);
        socket.off('assignment:status-changed');
        socket.off('request:in-progress');
      };
    }
  }, [socket, connected]);

  const fetchAssignments = async () => {
    try {
      const response = await axios.get(`${API_URL}/assignments`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.data.success) {
        setAssignments(response.data.assignments);
      }
    } catch (error) {
      console.error('Error fetching assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOffers = async () => {
    try {
      const response = await axios.get(`${API_URL}/offers?ngoId=${user.organizationId}&status=`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.data.success) {
        setOffers(response.data.offers);
      }
    } catch (error) {
      console.error('Error fetching offers:', error);
    }
  };

  const handleAssignmentUpdate = (data) => {
    setAssignments(prev => 
      prev.map(a => a._id === data.assignmentId ? { ...a, ...data.updates } : a)
    );
  };

  const updateAssignmentStatus = async (assignmentId, newStatus) => {
    try {
      const response = await axios.patch(
        `${API_URL}/assignments/${assignmentId}/status`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      if (response.data.success) {
        fetchAssignments();
        alert('Status updated successfully!');
      }
    } catch (error) {
      alert('Error updating status: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };

  const confirmAssignment = async (assignmentId) => {
    try {
      const response = await axios.post(
        `${API_URL}/assignments/${assignmentId}/confirm`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      if (response.data.success) {
        fetchAssignments();
        alert('Assignment confirmed and started');
      }
    } catch (error) {
      alert('Error confirming assignment: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };

  const declineAssignment = async (assignmentId) => {
    if (!confirm('Decline this assignment and send it back to the queue?')) return;
    try {
      const response = await axios.post(
        `${API_URL}/assignments/${assignmentId}/decline`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      if (response.data.success) {
        fetchAssignments();
        alert('Assignment declined and request requeued');
      }
    } catch (error) {
      alert('Error declining assignment: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };

  const markAsDelivered = async (assignmentId) => {
    try {
      const response = await axios.post(
        `${API_URL}/assignments/${assignmentId}/deliver`,
        { deliveryNotes },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      if (response.data.success) {
        setDeliveryDialog(null);
        setDeliveryNotes('');
        fetchAssignments();
        alert('Assignment marked as delivered!');
      }
    } catch (error) {
      alert('Error marking as delivered: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };



  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // SMS Handler Functions
  const handleSendSMS = async (assignment) => {
    try {
      // ✅ Extract phone digits AND country code
      let victimPhone = '';
      let victimCC = '+91'; // Default country code
      
      // Helper to extract clean digits from any phone format
      const extractDigits = (phone) => {
        if (!phone) return '';
        const str = String(phone);
        
        // If phone starts with country code prefix (like 918639127753 or +918639127753)
        // Strip it and keep only the actual phone digits
        if (str.match(/^(\+)?91/)) {
          // India format - remove country code and leading +
          return str.replace(/^\+?91/, '').replace(/\D/g, '');
        } else if (str.match(/^(\+)?1/)) {
          // US format
          return str.replace(/^\+?1/, '').replace(/\D/g, '');
        } else if (str.match(/^(\+)?44/)) {
          // UK format
          return str.replace(/^\+?44/, '').replace(/\D/g, '');
        }
        
        // Default: just extract digits
        return str.replace(/\D/g, '');
      };
      
      // Extract phone digits AND country code
      if (assignment.request?.submitterContact?.phone) {
        victimPhone = extractDigits(assignment.request.submitterContact.phone);
        victimCC = assignment.request.submitterContact?.countryCode || '+91';
        console.log('📝 Using phone from submitterContact:');
        console.log(`   - Phone (digits): ${victimPhone}`);
        console.log(`   - Country Code: ${victimCC}`);
      } else if (assignment.request?.phoneNumber) {
        victimPhone = extractDigits(assignment.request.phoneNumber);
        console.log('📝 Using fallback phone (phoneNumber):');
        console.log(`   - Original: ${assignment.request.phoneNumber}`);
        console.log(`   - Extracted digits: ${victimPhone}`);
      } else if (assignment.request?.phone) {
        victimPhone = extractDigits(assignment.request.phone);
        console.log('📝 Using fallback phone (phone):');
        console.log(`   - Original: ${assignment.request.phone}`);
        console.log(`   - Extracted digits: ${victimPhone}`);
      }
      console.log(`   ✅ Final phone digits: ${victimPhone}`);
      
      // If no phone found locally, try fetching from backend
      if (!victimPhone) {
        console.log('📱 Phone not found locally, fetching from backend...');
        try {
          const response = await axios.get(
            `${API_URL}/integrations/sms/get-victim-phone/${assignment._id}`,
            { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
          );
          if (response.data.success) {
            // Backend returns BOTH phoneNumber (digits) and countryCode separately
            victimPhone = response.data.phoneNumber?.replace(/\D/g, '') || '';
            victimCC = response.data.countryCode || '+91';
            console.log('✅ Phone fetched from backend:');
            console.log(`   - Phone (digits): ${victimPhone}`);
            console.log(`   - Country Code: ${victimCC}`);
            if (response.data.debug) {
              console.log('   🔍 Debug info:', response.data.debug);
            }
          }
        } catch (err) {
          console.log('⚠️ Could not fetch phone from backend:', err.message);
          if (err.response?.data?.debug) {
            console.log('   🔍 Backend debug:', err.response.data.debug);
          }
        }
      }
      
      const victimName = assignment.request?.beneficiaries?.name || 'Recipient';
      
      setSmsModal({
        isOpen: true,
        phoneNumber: victimPhone || '',      // Digits only
        countryCode: victimCC,                // ✅ NEW: Country code
        recipientName: victimName,
        requestId: assignment.request?._id
      });
    } catch (error) {
      console.error('Error opening SMS modal:', error);
      alert('Error opening SMS modal');
    }
  };

  const handleBulkSMS = async () => {
    try {
      // Helper to extract clean digits from any phone format
      const extractDigits = (phone) => {
        if (!phone) return '';
        const str = String(phone);
        
        // If phone starts with country code prefix (like 918639127753 or +918639127753)
        // Strip it and keep only the actual phone digits
        if (str.match(/^(\+)?91/)) {
          // India format - remove country code and leading +
          return str.replace(/^\+?91/, '').replace(/\D/g, '');
        } else if (str.match(/^(\+)?1/)) {
          // US format
          return str.replace(/^\+?1/, '').replace(/\D/g, '');
        } else if (str.match(/^(\+)?44/)) {
          // UK format
          return str.replace(/^\+?44/, '').replace(/\D/g, '');
        }
        
        // Default: just extract digits
        return str.replace(/\D/g, '');
      };
      
      // Get all assignments with their phone numbers (from local or backend)
      const recipientsWithPhones = [];
      
      for (const assignment of assignments) {
        // ✅ Extract ONLY phone digits (no country code)
        // Backend will add the country code when sending
        let phone = '';
        
        if (assignment.request?.submitterContact?.phone) {
          phone = extractDigits(assignment.request.submitterContact.phone);
          console.log(`✅ Bulk SMS - Phone: ${phone}`);
        } else {
          // Fallback: extract digits from other fields
          phone = extractDigits(
            assignment.request?.phoneNumber || assignment.request?.phone || ''
          );
        }
        
        // If no phone found locally, try fetching from backend
        if (!phone) {
          try {
            const response = await axios.get(
              `${API_URL}/integrations/sms/get-victim-phone/${assignment._id}`,
              { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
            );
            if (response.data.success && response.data.phoneNumber) {
              phone = extractDigits(response.data.phoneNumber);
              console.log(`✅ Fetched phone for ${assignment._id}: ${phone}`);
            }
          } catch (err) {
            console.log(`⚠️ Could not fetch phone for assignment ${assignment._id}:`, err.message);
          }
        }
        
        if (phone) {
          recipientsWithPhones.push({
            _id: assignment._id,
            name: assignment.request?.beneficiaries?.name || assignment.category || 'Recipient',
            phoneNumber: phone,
            phone: phone
          });
        }
      }
      
      if (recipientsWithPhones.length === 0) {
        alert('❌ No recipients with phone numbers available.\n\nPlease enter phone numbers manually in the bulk SMS dialog.');
        // Still open modal so user can enter custom phone numbers
        setBulkSmsModal({
          isOpen: true,
          recipients: []
        });
        return;
      }

      console.log(`✅ Found ${recipientsWithPhones.length} recipients with phone numbers`);
      
      setBulkSmsModal({
        isOpen: true,
        recipients: recipientsWithPhones
      });
    } catch (error) {
      console.error('Error opening bulk SMS modal:', error);
      alert('Error opening bulk SMS modal');
    }
  };

  const handleSmsModalSend = async (message, phone) => {
    try {
      console.log('📱 Sending SMS to:', phone);
      console.log('📝 Message:', message);
      
      if (!phone || !phone.trim()) {
        alert('❌ Phone number is required');
        return;
      }

      await sendSMS(phone, message);
      
      // Show success alert
      alert(`✅ SMS SENT SUCCESSFULLY\n\n📱 To: ${phone}\n👤 Recipient: ${smsModal.recipientName}\n\n📝 Message: "${message}"`);
      
      setSmsModal({ ...smsModal, isOpen: false });
      
      // Refresh to show new SMS in history
      fetchAssignments();
    } catch (error) {
      console.error('❌ Error sending SMS:', error);
      alert(`❌ FAILED TO SEND SMS\n\nError: ${error.message || 'Unknown error occurred'}`);
    }
  };

  const handleBulkSmsModalSend = async (message, phoneNumbers) => {
    try {
      console.log('📢 Sending Bulk SMS to:', phoneNumbers.length, 'recipients');
      console.log('📝 Message:', message);
      
      await sendBulkSMS(phoneNumbers, message);
      
      // Show success alert
      alert(`✅ BULK SMS SENT SUCCESSFULLY\n\n👥 Recipients: ${phoneNumbers.length}\n📝 Message: "${message}"`);
      
      setBulkSmsModal({ ...bulkSmsModal, isOpen: false });
      
      // Refresh to show new SMS in history
      fetchAssignments();
    } catch (error) {
      console.error('❌ Error sending bulk SMS:', error);
      alert(`❌ FAILED TO SEND BULK SMS\n\nError: ${error.message || 'Unknown error occurred'}`);
    }
  };

  const handleOpenSmsHistory = (assignment) => {
    const victimPhone = assignment.request?.phoneNumber || assignment.request?.phone;
    setSmsHistoryModal({
      isOpen: true,
      phoneNumber: victimPhone,
      requestId: assignment.request?._id
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      accepted: 'bg-blue-100 text-blue-800',
      'in-progress': 'bg-purple-100 text-purple-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityColor = (priority) => {
    const colors = {
      critical: 'text-red-600',
      high: 'text-orange-600',
      medium: 'text-yellow-600',
      low: 'text-green-600',
    };
    return colors[priority] || 'text-gray-600';
  };

  const filteredAssignments = statusFilter === 'all' 
    ? assignments 
    : assignments.filter(a => a.status === statusFilter);

  return (
    <div className="min-h-screen bg-gray-50">
      <AdvisoriesBanner />
      {/* Header */}
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Heart className="w-8 h-8 text-blue-500" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">NGO Dashboard</h1>
              <p className="text-sm text-gray-500">Welcome, {user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-600">{connected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <button
              onClick={() => setLocationModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
              title="Update your organization location"
            >
              <MapPin className="w-4 h-4" />
              <span className="text-sm font-medium">Update Location</span>
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Assignments</p>
                <p className="text-2xl font-bold text-gray-800">{assignments.length}</p>
              </div>
              <Package className="w-10 h-10 text-blue-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">In Progress</p>
                <p className="text-2xl font-bold text-purple-600">
                  {assignments.filter(a => a.status === 'in-progress').length}
                </p>
              </div>
              <Clock className="w-10 h-10 text-purple-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Completed</p>
                <p className="text-2xl font-bold text-green-600">
                  {assignments.filter(a => a.status === 'completed').length}
                </p>
              </div>
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {assignments.filter(a => a.status === 'pending').length}
                </p>
              </div>
              <AlertCircle className="w-10 h-10 text-yellow-500" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('assignments')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'assignments'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Assignments
            </button>
            <button
              onClick={() => setActiveTab('offers')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'offers'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              My Offers
            </button>
          </div>
        </div>

        {/* Content */}
        {activeTab === 'assignments' && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="bg-white rounded-lg shadow p-4 flex items-center gap-4">
              <Filter className="w-5 h-5 text-gray-600" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
              <button
                onClick={fetchAssignments}
                className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>

            {/* Assignments List */}
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
              </div>
            ) : filteredAssignments.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No assignments found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {filteredAssignments.map((assignment) => (
                  <div key={assignment._id} className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-800">
                            {assignment.category}
                          </h3>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(assignment.status)}`}>
                            {assignment.status}
                          </span>
                          <span className={`text-sm font-medium ${getPriorityColor(assignment.priority)}`}>
                            {assignment.priority} priority
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            <span>{assignment.deliveryLocation?.address || 'Location not specified'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            <span>{assignment.request?.beneficiaries?.total || 0} beneficiaries</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {assignment.notes && (
                      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-700">{assignment.notes}</p>
                      </div>
                    )}

                    {/* ✅ Display Victim Evidence (Photos, Videos, Voice Notes) */}
                    {assignment.request?.evidence && (
                      <EvidenceViewer 
                        evidence={assignment.request.evidence}
                        title="📸 Evidence Provided by Victim"
                        className="mb-4"
                      />
                    )}

                    {/* Display Victim Closure Feedback & Photos */}
                    {assignment.request?.victimFeedback && assignment.request.victimFeedback.closurePhotos?.length > 0 && (
                      <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <h4 className="font-semibold text-blue-900 mb-3">📸 Victim Delivery Confirmation</h4>
                        
                        {/* Rating */}
                        <div className="mb-3">
                          <p className="text-sm text-blue-800">
                            <span className="font-medium">Rating:</span> 
                            <span className="ml-2">
                              {'⭐'.repeat(assignment.request.victimFeedback.rating)}
                              {'☆'.repeat(5 - assignment.request.victimFeedback.rating)}
                            </span>
                          </p>
                        </div>

                        {/* Feedback */}
                        {assignment.request.victimFeedback.feedback && (
                          <div className="mb-3">
                            <p className="text-sm text-blue-800">
                              <span className="font-medium">Feedback:</span>
                            </p>
                            <p className="text-sm text-blue-700 mt-1">{assignment.request.victimFeedback.feedback}</p>
                          </div>
                        )}

                        {/* Photos */}
                        <div className="mt-3">
                          <p className="text-sm font-medium text-blue-900 mb-2">Delivery Photos:</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {assignment.request.victimFeedback.closurePhotos.map((photo, idx) => (
                              <div
                                key={idx}
                                onClick={() => setPhotoModal({ photo, index: idx, totalPhotos: assignment.request.victimFeedback.closurePhotos.length, allPhotos: assignment.request.victimFeedback.closurePhotos })}
                                className="relative cursor-pointer group"
                              >
                                <img
                                  src={photo}
                                  alt={`Delivery photo ${idx + 1}`}
                                  className="w-full h-24 object-cover rounded-lg border border-blue-300 hover:opacity-90 transition group-hover:ring-2 group-hover:ring-blue-500"
                                />
                                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded-lg transition flex items-center justify-center">
                                  <span className="text-white opacity-0 group-hover:opacity-100 text-xs font-semibold">View</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Submission Time */}
                        <p className="text-xs text-blue-600 mt-2">
                          Confirmed on: {new Date(assignment.request.victimFeedback.submittedAt).toLocaleDateString()}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      {assignment.status === 'new' && (
                        <>
                          <button
                            onClick={() => confirmAssignment(assignment._id)}
                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => declineAssignment(assignment._id)}
                            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                          >
                            Decline
                          </button>
                        </>
                      )}
                      {assignment.status === 'accepted' && (
                        <button
                          onClick={() => updateAssignmentStatus(assignment._id, 'in-progress')}
                          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                        >
                          Start Progress
                        </button>
                      )}
                      {assignment.status === 'in-progress' && (
                        <button
                          onClick={() => setDeliveryDialog(assignment._id)}
                          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                        >
                          Mark Delivered
                        </button>
                      )}

                      {/* SMS Button - Always Show */}
                      <button
                        onClick={() => handleSendSMS(assignment)}
                        className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium"
                        title="Send SMS to recipient"
                      >
                        <Phone className="w-4 h-4" />
                        📱 Send SMS
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Bulk SMS Button - Always visible */}
            {filteredAssignments.length > 0 && (
              <div className="mt-6 p-4 bg-purple-50 border border-purple-200 rounded-lg flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-purple-900">📢 Send SMS to Recipients</h4>
                  <p className="text-sm text-purple-800 mt-1">
                    Total Assignments: {filteredAssignments.length} | With Phone: {filteredAssignments.filter(a => a.request?.phoneNumber || a.request?.phone || a.request?.submitterContact?.phone).length}
                  </p>
                </div>
                <button
                  onClick={handleBulkSMS}
                  disabled={!filteredAssignments.some(a => a.request?.phoneNumber || a.request?.phone || a.request?.submitterContact?.phone)}
                  className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-colors"
                >
                  <Send className="w-5 h-5" />
                  Send Bulk SMS
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'offers' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">My Offers</h3>
              <div className="flex gap-2">
                <button onClick={fetchOffers} className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded hover:bg-gray-200">
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
                <button onClick={()=>navigate('/ngo/offers')} className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                  Manage
                </button>
              </div>
            </div>
            {offers.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No offers yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {offers.map((offer) => (
                  <div key={offer._id} className="border rounded-lg p-4 bg-gradient-to-br from-gray-50 to-white">
                    {/* Header with Title and Status */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-gray-900 text-lg">{offer.title}</h3>
                          <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">{offer.category}</span>
                          {offer.isVerified && (
                            <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded font-medium">✓ Verified</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{offer.description}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ml-2 ${
                        offer.status === 'active' ? 'bg-green-100 text-green-800' :
                        offer.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
                        offer.status === 'exhausted' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {offer.status}
                      </span>
                    </div>

                    {/* Quantity Info */}
                    <div className="mb-4 p-3 bg-blue-50 rounded">
                      <p className="text-sm font-medium text-blue-900">
                        Available: <span className="font-bold">{offer.availableQuantity}</span> / Total: <span className="font-bold">{offer.totalQuantity}</span> {offer.unit || 'units'}
                      </p>
                      <div className="mt-2 w-full bg-blue-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all" 
                          style={{width: `${(offer.availableQuantity / offer.totalQuantity) * 100}%`}}
                        />
                      </div>
                    </div>

                    {/* Grid of Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-4">
                      {/* Coverage Radius */}
                      <div className="flex items-start gap-2">
                        <span className="text-blue-600 font-semibold">📍 Coverage:</span>
                        <span className="text-gray-700">{(offer.coverageRadius / 1000).toFixed(1)} km</span>
                      </div>

                      {/* Availability Period */}
                      <div className="flex items-start gap-2">
                        <span className="text-blue-600 font-semibold">📅 Available:</span>
                        <span className="text-gray-700">
                          {new Date(offer.availableFrom).toLocaleDateString()} 
                          {offer.availableUntil ? ` to ${new Date(offer.availableUntil).toLocaleDateString()}` : ' (Open-ended)'}
                        </span>
                      </div>

                      {/* Organization */}
                      <div className="flex items-start gap-2">
                        <span className="text-blue-600 font-semibold">🏢 Organization:</span>
                        <span className="text-gray-700">{offer.offeredBy?.name || 'N/A'}</span>
                      </div>

                      {/* Verification Status */}
                      <div className="flex items-start gap-2">
                        <span className="text-blue-600 font-semibold">✓ Verification:</span>
                        <span className={`font-medium ${offer.isVerified ? 'text-green-700' : 'text-yellow-700'}`}>
                          {offer.isVerified ? `Verified (${new Date(offer.verifiedAt).toLocaleDateString()})` : 'Pending'}
                        </span>
                      </div>

                      {/* Category-specific details */}
                      {offer.category === 'medical' && offer.details?.onCallMedics && (
                        <div className="flex items-start gap-2">
                          <span className="text-blue-600 font-semibold">👨‍⚕️ Medics:</span>
                          <span className="text-gray-700">{offer.details.onCallMedics} on-call</span>
                        </div>
                      )}

                      {offer.category === 'transport' && offer.details?.vehicleCount && (
                        <div className="flex items-start gap-2">
                          <span className="text-blue-600 font-semibold">🚗 Vehicles:</span>
                          <span className="text-gray-700">{offer.details.vehicleCount} {offer.details.vehicleType || 'vehicles'}</span>
                        </div>
                      )}

                      {offer.category === 'shelter' && offer.details?.capacity && (
                        <div className="flex items-start gap-2">
                          <span className="text-blue-600 font-semibold">🏠 Capacity:</span>
                          <span className="text-gray-700">{offer.details.capacity} people</span>
                        </div>
                      )}

                      {offer.category === 'food' && offer.details?.capacity && (
                        <div className="flex items-start gap-2">
                          <span className="text-blue-600 font-semibold">🍽️ Capacity:</span>
                          <span className="text-gray-700">{offer.details.capacity} packets</span>
                        </div>
                      )}

                      {/* Delivery & Pickup Info */}
                      <div className="flex items-start gap-2">
                        <span className="text-blue-600 font-semibold">📦 Delivery:</span>
                        <span className="text-gray-700">
                          {offer.conditions?.deliveryAvailable ? '✓ Available' : '✗ Not Available'}
                          {offer.conditions?.requiresPickup ? ' | Pickup required' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Shift Times */}
                    {offer.details?.shiftTimes && offer.details.shiftTimes.length > 0 && (
                      <div className="mb-4 p-3 bg-purple-50 rounded">
                        <p className="text-sm font-semibold text-purple-900 mb-2">⏰ Shift Times:</p>
                        <div className="space-y-1">
                          {offer.details.shiftTimes.map((shift, idx) => (
                            <div key={idx} className="text-sm text-purple-800">
                              <span className="font-medium">{shift.day}</span>: {shift.startTime} - {shift.endTime}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Stats */}
                    {offer.stats && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600 border-t pt-3">
                        <div>
                          <span className="font-semibold">Allocated:</span> {offer.stats.totalAllocated}
                        </div>
                        <div>
                          <span className="font-semibold">Fulfilled:</span> {offer.stats.totalFulfilled}
                        </div>
                        <div>
                          <span className="font-semibold">People Helped:</span> {offer.stats.peopleHelped}
                        </div>
                        <div>
                          <span className="font-semibold">Avg Response:</span> {offer.stats.averageResponseTime}h
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delivery Confirmation Dialog */}
      {deliveryDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Confirm Delivery</h3>
              <button
                onClick={() => {
                  setDeliveryDialog(null);
                  setDeliveryNotes('');
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-gray-600 mb-4">
              Mark this assignment as delivered. The victim will be notified and can confirm receipt.
            </p>

            <div className="mb-6">
              <label className="block text-sm text-gray-600 mb-2">Delivery Notes (Optional)</label>
              <textarea
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="Add any delivery notes or details..."
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeliveryDialog(null);
                  setDeliveryNotes('');
                }}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => markAsDelivered(deliveryDialog)}
                className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors"
              >
                Confirm Delivery
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📸 Full-Screen Photo Viewer Modal */}
      {photoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center flex-col">
          {/* Close Button */}
          <button
            onClick={() => setPhotoModal(null)}
            className="absolute top-4 right-4 bg-red-500 hover:bg-red-600 text-white rounded-full p-2 transition-colors z-51"
            title="Close (ESC)"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Photo Counter */}
          <div className="absolute top-4 left-4 bg-gray-800 text-white px-3 py-2 rounded-lg font-semibold">
            {photoModal.index + 1} / {photoModal.totalPhotos}
          </div>

          {/* Main Image */}
          <div className="flex-1 flex items-center justify-center px-4 md:px-0">
            <img
              src={photoModal.photo}
              alt={`Photo ${photoModal.index + 1}`}
              className="max-h-screen max-w-4xl object-contain rounded-lg shadow-2xl"
            />
          </div>

          {/* Navigation Controls */}
          {photoModal.totalPhotos > 1 && (
            <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-4">
              {/* Previous Button */}
              <button
                onClick={() => {
                  const newIndex = photoModal.index === 0 ? photoModal.totalPhotos - 1 : photoModal.index - 1;
                  setPhotoModal({
                    ...photoModal,
                    photo: photoModal.allPhotos[newIndex],
                    index: newIndex
                  });
                }}
                className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2"
              >
                ← Previous
              </button>

              {/* Thumbnail Strip */}
              <div className="flex gap-2 max-w-2xl overflow-x-auto px-4 py-2 bg-gray-800 bg-opacity-50 rounded-lg">
                {photoModal.allPhotos.map((photo, idx) => (
                  <img
                    key={idx}
                    src={photo}
                    alt={`Thumb ${idx + 1}`}
                    onClick={() => setPhotoModal({ ...photoModal, photo, index: idx })}
                    className={`h-16 w-16 object-cover rounded cursor-pointer transition-all ${
                      idx === photoModal.index
                        ? 'ring-2 ring-blue-500 opacity-100'
                        : 'opacity-60 hover:opacity-80'
                    }`}
                  />
                ))}
              </div>

              {/* Next Button */}
              <button
                onClick={() => {
                  const newIndex = (photoModal.index + 1) % photoModal.totalPhotos;
                  setPhotoModal({
                    ...photoModal,
                    photo: photoModal.allPhotos[newIndex],
                    index: newIndex
                  });
                }}
                className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2"
              >
                Next →
              </button>
            </div>
          )}

          {/* Keyboard hint */}
          <div className="absolute bottom-4 left-4 text-gray-400 text-xs">
            Press ESC to close | Arrow keys to navigate
          </div>
        </div>
      )}

      {/* Keyboard navigation for photo modal */}
      {photoModal && (
        <div
          onKeyDown={(e) => {
            if (e.key === 'Escape') setPhotoModal(null);
            if (e.key === 'ArrowRight') {
              const newIndex = (photoModal.index + 1) % photoModal.totalPhotos;
              setPhotoModal({
                ...photoModal,
                photo: photoModal.allPhotos[newIndex],
                index: newIndex
              });
            }
            if (e.key === 'ArrowLeft') {
              const newIndex = photoModal.index === 0 ? photoModal.totalPhotos - 1 : photoModal.index - 1;
              setPhotoModal({
                ...photoModal,
                photo: photoModal.allPhotos[newIndex],
                index: newIndex
              });
            }
          }}
          style={{ position: 'fixed' }}
          tabIndex={0}
          autoFocus
        />
      )}

      {/* SMS Modal */}
      {smsModal?.isOpen && (
        <SmsModal
          isOpen={true}
          onClose={() => setSmsModal({ ...smsModal, isOpen: false })}
          onSend={handleSmsModalSend}
          phoneNumber={smsModal.phoneNumber}
          countryCode={smsModal.countryCode}
          recipientName={smsModal.recipientName}
          loading={smsLoading}
        />
      )}

      {/* Bulk SMS Modal */}
      {bulkSmsModal?.isOpen && (
        <BulkSmsModal
          isOpen={true}
          onClose={() => setBulkSmsModal({ ...bulkSmsModal, isOpen: false })}
          onSend={handleBulkSmsModalSend}
          recipients={bulkSmsModal.recipients}
          loading={smsLoading}
        />
      )}

      {/* SMS History Modal */}
      {smsHistoryModal?.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">SMS History</h3>
              <button
                onClick={() => setSmsHistoryModal({ ...smsHistoryModal, isOpen: false })}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <SmsHistory
                phoneNumber={smsHistoryModal.phoneNumber}
                requestId={smsHistoryModal.requestId}
                limit={20}
              />
            </div>
          </div>
        </div>
      )}

      {/* Location Update Modal */}
      {locationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <MapPin className="w-6 h-6 text-green-600" />
                Update Organization Location
              </h3>
              <button
                onClick={() => {
                  setLocationModal(false);
                  setNewLocation(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Current Location */}
              {currentLocation && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-semibold text-blue-900 mb-1">📍 Current Location:</p>
                  <p className="text-sm text-blue-800">{currentLocation.address || 'Address not available'}</p>
                  <p className="text-xs text-blue-600 mt-1">
                    Coordinates: {currentLocation.coordinates?.[1]?.toFixed(6)}, {currentLocation.coordinates?.[0]?.toFixed(6)}
                  </p>
                </div>
              )}

              {/* New Location Capture */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm font-semibold text-gray-900 mb-3">🎯 Capture New Location:</p>
                
                {!newLocation ? (
                  <button
                    type="button"
                    onClick={getGPSLocation}
                    disabled={locationLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-50 hover:bg-green-100 border-2 border-green-300 text-green-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {locationLoading ? (
                      <>
                        <Loader className="w-5 h-5 animate-spin" />
                        <span>Getting GPS location...</span>
                      </>
                    ) : (
                      <>
                        <MapPin className="w-5 h-5" />
                        <span>Capture Current Location</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="w-full px-4 py-3 bg-green-50 border-2 border-green-300 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-green-700 font-medium mb-1">
                          <MapPin className="w-4 h-4" />
                          <span>New Location Captured</span>
                        </div>
                        <p className="text-sm text-gray-600 break-words">
                          {newLocation.address}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {newLocation.coordinates[1].toFixed(6)}, {newLocation.coordinates[0].toFixed(6)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewLocation(null)}
                        className="ml-2 text-red-500 hover:text-red-700 text-sm font-medium"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ℹ️ <strong>Note:</strong> Updating your location will affect all future offers and assignments. Make sure you're at your organization's current location before capturing.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setLocationModal(false);
                    setNewLocation(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={updateLocation}
                  disabled={!newLocation}
                  className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Update Location
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
