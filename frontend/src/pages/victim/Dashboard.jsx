import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import AdvisoriesBanner from '../../components/AdvisoriesBanner';
import RequestTracking from '../../components/RequestTracking';
import axios from 'axios';
import { Plus, AlertCircle, Clock, CheckCircle, MessageSquare, LogOut, X, Image as ImageIcon, Video, Mic, Trash2, Play, Pause } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function VictimDashboard() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, pending: 0, fulfilled: 0 });
  const [closeDialog, setCloseDialog] = useState(null);
  const [closeFeedback, setCloseFeedback] = useState('');
  const [closeRating, setCloseRating] = useState(5);
  const [closureEvidence, setClosureEvidence] = useState({
    photos: [],
    videos: [],
    voiceNotes: [],
  });
  const [evidencePreviews, setEvidencePreviews] = useState({
    photos: [],
    videos: [],
    voiceNotes: [],
  });
  const [evidenceDescriptions, setEvidenceDescriptions] = useState({
    photos: [],
    videos: [],
    voiceNotes: [],
  });
  const [playingAudio, setPlayingAudio] = useState(null);
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    fetchRequests();
  }, []);

  // Add real-time Socket.IO listeners
  useEffect(() => {
    if (socket && connected) {
      // Listen for assignment status updates
      socket.on('assignment:status-update', (data) => {
        console.log('📍 Assignment update received:', data);
        // Refresh requests to get latest assignment data
        fetchRequests();
      });

      // Listen for request-level updates
      socket.on('request:assignment-updated', (data) => {
        console.log('📋 Request assignment updated:', data);
        fetchRequests();
      });

      // Listen for delivery confirmations
      socket.on('delivery:confirmed', (data) => {
        console.log('🚚 Delivery confirmed:', data);
        fetchRequests();
      });

      return () => {
        socket.off('assignment:status-update');
        socket.off('request:assignment-updated');
        socket.off('delivery:confirmed');
      };
    }
  }, [socket, connected]);

  const fetchRequests = async () => {
    try {
      const response = await axios.get(`${API_URL}/requests`);
      if (response.data.success) {
        setRequests(response.data.requests);
        
        // Calculate stats
        const total = response.data.requests.length;
        const pending = response.data.requests.filter(r => 
          ['new', 'triaged', 'assigned', 'in-progress'].includes(r.status)
        ).length;
        const fulfilled = response.data.requests.filter(r => 
          r.status === 'fulfilled'
        ).length;
        
        setStats({ total, pending, fulfilled });
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority) => {
    const colors = {
      sos: 'bg-red-100 text-red-800 border-red-300',
      critical: 'bg-orange-100 text-orange-800 border-orange-300',
      high: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      medium: 'bg-blue-100 text-blue-800 border-blue-300',
      low: 'bg-gray-100 text-gray-800 border-gray-300',
    };
    return colors[priority] || colors.medium;
  };

  const getStatusColor = (status) => {
    const colors = {
      new: 'bg-blue-100 text-blue-800',
      triaged: 'bg-purple-100 text-purple-800',
      assigned: 'bg-indigo-100 text-indigo-800',
      'in-progress': 'bg-yellow-100 text-yellow-800',
      fulfilled: 'bg-green-100 text-green-800',
      cancelled: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || colors.new;
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const closeRequest = async (requestId) => {
    try {
      const token = localStorage.getItem('token');
      console.log('🔒 Close Request - Token:', token ? '✅ Present' : '❌ Missing');
      console.log('👤 Close Request - User:', user);
      console.log('📋 Close Request - Data:', { 
        requestId, 
        feedback: closeFeedback, 
        rating: closeRating, 
        evidence: {
          photos: closureEvidence.photos?.length || 0,
          videos: closureEvidence.videos?.length || 0,
          voiceNotes: closureEvidence.voiceNotes?.length || 0
        }
      });

      // Validate evidence
      if (!closureEvidence.photos || !closureEvidence.videos || !closureEvidence.voiceNotes) {
        console.error('❌ Evidence structure is invalid');
        alert('Error: Evidence data is invalid. Please try again.');
        return;
      }

      const requestBody = {
        feedback: closeFeedback,
        rating: closeRating,
        satisfactionLevel: closeRating,
        evidence: closureEvidence
      };

      console.log('📤 Sending request with payload size:', JSON.stringify(requestBody).length / (1024 * 1024), 'MB');

      const response = await axios.post(
        `${API_URL}/assignments/requests/${requestId}/close`,
        requestBody,
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 60000 // 60 second timeout for large payloads
        }
      );

      console.log('✅ Close Request Response:', response.data);

      if (response.data.success) {
        // Clear dialog immediately for better UX
        setCloseDialog(null);
        setCloseFeedback('');
        setCloseRating(5);
        setClosureEvidence({ photos: [], videos: [], voiceNotes: [] });
        setEvidencePreviews({ photos: [], videos: [], voiceNotes: [] });
        setEvidenceDescriptions({ photos: [], videos: [], voiceNotes: [] });
        setPlayingAudio(null);
        
        // Show success message
        alert('✅ Request closed successfully with evidence!');
        
        // Refresh data
        try {
          await fetchRequests();
        } catch (fetchErr) {
          console.warn('⚠️ Failed to refresh requests:', fetchErr.message);
          // Still show success even if refresh fails
          window.location.reload();
        }
      } else {
        // Handle non-success response
        console.error('❌ Request returned success: false', response.data);
        alert(response.data.message || 'Failed to close request');
      }
    } catch (error) {
      console.error('❌ Close Request Error:', error);
      console.error('❌ Error Config:', error.config);
      console.error('❌ Error Response:', error.response?.data);
      console.error('❌ Error Status:', error.response?.status);
      console.error('❌ Error Message:', error.message);
      
      // Check if the error is just a timeout or connection issue
      // The data might have been saved on the backend despite the error
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.warn('⚠️ Request timeout - data may have been saved on backend');
        alert('Request may have been saved. Refreshing to verify...');
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        alert(error.response?.data?.message || 'Failed to close request: ' + error.message);
      }
    }
  };

  const handleEvidenceUpload = (type, files) => {
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
    const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total
    const MAX_FILES = 5;

    Array.from(files).forEach(file => {
      // Check file count
      if (closureEvidence[type].length >= MAX_FILES) {
        alert(`Maximum ${MAX_FILES} ${type} allowed`);
        return;
      }

      // Check individual file size
      if (file.size > MAX_FILE_SIZE) {
        alert(`File "${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max 10MB per file.`);
        return;
      }

      // Check total size across all types
      const totalSize = 
        closureEvidence.photos.reduce((sum, p) => sum + (p?.length || 0), 0) +
        closureEvidence.videos.reduce((sum, v) => sum + (v?.length || 0), 0) +
        closureEvidence.voiceNotes.reduce((sum, v) => sum + (v?.length || 0), 0) +
        file.size;

      if (totalSize > MAX_TOTAL_SIZE) {
        alert(`Total size exceeds ${(MAX_TOTAL_SIZE / (1024 * 1024))}MB limit`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Data = e.target.result;
        const filename = file.name;

        setClosureEvidence(prev => ({
          ...prev,
          [type]: [
            ...prev[type],
            {
              data: base64Data,
              description: '',
              filename,
            }
          ]
        }));

        setEvidencePreviews(prev => ({
          ...prev,
          [type]: [...prev[type], URL.createObjectURL(file)]
        }));

        setEvidenceDescriptions(prev => ({
          ...prev,
          [type]: [...prev[type], '']
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeEvidence = (type, index) => {
    setClosureEvidence(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index)
    }));
    setEvidencePreviews(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index)
    }));
    setEvidenceDescriptions(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index)
    }));
  };

  const updateEvidenceDescription = (type, index, description) => {
    setEvidenceDescriptions(prev => {
      const updated = [...prev[type]];
      updated[index] = description;
      return { ...prev, [type]: updated };
    });

    setClosureEvidence(prev => {
      const updated = [...prev[type]];
      if (updated[index]) {
        updated[index].description = description;
      }
      return { ...prev, [type]: updated };
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdvisoriesBanner />
      {/* Header */}
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">My Requests</h1>
              <p className="text-sm text-gray-500">Welcome, {user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-600">{connected ? 'Connected' : 'Disconnected'}</span>
            </div>
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
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Requests</p>
                <p className="text-3xl font-bold text-gray-800">{stats.total}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Fulfilled</p>
                <p className="text-3xl font-bold text-green-600">{stats.fulfilled}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Create New Request Button */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/victim/request')}
            className="w-full md:w-auto flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold py-4 px-8 rounded-xl shadow-lg transition-all transform hover:scale-105"
          >
            <Plus className="w-5 h-5" />
            <span>Submit New Request</span>
          </button>
        </div>

        {/* Requests List */}
        <div className="space-y-4">
          {requests.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
              <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                No requests yet
              </h3>
              <p className="text-gray-600 mb-6">
                Submit your first emergency request to get help
              </p>
              <button
                onClick={() => navigate('/victim/request')}
                className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Submit Request
              </button>
            </div>
          ) : (
            requests.map((request) => (
              <div
                key={request._id}
                className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/chat/${request._id}`)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getPriorityColor(request.priority)}`}>
                        {request.priority.toUpperCase()}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(request.status)}`}>
                        {request.status.replace('-', ' ').toUpperCase()}
                      </span>
                      {request.sosDetected && (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-500 text-white animate-pulse">
                          🚨 SOS
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-2">
                      {request.location?.address || 'Location provided'}
                    </p>
                    
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
                  </div>

                  <div className="text-right text-sm text-gray-500">
                    <p>{new Date(request.createdAt).toLocaleDateString()}</p>
                    <p>{new Date(request.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>

                {request.assignments && request.assignments.length > 0 && (
                  <div className="pt-4 border-t border-gray-200">
                    <p className="text-sm text-gray-600">
                      {request.assignments.length} assignment(s) • 
                      {request.messages?.length || 0} message(s)
                    </p>
                  </div>
                )}

                {/* NEW: Request Tracking Component */}
                <div className="mt-4">
                  <RequestTracking
                    request={request}
                    assignments={request.assignments || []}
                  />
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/chat/${request._id}`);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>View Details & Chat</span>
                  </button>

                  {request.status === 'fulfilled' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCloseDialog(request._id);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Confirm & Close</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Close Request Dialog */}
      {closeDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Close Request</h3>
              <button
                onClick={() => {
                  setCloseDialog(null);
                  setClosureEvidence({ photos: [], videos: [], voiceNotes: [] });
                  setEvidencePreviews({ photos: [], videos: [], voiceNotes: [] });
                  setEvidenceDescriptions({ photos: [], videos: [], voiceNotes: [] });
                  setPlayingAudio(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-gray-600 mb-4">
              Please confirm that you've received all items and provide feedback on the service.
            </p>

            {/* Satisfaction Rating */}
            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-2">Satisfaction Rating</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setCloseRating(star)}
                    className={`text-2xl transition-colors ${
                      star <= closeRating ? 'text-yellow-400' : 'text-gray-300'
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            {/* Feedback */}
            <div className="mb-6">
              <label className="block text-sm text-gray-600 mb-2">Feedback (Optional)</label>
              <textarea
                value={closeFeedback}
                onChange={(e) => setCloseFeedback(e.target.value)}
                placeholder="Share your experience with the service..."
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                rows={3}
              />
            </div>

            {/* Photos */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                📸 Photos (Optional)
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center mb-3">
                <input
                  type="file"
                  multiple
                  accept="image/*,.jpg,.jpeg,.png,.gif,.webp"
                  onChange={(e) => handleEvidenceUpload('photos', e.target.files)}
                  className="hidden"
                  id="closure-photos"
                />
                <label
                  htmlFor="closure-photos"
                  className="cursor-pointer text-sm text-blue-600 hover:text-blue-700"
                >
                  Click to upload photos (up to 5)
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  {closureEvidence.photos.length} photo(s) selected
                </p>
              </div>

              {closureEvidence.photos.length > 0 && (
                <div className="space-y-2">
                  {closureEvidence.photos.map((photo, idx) => (
                    <div key={idx} className="flex gap-3 p-2 bg-gray-50 rounded-lg">
                      <img
                        src={evidencePreviews.photos[idx]}
                        alt={`Photo ${idx}`}
                        className="w-16 h-16 object-cover rounded"
                      />
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Add description..."
                          value={evidenceDescriptions.photos[idx] || ''}
                          onChange={(e) => updateEvidenceDescription('photos', idx, e.target.value)}
                          className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <p className="text-xs text-gray-500 mt-1">{photo.filename}</p>
                      </div>
                      <button
                        onClick={() => removeEvidence('photos', idx)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Videos */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Video className="w-4 h-4" />
                🎥 Videos (Optional)
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center mb-3">
                <input
                  type="file"
                  multiple
                  accept="video/*,.mp4,.mov,.avi,.mkv,.webm"
                  onChange={(e) => handleEvidenceUpload('videos', e.target.files)}
                  className="hidden"
                  id="closure-videos"
                />
                <label
                  htmlFor="closure-videos"
                  className="cursor-pointer text-sm text-blue-600 hover:text-blue-700"
                >
                  Click to upload videos (up to 5)
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  {closureEvidence.videos.length} video(s) selected
                </p>
              </div>

              {closureEvidence.videos.length > 0 && (
                <div className="space-y-2">
                  {closureEvidence.videos.map((video, idx) => (
                    <div key={idx} className="flex gap-3 p-2 bg-gray-50 rounded-lg">
                      <video
                        src={evidencePreviews.videos[idx]}
                        className="w-16 h-16 object-cover rounded"
                      />
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Add description..."
                          value={evidenceDescriptions.videos[idx] || ''}
                          onChange={(e) => updateEvidenceDescription('videos', idx, e.target.value)}
                          className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <p className="text-xs text-gray-500 mt-1">{video.filename}</p>
                      </div>
                      <button
                        onClick={() => removeEvidence('videos', idx)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Voice Notes / Audio */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Mic className="w-4 h-4" />
                🎙️ Audio (Optional)
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center mb-3">
                <input
                  type="file"
                  multiple
                  accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm"
                  onChange={(e) => handleEvidenceUpload('voiceNotes', e.target.files)}
                  className="hidden"
                  id="closure-audio"
                />
                <label
                  htmlFor="closure-audio"
                  className="cursor-pointer text-sm text-blue-600 hover:text-blue-700"
                >
                  Click to upload audio (up to 5)
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  {closureEvidence.voiceNotes.length} audio file(s) selected
                </p>
              </div>

              {closureEvidence.voiceNotes.length > 0 && (
                <div className="space-y-2">
                  {closureEvidence.voiceNotes.map((audio, idx) => (
                    <div key={idx} className="flex gap-3 p-2 bg-gray-50 rounded-lg items-center">
                      <button
                        onClick={() => setPlayingAudio(playingAudio === idx ? null : idx)}
                        className="text-blue-600 hover:text-blue-700 p-1"
                      >
                        {playingAudio === idx ? (
                          <Pause className="w-5 h-5" />
                        ) : (
                          <Play className="w-5 h-5" />
                        )}
                      </button>
                      <audio
                        src={evidencePreviews.voiceNotes[idx]}
                        controls
                        className="flex-1 h-8"
                      />
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          placeholder="Add description..."
                          value={evidenceDescriptions.voiceNotes[idx] || ''}
                          onChange={(e) => updateEvidenceDescription('voiceNotes', idx, e.target.value)}
                          className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <p className="text-xs text-gray-500 mt-1">{audio.filename}</p>
                      </div>
                      <button
                        onClick={() => removeEvidence('voiceNotes', idx)}
                        className="text-red-500 hover:text-red-700 p-1 flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setCloseDialog(null);
                  setClosureEvidence({ photos: [], videos: [], voiceNotes: [] });
                  setEvidencePreviews({ photos: [], videos: [], voiceNotes: [] });
                  setEvidenceDescriptions({ photos: [], videos: [], voiceNotes: [] });
                  setPlayingAudio(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => closeRequest(closeDialog)}
                className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors"
              >
                Confirm & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
