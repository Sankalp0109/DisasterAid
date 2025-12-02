import { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function AdvisoriesBanner() {
  const [advisories, setAdvisories] = useState([]);

  const load = async () => {
    try {
      const res = await axios.get(`${API_URL}/advisories`);
      if (res.data.success) setAdvisories(res.data.advisories || []);
    } catch {}
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  if (!advisories.length) return null;

  const colorMap = {
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    watch: 'bg-amber-50 text-amber-800 border-amber-200',
    warning: 'bg-orange-50 text-orange-800 border-orange-200',
    danger: 'bg-red-50 text-red-800 border-red-200',
  };

  return (
    <div className="sticky top-0 z-[900] w-full">
      {advisories.map((a) => (
        <div key={a._id} className={`border-y px-4 py-2 text-sm ${colorMap[a.severity] || colorMap.info}`}> 
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="font-medium">{a.title}</div>
            <div className="text-xs sm:text-sm opacity-90">{a.message}</div>
            {a.expiresAt && <div className="text-[10px] opacity-70">Expires: {new Date(a.expiresAt).toLocaleString()}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
