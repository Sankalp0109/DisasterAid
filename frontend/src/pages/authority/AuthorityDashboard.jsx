import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import axios from 'axios';
import { 
  Shield,
  LogOut,
  AlertTriangle,
  TrendingUp,
  Users,
  Package,
  MapPin,
  Activity,
  BarChart3,
  RefreshCw,
  Download,
  X,
  MessageSquare,
  Phone,
  Video,
  Mic,
  Play,
  Pause,
  Image as ImageIcon,
  Trash2
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import AdvisoriesBanner from '../../components/AdvisoriesBanner';
import RequestTracking from '../../components/RequestTracking';
import SmsModal from '../../components/SmsModal';
import BulkSmsModal from '../../components/BulkSmsModal';
import SmsHistory from '../../components/SmsHistory';
import DemandsVsSupplyHeatmap from '../../components/DemandsVsSupplyHeatmap';
import EvidenceViewer from '../../components/EvidenceViewer';
import { useSms } from '../../hooks/useSms';

// Fix default icon paths for Vite + Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Utility to create colored circular divIcons
const makeIcon = (colorA = '#2563eb', colorB = '#3b82f6') => L.divIcon({
  className: 'marker-dot',
  html: `<span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:linear-gradient(135deg, ${colorA}, ${colorB});border:2px solid #ffffff;box-shadow:0 0 4px rgba(0,0,0,0.25);"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 18],
  popupAnchor: [0, -12]
});

const ngoIcon = makeIcon('#10b981', '#059669');
const victimIcon = makeIcon('#dc2626', '#f97316');
const shelterIcon = makeIcon('#7c3aed', '#8b5cf6');
const medicalIcon = makeIcon('#dc2626', '#991b1b');
const depotIcon = makeIcon('#f59e0b', '#d97706');

// Color palette for NGO coverage circles (cycled)
const COVERAGE_COLORS = [
  '#10b981', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed', '#0d9488', '#6366f1'
];

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function AuthorityDashboard() {
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState({});
  const [requests, setRequests] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);
  const [ngos, setNgos] = useState([]);
  
  // SMS State
  const { sendSMS, sendBulkSMS, loading: smsLoading, error: smsError, success: smsSuccess, clearMessages: clearSmsMessages } = useSms();
  const [smsModal, setSmsModal] = useState(null); // { isOpen, phoneNumber, recipientName, requestId }
  const [bulkSmsModal, setBulkSmsModal] = useState(null); // { isOpen, recipients }
  const [smsHistoryModal, setSmsHistoryModal] = useState(null); // { isOpen, phoneNumber, requestId }
  
  // Authority operational overlays (local-only persistence for now)
  const [shelters, setShelters] = useState([]); // {name, capacity, lat, lng}
  const [medicalCamps, setMedicalCamps] = useState([]); // {name, status, lat, lng}
  const [depots, setDepots] = useState([]); // {name, lat, lng}
  const [blockedRoutes, setBlockedRoutes] = useState([]); // {name, points:[[lat,lng],...]}
  const [riskZones, setRiskZones] = useState([]); // {name, level, lat, lng, radius}
  const [advisories, setAdvisories] = useState([]); // backend active advisories
  const [creating, setCreating] = useState(false);
  const [newAdv, setNewAdv] = useState({ title: '', message: '', severity: 'info', expiresAt: '' });
  const [triageDialog, setTriageDialog] = useState(null);
  const [triageNotes, setTriageNotes] = useState('');
  const [triagePriority, setTriagePriority] = useState('medium');
  const [photoModal, setPhotoModal] = useState(null); // { photo, index, totalPhotos, allPhotos }
  const [photoGalleryIndex, setPhotoGalleryIndex] = useState(0);
  const [evidenceModal, setEvidenceModal] = useState(null); // { type, index, allEvidence } for videos/audio
  const [playingAudioIndex, setPlayingAudioIndex] = useState(null);

  useEffect(() => {
    fetchStats();
    fetchRequests();
    fetchClusters();
    fetchAssignments();
    fetchNGOs();
    fetchActiveAdvisories();
  }, []);

  useEffect(() => {
    if (socket && connected) {
      // Listen for stats updates and refresh
      socket.on('stats:updated', (data) => {
        console.log('📊 Stats updated:', data);
        // Refresh both stats AND requests to get latest numbers
        // This ensures crisis load distribution shows correct counts
        fetchStats();
        fetchRequests();
      });
      
      // Listen for assignment status updates (real-time)
      socket.on('assignment:status-changed', (data) => {
        console.log('📍 Assignment status changed:', data);
        // Update assignments list with new status
        setAssignments(prev =>
          prev.map(a =>
            a._id === data.assignmentId
              ? { ...a, status: data.status, updatedAt: data.timestamp }
              : a
          )
        );
        // Also refresh requests to get latest status
        fetchRequests();
      });

      // Listen for request updates
      socket.on('request:assignment-updated', (data) => {
        console.log('📋 Request assignment updated:', data);
        fetchRequests();
      });

      // Listen for assignment in-progress
      socket.on('assignment:in-progress', (data) => {
        console.log('🚚 Assignment in progress:', data);
        setAssignments(prev =>
          prev.map(a =>
            a._id === data.assignmentId
              ? { ...a, status: 'in-progress' }
              : a
          )
        );
        fetchRequests();
      });
      
      return () => {
        socket.off('stats:updated');
        socket.off('assignment:status-changed');
        socket.off('request:assignment-updated');
        socket.off('assignment:in-progress');
      };
    }
  }, [socket, connected]);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/analytics/stats`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.data.success) {
        setStats(response.data.stats);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    try {
      console.log('🔄 Fetching requests from backend...');
      const response = await axios.get(`${API_URL}/requests`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.data.success) {
        console.log(`✅ Received ${response.data.requests.length} requests`);
        const sosCount = response.data.requests.filter(r => r.sosDetected).length;
        const statuses = {};
        response.data.requests.forEach(r => {
          statuses[r.status] = (statuses[r.status] || 0) + 1;
        });
        console.log(`📊 Request statuses:`, statuses);
        console.log(`🚨 SoS requests: ${sosCount}`);
        setRequests(response.data.requests);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
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
    }
  };

  const fetchNGOs = async () => {
    try {
      const response = await axios.get(`${API_URL}/ngos`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.data.success) {
        setNgos(response.data.ngos || []);
      }
    } catch (error) {
      console.error('Error fetching NGOs:', error);
    }
  };

  const fetchActiveAdvisories = async () => {
    try {
      const res = await axios.get(`${API_URL}/advisories`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (res.data.success) setAdvisories(res.data.advisories || []);
    } catch (e) {
      // ignore
    }
  };

  // ✅ SMS Handler Functions
  const handleSendSMS = async (assignment) => {
    try {
      // Helper to extract clean digits from any phone format
      const extractDigits = (phone) => {
        if (!phone) return '';
        const str = String(phone);
        
        // If phone starts with country code prefix (like 918639127753 or +918639127753)
        // Strip it and keep only the actual phone digits
        if (str.match(/^(\+)?91/)) {
          return str.replace(/^\+?91/, '').replace(/\D/g, '');
        } else if (str.match(/^(\+)?1/)) {
          return str.replace(/^\+?1/, '').replace(/\D/g, '');
        } else if (str.match(/^(\+)?44/)) {
          return str.replace(/^\+?44/, '').replace(/\D/g, '');
        }
        return str.replace(/\D/g, '');
      };
      
      let victimPhone = '';
      let victimCC = '+91'; // Default country code
      
      if (assignment.request?.submitterContact?.phone) {
        victimPhone = extractDigits(assignment.request.submitterContact.phone);
        victimCC = assignment.request.submitterContact?.countryCode || '+91';
        console.log('📝 Using phone from submitterContact:');
        console.log(`   - Phone (digits): ${victimPhone}`);
        console.log(`   - Country Code: ${victimCC}`);
      } else if (assignment.request?.phoneNumber) {
        victimPhone = extractDigits(assignment.request.phoneNumber);
      } else if (assignment.request?.phone) {
        victimPhone = extractDigits(assignment.request.phone);
      }
      
      if (!victimPhone) {
        try {
          const response = await axios.get(
            `${API_URL}/integrations/sms/get-victim-phone/${assignment._id}`,
            { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
          );
          if (response.data.success) {
            victimPhone = extractDigits(response.data.phoneNumber);
            victimCC = response.data.countryCode || '+91';
            console.log('✅ Phone fetched from backend:');
            console.log(`   - Phone (digits): ${victimPhone}`);
            console.log(`   - Country Code: ${victimCC}`);
          }
        } catch (err) {
          console.log('Could not fetch phone from backend:', err.message);
        }
      }
      
      const victimName = assignment.request?.beneficiaries?.name || 'Recipient';
      
      setSmsModal({
        isOpen: true,
        phoneNumber: victimPhone || '',
        countryCode: victimCC,            // ✅ NEW: Pass country code
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
      const extractDigits = (phone) => {
        if (!phone) return '';
        const str = String(phone);
        if (str.match(/^(\+)?91/)) {
          return str.replace(/^\+?91/, '').replace(/\D/g, '');
        } else if (str.match(/^(\+)?1/)) {
          return str.replace(/^\+?1/, '').replace(/\D/g, '');
        } else if (str.match(/^(\+)?44/)) {
          return str.replace(/^\+?44/, '').replace(/\D/g, '');
        }
        return str.replace(/\D/g, '');
      };
      
      const recipientsWithPhones = [];
      
      for (const assignment of assignments) {
        let phone = '';
        
        if (assignment.request?.submitterContact?.phone) {
          phone = extractDigits(assignment.request.submitterContact.phone);
        } else {
          phone = extractDigits(
            assignment.request?.phoneNumber || assignment.request?.phone || ''
          );
        }
        
        if (!phone) {
          try {
            const response = await axios.get(
              `${API_URL}/integrations/sms/get-victim-phone/${assignment._id}`,
              { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
            );
            if (response.data.success && response.data.phoneNumber) {
              phone = extractDigits(response.data.phoneNumber);
            }
          } catch (err) {
            console.log(`Could not fetch phone for assignment ${assignment._id}`);
          }
        }
        
        if (phone) {
          recipientsWithPhones.push({
            _id: assignment._id,
            name: assignment.request?.beneficiaries?.name || 'Recipient',
            phoneNumber: phone,
            phone: phone
          });
        }
      }
      
      if (recipientsWithPhones.length === 0) {
        alert('No recipients with phone numbers available.');
        setBulkSmsModal({ isOpen: true, recipients: [] });
        return;
      }

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
      if (!phone || !phone.trim()) {
        alert('Phone number is required');
        return;
      }

      await sendSMS(phone, message);
      alert(`✅ SMS sent to ${phone}`);
      setSmsModal(null);
      fetchAssignments();
    } catch (error) {
      console.error('Error sending SMS:', error);
      alert(`Failed to send SMS: ${error.message}`);
    }
  };

  const handleBulkSmsModalSend = async (message, phoneNumbers) => {
    try {
      await sendBulkSMS(phoneNumbers, message);
      alert(`✅ Bulk SMS sent to ${phoneNumbers.length} recipients`);
      setBulkSmsModal(null);
      fetchAssignments();
    } catch (error) {
      console.error('Error sending bulk SMS:', error);
      alert(`Failed to send bulk SMS: ${error.message}`);
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

  const createAdvisory = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...newAdv };
      if (!payload.title || !payload.message) return;
      // Convert datetime-local to ISO if provided
      if (payload.expiresAt) {
        const dt = new Date(payload.expiresAt);
        if (!isNaN(dt.getTime())) payload.expiresAt = dt.toISOString();
      } else {
        delete payload.expiresAt;
      }
      await axios.post(`${API_URL}/advisories`, payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setNewAdv({ title: '', message: '', severity: 'info', expiresAt: '' });
      setCreating(false);
      fetchActiveAdvisories();
    } catch (err) {
      alert('Failed to publish advisory: ' + (err.response?.data?.message || err.message));
    }
  };

  const deactivateAdvisory = async (id) => {
    if (!confirm('Remove this advisory for everyone?')) return;
    try {
      await axios.patch(`${API_URL}/advisories/${id}/deactivate`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      fetchActiveAdvisories();
    } catch (err) {
      alert('Failed to remove advisory: ' + (err.response?.data?.message || err.message));
    }
  };

  const exportData = async (type) => {
    try {
      const response = await axios.get(`${API_URL}/analytics/export/${type}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type}-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      alert('Error exporting data: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };

  const generateIndividualReport = async (requestId) => {
    try {
      // Fetch the specific request export data from backend using ticketNumber or requestId
      const response = await axios.get(`${API_URL}/analytics/export/requests`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        params: { 
          format: 'json',
          ticketNumber: requestId.startsWith('REQ-') ? requestId : undefined,
          requestId: !requestId.startsWith('REQ-') ? requestId : undefined
        }
      });

      const exportedData = response.data;
      
      // Check if data was returned
      if (!exportedData || exportedData.length === 0) {
        alert('Request data not found. The request may not exist or you may not have permission to view it.');
        return;
      }
      
      // Get the first (and should be only) request
      const requestData = exportedData[0];

      const now = new Date();
      
      // Generate individual request report
      let report = `═══════════════════════════════════════════════════════════\n`;
      report += `            INDIVIDUAL REQUEST DETAILED REPORT\n`;
      report += `         Generated: ${now.toLocaleString()}\n`;
      report += `═══════════════════════════════════════════════════════════\n\n`;
      
      // Basic Information
      report += `📋 REQUEST INFORMATION:\n`;
      report += `${'─'.repeat(60)}\n`;
      report += `   Ticket Number: ${requestData.ticketNumber || 'N/A'}\n`;
      report += `   Current Status: ${(requestData.currentStatus || 'new').toUpperCase()}\n`;
      report += `   Priority: ${(requestData.priority || 'medium').toUpperCase()}`;
      if (requestData.selfDeclaredUrgency && requestData.selfDeclaredUrgency !== 'medium') {
        report += ` (User declared: ${requestData.selfDeclaredUrgency.toUpperCase()})`;
      }
      report += `\n`;
      if (requestData.sosDetected === 'Yes') {
        report += `   🚨 SOS EMERGENCY - IMMEDIATE ATTENTION REQUIRED\n`;
      }
      report += `   Request Type: ${requestData.requestType || 'individual'}\n\n`;
      
      // Requester Information
      report += `👤 REQUESTER INFORMATION:\n`;
      report += `${'─'.repeat(60)}\n`;
      report += `   Name: ${requestData.submittedBy || 'Unknown'}\n`;
      if (requestData.requesterPhone) {
        report += `   Phone: ${requestData.requesterCountryCode || '+91'} ${requestData.requesterPhone}\n`;
      }
      if (requestData.alternatePhone) {
        report += `   Alternate Phone: ${requestData.alternateCountryCode || '+91'} ${requestData.alternatePhone}\n`;
      }
      if (requestData.requesterEmail) {
        report += `   Email: ${requestData.requesterEmail}\n`;
      }
      report += `\n`;
      
      // Location Details
      report += `📍 LOCATION INFORMATION:\n`;
      report += `${'─'.repeat(60)}\n`;
      
      let hasLocation = false;
      if (requestData.locationAddress) {
        report += `   Address: ${requestData.locationAddress}\n`;
        hasLocation = true;
      }
      if (requestData.landmark) {
        report += `   Landmark: ${requestData.landmark}\n`;
        hasLocation = true;
      }
      if (requestData.area) {
        report += `   Area: ${requestData.area}\n`;
        hasLocation = true;
      }
      if (requestData.city) {
        report += `   City: ${requestData.city}\n`;
        hasLocation = true;
      }
      if (requestData.state) {
        report += `   State: ${requestData.state}\n`;
        hasLocation = true;
      }
      if (requestData.pincode) {
        report += `   Pincode: ${requestData.pincode}\n`;
        hasLocation = true;
      }
      if (requestData.latitude && requestData.longitude) {
        report += `   GPS Coordinates: ${requestData.latitude}, ${requestData.longitude}\n`;
        report += `   Google Maps: https://www.google.com/maps?q=${requestData.latitude},${requestData.longitude}\n`;
        hasLocation = true;
      }
      if (requestData.locationAccuracy) {
        report += `   Location Accuracy: ${requestData.locationAccuracy}m\n`;
        hasLocation = true;
      }
      
      if (!hasLocation) {
        report += `   Location information not provided\n`;
      }
      report += `\n`;
      
      // Beneficiaries
      report += `👥 BENEFICIARIES:\n`;
      report += `${'─'.repeat(60)}\n`;
      report += `   Total Beneficiaries: ${requestData.beneficiariesTotal || 0} people\n`;
      if (requestData.adults > 0) report += `   Adults: ${requestData.adults}\n`;
      if (requestData.children > 0) report += `   Children: ${requestData.children}\n`;
      if (requestData.elderly > 0) report += `   Elderly: ${requestData.elderly}\n`;
      if (requestData.infants > 0) report += `   Infants: ${requestData.infants}\n`;
      report += `\n`;
      
      // Needs & Requirements
      report += `🎯 NEEDS & REQUIREMENTS:\n`;
      report += `${'─'.repeat(60)}\n`;
      
      const needs = [];
      if (requestData.rescueRequired === 'Yes') {
        needs.push(`Rescue (Urgency: ${requestData.rescueUrgency || 'N/A'})`);
        if (requestData.rescueDetails) needs.push(`   Details: ${requestData.rescueDetails}`);
      }
      if (requestData.foodRequired === 'Yes') {
        needs.push(`Food (Quantity: ${requestData.foodQuantity || 'N/A'})`);
      }
      if (requestData.waterRequired === 'Yes') {
        needs.push(`Water (Quantity: ${requestData.waterQuantity || 'N/A'})`);
      }
      if (requestData.medicalRequired === 'Yes') {
        needs.push(`Medical (Urgency: ${requestData.medicalUrgency || 'N/A'})`);
        if (requestData.medicalDetails) needs.push(`   Details: ${requestData.medicalDetails}`);
      }
      if (requestData.shelterRequired === 'Yes') {
        needs.push(`Shelter`);
      }
      if (requestData.transportRequired === 'Yes') {
        needs.push(`Transport`);
      }
      
      if (needs.length > 0) {
        needs.forEach(need => report += `   • ${need}\n`);
      } else {
        report += `   No specific needs recorded\n`;
      }
      report += `\n`;
      
      // Description
      if (requestData.description) {
        report += `📝 DETAILED DESCRIPTION:\n`;
        report += `${'─'.repeat(60)}\n`;
        report += `   ${requestData.description}\n\n`;
      }
      
      // Special Needs
      if (requestData.specialNeeds && requestData.specialNeeds !== 'None') {
        report += `⚕️ SPECIAL NEEDS:\n`;
        report += `${'─'.repeat(60)}\n`;
        report += `   ${requestData.specialNeeds}\n`;
        if (requestData.medicalConditions) {
          report += `   Medical Conditions: ${requestData.medicalConditions}\n`;
        }
        if (requestData.disabilities) {
          report += `   Disabilities: ${requestData.disabilities}\n`;
        }
        if (requestData.pregnant === 'Yes') {
          report += `   Pregnant Individual: Yes\n`;
        }
        if (requestData.hasPets === 'Yes') {
          report += `   Pets: ${requestData.petCount} animal(s)\n`;
        }
        report += `\n`;
      }
      
      // SOS Indicators
      if (requestData.sosDetected === 'Yes') {
        report += `🚨 SOS INDICATORS:\n`;
        report += `${'─'.repeat(60)}\n`;
        if (requestData.trapped === 'Yes') report += `   ⚠️  TRAPPED - Person is trapped and cannot escape\n`;
        if (requestData.medicalEmergency === 'Yes') report += `   ⚠️  MEDICAL EMERGENCY - Requires immediate medical attention\n`;
        if (requestData.repeatedCalls > 0) report += `   ⚠️  Repeated Calls: ${requestData.repeatedCalls} times\n`;
        if (requestData.lowBattery === 'Yes') report += `   ⚠️  Low Battery - Device power critical\n`;
        if (requestData.poorSignal === 'Yes') report += `   ⚠️  Poor Signal - Communication may be lost\n`;
        if (requestData.sosKeywords) report += `   Keywords Detected: ${requestData.sosKeywords}\n`;
        report += `\n`;
      }
      
      // Device Information
      if (requestData.batteryLevel || requestData.signalStrength || requestData.networkType) {
        report += `📱 DEVICE INFORMATION:\n`;
        report += `${'─'.repeat(60)}\n`;
        if (requestData.batteryLevel) report += `   Battery Level: ${requestData.batteryLevel}%\n`;
        if (requestData.signalStrength) report += `   Signal Strength: ${requestData.signalStrength}\n`;
        if (requestData.networkType) report += `   Network Type: ${requestData.networkType}\n`;
        report += `\n`;
      }
      
      // Evidence
      if (requestData.totalEvidenceCount > 0) {
        report += `📸 EVIDENCE COLLECTED:\n`;
        report += `${'─'.repeat(60)}\n`;
        report += `   Total Evidence Items: ${requestData.totalEvidenceCount}\n`;
        if (requestData.photoCount > 0) report += `   Photos: ${requestData.photoCount}\n`;
        if (requestData.videoCount > 0) report += `   Videos: ${requestData.videoCount}\n`;
        if (requestData.voiceNoteCount > 0) report += `   Voice Notes: ${requestData.voiceNoteCount}\n`;
        if (requestData.documentCount > 0) report += `   Documents: ${requestData.documentCount}\n`;
        report += `\n`;
      }
      
      // Assignment Information
      report += `🏢 ASSIGNMENT & NGO INFORMATION:\n`;
      report += `${'─'.repeat(60)}\n`;
      if (requestData.assignedNGOs && requestData.assignedNGOs !== 'None') {
        report += `   Assigned NGOs: ${requestData.assignedNGOs}\n`;
        report += `   Number of Assignments: ${requestData.assignmentCount}\n`;
        report += `   Assignment Status:\n`;
        const statuses = requestData.assignmentStatuses.split('; ');
        statuses.forEach(status => report += `      • ${status}\n`);
      } else {
        report += `   ⚠️  NOT YET ASSIGNED TO ANY NGO\n`;
        report += `   RECOMMENDATION: Assign immediately based on priority level\n`;
      }
      report += `\n`;
      
      // Timeline
      report += `📅 TIMELINE & STATUS HISTORY:\n`;
      report += `${'─'.repeat(60)}\n`;
      report += `   Request Created: ${requestData.requestCreated || 'Unknown'}\n`;
      report += `   Last Updated: ${requestData.lastUpdated || 'Unknown'}\n`;
      if (requestData.triagedAt && requestData.triagedAt !== '') {
        report += `   ✓ Triaged: ${requestData.triagedAt}\n`;
        if (requestData.triageNotes && requestData.triageNotes !== '') {
          report += `     Triage Notes: ${requestData.triageNotes}\n`;
        }
      } else {
        report += `   ⚠️  Not yet triaged\n`;
      }
      if (requestData.assignedDate && requestData.assignedDate !== 'Not assigned' && requestData.assignedDate !== '') {
        report += `   ✓ Assigned: ${requestData.assignedDate}\n`;
      }
      if (requestData.inProgressDate && requestData.inProgressDate !== '') {
        report += `   ✓ In Progress: ${requestData.inProgressDate}\n`;
      }
      if (requestData.fulfilledAt && requestData.fulfilledAt !== '') {
        report += `   ✓ Fulfilled: ${requestData.fulfilledAt}\n`;
      }
      if (requestData.closedAt && requestData.closedAt !== '') {
        report += `   ✓ Closed: ${requestData.closedAt}\n`;
      }
      report += `\n`;
      
      // Operator Notes
      if (requestData.operatorNotes) {
        report += `📝 OPERATOR NOTES:\n`;
        report += `${'─'.repeat(60)}\n`;
        report += `   ${requestData.operatorNotes}\n\n`;
      }
      
      // Priority Changes
      if (requestData.priorityChangedAt) {
        report += `⚡ PRIORITY CHANGE HISTORY:\n`;
        report += `${'─'.repeat(60)}\n`;
        report += `   Priority Changed: ${requestData.priorityChangedAt}\n\n`;
      }
      
      // Duplicate/Escalation Status
      if (requestData.isDuplicate === 'Yes' || requestData.isEscalated === 'Yes' || requestData.matchConfirmed === 'Yes') {
        report += `🔍 SPECIAL STATUS:\n`;
        report += `${'─'.repeat(60)}\n`;
        if (requestData.isDuplicate === 'Yes') {
          report += `   Duplicate Status: Yes (Score: ${requestData.duplicateScore})\n`;
        }
        if (requestData.isEscalated === 'Yes') {
          report += `   Escalated: Yes\n`;
          if (requestData.escalationReason) report += `   Escalation Reason: ${requestData.escalationReason}\n`;
          if (requestData.escalatedAt) report += `   Escalated At: ${requestData.escalatedAt}\n`;
        }
        if (requestData.matchConfirmed === 'Yes') {
          report += `   Match Confirmed: Yes (${requestData.matchConfirmedAt})\n`;
        }
        report += `\n`;
      }
      
      // Feedback & Satisfaction
      if (requestData.victimRating || requestData.fulfillmentConfirmed === 'Yes') {
        report += `⭐ FEEDBACK & SATISFACTION:\n`;
        report += `${'─'.repeat(60)}\n`;
        if (requestData.victimRating) {
          report += `   Victim Rating: ${requestData.victimRating}/5 ${'⭐'.repeat(parseInt(requestData.victimRating))}\n`;
        }
        if (requestData.victimFeedback) {
          report += `   Victim Feedback: ${requestData.victimFeedback}\n`;
        }
        if (requestData.victimFeedbackSubmittedAt) {
          report += `   Feedback Submitted: ${requestData.victimFeedbackSubmittedAt}\n`;
        }
        if (requestData.fulfillmentConfirmed === 'Yes') {
          report += `   Fulfillment Confirmed: ${requestData.fulfillmentConfirmedAt}\n`;
          if (requestData.fulfillmentSatisfaction) {
            report += `   Fulfillment Satisfaction: ${requestData.fulfillmentSatisfaction}/5\n`;
          }
          if (requestData.fulfillmentNotes) {
            report += `   Fulfillment Notes: ${requestData.fulfillmentNotes}\n`;
          }
        }
        report += `\n`;
      }
      
      // Recommendations
      report += `💡 RECOMMENDATIONS:\n`;
      report += `${'─'.repeat(60)}\n`;
      
      if (requestData.currentStatus === 'new') {
        report += `   • Immediate triage required\n`;
      }
      if (requestData.sosDetected === 'Yes') {
        report += `   • 🚨 URGENT: Deploy emergency response team immediately\n`;
      }
      if (requestData.assignedNGOs === 'None' && requestData.currentStatus !== 'closed') {
        report += `   • Assign to appropriate NGO based on location and needs\n`;
      }
      if (requestData.rescueRequired === 'Yes') {
        report += `   • Deploy rescue team with appropriate equipment\n`;
      }
      if (requestData.medicalRequired === 'Yes') {
        report += `   • Coordinate with medical team for emergency response\n`;
      }
      if (requestData.lowBattery === 'Yes') {
        report += `   • Communication may be lost - prioritize immediate response\n`;
      }
      if (requestData.trapped === 'Yes') {
        report += `   • Coordinate with fire/rescue services immediately\n`;
      }
      
      report += `\n═══════════════════════════════════════════════════════════\n`;
      report += `End of Individual Request Report\n`;
      report += `═══════════════════════════════════════════════════════════\n`;
      
      // Download the report
      const reportBlob = new Blob([report], { type: 'text/plain' });
      const url = window.URL.createObjectURL(reportBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `request-report-${requestData.ticketNumber}-${Date.now()}.txt`;
      link.click();
      window.URL.revokeObjectURL(url);
      
      // Also show in alert for quick view (first 2000 characters)
      alert(report.length > 2000 ? report.substring(0, 2000) + '\n\n... (Full report downloaded)' : report);
      
    } catch (error) {
      console.error('Error generating individual report:', error);
      alert('Error generating report: ' + error.message);
    }
  };

  const generateReport = async () => {
    try {
      // Fetch the complete export data from backend
      const response = await axios.get(`${API_URL}/analytics/export/requests`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        params: { format: 'json' }
      });

      const exportedData = response.data;
      const now = new Date();
      const threeHoursAgo = new Date(now - 3 * 60 * 60 * 1000);
      
      // Calculate statistics from exported data
      const totalRequests = exportedData.length;
      const activeReqs = exportedData.filter(r => ['new', 'triaged', 'assigned', 'in-progress'].includes(r.currentStatus));
      const sosReqs = exportedData.filter(r => r.sosDetected === 'Yes');
      const criticalReqs = exportedData.filter(r => r.priority === 'critical');
      
      // Status breakdown from exported data
      const newReqs = exportedData.filter(r => r.currentStatus === 'new').length;
      const triagedReqs = exportedData.filter(r => r.currentStatus === 'triaged').length;
      const assignedReqs = exportedData.filter(r => r.currentStatus === 'assigned').length;
      const inProgressReqs = exportedData.filter(r => r.currentStatus === 'in-progress').length;
      const fulfilledReqs = exportedData.filter(r => r.currentStatus === 'fulfilled').length;
      const closedReqs = exportedData.filter(r => r.currentStatus === 'closed').length;
      
      // Needs analysis from exported data
      const foodNeeds = exportedData.filter(r => r.foodRequired === 'Yes' && !['fulfilled', 'closed'].includes(r.currentStatus)).length;
      const waterNeeds = exportedData.filter(r => r.waterRequired === 'Yes' && !['fulfilled', 'closed'].includes(r.currentStatus)).length;
      const medicalNeeds = exportedData.filter(r => r.medicalRequired === 'Yes' && !['fulfilled', 'closed'].includes(r.currentStatus)).length;
      const shelterNeeds = exportedData.filter(r => r.shelterRequired === 'Yes' && !['fulfilled', 'closed'].includes(r.currentStatus)).length;
      const rescueNeeds = exportedData.filter(r => r.rescueRequired === 'Yes' && !['fulfilled', 'closed'].includes(r.currentStatus)).length;
      
      // Recent trends (last 3 hours) from exported data
      const recentRequests = exportedData.filter(r => {
        const createdDate = new Date(r.requestCreated);
        return createdDate >= threeHoursAgo;
      });
      const recentFoodReqs = recentRequests.filter(r => r.foodRequired === 'Yes').length;
      const recentWaterReqs = recentRequests.filter(r => r.waterRequired === 'Yes').length;
      const recentMedicalReqs = recentRequests.filter(r => r.medicalRequired === 'Yes').length;
      
      // Calculate percentage changes from exported data
      const oldFoodReqs = exportedData.filter(r => {
        const createdDate = new Date(r.requestCreated);
        return r.foodRequired === 'Yes' && createdDate < threeHoursAgo;
      }).length;
      const oldWaterReqs = exportedData.filter(r => {
        const createdDate = new Date(r.requestCreated);
        return r.waterRequired === 'Yes' && createdDate < threeHoursAgo;
      }).length;
      const foodTrend = oldFoodReqs > 0 ? Math.round(((recentFoodReqs / oldFoodReqs) - 1) * 100) : 0;
      const waterTrend = oldWaterReqs > 0 ? Math.round(((recentWaterReqs / oldWaterReqs) - 1) * 100) : 0;
      
      // NGO capacity analysis
      const activeNGOs = ngos.filter(n => n.status === 'active').length;
      const busyNGOs = ngos.filter(n => (n.activeAssignments || 0) > 5).length;
      
      // Assignment analysis
      const pendingAssignments = assignments.filter(a => a.status === 'pending').length;
      const activeAssignments = assignments.filter(a => a.status === 'active').length;
      
      // Zone analysis (by city/area) from exported data
      const zoneBreakdown = {};
      exportedData.forEach(r => {
        const zone = r.city || r.area || 'Unknown';
        if (!zoneBreakdown[zone]) {
          zoneBreakdown[zone] = { total: 0, food: 0, water: 0, medical: 0, shelter: 0 };
        }
        zoneBreakdown[zone].total++;
        if (r.foodRequired === 'Yes' && !['fulfilled', 'closed'].includes(r.currentStatus)) zoneBreakdown[zone].food++;
        if (r.waterRequired === 'Yes' && !['fulfilled', 'closed'].includes(r.currentStatus)) zoneBreakdown[zone].water++;
        if (r.medicalRequired === 'Yes' && !['fulfilled', 'closed'].includes(r.currentStatus)) zoneBreakdown[zone].medical++;
        if (r.shelterRequired === 'Yes' && !['fulfilled', 'closed'].includes(r.currentStatus)) zoneBreakdown[zone].shelter++;
      });
      
      // Find critical zones
      const criticalZones = Object.entries(zoneBreakdown)
        .filter(([zone]) => zone !== 'Unknown')
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 3);
      
      // Shelter capacity
      const shelterCapacity = shelters.reduce((sum, s) => sum + (s.capacity || 0), 0);
      const shelterOccupancy = Math.round((shelterNeeds / Math.max(shelterCapacity, 1)) * 100);
      
      // Generate plain-English report
      let report = `═══════════════════════════════════════════════════════════\n`;
      report += `         DISASTER RELIEF SITUATION REPORT\n`;
      report += `         Generated: ${now.toLocaleString()}\n`;
      report += `═══════════════════════════════════════════════════════════\n\n`;
      
      // CRITICAL ALERTS
      if (sosReqs.length > 0 || criticalReqs.length > 0) {
        report += `🚨 CRITICAL ALERTS:\n`;
        if (sosReqs.length > 0) {
          report += `   • ${sosReqs.length} SOS EMERGENCIES requiring immediate attention!\n`;
        }
        if (criticalReqs.length > 0) {
          report += `   • ${criticalReqs.length} critical priority requests need urgent response.\n`;
        }
        report += `\n`;
      }
      
      // OVERALL SITUATION
      report += `📊 OVERALL SITUATION:\n`;
      report += `   • Total Requests: ${totalRequests} (${activeReqs.length} active, ${fulfilledReqs} fulfilled, ${closedReqs} closed)\n`;
      report += `   • Request Pipeline: ${newReqs} new → ${triagedReqs} triaged → ${assignedReqs} assigned → ${inProgressReqs} in-progress\n`;
      report += `   • Recent Activity: ${recentRequests.length} requests received in last 3 hours\n\n`;
      
      // UNMET NEEDS
      report += `🎯 UNMET NEEDS:\n`;
      const needsArray = [];
      if (foodNeeds > 0) needsArray.push(`${foodNeeds} food requests`);
      if (waterNeeds > 0) needsArray.push(`${waterNeeds} water requests`);
      if (medicalNeeds > 0) needsArray.push(`${medicalNeeds} medical requests`);
      if (shelterNeeds > 0) needsArray.push(`${shelterNeeds} shelter requests`);
      if (rescueNeeds > 0) needsArray.push(`${rescueNeeds} rescue requests`);
      
      if (needsArray.length > 0) {
        report += `   • ${needsArray.join(', ')}\n`;
      } else {
        report += `   • All current needs are being addressed\n`;
      }
      
      // TRENDS
      if (recentRequests.length > 0) {
        report += `\n📈 TRENDS (Last 3 Hours):\n`;
        if (waterTrend > 10) {
          report += `   • ⚠️  Water demand rising ${Math.abs(waterTrend)}% - consider deploying additional water tankers\n`;
        }
        if (foodTrend > 10) {
          report += `   • ⚠️  Food demand rising ${Math.abs(foodTrend)}% - increase distribution capacity\n`;
        }
        if (recentMedicalReqs > 2) {
          report += `   • ⚠️  ${recentMedicalReqs} new medical requests - medical teams may need support\n`;
        }
        if (waterTrend <= 10 && foodTrend <= 10 && recentMedicalReqs <= 2) {
          report += `   • Demand is stable across all categories\n`;
        }
      }
      
      // ZONE ANALYSIS
      if (criticalZones.length > 0) {
        report += `\n🗺️  ZONE ANALYSIS:\n`;
        criticalZones.forEach(([zone, data], idx) => {
          const recommendations = [];
          if (data.food > 5) recommendations.push(`${Math.ceil(data.food / 50)} food distribution teams`);
          if (data.water > 5) recommendations.push(`${Math.ceil(data.water / 30)} water tankers`);
          if (data.medical > 3) recommendations.push(`${Math.ceil(data.medical / 10)} medical teams`);
          if (data.shelter > 3) recommendations.push(`shelter support for ${data.shelter} families`);
          
          report += `   ${idx + 1}. ${zone}: ${data.total} total requests`;
          if (data.food > 0 || data.water > 0 || data.medical > 0 || data.shelter > 0) {
            const breakdown = [];
            if (data.food > 0) breakdown.push(`${data.food} food`);
            if (data.water > 0) breakdown.push(`${data.water} water`);
            if (data.medical > 0) breakdown.push(`${data.medical} medical`);
            if (data.shelter > 0) breakdown.push(`${data.shelter} shelter`);
            report += ` (${breakdown.join(', ')})`;
          }
          report += `\n`;
          
          if (recommendations.length > 0) {
            report += `      → Recommend deploying: ${recommendations.join(', ')}\n`;
          }
        });
      }
      
      // SHELTER STATUS
      if (shelters.length > 0) {
        report += `\n🏠 SHELTER STATUS:\n`;
        report += `   • ${shelters.length} shelters available with total capacity: ${shelterCapacity}\n`;
        report += `   • Current occupancy: ~${shelterOccupancy}%`;
        if (shelterOccupancy > 80) {
          report += ` ⚠️  NEAR CAPACITY - consider opening additional shelters\n`;
        } else if (shelterOccupancy > 50) {
          report += ` - monitor closely\n`;
        } else {
          report += ` - adequate capacity\n`;
        }
        
        const nearCapacity = shelters.filter(s => s.occupied && s.capacity && (s.occupied / s.capacity) > 0.8);
        if (nearCapacity.length > 0) {
          report += `   • ${nearCapacity.length} shelter(s) near capacity: ${nearCapacity.map(s => s.name).join(', ')}\n`;
        }
      }
      
      // NGO CAPACITY
      report += `\n👥 NGO CAPACITY:\n`;
      report += `   • ${activeNGOs} active NGOs, ${busyNGOs} operating near capacity\n`;
      report += `   • ${pendingAssignments} assignments pending, ${activeAssignments} currently active\n`;
      if (busyNGOs > activeNGOs * 0.5) {
        report += `   • ⚠️  Over 50% of NGOs are heavily loaded - consider mobilizing additional resources\n`;
      }
      
      // RECOMMENDATIONS
      report += `\n💡 IMMEDIATE ACTIONS RECOMMENDED:\n`;
      let actionCount = 0;
      
      if (sosReqs.length > 0) {
        report += `   ${++actionCount}. URGENT: Dispatch emergency teams to ${sosReqs.length} SOS locations immediately\n`;
      }
      if (rescueNeeds > 0) {
        report += `   ${++actionCount}. Deploy ${Math.ceil(rescueNeeds / 5)} rescue teams for ${rescueNeeds} pending rescue operations\n`;
      }
      if (waterTrend > 15) {
        report += `   ${++actionCount}. Send ${Math.ceil(waterNeeds / 30)} additional water tankers (demand rising ${waterTrend}%)\n`;
      }
      if (foodTrend > 15) {
        report += `   ${++actionCount}. Deploy ${Math.ceil(foodNeeds / 50)} additional food distribution teams (demand rising ${foodTrend}%)\n`;
      }
      if (shelterOccupancy > 80) {
        report += `   ${++actionCount}. Open additional shelter facilities - current shelters at ${shelterOccupancy}% capacity\n`;
      }
      if (medicalNeeds > 10) {
        report += `   ${++actionCount}. Dispatch ${Math.ceil(medicalNeeds / 10)} medical teams for ${medicalNeeds} medical requests\n`;
      }
      if (newReqs > 20) {
        report += `   ${++actionCount}. Increase operator capacity - ${newReqs} requests awaiting triage\n`;
      }
      if (busyNGOs > activeNGOs * 0.7) {
        report += `   ${++actionCount}. Mobilize backup NGOs - current teams operating at high capacity\n`;
      }
      
      if (actionCount === 0) {
        report += `   • Situation is stable. Continue monitoring and maintain current resource allocation.\n`;
      }
      
      // DETAILED REQUEST LISTING (from CSV data)
      report += `\n\n═══════════════════════════════════════════════════════════\n`;
      report += `              DETAILED REQUEST INFORMATION\n`;
      report += `═══════════════════════════════════════════════════════════\n\n`;
      
      // Group requests by priority
      const sosRequests = exportedData.filter(r => r.sosDetected === 'Yes');
      const criticalRequests = exportedData.filter(r => r.priority === 'critical' && r.sosDetected !== 'Yes');
      const highRequests = exportedData.filter(r => r.priority === 'high' && !['sos', 'critical'].includes(r.priority));
      const activeRequests = exportedData.filter(r => ['new', 'triaged', 'assigned', 'in-progress'].includes(r.currentStatus) && !['critical', 'high', 'sos'].includes(r.priority));
      
      // SOS REQUESTS
      if (sosRequests.length > 0) {
        report += `🚨 SOS EMERGENCY REQUESTS (${sosRequests.length}):\n`;
        report += `${'─'.repeat(60)}\n\n`;
        
        sosRequests.forEach((req, idx) => {
          report += `${idx + 1}. Ticket #${req.ticketNumber}\n`;
          report += `   Status: ${req.currentStatus.toUpperCase()} | Priority: ${req.priority.toUpperCase()}\n`;
          report += `   Requester: ${req.submittedBy} (${req.requesterPhone})\n`;
          report += `   Location: ${req.locationAddress || req.city || 'Not specified'}\n`;
          if (req.latitude && req.longitude) {
            report += `   Coordinates: ${req.latitude}, ${req.longitude}\n`;
          }
          report += `   Beneficiaries: ${req.beneficiariesTotal} people (${req.adults} adults`;
          if (req.children > 0) report += `, ${req.children} children`;
          if (req.elderly > 0) report += `, ${req.elderly} elderly`;
          if (req.infants > 0) report += `, ${req.infants} infants`;
          report += `)\n`;
          
          // Needs
          const needs = [];
          if (req.rescueRequired === 'Yes') needs.push(`Rescue (${req.rescueUrgency})`);
          if (req.foodRequired === 'Yes') needs.push(`Food (Qty: ${req.foodQuantity || 'N/A'})`);
          if (req.waterRequired === 'Yes') needs.push(`Water (Qty: ${req.waterQuantity || 'N/A'})`);
          if (req.medicalRequired === 'Yes') needs.push(`Medical (${req.medicalUrgency})`);
          if (req.shelterRequired === 'Yes') needs.push('Shelter');
          if (req.transportRequired === 'Yes') needs.push('Transport');
          if (needs.length > 0) {
            report += `   Needs: ${needs.join(', ')}\n`;
          }
          
          // Description
          if (req.description) {
            report += `   Description: ${req.description}\n`;
          }
          
          // SOS Indicators
          const indicators = [];
          if (req.trapped === 'Yes') indicators.push('TRAPPED');
          if (req.medicalEmergency === 'Yes') indicators.push('MEDICAL EMERGENCY');
          if (req.lowBattery === 'Yes') indicators.push('Low Battery');
          if (req.poorSignal === 'Yes') indicators.push('Poor Signal');
          if (indicators.length > 0) {
            report += `   ⚠️  Indicators: ${indicators.join(', ')}\n`;
          }
          
          // Special Needs
          if (req.specialNeeds && req.specialNeeds !== 'None') {
            report += `   Special Needs: ${req.specialNeeds}\n`;
          }
          
          // Assignment info
          if (req.assignedNGOs && req.assignedNGOs !== 'None') {
            report += `   Assigned NGOs: ${req.assignedNGOs}\n`;
            report += `   Assignment Status: ${req.assignmentStatuses}\n`;
          } else {
            report += `   ⚠️  NOT YET ASSIGNED - IMMEDIATE ASSIGNMENT REQUIRED\n`;
          }
          
          // Timestamps
          report += `   Created: ${req.requestCreated}\n`;
          if (req.triagedAt) report += `   Triaged: ${req.triagedAt}\n`;
          
          report += `\n`;
        });
      }
      
      // CRITICAL REQUESTS
      if (criticalRequests.length > 0) {
        report += `\n⚠️  CRITICAL PRIORITY REQUESTS (${criticalRequests.length}):\n`;
        report += `${'─'.repeat(60)}\n\n`;
        
        criticalRequests.slice(0, 10).forEach((req, idx) => {
          report += `${idx + 1}. Ticket #${req.ticketNumber} - ${req.locationAddress || req.city || 'Location N/A'}\n`;
          report += `   Requester: ${req.submittedBy} (${req.requesterPhone})\n`;
          report += `   Status: ${req.currentStatus} | Beneficiaries: ${req.beneficiariesTotal}\n`;
          
          const needs = [];
          if (req.rescueRequired === 'Yes') needs.push('Rescue');
          if (req.foodRequired === 'Yes') needs.push('Food');
          if (req.waterRequired === 'Yes') needs.push('Water');
          if (req.medicalRequired === 'Yes') needs.push('Medical');
          if (req.shelterRequired === 'Yes') needs.push('Shelter');
          report += `   Needs: ${needs.join(', ')}\n`;
          
          if (req.description) {
            report += `   Description: ${req.description.substring(0, 100)}${req.description.length > 100 ? '...' : ''}\n`;
          }
          
          if (req.assignedNGOs && req.assignedNGOs !== 'None') {
            report += `   Assigned to: ${req.assignedNGOs}\n`;
          } else {
            report += `   ⚠️  Not assigned yet\n`;
          }
          
          report += `   Created: ${req.requestCreated}\n\n`;
        });
        
        if (criticalRequests.length > 10) {
          report += `   ... and ${criticalRequests.length - 10} more critical requests\n\n`;
        }
      }
      
      // HIGH PRIORITY UNASSIGNED
      const unassignedHigh = exportedData.filter(r => 
        r.priority === 'high' && 
        r.currentStatus === 'new' && 
        (r.assignedNGOs === 'None' || !r.assignedNGOs)
      );
      
      if (unassignedHigh.length > 0) {
        report += `\n📋 UNASSIGNED HIGH PRIORITY REQUESTS (${unassignedHigh.length}):\n`;
        report += `${'─'.repeat(60)}\n\n`;
        
        unassignedHigh.slice(0, 10).forEach((req, idx) => {
          report += `${idx + 1}. Ticket #${req.ticketNumber}\n`;
          report += `   Location: ${req.locationAddress || req.city || 'N/A'}\n`;
          report += `   Beneficiaries: ${req.beneficiariesTotal} | Contact: ${req.requesterPhone}\n`;
          
          const needs = [];
          if (req.foodRequired === 'Yes') needs.push('Food');
          if (req.waterRequired === 'Yes') needs.push('Water');
          if (req.medicalRequired === 'Yes') needs.push('Medical');
          if (req.shelterRequired === 'Yes') needs.push('Shelter');
          report += `   Needs: ${needs.join(', ')}\n`;
          report += `   Waiting since: ${req.requestCreated}\n\n`;
        });
        
        if (unassignedHigh.length > 10) {
          report += `   ... and ${unassignedHigh.length - 10} more unassigned requests\n\n`;
        }
      }
      
      // ACTIVE/IN-PROGRESS SUMMARY
      const inProgress = exportedData.filter(r => r.currentStatus === 'in-progress');
      if (inProgress.length > 0) {
        report += `\n🔄 REQUESTS IN PROGRESS (${inProgress.length}):\n`;
        report += `${'─'.repeat(60)}\n`;
        
        // Group by NGO
        const byNGO = {};
        inProgress.forEach(req => {
          const ngo = req.assignedNGOs || 'Unknown';
          if (!byNGO[ngo]) byNGO[ngo] = [];
          byNGO[ngo].push(req);
        });
        
        Object.entries(byNGO).forEach(([ngo, reqs]) => {
          report += `\n   ${ngo}: ${reqs.length} active assignment(s)\n`;
          reqs.slice(0, 3).forEach(req => {
            report += `      • Ticket #${req.ticketNumber} - ${req.city || 'N/A'}\n`;
          });
          if (reqs.length > 3) {
            report += `      ... and ${reqs.length - 3} more\n`;
          }
        });
        report += `\n`;
      }
      
      // FULFILLED/COMPLETED SUMMARY
      const completed = exportedData.filter(r => ['fulfilled', 'closed'].includes(r.currentStatus));
      if (completed.length > 0) {
        report += `\n✅ COMPLETED REQUESTS (${completed.length}):\n`;
        report += `${'─'.repeat(60)}\n`;
        
        const withFeedback = completed.filter(r => r.victimRating);
        const avgRating = withFeedback.length > 0 
          ? (withFeedback.reduce((sum, r) => sum + parseFloat(r.victimRating || 0), 0) / withFeedback.length).toFixed(1)
          : 'N/A';
        
        report += `   Total Completed: ${completed.length}\n`;
        report += `   With Feedback: ${withFeedback.length}\n`;
        report += `   Average Satisfaction Rating: ${avgRating}/5\n`;
        
        // Recently completed (last 24 hours)
        const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
        const recentlyCompleted = completed.filter(r => {
          const closedDate = new Date(r.closedAt || r.fulfilledAt || 0);
          return closedDate >= oneDayAgo;
        });
        
        if (recentlyCompleted.length > 0) {
          report += `   Completed in last 24 hours: ${recentlyCompleted.length}\n`;
        }
        report += `\n`;
      }
      
      // STATISTICS SUMMARY
      report += `\n📊 DETAILED STATISTICS:\n`;
      report += `${'─'.repeat(60)}\n`;
      report += `   Total Requests: ${totalRequests}\n`;
      report += `   By Status:\n`;
      report += `      • New (awaiting triage): ${newReqs}\n`;
      report += `      • Triaged: ${triagedReqs}\n`;
      report += `      • Assigned: ${assignedReqs}\n`;
      report += `      • In Progress: ${inProgressReqs}\n`;
      report += `      • Fulfilled: ${fulfilledReqs}\n`;
      report += `      • Closed: ${closedReqs}\n`;
      report += `\n   By Priority:\n`;
      report += `      • SOS: ${sosReqs.length}\n`;
      report += `      • Critical: ${criticalReqs.length}\n`;
      report += `      • High: ${highRequests.length}\n`;
      report += `      • Medium/Low: ${totalRequests - sosReqs.length - criticalReqs.length - highRequests.length}\n`;
      report += `\n   By Need Type (Unmet):\n`;
      report += `      • Food: ${foodNeeds}\n`;
      report += `      • Water: ${waterNeeds}\n`;
      report += `      • Medical: ${medicalNeeds}\n`;
      report += `      • Shelter: ${shelterNeeds}\n`;
      report += `      • Rescue: ${rescueNeeds}\n`;
      
      // Evidence summary
      const totalPhotos = exportedData.reduce((sum, r) => sum + parseInt(r.photoCount || 0), 0);
      const totalVideos = exportedData.reduce((sum, r) => sum + parseInt(r.videoCount || 0), 0);
      const totalAudio = exportedData.reduce((sum, r) => sum + parseInt(r.voiceNoteCount || 0), 0);
      
      report += `\n   Evidence Collected:\n`;
      report += `      • Photos: ${totalPhotos}\n`;
      report += `      • Videos: ${totalVideos}\n`;
      report += `      • Audio recordings: ${totalAudio}\n`;
      
      report += `\n═══════════════════════════════════════════════════════════\n`;
      report += `End of Report - Total ${exportedData.length} requests analyzed\n`;
      report += `═══════════════════════════════════════════════════════════\n`;
      
      // Display in a modal or download
      const reportBlob = new Blob([report], { type: 'text/plain' });
      const url = window.URL.createObjectURL(reportBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `situation-report-${Date.now()}.txt`;
      link.click();
      window.URL.revokeObjectURL(url);
      
      // Also show in alert for quick view
      alert(report);
      
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Error generating report: ' + error.message);
    }
  };

  const triageRequest = async (requestId) => {
    try {
      const response = await axios.post(
        `${API_URL}/assignments/requests/${requestId}/triage`,
        {
          triageNotes,
          priority: triagePriority
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );

      if (response.data.success) {
        setTriageDialog(null);
        setTriageNotes('');
        setTriagePriority('medium');
        fetchRequests();
        alert('Request triaged successfully!');
      }
    } catch (error) {
      alert('Error triaging request: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Update request priority
  const handleUpdatePriority = async (requestId, newPriority) => {
    try {
      const response = await axios.patch(
        `${API_URL}/requests/${requestId}/priority`,
        { priority: newPriority },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      );

      if (response.data.success) {
        // Update the request in state with new priority and sosDetected flag
        setRequests(prev =>
          prev.map(r =>
            r._id === requestId
              ? {
                  ...r,
                  priority: newPriority,
                  sosDetected: response.data.request.sosDetected || (newPriority === "sos"),
                  priorityChangedAt: response.data.request.priorityChangedAt,
                  priorityChangedBy: response.data.request.priorityChangedBy,
                }
              : r
          )
        );
        
        // If priority changed to SOS, show special alert
        if (newPriority === "sos") {
          console.log(`🚨 PRIORITY CHANGED TO SOS - Request added to SOS queue`);
          alert(`🚨 PRIORITY CHANGED TO SOS\n\nRequest has been added to the SOS queue!`);
        } else {
          console.log(`✅ Priority updated to ${newPriority}`);
          alert(`✅ Priority updated to ${newPriority}`);
        }
      }
    } catch (error) {
      console.error('❌ Error updating priority:', error);
      alert(`Error: ${error.response?.data?.message || error.message}`);
      // Revert the UI change on error
      setRequests([...requests]);
    }
  };

  // Export Analytics to CSV
  const exportAnalyticsToCSV = () => {
    try {
      const timestamp = new Date().toLocaleString();
      
      // Calculate statistics
      const totalBeneficiaries = requests.reduce((sum, r) => sum + (r.beneficiaries?.total || 0), 0);
      const fulfilledRequests = requests.filter(r => r.status === 'fulfilled').length;
      const sosCount = requests.filter(r => r.sosDetected).length;
      const criticalCount = requests.filter(r => r.priority === 'critical').length;
      
      // Calculate heatmap data
      const areas = {};
      requests.forEach(req => {
        if (req.location?.coordinates) {
          const lat = Math.round(req.location.coordinates[1] * 10) / 10;
          const lng = Math.round(req.location.coordinates[0] * 10) / 10;
          const key = `${lat},${lng}`;
          if (!areas[key]) {
            areas[key] = { demands: 0, supply: 0 };
          }
          areas[key].demands++;
        }
      });
      
      ngos.forEach(ngo => {
        if (ngo.location?.coordinates) {
          const lat = Math.round(ngo.location.coordinates[1] * 10) / 10;
          const lng = Math.round(ngo.location.coordinates[0] * 10) / 10;
          const key = `${lat},${lng}`;
          if (!areas[key]) {
            areas[key] = { demands: 0, supply: 0 };
          }
          areas[key].supply++;
        }
      });
      
      const totalDemands = Object.values(areas).reduce((sum, a) => sum + a.demands, 0);
      const totalSupply = Object.values(areas).reduce((sum, a) => sum + a.supply, 0);
      
      // Create CSV content
      let csv = "DISASTER AID - AUTHORITY DASHBOARD ANALYTICS REPORT\n";
      csv += `Generated on: ${timestamp}\n\n`;
      
      csv += "=== SUMMARY STATISTICS ===\n";
      csv += `Total Requests,${requests.length}\n`;
      csv += `Active Requests,${requests.filter(r => ['new', 'triaged', 'assigned', 'in-progress'].includes(r.status)).length}\n`;
      csv += `Fulfilled Requests,${fulfilledRequests}\n`;
      csv += `SOS Detected,${sosCount}\n`;
      csv += `Critical Priority,${criticalCount}\n`;
      csv += `Total Beneficiaries,${totalBeneficiaries}\n`;
      csv += `Active Clusters,${clusters.length}\n\n`;
      
      csv += "=== DEMANDS VS SUPPLY ===\n";
      csv += `Total Demands (Requests),${totalDemands}\n`;
      csv += `Total Supply (NGO Teams),${totalSupply}\n`;
      csv += `Average Ratio,${(totalDemands / (totalSupply || 1)).toFixed(2)}\n\n`;
      
      csv += "=== REQUEST STATUS BREAKDOWN ===\n";
      const statusCounts = {};
      requests.forEach(r => {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      });
      Object.entries(statusCounts).forEach(([status, count]) => {
        csv += `${status},${count}\n`;
      });
      csv += "\n";
      
      csv += "=== PRIORITY DISTRIBUTION ===\n";
      const priorityCounts = {};
      requests.forEach(r => {
        priorityCounts[r.priority] = (priorityCounts[r.priority] || 0) + 1;
      });
      Object.entries(priorityCounts).forEach(([priority, count]) => {
        csv += `${priority},${count}\n`;
      });
      csv += "\n";
      
      csv += "=== GEOGRAPHIC ANALYSIS ===\n";
      csv += "Location,Demands,Supply,Ratio,Balance\n";
      Object.entries(areas).forEach(([key, data]) => {
        const ratio = data.demands / (data.supply || 0.1);
        const balance = data.supply - data.demands;
        csv += `"${key}",${data.demands},${data.supply},${ratio.toFixed(2)},${balance}\n`;
      });
      csv += "\n";
      
      csv += "=== DETAILED REQUEST LIST WITH ASSIGNMENTS ===\n";
      csv += "ID,Status,Priority,SOS,Location,Beneficiaries,Created,AssignedTo,AssignmentStatus,AssignmentCreated,Notes,Fulfilled,TriagedBy,TriagedAt\n";
      requests.forEach(r => {
        const location = r.location?.address || `(${r.location?.coordinates?.join(', ')})` || 'N/A';
        const created = new Date(r.createdAt).toLocaleDateString();
        
        // Get assignment info if exists
        const assignment = assignments?.find(a => a.request?._id === r._id);
        const assignedTo = assignment?.ngo?.name || 'Not Assigned';
        const assignmentStatus = assignment?.status || 'No Assignment';
        const assignmentCreated = assignment ? new Date(assignment.createdAt).toLocaleDateString() : 'N/A';
        const notes = assignment?.notes?.replace(/"/g, '""') || 'N/A';
        const fulfilled = assignment ? (assignment.status === 'fulfilled' ? 'YES' : 'NO') : 'N/A';
        const triagedBy = r.triagedBy ? 'Yes' : 'No';
        const triagedAt = r.triagedAt ? new Date(r.triagedAt).toLocaleDateString() : 'N/A';
        
        csv += `"${r._id}","${r.status}","${r.priority}","${r.sosDetected ? 'YES' : 'NO'}","${location}",${r.beneficiaries?.total || 0},"${created}","${assignedTo}","${assignmentStatus}","${assignmentCreated}","${notes}","${fulfilled}","${triagedBy}","${triagedAt}"\n`;
      });
      
      csv += "\n=== ASSIGNMENT SUMMARY ===\n";
      csv += "Total Assignments,Pending,In Progress,Fulfilled,Cancelled\n";
      const assignmentStatusCounts = {
        pending: assignments?.filter(a => a.status === 'pending').length || 0,
        inProgress: assignments?.filter(a => a.status === 'in-progress').length || 0,
        fulfilled: assignments?.filter(a => a.status === 'fulfilled').length || 0,
        cancelled: assignments?.filter(a => a.status === 'cancelled').length || 0,
      };
      csv += `${assignments?.length || 0},${assignmentStatusCounts.pending},${assignmentStatusCounts.inProgress},${assignmentStatusCounts.fulfilled},${assignmentStatusCounts.cancelled}\n\n`;
      
      csv += "=== NGO PERFORMANCE METRICS ===\n";
      csv += "NGO Name,Total Assignments,Fulfilled,In Progress,Pending,Completion Rate\n";
      ngos.forEach(ngo => {
        const ngoAssignments = assignments?.filter(a => a.ngo?._id === ngo._id) || [];
        const fulfilled = ngoAssignments.filter(a => a.status === 'fulfilled').length;
        const inProgress = ngoAssignments.filter(a => a.status === 'in-progress').length;
        const pending = ngoAssignments.filter(a => a.status === 'pending').length;
        const completionRate = ngoAssignments.length > 0 ? ((fulfilled / ngoAssignments.length) * 100).toFixed(2) : 0;
        csv += `"${ngo.name}",${ngoAssignments.length},${fulfilled},${inProgress},${pending},${completionRate}%\n`;
      });
      
      // Download CSV
      const element = document.createElement('a');
      element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
      element.setAttribute('download', `analytics-report-${Date.now()}.csv`);
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      
      alert('✅ Analytics exported to CSV successfully!');
    } catch (error) {
      console.error('Export error:', error);
      alert('Error exporting analytics: ' + error.message);
    }
  };

  // Export Analytics to JSON
  const exportAnalyticsToJSON = () => {
    try {
      const analyticsData = {
        exportedAt: new Date().toISOString(),
        summary: {
          totalRequests: requests.length,
          activeRequests: requests.filter(r => ['new', 'triaged', 'assigned', 'in-progress'].includes(r.status)).length,
          fulfilledRequests: requests.filter(r => r.status === 'fulfilled').length,
          sosRequests: requests.filter(r => r.sosDetected).length,
          criticalRequests: requests.filter(r => r.priority === 'critical').length,
          totalBeneficiaries: requests.reduce((sum, r) => sum + (r.beneficiaries?.total || 0), 0),
          activeClusters: clusters.length,
          ngoTeams: ngos.length,
          totalAssignments: assignments?.length || 0,
          completedAssignments: assignments?.filter(a => a.status === 'fulfilled').length || 0,
          inProgressAssignments: assignments?.filter(a => a.status === 'in-progress').length || 0,
          pendingAssignments: assignments?.filter(a => a.status === 'pending').length || 0,
        },
        statusBreakdown: {},
        priorityBreakdown: {},
        assignmentStatusBreakdown: {},
        requestsWithAssignments: requests.map(r => {
          const assignment = assignments?.find(a => a.request?._id === r._id);
          return {
            id: r._id,
            status: r.status,
            priority: r.priority,
            sosDetected: r.sosDetected,
            location: r.location?.address,
            coordinates: r.location?.coordinates,
            beneficiaries: r.beneficiaries,
            createdAt: r.createdAt,
            triagedAt: r.triagedAt,
            triagedBy: r.triagedBy || null,
            // ✅ ASSIGNMENT INFO
            assignment: assignment ? {
              id: assignment._id,
              ngoName: assignment.ngo?.name,
              ngoId: assignment.ngo?._id,
              status: assignment.status,
              createdAt: assignment.createdAt,
              updatedAt: assignment.updatedAt,
              notes: assignment.notes,
              category: assignment.category,
              deliveryLocation: assignment.deliveryLocation,
            } : null,
          };
        }),
        requests: requests.map(r => ({
          id: r._id,
          status: r.status,
          priority: r.priority,
          sosDetected: r.sosDetected,
          location: r.location?.address,
          coordinates: r.location?.coordinates,
          beneficiaries: r.beneficiaries,
          createdAt: r.createdAt,
          triagedAt: r.triagedAt,
          description: r.description,
          selfDeclaredUrgency: r.selfDeclaredUrgency,
        })),
        assignments: assignments?.map(a => ({
          id: a._id,
          requestId: a.request?._id,
          ngoName: a.ngo?.name,
          ngoId: a.ngo?._id,
          status: a.status,
          category: a.category,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          notes: a.notes,
          deliveryLocation: a.deliveryLocation,
          fulfilledAt: a.fulfilledAt,
        })) || [],
        ngoPerformance: ngos.map(ngo => {
          const ngoAssignments = assignments?.filter(a => a.ngo?._id === ngo._id) || [];
          const fulfilled = ngoAssignments.filter(a => a.status === 'fulfilled').length;
          const inProgress = ngoAssignments.filter(a => a.status === 'in-progress').length;
          const pending = ngoAssignments.filter(a => a.status === 'pending').length;
          const completionRate = ngoAssignments.length > 0 ? (fulfilled / ngoAssignments.length) * 100 : 0;
          return {
            id: ngo._id,
            name: ngo.name,
            totalAssignments: ngoAssignments.length,
            fulfilled,
            inProgress,
            pending,
            completionRate: completionRate.toFixed(2) + '%',
            location: ngo.location?.coordinates,
            coverageRadius: ngo.coverageRadius,
          };
        }),
        ngos: ngos.map(n => ({
          id: n._id,
          name: n.name,
          location: n.location?.coordinates,
          coverageRadius: n.coverageRadius,
        })),
      };
      
      // Calculate breakdowns
      requests.forEach(r => {
        analyticsData.statusBreakdown[r.status] = (analyticsData.statusBreakdown[r.status] || 0) + 1;
        analyticsData.priorityBreakdown[r.priority] = (analyticsData.priorityBreakdown[r.priority] || 0) + 1;
      });
      
      assignments?.forEach(a => {
        analyticsData.assignmentStatusBreakdown[a.status] = (analyticsData.assignmentStatusBreakdown[a.status] || 0) + 1;
      });
      
      const element = document.createElement('a');
      element.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(analyticsData, null, 2)));
      element.setAttribute('download', `analytics-report-${Date.now()}.json`);
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      
      alert('✅ Analytics exported to JSON successfully!');
    } catch (error) {
      console.error('Export error:', error);
      alert('Error exporting analytics: ' + error.message);
    }
  };

  const sosRequests = requests.filter(r => r.sosDetected);
  const criticalRequests = requests.filter(r => r.priority === 'critical');
  const activeRequests = requests.filter(r => ['new', 'triaged', 'assigned', 'in-progress'].includes(r.status));

  // Load overlays from localStorage once (exclude advisories)
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('authorityOverlays') || '{}');
      setShelters(stored.shelters || []);
      setMedicalCamps(stored.medicalCamps || []);
      setDepots(stored.depots || []);
      setBlockedRoutes(stored.blockedRoutes || []);
      setRiskZones(stored.riskZones || []);
    } catch {/* ignore */}
  }, []);

  // Persist overlays whenever they change (exclude advisories)
  useEffect(() => {
    const payload = { shelters, medicalCamps, depots, blockedRoutes, riskZones };
    localStorage.setItem('authorityOverlays', JSON.stringify(payload));
  }, [shelters, medicalCamps, depots, blockedRoutes, riskZones]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AdvisoriesBanner />
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-blue-500" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Authority Dashboard</h1>
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
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Requests</p>
                <p className="text-3xl font-bold text-gray-800">{requests.length}</p>
                <p className="text-xs text-green-600 mt-1">↑ Active: {activeRequests.length}</p>
              </div>
              <Package className="w-12 h-12 text-blue-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">SoS Alerts</p>
                <p className="text-3xl font-bold text-red-600">{sosRequests.length}</p>
                <p className="text-xs text-red-600 mt-1">Requires immediate attention</p>
              </div>
              <AlertTriangle className="w-12 h-12 text-red-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Critical Priority</p>
                <p className="text-3xl font-bold text-orange-600">{criticalRequests.length}</p>
                <p className="text-xs text-orange-600 mt-1">High priority cases</p>
              </div>
              <TrendingUp className="w-12 h-12 text-orange-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Clusters</p>
                <p className="text-3xl font-bold text-purple-600">{clusters.length}</p>
                <p className="text-xs text-purple-600 mt-1">Geographic groupings</p>
              </div>
              <MapPin className="w-12 h-12 text-purple-500" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('sos')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'sos'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              SoS Queue
            </button>
            <button
              onClick={() => setActiveTab('requests')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'requests'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              All Requests
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'analytics'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab('map')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'map'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Map
            </button>
          </div>
        </div>

        {/* Action Bar */}
        <div className="bg-white rounded-lg shadow p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Activity className="w-5 h-5 text-gray-600" />
            <span className="text-sm text-gray-600">Last updated: {new Date().toLocaleTimeString()}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                fetchStats();
                fetchRequests();
                fetchClusters();
                fetchActiveAdvisories();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={() => exportData('requests')}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
            >
              <Download className="w-4 h-4" />
              Export Data
            </button>
            <button
              onClick={generateReport}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
            >
              <BarChart3 className="w-4 h-4" />
              Generate Report
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
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Crisis Load Map */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Crisis Load Distribution</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">By Status</h4>
                      <div className="space-y-2">
                        {['new', 'triaged', 'assigned', 'in-progress', 'fulfilled', 'closed'].map(status => {
                          const count = requests.filter(r => r.status === status).length;
                          const percentage = requests.length > 0 ? (count / requests.length * 100).toFixed(1) : 0;
                          return (
                            <div key={status} className="flex items-center justify-between">
                              <span className="text-sm text-gray-600 capitalize">{status}</span>
                              <div className="flex items-center gap-2">
                                <div className="w-32 bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-blue-500 h-2 rounded-full"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                                <span className="text-sm font-medium text-gray-700 w-12 text-right">{count}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">By Priority</h4>
                      <div className="space-y-2">
                        {['critical', 'high', 'medium', 'low'].map(priority => {
                          const count = requests.filter(r => r.priority === priority).length;
                          const percentage = requests.length > 0 ? (count / requests.length * 100).toFixed(1) : 0;
                          const colors = {
                            critical: 'bg-red-500',
                            high: 'bg-orange-500',
                            medium: 'bg-yellow-500',
                            low: 'bg-green-500'
                          };
                          return (
                            <div key={priority} className="flex items-center justify-between">
                              <span className="text-sm text-gray-600 capitalize">{priority}</span>
                              <div className="flex items-center gap-2">
                                <div className="w-32 bg-gray-200 rounded-full h-2">
                                  <div
                                    className={`${colors[priority]} h-2 rounded-full`}
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                                <span className="text-sm font-medium text-gray-700 w-12 text-right">{count}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Recent Requests</h3>
                  <div className="space-y-3">
                    {requests.slice(0, 5).map(request => (
                      <div key={request._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Package className="w-5 h-5 text-gray-600" />
                          <div>
                            <p className="text-sm font-medium text-gray-800">Request #{request.ticketNumber}</p>
                            <p className="text-xs text-gray-600">{request.location?.address}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            request.priority === 'critical' ? 'bg-red-100 text-red-800' :
                            request.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                            request.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {request.priority}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(request.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'sos' && (
              <div className="space-y-4">
                {sosRequests.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-12 text-center">
                    <Shield className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <p className="text-gray-600">No SoS alerts at this time</p>
                  </div>
                ) : (
                  sosRequests.map(request => (
                    <div key={request._id} className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                            <h3 className="text-lg font-semibold text-gray-800">
                              Request #{request.ticketNumber}
                            </h3>
                            <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                              🚨 SoS DETECTED
                            </span>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                              request.status === 'new' ? 'bg-blue-100 text-blue-800' :
                              request.status === 'triaged' ? 'bg-purple-100 text-purple-800' :
                              request.status === 'assigned' ? 'bg-indigo-100 text-indigo-800' :
                              request.status === 'in-progress' ? 'bg-yellow-100 text-yellow-800' :
                              request.status === 'fulfilled' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {request.status?.toUpperCase()}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              <span>{request.location?.address || 'Location not specified'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              <span>{request.beneficiaries?.total || 0} people affected</span>
                            </div>
                          </div>
                          {request.description && (
                            <p className="text-sm text-gray-700 mb-3">{request.description}</p>
                          )}
                          
                          {/* Show request tracking for SoS */}
                          <div className="mt-4 pt-4 border-t">
                            <RequestTracking
                              request={request}
                              assignments={request.assignments || []}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'analytics' && (
              <div className="space-y-6">
                {/* Demands vs Supply Heatmap */}
                <DemandsVsSupplyHeatmap requests={requests} ngos={ngos} />

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-gray-800">System Analytics</h3>
                      <BarChart3 className="w-6 h-6 text-gray-600" />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={exportAnalyticsToCSV}
                        className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition text-sm font-medium"
                        title="Export analytics to CSV"
                      >
                        <Download className="w-4 h-4" />
                        CSV
                      </button>
                      <button
                        onClick={exportAnalyticsToJSON}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition text-sm font-medium"
                        title="Export analytics to JSON"
                      >
                        <Download className="w-4 h-4" />
                        JSON
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-2">Total Beneficiaries</p>
                      <p className="text-3xl font-bold text-blue-600">
                        {requests.reduce((sum, r) => sum + (r.beneficiaries?.total || 0), 0)}
                      </p>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-2">Fulfilled Requests</p>
                      <p className="text-3xl font-bold text-green-600">
                        {requests.filter(r => r.status === 'fulfilled').length}
                      </p>
                    </div>
                    <div className="text-center p-4 bg-purple-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-2">Active Clusters</p>
                      <p className="text-3xl font-bold text-purple-600">{clusters.length}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Response Time Metrics</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Average Triage Time</span>
                      <span className="text-sm font-medium text-gray-800">~2.5 hours</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Average Assignment Time</span>
                      <span className="text-sm font-medium text-gray-800">~4 hours</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Average Fulfillment Time</span>
                      <span className="text-sm font-medium text-gray-800">~24 hours</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'map' && (
              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Operational Map</h3>
                {/* Overlay entry forms */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-sm">
                  {/* Shelters */}
                  <div className="border rounded p-3">
                    <div className="font-semibold mb-2 flex items-center justify-between">Shelters <span className="text-xs text-gray-500">({shelters.length})</span></div>
                    <form onSubmit={(e)=>{e.preventDefault();const fd=new FormData(e.currentTarget);const s={name:fd.get('name')||'Shelter',capacity:Number(fd.get('capacity')||0),lat:Number(fd.get('lat')),lng:Number(fd.get('lng'))};if(Number.isFinite(s.lat)&&Number.isFinite(s.lng)){setShelters(p=>[...p,s]);e.currentTarget.reset();}}} className="flex flex-col gap-2">
                      <input name="name" placeholder="Name" className="border rounded px-2 py-1" />
                      <input name="capacity" type="number" placeholder="Capacity" className="border rounded px-2 py-1" />
                      <div className="grid grid-cols-2 gap-2">
                        <input name="lat" placeholder="Lat" className="border rounded px-2 py-1" />
                        <input name="lng" placeholder="Lng" className="border rounded px-2 py-1" />
                      </div>
                      <button className="bg-purple-600 text-white rounded py-1">Add</button>
                    </form>
                  </div>
                  {/* Medical Camps */}
                  <div className="border rounded p-3">
                    <div className="font-semibold mb-2 flex items-center justify-between">Medical Camps <span className="text-xs text-gray-500">({medicalCamps.length})</span></div>
                    <form onSubmit={(e)=>{e.preventDefault();const fd=new FormData(e.currentTarget);const m={name:fd.get('name')||'Med Camp',status:fd.get('status')||'operational',lat:Number(fd.get('lat')),lng:Number(fd.get('lng'))};if(Number.isFinite(m.lat)&&Number.isFinite(m.lng)){setMedicalCamps(p=>[...p,m]);e.currentTarget.reset();}}} className="flex flex-col gap-2">
                      <input name="name" placeholder="Name" className="border rounded px-2 py-1" />
                      <select name="status" className="border rounded px-2 py-1">
                        <option value="operational">Operational</option>
                        <option value="limited">Limited</option>
                        <option value="closed">Closed</option>
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <input name="lat" placeholder="Lat" className="border rounded px-2 py-1" />
                        <input name="lng" placeholder="Lng" className="border rounded px-2 py-1" />
                      </div>
                      <button className="bg-red-600 text-white rounded py-1">Add</button>
                    </form>
                  </div>
                  {/* Depots */}
                  <div className="border rounded p-3">
                    <div className="font-semibold mb-2 flex items-center justify-between">Supply Depots <span className="text-xs text-gray-500">({depots.length})</span></div>
                    <form onSubmit={(e)=>{e.preventDefault();const fd=new FormData(e.currentTarget);const d={name:fd.get('name')||'Depot',lat:Number(fd.get('lat')),lng:Number(fd.get('lng'))};if(Number.isFinite(d.lat)&&Number.isFinite(d.lng)){setDepots(p=>[...p,d]);e.currentTarget.reset();}}} className="flex flex-col gap-2">
                      <input name="name" placeholder="Name" className="border rounded px-2 py-1" />
                      <div className="grid grid-cols-2 gap-2">
                        <input name="lat" placeholder="Lat" className="border rounded px-2 py-1" />
                        <input name="lng" placeholder="Lng" className="border rounded px-2 py-1" />
                      </div>
                      <button className="bg-amber-600 text-white rounded py-1">Add</button>
                    </form>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 text-sm">
                  {/* Blocked Routes */}
                  <div className="border rounded p-3">
                    <div className="font-semibold mb-2 flex items-center justify-between">Blocked Routes <span className="text-xs text-gray-500">({blockedRoutes.length})</span></div>
                    <form onSubmit={(e)=>{e.preventDefault();const fd=new FormData(e.currentTarget);try{const pts=JSON.parse(fd.get('points')||'[]');if(Array.isArray(pts)&&pts.length>1){setBlockedRoutes(p=>[...p,{name:fd.get('name')||'Blocked',points:pts}]);e.currentTarget.reset();}}catch{}}} className="flex flex-col gap-2">
                      <input name="name" placeholder="Name" className="border rounded px-2 py-1" />
                      <textarea name="points" placeholder='[[lat,lng],[lat,lng]]' rows={2} className="border rounded px-2 py-1" />
                      <button className="bg-gray-700 text-white rounded py-1">Add</button>
                    </form>
                  </div>
                  {/* Risk Zones */}
                  <div className="border rounded p-3">
                    <div className="font-semibold mb-2 flex items-center justify-between">Risk Zones <span className="text-xs text-gray-500">({riskZones.length})</span></div>
                    <form onSubmit={(e)=>{e.preventDefault();const fd=new FormData(e.currentTarget);const rz={name:fd.get('name')||'Zone',level:fd.get('level')||'moderate',lat:Number(fd.get('lat')),lng:Number(fd.get('lng')),radius:Number(fd.get('radius')||1000)};if(Number.isFinite(rz.lat)&&Number.isFinite(rz.lng)){setRiskZones(p=>[...p,rz]);e.currentTarget.reset();}}} className="flex flex-col gap-2">
                      <input name="name" placeholder="Name" className="border rounded px-2 py-1" />
                      <select name="level" className="border rounded px-2 py-1">
                        <option value="low">Low</option>
                        <option value="moderate">Moderate</option>
                        <option value="high">High</option>
                        <option value="severe">Severe</option>
                      </select>
                      <div className="grid grid-cols-3 gap-2">
                        <input name="lat" placeholder="Lat" className="border rounded px-2 py-1" />
                        <input name="lng" placeholder="Lng" className="border rounded px-2 py-1" />
                        <input name="radius" placeholder="Radius(m)" className="border rounded px-2 py-1" />
                      </div>
                      <button className="bg-yellow-600 text-white rounded py-1">Add</button>
                    </form>
                  </div>
                </div>

                {/* Advisories (backend-managed) */}
                <div className="border rounded p-3 mb-6 text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold">Official Advisories <span className="text-xs text-gray-500">({advisories.length})</span></div>
                    <button onClick={()=>setCreating(v=>!v)} className="px-2 py-1 text-xs bg-blue-600 text-white rounded">
                      {creating ? 'Close' : 'New Advisory'}
                    </button>
                  </div>
                  {creating && (
                    <form onSubmit={createAdvisory} className="flex flex-col gap-2 mb-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input value={newAdv.title} onChange={e=>setNewAdv(s=>({...s,title:e.target.value}))} placeholder="Title" className="border rounded px-2 py-1" />
                        <select value={newAdv.severity} onChange={e=>setNewAdv(s=>({...s,severity:e.target.value}))} className="border rounded px-2 py-1">
                          <option value="info">Info</option>
                          <option value="watch">Watch</option>
                          <option value="warning">Warning</option>
                          <option value="danger">Danger</option>
                        </select>
                      </div>
                      <textarea value={newAdv.message} onChange={e=>setNewAdv(s=>({...s,message:e.target.value}))} placeholder="Message" rows={2} className="border rounded px-2 py-1" />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center">
                        <label className="text-xs text-gray-600">Expires At (optional)</label>
                        <input type="datetime-local" value={newAdv.expiresAt} onChange={e=>setNewAdv(s=>({...s,expiresAt:e.target.value}))} className="border rounded px-2 py-1" />
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="bg-blue-600 text-white rounded py-1 px-3 text-sm">Publish</button>
                        <button type="button" onClick={()=>setCreating(false)} className="bg-gray-100 text-gray-700 rounded py-1 px-3 text-sm">Cancel</button>
                      </div>
                    </form>
                  )}
                  {advisories.length>0 ? (
                    <ul className="space-y-2 max-h-40 overflow-auto pr-1">
                      {advisories.map((a)=>{
                        const colorMap={info:'bg-blue-50 text-blue-800 border-blue-200',watch:'bg-amber-50 text-amber-800 border-amber-200',warning:'bg-orange-50 text-orange-800 border-orange-200',danger:'bg-red-50 text-red-800 border-red-200'};
                        return (
                          <li key={a._id} className={`border rounded p-2 ${colorMap[a.severity]||''}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-medium text-sm">{a.title}</div>
                                <div className="text-xs opacity-90">{a.message}</div>
                                {a.expiresAt && <div className="text-[10px] opacity-70 mt-1">Expires: {new Date(a.expiresAt).toLocaleString()}</div>}
                              </div>
                              <button onClick={()=>deactivateAdvisory(a._id)} className="text-xs px-2 py-1 bg-red-600 text-white rounded">Remove</button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="text-xs text-gray-500">No active advisories</div>
                  )}
                </div>

                <div className="w-full h-[520px] rounded overflow-hidden">
                  <MapContainer center={[12.9716, 77.5946]} zoom={11} style={{ height: '520px', width: '100%' }}>
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution="&copy; OpenStreetMap contributors"
                    />
                    {/* Victim markers */}
                    {requests.map(r => (
                      r.location?.coordinates ? (
                        <Marker key={r._id} position={[r.location.coordinates[1], r.location.coordinates[0]]} icon={victimIcon}>
                          <Popup>
                            <div className="text-sm">
                              <div className="font-semibold">Request #{r.ticketNumber || r._id.slice(-6)}</div>
                              <div>Status: {r.status}</div>
                              <div>Priority: {r.priority}</div>
                            </div>
                          </Popup>
                        </Marker>
                      ) : null
                    ))}
                    {/* NGO markers and light polylines for active assignments */}
                    {assignments.map((a, idx) => {
                      const req = a.request;
                      const ngo = a.assignedTo;
                      if (!req?.location?.coordinates || !ngo?.location?.coordinates) return null;
                      const victimLatLng = [req.location.coordinates[1], req.location.coordinates[0]];
                      const ngoLatLng = [ngo.location.coordinates[1], ngo.location.coordinates[0]];
                      // Direction: if in-progress, draw NGO -> Victim, else if assigned/new, draw Victim -> NGO
                      const from = (a.status === 'in-progress') ? ngoLatLng : victimLatLng;
                      const to = (a.status === 'in-progress') ? victimLatLng : ngoLatLng;
                      const coverageColor = COVERAGE_COLORS[idx % COVERAGE_COLORS.length];
                      return (
                        <div key={`grp-${a._id}`}>
                          <Circle center={ngoLatLng} radius={ngo.coverageRadius || 50000} pathOptions={{ color: coverageColor, weight:1, opacity:0.4, fillColor: coverageColor, fillOpacity:0.04 }} />
                          <Marker key={`ngo-${a._id}`} position={ngoLatLng} icon={ngoIcon}>
                            <Popup>
                              <div className="text-sm">
                                <div className="font-semibold">{ngo.name}</div>
                                <div>Assignment: {a.category}</div>
                                <div>Status: {a.status}</div>
                              </div>
                            </Popup>
                          </Marker>
                          <Polyline key={`line-${a._id}`} positions={[from, to]} pathOptions={{ color: coverageColor, weight: 3, opacity: 0.5, dashArray: '4 6' }} />
                        </div>
                      );
                    })}
                    {/* All NGOs coverage circles and base markers */}
                    {ngos.map((n, i) => {
                      if (!n?.location?.coordinates) return null;
                      const center = [n.location.coordinates[1], n.location.coordinates[0]];
                      const color = COVERAGE_COLORS[i % COVERAGE_COLORS.length];
                      return (
                        <div key={`ngo-base-${n._id || i}`}>
                          <Circle center={center} radius={n.coverageRadius || 50000} pathOptions={{ color, weight: 1, opacity: 0.3, fillColor: color, fillOpacity: 0.03 }} />
                          <Marker position={center} icon={ngoIcon}>
                            <Popup>
                              <div className="text-sm">
                                <div className="font-semibold">{n.name}</div>
                                <div>Coverage: {(n.coverageRadius || 50000)/1000} km</div>
                              </div>
                            </Popup>
                          </Marker>
                        </div>
                      );
                    })}
                    {/* Shelters */}
                    {shelters.map((s,i)=>(
                      <Marker key={`shelter-${i}`} position={[s.lat, s.lng]} icon={shelterIcon}>
                        <Popup>
                          <div className="text-sm">
                            <div className="font-semibold">{s.name}</div>
                            <div>Capacity: {s.capacity}</div>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                    {/* Medical Camps */}
                    {medicalCamps.map((m,i)=>(
                      <Marker key={`mc-${i}`} position={[m.lat, m.lng]} icon={medicalIcon}>
                        <Popup>
                          <div className="text-sm">
                            <div className="font-semibold">{m.name}</div>
                            <div>Status: {m.status}</div>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                    {/* Depots */}
                    {depots.map((d,i)=>(
                      <Marker key={`depot-${i}`} position={[d.lat, d.lng]} icon={depotIcon}>
                        <Popup>
                          <div className="text-sm">
                            <div className="font-semibold">{d.name}</div>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                    {/* Blocked Routes */}
                    {blockedRoutes.map((br,i)=>(
                      <Polyline key={`br-${i}`} positions={br.points} pathOptions={{ color:'#dc2626', weight:4, opacity:0.8, dashArray:'6 6' }} />
                    ))}
                    {/* Risk Zones */}
                    {riskZones.map((rz,i)=>{
                      const colors={low:'#22c55e',moderate:'#f59e0b',high:'#ef4444',severe:'#7f1d1d'};const c=colors[rz.level]||'#f59e0b';
                      return <Circle key={`rz-${i}`} center={[rz.lat, rz.lng]} radius={rz.radius} pathOptions={{color:c,weight:1,opacity:0.9,fillColor:c,fillOpacity:0.15}}/>;
                    })}
                  </MapContainer>
                </div>
              </div>
            )}

            {activeTab === 'requests' && (
              <div className="space-y-4">
                <div className="bg-white rounded-lg shadow p-4 mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">All Emergency Requests</h3>
                  <p className="text-sm text-gray-600 mt-1">Triage and manage all incoming requests</p>
                </div>
                {requests.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-12 text-center">
                    <Package className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <p className="text-gray-600">No requests at this time</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {requests.map(request => (
                      <div key={request._id} className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-semibold text-gray-800">
                                Request #{request.ticketNumber || request._id.slice(-6)}
                              </h3>
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                request.status === 'new' ? 'bg-blue-100 text-blue-800' :
                                request.status === 'triaged' ? 'bg-purple-100 text-purple-800' :
                                request.status === 'assigned' ? 'bg-indigo-100 text-indigo-800' :
                                request.status === 'in-progress' ? 'bg-yellow-100 text-yellow-800' :
                                request.status === 'fulfilled' ? 'bg-green-100 text-green-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {request.status.toUpperCase()}
                              </span>
                              {request.sosDetected && (
                                <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                                  🚨 SOS
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                              <div className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                <span>{request.location?.address || 'Location not specified'}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Users className="w-4 h-4" />
                                <span>{request.beneficiaries?.total || 0} beneficiaries</span>
                              </div>
                            </div>

                            {/* 🆕 Contact Information */}
                            {request.submitterContact && (
                              <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                                <div className="flex items-center gap-1">
                                  <Phone className="w-4 h-4" />
                                  <span>{request.submitterContact.countryCode}{request.submitterContact.phone}</span>
                                </div>
                                {request.submitterContact.email && (
                                  <span className="text-gray-600">{request.submitterContact.email}</span>
                                )}
                              </div>
                            )}

                            {/* 🆕 Urgency & Priority Info - EDITABLE */}
                            <div className="flex items-center gap-4 text-sm mb-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <select
                                  value={request.priority}
                                  onChange={(e) => handleUpdatePriority(request._id, e.target.value)}
                                  className={`px-2 py-1 rounded font-semibold border-2 cursor-pointer ${
                                    request.priority === 'sos' ? 'bg-red-200 text-red-800 border-red-400' :
                                    request.priority === 'critical' ? 'bg-orange-200 text-orange-800 border-orange-400' :
                                    request.priority === 'high' ? 'bg-yellow-200 text-yellow-800 border-yellow-400' :
                                    request.priority === 'medium' ? 'bg-blue-200 text-blue-800 border-blue-400' :
                                    'bg-green-200 text-green-800 border-green-400'
                                  }`}
                                >
                                  <option value="low">Low</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">High</option>
                                  <option value="critical">Critical</option>
                                  <option value="sos">SOS</option>
                                </select>
                              </div>
                              <span className="text-gray-700">
                                User Urgency: <span className="font-semibold">{request.selfDeclaredUrgency?.toUpperCase()}</span>
                              </span>
                              {request.priorityChangedAt && (
                                <span className="text-xs text-gray-500">
                                  (Changed: {new Date(request.priorityChangedAt).toLocaleString()})
                                </span>
                              )}
                            </div>

                            {/* 🆕 Location Details */}
                            <div className="text-sm text-gray-600 mb-2">
                              <div className="font-semibold">📍 Location Details:</div>
                              <div className="ml-2 text-xs">
                                {request.location?.landmark && <div>Landmark: {request.location.landmark}</div>}
                                {request.location?.area && <div>Area: {request.location.area}</div>}
                                {request.location?.city && <div>City: {request.location.city}</div>}
                                {request.location?.coordinates && (
                                  <div>GPS: {request.location.coordinates[1]?.toFixed(4)}, {request.location.coordinates[0]?.toFixed(4)}</div>
                                )}
                              </div>
                            </div>

                            {/* 🆕 SOS Indicators */}
                            {request.sosDetected && request.sosIndicators && (
                              <div className="bg-red-50 border border-red-200 rounded p-2 mb-2">
                                <div className="text-sm font-semibold text-red-800 mb-1">🚨 SOS Indicators:</div>
                                <div className="text-xs text-red-700 space-y-1">
                                  {request.sosIndicators.keywords?.length > 0 && (
                                    <div>Keywords: {request.sosIndicators.keywords.join(', ')}</div>
                                  )}
                                  {request.sosIndicators.trapped && <div>✓ Trapped Status</div>}
                                  {request.sosIndicators.medicalEmergency && <div>✓ Medical Emergency</div>}
                                  {request.sosIndicators.lowBattery && <div>✓ Low Battery</div>}
                                  {request.sosIndicators.poorSignal && <div>✓ Poor Signal</div>}
                                </div>
                              </div>
                            )}

                            {/* 🆕 Device Information */}
                            {request.deviceInfo && (
                              <div className="bg-gray-50 border border-gray-200 rounded p-2 mb-2">
                                <div className="text-sm font-semibold text-gray-800 mb-1">📱 Device Info:</div>
                                <div className="text-xs text-gray-700 space-y-1">
                                  {request.deviceInfo.batteryLevel !== undefined && (
                                    <div>Battery: {request.deviceInfo.batteryLevel}%</div>
                                  )}
                                  {request.deviceInfo.signalStrength && (
                                    <div>Signal: {request.deviceInfo.signalStrength}</div>
                                  )}
                                  {request.deviceInfo.networkType && (
                                    <div>Network: {request.deviceInfo.networkType}</div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* 🆕 Description */}
                            {request.description && (
                              <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-2">
                                <div className="text-sm font-semibold text-blue-800 mb-1">📝 Description:</div>
                                <div className="text-sm text-blue-900">{request.description}</div>
                              </div>
                            )}

                            {/* ✅ Display Victim Evidence (Photos, Videos, Voice Notes) */}
                            {request.evidence && (
                              <div className="my-2">
                                <EvidenceViewer 
                                  evidence={request.evidence}
                                  title="📸 Evidence Provided by Victim"
                                  className="mb-2"
                                />
                              </div>
                            )}

                            {/* Special Needs */}
                            {(request.specialNeeds?.pregnant || request.specialNeeds?.medicalConditions?.length > 0) && (
                              <div className="bg-purple-50 border border-purple-200 rounded p-2 mb-2">
                                <div className="text-sm font-semibold text-purple-800 mb-1">⚕️ Special Needs:</div>
                                <div className="text-xs text-purple-700 space-y-1">
                                  {request.specialNeeds.pregnant && <div>✓ Pregnant woman</div>}
                                  {request.specialNeeds.medicalConditions?.map(cond => (
                                    <div key={cond}>{cond}</div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Beneficiary Breakdown */}
                            {request.beneficiaries && (
                              <div className="bg-indigo-50 border border-indigo-200 rounded p-2 mb-2">
                                <div className="text-sm font-semibold text-indigo-800 mb-1">👥 Beneficiaries:</div>
                                <div className="text-xs text-indigo-700 space-y-1">
                                  {request.beneficiaries.adults > 0 && <div>Adults: {request.beneficiaries.adults}</div>}
                                  {request.beneficiaries.children > 0 && <div>Children: {request.beneficiaries.children}</div>}
                                  {request.beneficiaries.elderly > 0 && <div>Elderly: {request.beneficiaries.elderly}</div>}
                                  {request.beneficiaries.infants > 0 && <div>Infants: {request.beneficiaries.infants}</div>}
                                </div>
                              </div>
                            )}

                            {request.description && (
                              <p className="text-sm text-gray-700 mb-2">{request.description}</p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(request.needs || {}).map(([key, value]) => 
                                value.required && (
                                  <span
                                    key={key}
                                    className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium"
                                  >
                                    {key.charAt(0).toUpperCase() + key.slice(1)}
                                  </span>
                                )
                              )}
                            </div>

                            {/* NEW: Request Tracking Component */}
                            <div className="mt-4 pt-4 border-t">
                              <RequestTracking
                                request={request}
                                assignments={request.assignments || []}
                              />
                            </div>

                            {/* Victim Closure Photos & Feedback - LEGACY */}
                            {request.victimFeedback && request.victimFeedback.closurePhotos?.length > 0 && (
                              <div className="mt-4 pt-4 border-t">
                                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                                  <h4 className="font-semibold text-green-900 mb-3">✅ Victim Delivery Confirmation (Legacy)</h4>
                                  
                                  {/* Rating */}
                                  <div className="mb-3">
                                    <p className="text-sm text-green-800">
                                      <span className="font-medium">Rating:</span> 
                                      <span className="ml-2">
                                        {'⭐'.repeat(request.victimFeedback.rating || 0)}
                                        {'☆'.repeat(5 - (request.victimFeedback.rating || 0))}
                                      </span>
                                    </p>
                                  </div>

                                  {/* Feedback */}
                                  {request.victimFeedback.feedback && (
                                    <div className="mb-3">
                                      <p className="text-sm text-green-800">
                                        <span className="font-medium">Feedback:</span>
                                      </p>
                                      <p className="text-sm text-green-700 mt-1">{request.victimFeedback.feedback}</p>
                                    </div>
                                  )}

                                  {/* Photos */}
                                  <div className="mt-3">
                                    <p className="text-sm font-medium text-green-900 mb-2">📸 Delivery Photos:</p>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                      {request.victimFeedback.closurePhotos.map((photo, idx) => (
                                        <div
                                          key={idx}
                                          onClick={() => setPhotoModal({ photo, index: idx, totalPhotos: request.victimFeedback.closurePhotos.length, allPhotos: request.victimFeedback.closurePhotos })}
                                          className="relative cursor-pointer group"
                                        >
                                          <img
                                            src={photo}
                                            alt={`Delivery photo ${idx + 1}`}
                                            className="w-full h-20 object-cover rounded-lg border border-green-300 hover:opacity-90 transition group-hover:ring-2 group-hover:ring-green-500"
                                            title="Click to view full image"
                                          />
                                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded-lg transition flex items-center justify-center">
                                            <span className="text-white opacity-0 group-hover:opacity-100 text-xs font-semibold">View</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <p className="text-xs text-green-600 mt-2">
                                      ({request.victimFeedback.closurePhotos.length} photo{request.victimFeedback.closurePhotos.length !== 1 ? 's' : ''}) - Click to view full size
                                    </p>
                                  </div>

                                  {/* Submission Time */}
                                  <p className="text-xs text-green-600 mt-3">
                                    Confirmed on: {new Date(request.victimFeedback.submittedAt).toLocaleDateString()} at {new Date(request.victimFeedback.submittedAt).toLocaleTimeString()}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* ✨ NEW: Fulfillment Confirmation with Full Media Support (Photos, Videos, Audio) */}
                            {request.fulfillmentConfirmation && (
                              <div className="mt-4 pt-4 border-t">
                                <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-300">
                                  <h4 className="font-semibold text-emerald-900 mb-3">✅ Fulfillment Confirmation with Evidence</h4>
                                  
                                  {/* Rating */}
                                  {request.fulfillmentConfirmation.satisfactionRating && (
                                    <div className="mb-3">
                                      <p className="text-sm text-emerald-800">
                                        <span className="font-medium">Satisfaction Rating:</span> 
                                        <span className="ml-2">
                                          {'⭐'.repeat(request.fulfillmentConfirmation.satisfactionRating)}
                                          {'☆'.repeat(5 - request.fulfillmentConfirmation.satisfactionRating)}
                                        </span>
                                      </p>
                                    </div>
                                  )}

                                  {/* Notes/Feedback */}
                                  {request.fulfillmentConfirmation.notes && (
                                    <div className="mb-3">
                                      <p className="text-sm text-emerald-800">
                                        <span className="font-medium">Notes:</span>
                                      </p>
                                      <p className="text-sm text-emerald-700 mt-1">{request.fulfillmentConfirmation.notes}</p>
                                    </div>
                                  )}

                                  {/* Photos with descriptions */}
                                  {request.fulfillmentConfirmation.evidence?.photos && request.fulfillmentConfirmation.evidence.photos.length > 0 && (
                                    <div className="mt-4 p-3 bg-white rounded border border-emerald-200">
                                      <p className="text-sm font-medium text-emerald-900 mb-3 flex items-center gap-2">
                                        <ImageIcon className="w-4 h-4" />
                                        📸 Photos ({request.fulfillmentConfirmation.evidence.photos.length})
                                      </p>
                                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                                        {request.fulfillmentConfirmation.evidence.photos.map((photo, idx) => (
                                          <div key={idx} className="relative cursor-pointer group">
                                            <img
                                              src={photo.data}
                                              alt={`Evidence photo ${idx + 1}`}
                                              className="w-full h-24 object-cover rounded-lg border border-emerald-300 hover:opacity-90 transition group-hover:ring-2 group-hover:ring-emerald-500"
                                              title={photo.description || photo.filename}
                                            />
                                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-lg transition flex items-center justify-center">
                                              <span className="text-white opacity-0 group-hover:opacity-100 text-xs font-semibold">View</span>
                                            </div>
                                            {photo.description && (
                                              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs p-1 rounded-b-lg truncate">
                                                {photo.description}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Videos with descriptions */}
                                  {request.fulfillmentConfirmation.evidence?.videos && request.fulfillmentConfirmation.evidence.videos.length > 0 && (
                                    <div className="mt-3 p-3 bg-white rounded border border-emerald-200">
                                      <p className="text-sm font-medium text-emerald-900 mb-3 flex items-center gap-2">
                                        <Video className="w-4 h-4" />
                                        🎥 Videos ({request.fulfillmentConfirmation.evidence.videos.length})
                                      </p>
                                      <div className="space-y-2">
                                        {request.fulfillmentConfirmation.evidence.videos.map((video, idx) => (
                                          <div key={idx} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-emerald-200 hover:bg-gray-100 transition">
                                            <video
                                              src={video.data}
                                              className="w-20 h-20 object-cover rounded border border-emerald-300"
                                              title={video.description || video.filename}
                                            />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-medium text-gray-800 truncate">{video.filename}</p>
                                              {video.description && (
                                                <p className="text-xs text-gray-600 mt-1">{video.description}</p>
                                              )}
                                            </div>
                                            <button
                                              onClick={() => {
                                                const link = document.createElement('a');
                                                link.href = video.data;
                                                link.download = video.filename;
                                                link.click();
                                              }}
                                              className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-xs font-medium transition"
                                            >
                                              Download
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Audio with descriptions */}
                                  {request.fulfillmentConfirmation.evidence?.voiceNotes && request.fulfillmentConfirmation.evidence.voiceNotes.length > 0 && (
                                    <div className="mt-3 p-3 bg-white rounded border border-emerald-200">
                                      <p className="text-sm font-medium text-emerald-900 mb-3 flex items-center gap-2">
                                        <Mic className="w-4 h-4" />
                                        🎙️ Audio Files ({request.fulfillmentConfirmation.evidence.voiceNotes.length})
                                      </p>
                                      <div className="space-y-2">
                                        {request.fulfillmentConfirmation.evidence.voiceNotes.map((audio, idx) => (
                                          <div key={idx} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-emerald-200 hover:bg-gray-100 transition">
                                            <button
                                              onClick={() => setPlayingAudioIndex(playingAudioIndex === idx ? null : idx)}
                                              className="flex-shrink-0 text-emerald-600 hover:text-emerald-700"
                                            >
                                              {playingAudioIndex === idx ? (
                                                <Pause className="w-5 h-5" />
                                              ) : (
                                                <Play className="w-5 h-5" />
                                              )}
                                            </button>
                                            <audio
                                              src={audio.data}
                                              controls
                                              className="flex-1 h-8"
                                              onPlay={() => setPlayingAudioIndex(idx)}
                                              onPause={() => setPlayingAudioIndex(null)}
                                            />
                                            <div className="flex-1 min-w-0 text-right">
                                              <p className="text-xs font-medium text-gray-800 truncate">{audio.filename}</p>
                                              {audio.description && (
                                                <p className="text-xs text-gray-600 mt-1">{audio.description}</p>
                                              )}
                                            </div>
                                            <button
                                              onClick={() => {
                                                const link = document.createElement('a');
                                                link.href = audio.data;
                                                link.download = audio.filename;
                                                link.click();
                                              }}
                                              className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-xs font-medium transition"
                                            >
                                              Download
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Submission Time */}
                                  <p className="text-xs text-emerald-600 mt-3">
                                    Confirmed on: {new Date(request.fulfillmentConfirmation.confirmedAt || request.fulfillmentConfirmation.submittedAt).toLocaleDateString()} at {new Date(request.fulfillmentConfirmation.confirmedAt || request.fulfillmentConfirmation.submittedAt).toLocaleTimeString()}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="ml-4 flex flex-col gap-2">
                            {request.status === 'new' && (
                              <button
                                onClick={() => setTriageDialog(request._id)}
                                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold transition-colors"
                              >
                                Triage
                              </button>
                            )}
                            {request.submitterContact?.phone && (
                              <>
                                <button
                                  onClick={() => {
                                    const assignment = assignments.find(a => a.request?._id === request._id) || { request };
                                    handleSendSMS(assignment);
                                  }}
                                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-2 justify-center"
                                  title="Send SMS to victim"
                                >
                                  <Phone className="w-4 h-4" />
                                  Send SMS
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => generateIndividualReport(request.ticketNumber || request._id)}
                              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-2 justify-center"
                              title="Generate detailed report for this request"
                            >
                              <BarChart3 className="w-4 h-4" />
                              Report
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Bulk SMS Button */}
                {assignments.some(a => a.request?.submitterContact?.phone) && (
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={handleBulkSMS}
                      className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
                    >
                      <MessageSquare className="w-5 h-5" />
                      📢 Bulk SMS to All Recipients
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Triage Dialog */}
      {triageDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Triage Request</h3>
              <button
                onClick={() => {
                  setTriageDialog(null);
                  setTriageNotes('');
                  setTriagePriority('medium');
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-gray-600 mb-4">
              Assess and assign priority level to this request for proper resource allocation.
            </p>

            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-2">Priority Level</label>
              <select
                value={triagePriority}
                onChange={(e) => setTriagePriority(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
                <option value="sos">SoS</option>
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-sm text-gray-600 mb-2">Triage Notes (Optional)</label>
              <textarea
                value={triageNotes}
                onChange={(e) => setTriageNotes(e.target.value)}
                placeholder="Add assessment notes, medical observations, or special requirements..."
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setTriageDialog(null);
                  setTriageNotes('');
                  setTriagePriority('medium');
                }}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => triageRequest(triageDialog)}
                className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors"
              >
                Triage & Assign Priority
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
          isOpen={smsModal.isOpen}
          onClose={() => setSmsModal(null)}
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
          isOpen={bulkSmsModal.isOpen}
          onClose={() => setBulkSmsModal({ ...bulkSmsModal, isOpen: false })}
          onSend={handleBulkSmsModalSend}
          recipients={bulkSmsModal.recipients}
        />
      )}

      {/* SMS History Modal */}
      {smsHistoryModal?.isOpen && (
        <SmsHistory
          isOpen={smsHistoryModal.isOpen}
          onClose={() => setSmsHistoryModal(null)}
          phoneNumber={smsHistoryModal.phoneNumber}
          requestId={smsHistoryModal.requestId}
        />
      )}
    </div>
  );
}
