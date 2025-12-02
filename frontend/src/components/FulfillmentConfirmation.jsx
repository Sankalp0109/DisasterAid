import { useState } from 'react';
import { X, Image as ImageIcon, Video, Mic, Trash2, Star } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/**
 * ✅ Fulfillment Confirmation Component
 * 
 * When NGO marks assignment as fulfilled, victim must confirm with evidence
 * Props:
 * - requestId: ID of request that was fulfilled
 * - onClose: Callback when dialog closes
 * - onSuccess: Callback when confirmation submitted successfully
 */
export default function FulfillmentConfirmation({ requestId, onClose, onSuccess }) {
  const [step, setStep] = useState(1); // 1: Satisfaction, 2: Evidence, 3: Review
  const [satisfaction, setSatisfaction] = useState(5);
  const [notes, setNotes] = useState('');
  const [evidence, setEvidence] = useState({
    photos: [],
    videos: [],
    voiceNotes: [],
  });
  const [evidencePreviews, setEvidencePreviews] = useState({
    photos: [],
    videos: [],
    voiceNotes: [],
  });
  const [loading, setLoading] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(null);

  const handleEvidenceUpload = (type, files) => {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Data = e.target.result;
        const filename = file.name;

        setEvidence(prev => ({
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
          [type]: [
            ...prev[type],
            {
              url: base64Data,
              filename,
            }
          ]
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeEvidence = (type, index) => {
    setEvidence(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index)
    }));
    setEvidencePreviews(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index)
    }));
  };

  const updateEvidenceDescription = (type, index, description) => {
    setEvidence(prev => ({
      ...prev,
      [type]: prev[type].map((item, i) =>
        i === index ? { ...item, description } : item
      )
    }));
  };

  const handlePlayAudio = (index) => {
    const audioId = `audio-confirm-${index}`;
    const audioElement = document.getElementById(audioId);

    if (playingAudio === audioId && audioElement && !audioElement.paused) {
      audioElement.pause();
      setPlayingAudio(null);
    } else {
      if (audioElement) {
        audioElement.play().catch(err => console.error('Audio play error:', err));
        setPlayingAudio(audioId);
      }
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const payload = {
        evidence,
        notes,
        satisfaction
      };

      const response = await axios.post(
        `${API_URL}/assignments/requests/${requestId}/confirm-fulfillment`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      if (response.data.success) {
        alert('✅ Fulfillment confirmed with evidence! Thank you.');
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (error) {
      console.error('Confirmation error:', error);
      alert('Error: ' + (error.response?.data?.error || error.response?.data?.message || 'Failed to confirm'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-96 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-green-500 to-emerald-600 text-white p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold">✅ Confirm Fulfillment</h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-full"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Step 1: Satisfaction Rating */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800">How satisfied are you with the help received?</h3>
              <div className="flex gap-4 justify-center mb-6">
                {[1, 2, 3, 4, 5].map(rating => (
                  <button
                    key={rating}
                    onClick={() => setSatisfaction(rating)}
                    className={`text-4xl transition-transform hover:scale-110 ${
                      rating <= satisfaction ? 'text-yellow-400' : 'text-gray-300'
                    }`}
                  >
                    <Star fill="currentColor" />
                  </button>
                ))}
              </div>
              <p className="text-center text-gray-600 font-semibold">Rating: {satisfaction}/5</p>

              <textarea
                placeholder="Additional comments (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 h-24"
              />

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-2 rounded-lg"
                >
                  Next: Add Evidence
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Evidence Upload */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800">Add Evidence (Photos/Videos/Audio)</h3>
              <p className="text-sm text-gray-600">Upload photos, videos, or voice notes as proof of help received</p>

              {/* Photos */}
              <div className="border-2 border-dashed border-blue-300 rounded-lg p-4 bg-blue-50">
                <div className="flex items-center gap-2 mb-3">
                  <ImageIcon className="w-5 h-5 text-blue-600" />
                  <h4 className="font-semibold text-gray-800">📷 Photos ({evidence.photos.length})</h4>
                </div>
                <input
                  type="file"
                  multiple
                  accept="image/*,.jpg,.jpeg,.png,.gif,.webp"
                  onChange={(e) => handleEvidenceUpload('photos', e.target.files)}
                  className="hidden"
                  id="confirm-photo-input"
                />
                <label
                  htmlFor="confirm-photo-input"
                  className="block bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded cursor-pointer text-center transition-colors"
                >
                  + Add Photos
                </label>
                {evidence.photos.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {evidence.photos.map((photo, idx) => (
                      <div key={idx} className="bg-white rounded p-2 flex gap-2 items-start">
                        <img
                          src={photo.data}
                          alt={`Photo ${idx + 1}`}
                          className="w-12 h-12 object-cover rounded"
                        />
                        <div className="flex-1 text-sm">
                          <p className="text-gray-700 font-medium">Photo {idx + 1}</p>
                          <input
                            type="text"
                            placeholder="Description (optional)"
                            value={photo.description}
                            onChange={(e) => updateEvidenceDescription('photos', idx, e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs mt-1"
                          />
                        </div>
                        <button
                          onClick={() => removeEvidence('photos', idx)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Videos */}
              <div className="border-2 border-dashed border-green-300 rounded-lg p-4 bg-green-50">
                <div className="flex items-center gap-2 mb-3">
                  <Video className="w-5 h-5 text-green-600" />
                  <h4 className="font-semibold text-gray-800">🎥 Videos ({evidence.videos.length})</h4>
                </div>
                <input
                  type="file"
                  multiple
                  accept="video/*,.mp4,.mov,.avi,.mkv,.webm"
                  onChange={(e) => handleEvidenceUpload('videos', e.target.files)}
                  className="hidden"
                  id="confirm-video-input"
                />
                <label
                  htmlFor="confirm-video-input"
                  className="block bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded cursor-pointer text-center transition-colors"
                >
                  + Add Videos
                </label>
                {evidence.videos.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {evidence.videos.map((video, idx) => (
                      <div key={idx} className="bg-white rounded p-2 flex gap-2 items-start">
                        <div className="w-12 h-12 bg-gray-800 rounded flex items-center justify-center">
                          <Video className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 text-sm">
                          <p className="text-gray-700 font-medium">{video.filename}</p>
                          <input
                            type="text"
                            placeholder="Description (optional)"
                            value={video.description}
                            onChange={(e) => updateEvidenceDescription('videos', idx, e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs mt-1"
                          />
                        </div>
                        <button
                          onClick={() => removeEvidence('videos', idx)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Voice Notes */}
              <div className="border-2 border-dashed border-purple-300 rounded-lg p-4 bg-purple-50">
                <div className="flex items-center gap-2 mb-3">
                  <Mic className="w-5 h-5 text-purple-600" />
                  <h4 className="font-semibold text-gray-800">🎙️ Voice Notes ({evidence.voiceNotes.length})</h4>
                </div>
                <input
                  type="file"
                  multiple
                  accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm"
                  onChange={(e) => handleEvidenceUpload('voiceNotes', e.target.files)}
                  className="hidden"
                  id="confirm-audio-input"
                />
                <label
                  htmlFor="confirm-audio-input"
                  className="block bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded cursor-pointer text-center transition-colors"
                >
                  + Add Voice Notes
                </label>
                {evidence.voiceNotes.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {evidence.voiceNotes.map((note, idx) => (
                      <div key={idx} className="bg-white rounded p-2 flex gap-2 items-start">
                        <div className="w-12 h-12 bg-purple-500 rounded flex items-center justify-center">
                          <Mic className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 text-sm">
                          <p className="text-gray-700 font-medium">{note.filename}</p>
                          <input
                            type="text"
                            placeholder="Description (optional)"
                            value={note.description}
                            onChange={(e) => updateEvidenceDescription('voiceNotes', idx, e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs mt-1"
                          />
                          <audio
                            id={`audio-confirm-${idx}`}
                            src={note.data}
                            onEnded={() => setPlayingAudio(null)}
                            className="hidden"
                          />
                        </div>
                        <button
                          onClick={() => handlePlayAudio(idx)}
                          className={`px-2 py-1 rounded text-white text-xs font-semibold ${
                            playingAudio === `audio-confirm-${idx}`
                              ? 'bg-purple-600'
                              : 'bg-purple-500 hover:bg-purple-600'
                          }`}
                        >
                          {playingAudio === `audio-confirm-${idx}` ? '⏸ Stop' : '▶ Play'}
                        </button>
                        <button
                          onClick={() => removeEvidence('voiceNotes', idx)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 rounded-lg"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-2 rounded-lg"
                  disabled={evidence.photos.length === 0 && evidence.videos.length === 0 && evidence.voiceNotes.length === 0}
                >
                  Review & Confirm
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800">Review Your Confirmation</h3>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="font-semibold text-gray-800">Satisfaction Rating: ⭐ {satisfaction}/5</p>
                {notes && <p className="text-gray-700 mt-2">{notes}</p>}
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="font-semibold text-gray-800 mb-2">Evidence Summary:</p>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>📷 Photos: {evidence.photos.length}</li>
                  <li>🎥 Videos: {evidence.videos.length}</li>
                  <li>🎙️ Voice Notes: {evidence.voiceNotes.length}</li>
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 rounded-lg"
                >
                  Back to Evidence
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-semibold py-2 rounded-lg"
                >
                  {loading ? 'Submitting...' : 'Submit Confirmation'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
