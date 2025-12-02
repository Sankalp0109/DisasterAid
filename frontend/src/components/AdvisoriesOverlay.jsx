import { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Floating advisories overlay visible across the app
export default function AdvisoriesOverlay() {
  const [advisories, setAdvisories] = useState([]);

  const fetchAdvisories = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
      const res = await axios.get(`${API_URL}/advisories`, config);
      if (res.data.success) setAdvisories(res.data.advisories || []);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    fetchAdvisories();
    const id = setInterval(fetchAdvisories, 30000); // refresh every 30s
    return () => clearInterval(id);
  }, []);

  if (!advisories.length) return null;

  const colorMap = {
    info: 'bg-blue-600',
    watch: 'bg-amber-600',
    warning: 'bg-orange-600',
    danger: 'bg-red-600',
  };

  return (
    <div className="fixed bottom-4 right-4 z-[1000] space-y-2 max-w-sm">
      {advisories.map((a) => (
        <div key={a._id}
          className="rounded-lg shadow-lg overflow-hidden backdrop-blur bg-white/90 border border-gray-200 animate-fadeIn">
          <div className={`px-3 py-2 text-white text-sm ${colorMap[a.severity] || 'bg-blue-600'}`}>
            {a.title}
          </div>
          <div className="px-3 py-2 text-gray-800 text-sm">
            {a.message}
            {a.expiresAt && (
              <div className="text-xs text-gray-500 mt-1">Expires: {new Date(a.expiresAt).toLocaleString()}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
