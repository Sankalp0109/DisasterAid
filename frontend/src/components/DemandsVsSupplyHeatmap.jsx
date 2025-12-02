import React, { useMemo } from 'react';
import { TrendingUp, AlertTriangle } from 'lucide-react';

/**
 * DemandsVsSupplyHeatmap Component
 * Visualizes requests (demand) vs NGO coverage (supply) across geographic areas
 * Color-coded from green (balanced) to red (high demand, low supply)
 */
export default function DemandsVsSupplyHeatmap({ requests = [], ngos = [] }) {
  // Generate heatmap data from requests and NGO locations
  const heatmapData = useMemo(() => {
    if (!requests.length || !ngos.length) {
      return { grid: [], stats: null };
    }

    // Create a grid of areas based on coordinates
    const areas = {};
    
    // Count requests by area (rough grid-based clustering)
    requests.forEach(req => {
      if (req.location?.coordinates) {
        // Round coordinates to 0.1 degree precision for area grouping
        const lat = Math.round(req.location.coordinates[1] * 10) / 10;
        const lng = Math.round(req.location.coordinates[0] * 10) / 10;
        const key = `${lat},${lng}`;
        
        if (!areas[key]) {
          areas[key] = {
            lat,
            lng,
            demands: 0,
            supply: 0,
            requests: [],
            ngos: [],
          };
        }
        areas[key].demands++;
        areas[key].requests.push(req);
      }
    });

    // Count NGO coverage by area
    ngos.forEach(ngo => {
      if (ngo.location?.coordinates) {
        const lat = Math.round(ngo.location.coordinates[1] * 10) / 10;
        const lng = Math.round(ngo.location.coordinates[0] * 10) / 10;
        const key = `${lat},${lng}`;
        
        if (!areas[key]) {
          areas[key] = {
            lat,
            lng,
            demands: 0,
            supply: 0,
            requests: [],
            ngos: [],
          };
        }
        areas[key].supply++;
        areas[key].ngos.push(ngo);
      }
    });

    // Convert to array and calculate balance ratio
    const grid = Object.values(areas).map(area => ({
      ...area,
      ratio: area.demands / (area.supply || 0.1), // Avoid division by zero
      balance: area.supply - area.demands, // Positive = surplus, Negative = deficit
    }));

    // Calculate statistics
    const totalDemands = grid.reduce((sum, cell) => sum + cell.demands, 0);
    const totalSupply = grid.reduce((sum, cell) => sum + cell.supply, 0);
    const avgRatio = grid.length > 0 ? totalDemands / (totalSupply || 1) : 0;

    return {
      grid: grid.sort((a, b) => b.ratio - a.ratio), // Sort by highest demand/supply ratio
      stats: {
        totalDemands,
        totalSupply,
        avgRatio,
        surplus: grid.filter(c => c.balance > 0).length,
        deficit: grid.filter(c => c.balance < 0).length,
        balanced: grid.filter(c => c.balance === 0).length,
      },
    };
  }, [requests, ngos]);

  // Get color based on demand/supply ratio
  const getHeatColor = (ratio) => {
    if (ratio <= 0.5) return { bg: 'bg-green-500', text: 'text-green-900', label: 'Surplus' }; // More supply
    if (ratio <= 1) return { bg: 'bg-lime-400', text: 'text-lime-900', label: 'Balanced' }; // Balanced
    if (ratio <= 2) return { bg: 'bg-yellow-400', text: 'text-yellow-900', label: 'High Demand' }; // High demand
    if (ratio <= 3) return { bg: 'bg-orange-500', text: 'text-orange-900', label: 'Very High' }; // Very high
    return { bg: 'bg-red-600', text: 'text-red-900', label: 'Critical' }; // Critical shortage
  };

  if (!heatmapData.grid.length) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">📊 Demands vs Supply Heatmap</h3>
        <div className="text-center py-8 text-gray-500">
          No location data available for heatmap
        </div>
      </div>
    );
  }

  const stats = heatmapData.stats;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          📊 Demands vs Supply Heatmap
        </h3>
        <p className="text-sm text-gray-600">Geographic areas colored by demand/supply ratio. Red = shortage, Green = surplus</p>
      </div>

      {/* Statistics Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-blue-50 p-3 rounded-lg">
          <div className="text-xs text-blue-600 font-semibold">TOTAL DEMAND</div>
          <div className="text-2xl font-bold text-blue-800">{stats.totalDemands}</div>
          <div className="text-xs text-blue-600">requests</div>
        </div>
        <div className="bg-green-50 p-3 rounded-lg">
          <div className="text-xs text-green-600 font-semibold">TOTAL SUPPLY</div>
          <div className="text-2xl font-bold text-green-800">{stats.totalSupply}</div>
          <div className="text-xs text-green-600">NGO teams</div>
        </div>
        <div className="bg-orange-50 p-3 rounded-lg">
          <div className="text-xs text-orange-600 font-semibold">RATIO</div>
          <div className="text-2xl font-bold text-orange-800">{stats.avgRatio.toFixed(2)}</div>
          <div className="text-xs text-orange-600">avg demand/supply</div>
        </div>
        <div className="bg-purple-50 p-3 rounded-lg">
          <div className="text-xs text-purple-600 font-semibold">AREAS AT RISK</div>
          <div className="text-2xl font-bold text-purple-800">{stats.deficit}</div>
          <div className="text-xs text-purple-600">deficit areas</div>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="overflow-x-auto">
        <div className="space-y-2">
          {/* Header */}
          <div className="text-xs font-semibold text-gray-600 grid grid-cols-5 gap-2 mb-3">
            <div>Location</div>
            <div className="text-center">Demands</div>
            <div className="text-center">Supply</div>
            <div className="text-center">Ratio</div>
            <div>Status</div>
          </div>

          {/* Heatmap Cells */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {heatmapData.grid.map((cell, idx) => {
              const color = getHeatColor(cell.ratio);
              return (
                <div
                  key={`${cell.lat}-${cell.lng}-${idx}`}
                  className={`${color.bg} rounded-lg p-3 transition-all hover:shadow-md cursor-pointer`}
                >
                  <div className="grid grid-cols-5 gap-2 items-center">
                    {/* Location */}
                    <div className={`${color.text} text-sm font-medium`}>
                      ({cell.lat}°, {cell.lng}°)
                    </div>

                    {/* Demands Count */}
                    <div className={`${color.text} text-center font-bold text-lg`}>
                      {cell.demands}
                    </div>

                    {/* Supply Count */}
                    <div className={`${color.text} text-center font-bold text-lg`}>
                      {cell.supply}
                    </div>

                    {/* Ratio */}
                    <div className={`${color.text} text-center font-bold text-lg`}>
                      {cell.ratio.toFixed(1)}x
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-1">
                      {cell.balance > 0 ? (
                        <span className={`${color.text} text-xs font-semibold px-2 py-1 bg-white rounded`}>
                          ✅ +{cell.balance}
                        </span>
                      ) : cell.balance < 0 ? (
                        <span className={`${color.text} text-xs font-semibold px-2 py-1 bg-white rounded flex items-center gap-1`}>
                          <AlertTriangle className="w-3 h-3" />
                          {cell.balance}
                        </span>
                      ) : (
                        <span className={`${color.text} text-xs font-semibold px-2 py-1 bg-white rounded`}>
                          ⚖️ Balanced
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Detail Info */}
                  <div className={`${color.text} text-xs mt-2 opacity-80`}>
                    {cell.requests.length > 0 && (
                      <div>Requests: {cell.requests.map(r => r.priority).join(', ')}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 pt-6 border-t">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Legend</h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-500"></div>
            <span className="text-xs">Surplus</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-lime-400"></div>
            <span className="text-xs">Balanced</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-yellow-400"></div>
            <span className="text-xs">High Demand</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-orange-500"></div>
            <span className="text-xs">Very High</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-600"></div>
            <span className="text-xs">Critical</span>
          </div>
        </div>
      </div>

      {/* Analysis */}
      <div className="mt-6 pt-6 border-t">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">📈 Analysis</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="bg-green-50 p-3 rounded">
            <div className="font-semibold text-green-900">Balanced Areas</div>
            <div className="text-2xl font-bold text-green-600">{stats.balanced}</div>
            <div className="text-xs text-green-700">Good coverage</div>
          </div>
          <div className="bg-yellow-50 p-3 rounded">
            <div className="font-semibold text-yellow-900">Deficit Areas</div>
            <div className="text-2xl font-bold text-yellow-600">{stats.deficit}</div>
            <div className="text-xs text-yellow-700">Need reinforcement</div>
          </div>
          <div className="bg-blue-50 p-3 rounded">
            <div className="font-semibold text-blue-900">Surplus Areas</div>
            <div className="text-2xl font-bold text-blue-600">{stats.surplus}</div>
            <div className="text-xs text-blue-700">Can support others</div>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {stats.deficit > 0 && (
        <div className="mt-6 pt-6 border-t bg-red-50 p-4 rounded-lg">
          <div className="text-sm font-semibold text-red-900 flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" />
            ⚠️ Recommendations
          </div>
          <ul className="text-xs text-red-800 space-y-1">
            <li>• {stats.deficit} area(s) have more requests than available NGO teams</li>
            <li>• Consider redirecting NGOs from surplus areas to deficit areas</li>
            <li>• Prioritize SOS and critical requests in deficit areas</li>
            <li>• Coordinate with neighboring areas for resource sharing</li>
          </ul>
        </div>
      )}
    </div>
  );
}
