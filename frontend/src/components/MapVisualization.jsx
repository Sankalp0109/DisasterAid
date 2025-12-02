import { useState, useEffect } from 'react';
import { MapPin, Layers, ZoomIn, ZoomOut, Maximize2, AlertTriangle } from 'lucide-react';

export default function MapVisualization({ requests = [], clusters = [], height = '500px' }) {
  const [mapView, setMapView] = useState('heatmap'); // 'standard', 'heatmap', 'clusters'
  const [zoom, setZoom] = useState(12);
  const [center, setCenter] = useState({ lat: 12.9716, lng: 77.5946 });
  const [selectedRequest, setSelectedRequest] = useState(null);

  // Auto-center on requests
  useEffect(() => {
    if (requests.length > 0) {
      const lats = requests.map(r => r.location?.coordinates?.[1]).filter(Boolean);
      const lngs = requests.map(r => r.location?.coordinates?.[0]).filter(Boolean);
      if (lats.length > 0 && lngs.length > 0) {
        setCenter({
          lat: lats.reduce((a, b) => a + b, 0) / lats.length,
          lng: lngs.reduce((a, b) => a + b, 0) / lngs.length,
        });
      }
    }
  }, [requests]);

  // Calculate heatmap intensity
  const getHeatmapData = () => {
    const heatmap = {};
    requests.forEach(req => {
      if (req.location?.coordinates) {
        const [lng, lat] = req.location.coordinates;
        const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
        const priority = req.priority === 'critical' || req.sosDetected ? 3 : 
                        req.priority === 'high' ? 2 : 1;
        heatmap[key] = (heatmap[key] || 0) + priority;
      }
    });
    return heatmap;
  };

  const heatmapData = getHeatmapData();
  const maxIntensity = Math.max(...Object.values(heatmapData), 1);

  const getHeatColor = (intensity) => {
    const ratio = intensity / maxIntensity;
    if (ratio > 0.7) return 'bg-red-500 border-red-700';
    if (ratio > 0.4) return 'bg-orange-500 border-orange-700';
    if (ratio > 0.2) return 'bg-yellow-500 border-yellow-700';
    return 'bg-blue-500 border-blue-700';
  };

  const getHeatOpacity = (intensity) => {
    const ratio = intensity / maxIntensity;
    return Math.max(0.3, ratio);
  };

  const getPriorityColor = (request) => {
    if (request.sosDetected) return 'bg-red-600 border-red-800';
    if (request.priority === 'critical') return 'bg-red-500 border-red-700';
    if (request.priority === 'high') return 'bg-orange-500 border-orange-700';
    if (request.priority === 'medium') return 'bg-yellow-500 border-yellow-700';
    return 'bg-green-500 border-green-700';
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Map Controls */}
      <div className="bg-gray-100 p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-gray-600" />
          <span className="font-medium text-gray-800">Map View</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMapView('standard')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              mapView === 'standard'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-200'
            }`}
          >
            Standard
          </button>
          <button
            onClick={() => setMapView('heatmap')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              mapView === 'heatmap'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-200'
            }`}
          >
            Heatmap
          </button>
          <button
            onClick={() => setMapView('clusters')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              mapView === 'clusters'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-200'
            }`}
          >
            Clusters
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom(Math.min(zoom + 1, 18))}
            className="p-2 bg-white rounded hover:bg-gray-200 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(Math.max(zoom - 1, 1))}
            className="p-2 bg-white rounded hover:bg-gray-200 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600 px-2">{zoom}x</span>
        </div>
      </div>

      {/* Map Canvas */}
      <div 
        className="relative bg-gradient-to-br from-blue-50 to-green-50 overflow-hidden"
        style={{ height }}
      >
        {/* Grid Background */}
        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="gray" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Heatmap View */}
        {mapView === 'heatmap' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-full h-full">
              {Object.entries(heatmapData).map(([key, intensity]) => {
                const [lat, lng] = key.split(',').map(Number);
                const offsetX = ((lng - center.lng) * 1000 * zoom) + 50;
                const offsetY = ((center.lat - lat) * 1000 * zoom) + 50;
                const size = 40 + (intensity / maxIntensity) * 60;
                
                return (
                  <div
                    key={key}
                    className={`absolute rounded-full border-2 ${getHeatColor(intensity)} transition-all duration-300`}
                    style={{
                      left: `calc(50% + ${offsetX}%)`,
                      top: `calc(50% + ${offsetY}%)`,
                      width: `${size}px`,
                      height: `${size}px`,
                      opacity: getHeatOpacity(intensity),
                      transform: 'translate(-50%, -50%)',
                      filter: 'blur(8px)',
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Standard View - Individual Markers */}
        {mapView === 'standard' && (
          <div className="absolute inset-0">
            {requests.map((request, idx) => {
              if (!request.location?.coordinates) return null;
              const [lng, lat] = request.location.coordinates;
              const offsetX = ((lng - center.lng) * 1000 * zoom);
              const offsetY = ((center.lat - lat) * 1000 * zoom);
              
              return (
                <div
                  key={request._id || idx}
                  className="absolute cursor-pointer transition-transform hover:scale-125"
                  style={{
                    left: `calc(50% + ${offsetX}%)`,
                    top: `calc(50% + ${offsetY}%)`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onClick={() => setSelectedRequest(request)}
                >
                  <div className={`relative w-8 h-8 rounded-full border-2 ${getPriorityColor(request)} shadow-lg flex items-center justify-center`}>
                    {request.sosDetected && (
                      <AlertTriangle className="w-4 h-4 text-white animate-pulse" />
                    )}
                    {!request.sosDetected && (
                      <MapPin className="w-4 h-4 text-white" />
                    )}
                  </div>
                  {/* Pulse animation for critical */}
                  {(request.sosDetected || request.priority === 'critical') && (
                    <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Clusters View */}
        {mapView === 'clusters' && (
          <div className="absolute inset-0">
            {clusters.map((cluster, idx) => {
              if (!cluster.centerLocation?.coordinates) return null;
              const [lng, lat] = cluster.centerLocation.coordinates;
              const offsetX = ((lng - center.lng) * 1000 * zoom);
              const offsetY = ((center.lat - lat) * 1000 * zoom);
              const size = 40 + (cluster.requests?.length || 0) * 5;
              
              return (
                <div
                  key={cluster._id || idx}
                  className="absolute cursor-pointer"
                  style={{
                    left: `calc(50% + ${offsetX}%)`,
                    top: `calc(50% + ${offsetY}%)`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div 
                    className="relative bg-purple-500 border-2 border-purple-700 rounded-full shadow-lg flex items-center justify-center text-white font-bold transition-transform hover:scale-110"
                    style={{ width: `${size}px`, height: `${size}px` }}
                  >
                    {cluster.requests?.length || 0}
                  </div>
                  <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap text-xs bg-white px-2 py-1 rounded shadow">
                    {cluster.totalBeneficiaries?.total || 0} people
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3">
          <h4 className="text-xs font-semibold text-gray-700 mb-2">Legend</h4>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-red-600 border border-red-800"></div>
              <span>SoS / Critical</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-orange-500 border border-orange-700"></div>
              <span>High Priority</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-yellow-500 border border-yellow-700"></div>
              <span>Medium Priority</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-green-500 border border-green-700"></div>
              <span>Low Priority</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-3">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-800">{requests.length}</p>
            <p className="text-xs text-gray-600">Total Requests</p>
          </div>
          {clusters.length > 0 && (
            <div className="text-center mt-2 pt-2 border-t">
              <p className="text-xl font-bold text-purple-600">{clusters.length}</p>
              <p className="text-xs text-gray-600">Active Clusters</p>
            </div>
          )}
        </div>
      </div>

      {/* Selected Request Details */}
      {selectedRequest && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full m-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                Request #{selectedRequest.ticketNumber}
              </h3>
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-600" />
                <span className="text-gray-700">{selectedRequest.location?.address}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(selectedRequest)}`}>
                  {selectedRequest.priority}
                </span>
                {selectedRequest.sosDetected && (
                  <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                    SoS Detected
                  </span>
                )}
              </div>
              <p className="text-gray-600">
                Beneficiaries: {selectedRequest.beneficiaries?.total || 0} people
              </p>
              {selectedRequest.description && (
                <p className="text-gray-700 mt-2">{selectedRequest.description}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
