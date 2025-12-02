import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Package, LogOut, Plus, RefreshCw, Pause, Play, Trash2, Edit, MapPin, Loader } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const CATEGORIES = ['rescue','food','water','medical','babySupplies','sanitation','shelter','power','transport'];

export default function NGOOffers() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locationLoading, setLocationLoading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: 'food',
    description: '',
    totalQuantity: 100,
    unit: 'units',
    coverageRadius: 10000,
    status: 'active',
    location: null, // default to NGO location backend if null
    details: {
      shiftTimes: [{ day: 'Daily', startTime: '09:00', endTime: '17:00' }],
      onCallMedics: 0,
      vehicleCount: 0,
      vehicleType: '',
      capacity: 0,
    },
    conditions: {
      deliveryAvailable: true,
      requiresPickup: false,
    },
  });
  const [editing, setEditing] = useState(null);
  const [ngoHasLocation, setNgoHasLocation] = useState(false);
  const [firstOffer, setFirstOffer] = useState(true);

  useEffect(() => {
    fetchOffers();
    checkNGOLocation();
  }, []);

  const checkNGOLocation = async () => {
    try {
      const res = await axios.get(`${API_URL}/ngos/me`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (res.data.success && res.data.ngo) {
        setNgoHasLocation(!!(res.data.ngo.location && res.data.ngo.location.coordinates));
      }
    } catch (e) {
      console.error('Failed to check NGO location', e);
    }
  };

  const fetchOffers = async () => {
    try {
      // Pass status= to fetch all (backend defaults to active otherwise)
      const res = await axios.get(`${API_URL}/offers?status=`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (res.data.success) {
        setOffers(res.data.offers);
        if (res.data.offers.length > 0) setFirstOffer(false);
      }
    } catch (e) {
      console.error('Failed to load offers', e);
    } finally { setLoading(false); }
  };

  const resetForm = () => setForm({ 
    title:'', 
    category:'food', 
    description:'', 
    totalQuantity:100, 
    unit:'units', 
    coverageRadius:10000, 
    status:'active', 
    location:null,
    details: {
      shiftTimes: [{ day: 'Daily', startTime: '09:00', endTime: '17:00' }],
      onCallMedics: 0,
      vehicleCount: 0,
      vehicleType: '',
      capacity: 0,
    },
    conditions: {
      deliveryAvailable: true,
      requiresPickup: false,
    },
  });

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
          
          setForm({
            ...form,
            location: {
              type: 'Point',
              coordinates: [longitude, latitude],
              address: address
            }
          });
        } catch (err) {
          setForm({
            ...form,
            location: {
              type: 'Point',
              coordinates: [longitude, latitude],
              address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
            }
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

  const createOffer = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, totalQuantity: Number(form.totalQuantity) };
      const res = await axios.post(`${API_URL}/offers`, payload, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (res.data.success) {
        resetForm();
        await fetchOffers();
      }
    } catch (e) {
      alert(e.response?.data?.message || 'Failed to create offer');
    }
  };

  const toggleStatus = async (id) => {
    try {
      const res = await axios.patch(`${API_URL}/offers/${id}/toggle`, {}, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (res.data.success) fetchOffers();
    } catch (e) { console.error(e); }
  };

  const removeOffer = async (id) => {
    if (!confirm('Delete this offer?')) return;
    try {
      const res = await axios.delete(`${API_URL}/offers/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (res.data.success) fetchOffers();
    } catch (e) { alert(e.response?.data?.message || 'Failed to delete'); }
  };

  const startEdit = (offer) => {
    setEditing(offer._id);
    setForm({
      title: offer.title,
      category: offer.category,
      description: offer.description || '',
      totalQuantity: offer.totalQuantity,
      unit: offer.unit || 'units',
      coverageRadius: offer.coverageRadius || 10000,
      status: offer.status || 'active',
      location: offer.location,
      details: {
        shiftTimes: offer.details?.shiftTimes || [{ day: 'Daily', startTime: '09:00', endTime: '17:00' }],
        onCallMedics: offer.details?.onCallMedics || 0,
        vehicleCount: offer.details?.vehicleCount || 0,
        vehicleType: offer.details?.vehicleType || '',
        capacity: offer.details?.capacity || 0,
      },
      conditions: {
        deliveryAvailable: offer.conditions?.deliveryAvailable ?? true,
        requiresPickup: offer.conditions?.requiresPickup ?? false,
      },
    });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, totalQuantity: Number(form.totalQuantity) };
      const res = await axios.put(`${API_URL}/offers/${editing}`, payload, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (res.data.success) {
        setEditing(null);
        resetForm();
        await fetchOffers();
      }
    } catch (e) { alert(e.response?.data?.message || 'Failed to update'); }
  };

  const handleLogout = async () => { await logout(); navigate('/login'); };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-blue-500" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Manage Offers</h1>
              <p className="text-sm text-gray-500">Welcome, {user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/ngo/dashboard')} className="px-4 py-2 text-gray-600 hover:text-gray-800">Dashboard</button>
            <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 grid md:grid-cols-3 gap-6">
        {/* Create / Edit Form */}
        <div className="bg-white rounded-xl shadow p-6 md:col-span-1">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">{editing ? 'Edit Offer' : 'Create Offer'} <Plus className="w-4 h-4 text-blue-500" /></h2>
          <form onSubmit={editing ? saveEdit : createOffer} className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Title</label>
              <input value={form.title} onChange={e=>setForm({...form, title:e.target.value})} className="w-full px-3 py-2 border rounded" required />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Category</label>
              <select value={form.category} onChange={e=>setForm({...form, category:e.target.value})} className="w-full px-3 py-2 border rounded">
                {CATEGORIES.map(c=> <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Description</label>
              <textarea value={form.description} onChange={e=>setForm({...form, description:e.target.value})} className="w-full px-3 py-2 border rounded" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Total Quantity</label>
                <input type="number" min="1" value={form.totalQuantity} onChange={e=>setForm({...form, totalQuantity:e.target.value})} className="w-full px-3 py-2 border rounded" required />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Unit</label>
                <input value={form.unit} onChange={e=>setForm({...form, unit:e.target.value})} className="w-full px-3 py-2 border rounded" />
              </div>
            </div>
            {/* Shift Times */}
            <div className="border-t pt-3 mt-3">
              <label className="block text-sm font-semibold text-gray-700 mb-2">⏰ Shift Times</label>
              <div className="space-y-2">
                {form.details.shiftTimes.map((shift, idx) => (
                  <div key={idx} className="flex gap-2 items-end bg-gray-50 p-2 rounded">
                    <input type="text" placeholder="e.g., Daily, Mon-Fri" value={shift.day} onChange={e => {
                      const newShifts = [...form.details.shiftTimes];
                      newShifts[idx].day = e.target.value;
                      setForm({...form, details: {...form.details, shiftTimes: newShifts}});
                    }} className="flex-1 px-2 py-1 border rounded text-sm" />
                    <input type="time" value={shift.startTime} onChange={e => {
                      const newShifts = [...form.details.shiftTimes];
                      newShifts[idx].startTime = e.target.value;
                      setForm({...form, details: {...form.details, shiftTimes: newShifts}});
                    }} className="px-2 py-1 border rounded text-sm" />
                    <input type="time" value={shift.endTime} onChange={e => {
                      const newShifts = [...form.details.shiftTimes];
                      newShifts[idx].endTime = e.target.value;
                      setForm({...form, details: {...form.details, shiftTimes: newShifts}});
                    }} className="px-2 py-1 border rounded text-sm" />
                    <button type="button" onClick={() => {
                      const newShifts = form.details.shiftTimes.filter((_, i) => i !== idx);
                      setForm({...form, details: {...form.details, shiftTimes: newShifts}});
                    }} className="text-red-500 hover:text-red-700 text-sm font-semibold">✕</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => {
                setForm({...form, details: {...form.details, shiftTimes: [...form.details.shiftTimes, {day: '', startTime: '09:00', endTime: '17:00'}]}});
              }} className="text-xs mt-1 px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded">+ Add Shift</button>
            </div>

            {/* Medical: On-Call Medics */}
            {form.category === 'medical' && (
              <div className="border-t pt-3 mt-3">
                <label className="block text-sm text-gray-600 mb-1">👨‍⚕️ On-Call Medics</label>
                <input type="number" min="0" max="50" value={form.details.onCallMedics} onChange={e=>setForm({...form, details: {...form.details, onCallMedics: Number(e.target.value)}})} className="w-full px-3 py-2 border rounded" />
              </div>
            )}

            {/* Transport: Vehicle Info */}
            {form.category === 'transport' && (
              <div className="border-t pt-3 mt-3 space-y-2">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">🚗 Vehicle Count</label>
                  <input type="number" min="0" value={form.details.vehicleCount} onChange={e=>setForm({...form, details: {...form.details, vehicleCount: Number(e.target.value)}})} className="w-full px-3 py-2 border rounded" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Vehicle Type</label>
                  <input placeholder="e.g., Car, Boat, Helicopter" value={form.details.vehicleType} onChange={e=>setForm({...form, details: {...form.details, vehicleType: e.target.value}})} className="w-full px-3 py-2 border rounded" />
                </div>
              </div>
            )}

            {/* Shelter/Food: Capacity */}
            {(form.category === 'shelter' || form.category === 'food') && (
              <div className="border-t pt-3 mt-3">
                <label className="block text-sm text-gray-600 mb-1">{form.category === 'shelter' ? '🏠' : '🍽️'} Capacity ({form.unit})</label>
                <input type="number" min="0" value={form.details.capacity} onChange={e=>setForm({...form, details: {...form.details, capacity: Number(e.target.value)}})} className="w-full px-3 py-2 border rounded" />
              </div>
            )}

            {/* Delivery Conditions */}
            <div className="border-t pt-3 mt-3 space-y-2">
              <label className="block text-sm font-semibold text-gray-700">📦 Delivery Options</label>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="deliveryAvail" checked={form.conditions.deliveryAvailable} onChange={e=>setForm({...form, conditions: {...form.conditions, deliveryAvailable: e.target.checked}})} className="rounded" />
                <label htmlFor="deliveryAvail" className="text-sm text-gray-600">Delivery Available</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="requiresPickup" checked={form.conditions.requiresPickup} onChange={e=>setForm({...form, conditions: {...form.conditions, requiresPickup: e.target.checked}})} className="rounded" />
                <label htmlFor="requiresPickup" className="text-sm text-gray-600">Requires Pickup</label>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Status</label>
              <select value={form.status} onChange={e=>setForm({...form, status:e.target.value})} className="w-full px-3 py-2 border rounded">
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="exhausted">Exhausted</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Coverage Radius (m)</label>
              <input type="number" min="100" step="100" value={form.coverageRadius} onChange={e=>setForm({...form, coverageRadius:Number(e.target.value)})} className="w-full px-3 py-2 border rounded" />
            </div>

            {/* Location Capture - Only for first offer if NGO has no location */}
            {(!ngoHasLocation && firstOffer && offers.length === 0) && (
              <div className="border-t pt-3 mt-3">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  📍 Organization Location
                  <span className="block text-xs font-normal text-gray-500 mt-1">
                    This will be saved as your organization's base location
                  </span>
                </label>
                
                {!form.location ? (
                  <button
                    type="button"
                    onClick={getGPSLocation}
                    disabled={locationLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-50 hover:bg-green-100 border-2 border-green-300 text-green-700 rounded-lg disabled:opacity-50"
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
                          <span>Location Captured</span>
                        </div>
                        <p className="text-sm text-gray-600 break-words">
                          {form.location.address}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, location: null })}
                        className="ml-2 text-red-500 hover:text-red-700 text-sm font-medium"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-blue-600 mt-2">
                  ℹ️ After setting this once, it will be used for all future offers
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded">{editing ? 'Save' : 'Create'}</button>
              {editing && <button type="button" onClick={()=>{ setEditing(null); resetForm(); }} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded">Cancel</button>}
            </div>
          </form>
        </div>

        {/* Offers List */}
        <div className="bg-white rounded-xl shadow p-6 md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">My Offers</h2>
            <button onClick={fetchOffers} className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded hover:bg-gray-200"><RefreshCw className="w-4 h-4"/>Refresh</button>
          </div>
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto"></div>
            </div>
          ) : offers.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No offers yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {offers.map(o => (
                <div key={o._id} className="border rounded p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-800">{o.title}</h3>
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">{o.category}</span>
                    </div>
                    <p className="text-sm text-gray-600">{o.description}</p>
                    <p className="text-sm text-gray-700 mt-1">Available: <b>{o.availableQuantity}</b> / Total: <b>{o.totalQuantity}</b> {o.unit || 'units'}</p>
                    <p className="text-xs text-gray-500">Status: {o.status}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={()=>startEdit(o)} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded" title="Edit"><Edit className="w-4 h-4"/></button>
                    <button onClick={()=>toggleStatus(o._id)} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded" title="Toggle">
                      {o.status === 'active' ? <Pause className="w-4 h-4"/> : <Play className="w-4 h-4"/>}
                    </button>
                    <button onClick={()=>removeOffer(o._id)} className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded" title="Delete"><Trash2 className="w-4 h-4"/></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
