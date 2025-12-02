import { useState } from 'react';
import { ChevronLeft, ChevronRight, X, Play, Pause, Download, Mic } from 'lucide-react';

/**
 * ✅ Evidence Viewer Component
 * 
 * Displays victim evidence (photos, videos, voice notes)
 * Props:
 * - evidence: { photos: [...], videos: [...], voiceNotes: [...] }
 * - title: String (optional, default: "Victim Evidence")
 * - className: String (optional)
 */

export default function EvidenceViewer({ evidence, title = "📸 Victim Evidence", className = "" }) {
  const [activeTab, setActiveTab] = useState('photos');
  const [viewingIndex, setViewingIndex] = useState(0);
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const [audioElements, setAudioElements] = useState({});

  if (!evidence) return null;

  const hasEvidence = 
    (evidence.photos?.length > 0) ||
    (evidence.videos?.length > 0) ||
    (evidence.voiceNotes?.length > 0);

  if (!hasEvidence) return null;

  const currentTab = {
    photos: evidence.photos || [],
    videos: evidence.videos || [],
    voiceNotes: evidence.voiceNotes || [],
  };

  const items = currentTab[activeTab];
  const currentItem = items[viewingIndex];

  const handlePrevious = () => {
    setViewingIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setViewingIndex((prev) => (prev === items.length - 1 ? 0 : prev + 1));
  };

  const handlePlayAudio = (index) => {
    const audioId = `audio-${activeTab}-${index}`;
    const audioElement = document.getElementById(audioId);

    if (playingAudioId === audioId && audioElement && !audioElement.paused) {
      audioElement.pause();
      setPlayingAudioId(null);
    } else {
      // Pause any other playing audio
      Object.values(audioElements).forEach(el => {
        if (el && !el.paused) {
          el.pause();
        }
      });
      
      if (audioElement) {
        audioElement.play().catch(err => console.error('Audio play error:', err));
        setPlayingAudioId(audioId);
      }
    }
  };

  const handleDownload = (item) => {
    if (activeTab === 'photos' || activeTab === 'videos') {
      // Convert base64 to blob and download
      const link = document.createElement('a');
      link.href = item.data;
      link.download = item.filename || `evidence-${activeTab}-${viewingIndex}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (activeTab === 'voiceNotes') {
      // Download voice note
      const link = document.createElement('a');
      link.href = item.data;
      link.download = item.filename || `voice-note-${viewingIndex}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-gray-200">
        <button
          onClick={() => {
            setActiveTab('photos');
            setViewingIndex(0);
          }}
          disabled={!evidence.photos?.length}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'photos'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
        >
          📷 Photos ({evidence.photos?.length || 0})
        </button>
        <button
          onClick={() => {
            setActiveTab('videos');
            setViewingIndex(0);
          }}
          disabled={!evidence.videos?.length}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'videos'
              ? 'text-green-600 border-b-2 border-green-600'
              : 'text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
        >
          🎥 Videos ({evidence.videos?.length || 0})
        </button>
        <button
          onClick={() => {
            setActiveTab('voiceNotes');
            setViewingIndex(0);
          }}
          disabled={!evidence.voiceNotes?.length}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'voiceNotes'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
        >
          🎙️ Voice Notes ({evidence.voiceNotes?.length || 0})
        </button>
      </div>

      {items.length > 0 && (
        <div className="space-y-4">
          {/* Viewer */}
          <div className="relative bg-gray-100 rounded-lg overflow-hidden">
            {activeTab === 'photos' && currentItem && (
              <img
                src={currentItem.data}
                alt={`Photo ${viewingIndex + 1}`}
                className="w-full h-96 object-contain"
              />
            )}

            {activeTab === 'videos' && currentItem && (
              <video
                src={currentItem.data}
                controls
                className="w-full h-96 bg-black"
              />
            )}

            {activeTab === 'voiceNotes' && currentItem && (
              <div className="w-full h-96 bg-gradient-to-br from-purple-100 to-purple-50 flex flex-col items-center justify-center gap-4">
                <Mic className="w-16 h-16 text-purple-600" />
                <p className="text-center text-gray-700 font-medium">
                  {currentItem.filename}
                </p>
                {currentItem.duration && (
                  <p className="text-sm text-gray-600">Duration: {currentItem.duration}s</p>
                )}
                {/* Hidden audio element */}
                <audio
                  id={`audio-${activeTab}-${viewingIndex}`}
                  src={currentItem.data}
                  ref={(el) => {
                    if (el) {
                      audioElements[`audio-${activeTab}-${viewingIndex}`] = el;
                      el.onended = () => setPlayingAudioId(null);
                    }
                  }}
                />
              </div>
            )}

            {/* Navigation Arrows */}
            {items.length > 1 && (
              <>
                <button
                  onClick={handlePrevious}
                  className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-75 text-white p-2 rounded-full transition-all"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={handleNext}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-75 text-white p-2 rounded-full transition-all"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}

            {/* Counter */}
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-75 text-white px-3 py-1 rounded-full text-sm font-medium">
              {viewingIndex + 1} / {items.length}
            </div>
          </div>

          {/* Details and Controls */}
          {currentItem && (
            <div className="space-y-3">
              {/* Description */}
              {currentItem.description && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">Description:</span> {currentItem.description}
                  </p>
                </div>
              )}

              {/* Timestamp */}
              {currentItem.timestamp && (
                <p className="text-xs text-gray-600">
                  Uploaded: {new Date(currentItem.timestamp).toLocaleString()}
                </p>
              )}

              {/* Controls */}
              <div className="flex gap-3">
                {activeTab === 'voiceNotes' && (
                  <button
                    onClick={() => handlePlayAudio(viewingIndex)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-medium transition-colors ${
                      playingAudioId === `audio-${activeTab}-${viewingIndex}`
                        ? 'bg-purple-600 hover:bg-purple-700 text-white'
                        : 'bg-purple-500 hover:bg-purple-600 text-white'
                    }`}
                  >
                    {playingAudioId === `audio-${activeTab}-${viewingIndex}` ? (
                      <>
                        <Pause className="w-4 h-4" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Play
                      </>
                    )}
                  </button>
                )}

                {/* Download Button */}
                {(activeTab === 'photos' || activeTab === 'videos') && (
                  <button
                    onClick={() => handleDownload(currentItem)}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-medium bg-gray-200 hover:bg-gray-300 text-gray-800 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                )}
              </div>

              {/* Thumbnails */}
              {items.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {items.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => setViewingIndex(idx)}
                      className={`flex-shrink-0 relative rounded-lg overflow-hidden border-2 transition-all ${
                        idx === viewingIndex ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-300'
                      }`}
                    >
                      {activeTab === 'photos' && (
                        <img
                          src={item.data}
                          alt={`Thumbnail ${idx + 1}`}
                          className="w-16 h-16 object-cover"
                        />
                      )}
                      {activeTab === 'videos' && (
                        <div className="w-16 h-16 bg-gray-800 flex items-center justify-center">
                          <div className="text-white text-xs font-semibold">{idx + 1}</div>
                        </div>
                      )}
                      {activeTab === 'voiceNotes' && (
                        <div className="w-16 h-16 bg-purple-500 flex items-center justify-center">
                          <Mic className="w-6 h-6 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!hasEvidence && (
        <div className="text-center py-8">
          <p className="text-gray-600">No evidence provided by victim</p>
        </div>
      )}
    </div>
  );
}
