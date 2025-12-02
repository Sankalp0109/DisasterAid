import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import { MapPin, Phone, Users, Heart, Send, AlertCircle, ArrowLeft } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const COUNTRY_CODES = [
  { code: '+1', country: 'USA' },
  { code: '+44', country: 'UK' },
  { code: '+91', country: 'India' },
  { code: '+86', country: 'China' },
  { code: '+81', country: 'Japan' },
  { code: '+61', country: 'Australia' },
  { code: '+33', country: 'France' },
  { code: '+49', country: 'Germany' },
  { code: '+55', country: 'Brazil' },
];

export default function RequestForm() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    contact: {
      countryCode: '+91',
      phone: user?.phone || '',
      email: user?.email || '',
      alternateCountryCode: '+91',
      alternateContact: '', // ✅ Add alternate contact field
    },
    location: {
      type: 'Point',
      coordinates: [],
      address: '',
      landmark: '',
      city: '',
      area: '',
      state: '',
      pincode: '',
    },
    needs: {
      rescue: { required: false, urgency: 'medium', details: '' },
      food: { required: false, quantity: 0, details: '' },
      water: { required: false, quantity: 0, details: '' },
      medical: { required: false, urgency: 'medium', details: '' },
      shelter: { required: false, details: '' },
      transport: { required: false, details: '' },
    },
    beneficiaries: {
      adults: 1,
      children: 0,
      elderly: 0,
      infants: 0,
    },
    specialNeeds: {
      medicalConditions: [],
      disabilities: [],
      pregnant: false,
      pets: {
        has: false,
        count: 0,
        type: []
      },
    },
    description: '',
    selfDeclaredUrgency: 'medium',
    deviceInfo: {
      batteryLevel: 100,
      signalStrength: 'good',
    },
  });

  useEffect(() => {
    // Get current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setFormData(prev => ({
          ...prev,
          location: {
            ...prev.location,
            coordinates: [position.coords.longitude, position.coords.latitude],
          },
        }));
      });
    }

    // Get battery level
    if (navigator.getBattery) {
      navigator.getBattery().then((battery) => {
        setFormData(prev => ({
          ...prev,
          deviceInfo: {
            ...prev.deviceInfo,
            batteryLevel: Math.round(battery.level * 100),
          },
        }));
      });
    }
  }, []);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // ✅ Send country code and phone SEPARATELY (don't combine)
      const payload = {
        // ✅ INCLUDE CONTACT INFO (country code, phone & email)
        submitterContact: {
          countryCode: formData.contact.countryCode,
          phone: formData.contact.phone,
          email: formData.contact.email,
          alternateCountryCode: formData.contact.alternateCountryCode,
          alternateContact: formData.contact.alternateContact || '',
        },
        location: formData.location,
        needs: formData.needs,
        beneficiaries: formData.beneficiaries,
        specialNeeds: formData.specialNeeds,
        selfDeclaredUrgency: formData.selfDeclaredUrgency,
        description: formData.description || '',
        deviceInfo: formData.deviceInfo,
      };

      console.log('📝 Sending Request with separate country code and phone:');
      console.log('   Country Code:', formData.contact.countryCode);
      console.log('   Phone:', formData.contact.phone);
      console.log('   Email:', formData.contact.email);
      console.log('   Alternate Country Code:', formData.contact.alternateCountryCode);
      console.log('   Alternate Contact:', formData.contact.alternateContact);
      console.log('Payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post(`${API_URL}/requests`, payload, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.data.success) {
        alert('Request submitted successfully!');
        navigate('/victim/dashboard');
      }
    } catch (error) {
      console.error('Submit error:', error);
      console.error('Error details:', error.response?.data);
      alert('Error: ' + (error.response?.data?.error || error.response?.data?.message || 'Failed to submit request'));
    } finally {
      setLoading(false);
    }
  };

  const updateNeeds = (need, field, value) => {
    setFormData(prev => ({
      ...prev,
      needs: {
        ...prev.needs,
        [need]: {
          ...prev.needs[need],
          [field]: value,
        },
      },
    }));
  };

  // ✅ Handle evidence file uploads
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => step === 1 ? navigate('/victim/dashboard') : setStep(step - 1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Emergency Request</h1>
              <p className="text-gray-600">Fill in the details to get help</p>
            </div>
          </div>
          
          {/* Progress Steps */}
          <div className="flex items-center justify-between mt-6">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                  step >= s ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {s}
                </div>
                {s < 4 && (
                  <div className={`flex-1 h-1 mx-2 ${step > s ? 'bg-blue-500' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Contact & Location */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Contact Information
              </h2>
              <div className="space-y-4">
                {/* Main Phone Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={formData.contact.countryCode}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        contact: { ...prev.contact, countryCode: e.target.value }
                      }))}
                      className="w-28 px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                    >
                      {COUNTRY_CODES.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.code} {item.country}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      placeholder="Phone Number"
                      value={formData.contact.phone}
                      onChange={(e) => {
                        let phoneValue = e.target.value.replace(/\D/g, ''); // Extract only digits
                        
                        // Remove country code prefix if user accidentally included it
                        const ccDigits = formData.contact.countryCode.replace('+', ''); // e.g., '91'
                        if (phoneValue.startsWith(ccDigits) && phoneValue.length > ccDigits.length) {
                          phoneValue = phoneValue.substring(ccDigits.length); // Remove CC prefix
                        }
                        
                        setFormData(prev => ({
                          ...prev,
                          contact: { ...prev.contact, phone: phoneValue }
                        }));
                      }}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">📍 Full: {formData.contact.countryCode}{formData.contact.phone}</p>
                </div>

                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={formData.contact.email}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    contact: { ...prev.contact, email: e.target.value }
                  }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                
                {/* Alternate Contact Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Alternate Contact (optional)
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={formData.contact.alternateCountryCode}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        contact: { ...prev.contact, alternateCountryCode: e.target.value }
                      }))}
                      className="w-28 px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                    >
                      {COUNTRY_CODES.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.code} {item.country}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      placeholder="Alternate Contact"
                      value={formData.contact.alternateContact}
                      onChange={(e) => {
                        let phoneValue = e.target.value.replace(/\D/g, ''); // Extract only digits
                        
                        // Remove country code prefix if user accidentally included it
                        const ccDigits = formData.contact.alternateCountryCode.replace('+', ''); // e.g., '91'
                        if (phoneValue.startsWith(ccDigits) && phoneValue.length > ccDigits.length) {
                          phoneValue = phoneValue.substring(ccDigits.length); // Remove CC prefix
                        }
                        
                        setFormData(prev => ({
                          ...prev,
                          contact: { ...prev.contact, alternateContact: phoneValue }
                        }));
                      }}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  {formData.contact.alternateContact && (
                    <p className="text-xs text-gray-500 mt-1">📍 Full: {formData.contact.alternateCountryCode}{formData.contact.alternateContact}</p>
                  )}
                </div>
                
                <p className="text-xs text-gray-500">📱 All contact information will be stored and used to reach you</p>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Location
              </h2>
              <div className="space-y-4">
                {/* Address - Required */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Enter complete address"
                    value={formData.location.address}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      location: { ...prev.location, address: e.target.value }
                    }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">📍 Full street address or location description</p>
                </div>

                {/* Landmark */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Landmark (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g., Near Hospital, Market Gate, Police Station"
                    value={formData.location.landmark}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      location: { ...prev.location, landmark: e.target.value }
                    }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* City and Area - 2 columns */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">City/Town (optional)</label>
                    <input
                      type="text"
                      placeholder="City"
                      value={formData.location.city}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        location: { ...prev.location, city: e.target.value }
                      }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Area/District (optional)</label>
                    <input
                      type="text"
                      placeholder="Area"
                      value={formData.location.area}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        location: { ...prev.location, area: e.target.value }
                      }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Pin Code and State - 2 columns */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Pin Code (optional)</label>
                    <input
                      type="text"
                      placeholder="Pin Code"
                      value={formData.location.pincode}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        location: { ...prev.location, pincode: e.target.value }
                      }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">State (optional)</label>
                    <input
                      type="text"
                      placeholder="State"
                      value={formData.location.state}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        location: { ...prev.location, state: e.target.value }
                      }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* GPS Status */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  {formData.location.coordinates.length > 0 ? (
                    <p className="text-sm text-green-700">
                      ✅ GPS Location captured: ({formData.location.coordinates[1]?.toFixed(4)}, {formData.location.coordinates[0]?.toFixed(4)})
                    </p>
                  ) : (
                    <p className="text-sm text-orange-700">
                      ⏳ GPS not yet captured. Fill address manually and continue.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Next
            </button>
          </div>
        )}

        {/* Step 2: Needs */}
        {step === 2 && (
          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              What do you need?
            </h2>

            {/* Rescue */}
            <div className="border border-gray-200 rounded-lg p-4">
              <label className="flex items-center mb-3">
                <input
                  type="checkbox"
                  checked={formData.needs.rescue.required}
                  onChange={(e) => updateNeeds('rescue', 'required', e.target.checked)}
                  className="w-5 h-5 text-blue-500 rounded"
                />
                <span className="ml-3 font-semibold text-gray-800">Rescue</span>
              </label>
              {formData.needs.rescue.required && (
                <div className="space-y-3 ml-8">
                  <select
                    value={formData.needs.rescue.urgency}
                    onChange={(e) => updateNeeds('rescue', 'urgency', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                  <textarea
                    placeholder="Details..."
                    value={formData.needs.rescue.details}
                    onChange={(e) => updateNeeds('rescue', 'details', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    rows="2"
                  />
                </div>
              )}
            </div>

            {/* Food */}
            <div className="border border-gray-200 rounded-lg p-4">
              <label className="flex items-center mb-3">
                <input
                  type="checkbox"
                  checked={formData.needs.food.required}
                  onChange={(e) => updateNeeds('food', 'required', e.target.checked)}
                  className="w-5 h-5 text-blue-500 rounded"
                />
                <span className="ml-3 font-semibold text-gray-800">Food</span>
              </label>
              {formData.needs.food.required && (
                <div className="ml-8">
                  <input
                    type="number"
                    placeholder="Number of meals"
                    value={formData.needs.food.quantity}
                    onChange={(e) => updateNeeds('food', 'quantity', parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              )}
            </div>

            {/* Water */}
            <div className="border border-gray-200 rounded-lg p-4">
              <label className="flex items-center mb-3">
                <input
                  type="checkbox"
                  checked={formData.needs.water.required}
                  onChange={(e) => updateNeeds('water', 'required', e.target.checked)}
                  className="w-5 h-5 text-blue-500 rounded"
                />
                <span className="ml-3 font-semibold text-gray-800">Water</span>
              </label>
              {formData.needs.water.required && (
                <div className="ml-8">
                  <input
                    type="number"
                    placeholder="Liters needed"
                    value={formData.needs.water.quantity}
                    onChange={(e) => updateNeeds('water', 'quantity', parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              )}
            </div>

            {/* Medical */}
            <div className="border border-gray-200 rounded-lg p-4">
              <label className="flex items-center mb-3">
                <input
                  type="checkbox"
                  checked={formData.needs.medical.required}
                  onChange={(e) => updateNeeds('medical', 'required', e.target.checked)}
                  className="w-5 h-5 text-blue-500 rounded"
                />
                <span className="ml-3 font-semibold text-gray-800">Medical</span>
              </label>
              {formData.needs.medical.required && (
                <div className="space-y-3 ml-8">
                  <select
                    value={formData.needs.medical.urgency}
                    onChange={(e) => updateNeeds('medical', 'urgency', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                  <textarea
                    placeholder="Medical details..."
                    value={formData.needs.medical.details}
                    onChange={(e) => updateNeeds('medical', 'details', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    rows="2"
                  />
                </div>
              )}
            </div>

            {/* Shelter & Transport */}
            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center border border-gray-200 rounded-lg p-4">
                <input
                  type="checkbox"
                  checked={formData.needs.shelter.required}
                  onChange={(e) => updateNeeds('shelter', 'required', e.target.checked)}
                  className="w-5 h-5 text-blue-500 rounded"
                />
                <span className="ml-3 font-semibold text-gray-800">Shelter</span>
              </label>
              <label className="flex items-center border border-gray-200 rounded-lg p-4">
                <input
                  type="checkbox"
                  checked={formData.needs.transport.required}
                  onChange={(e) => updateNeeds('transport', 'required', e.target.checked)}
                  className="w-5 h-5 text-blue-500 rounded"
                />
                <span className="ml-3 font-semibold text-gray-800">Transport</span>
              </label>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setStep(1)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Beneficiaries */}
        {step === 3 && (
          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              How many people need help?
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Adults</label>
                <input
                  type="number"
                  min="0"
                  value={formData.beneficiaries.adults}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    beneficiaries: { ...prev.beneficiaries, adults: parseInt(e.target.value) || 0 }
                  }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Children</label>
                <input
                  type="number"
                  min="0"
                  value={formData.beneficiaries.children}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    beneficiaries: { ...prev.beneficiaries, children: parseInt(e.target.value) || 0 }
                  }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Elderly</label>
                <input
                  type="number"
                  min="0"
                  value={formData.beneficiaries.elderly}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    beneficiaries: { ...prev.beneficiaries, elderly: parseInt(e.target.value) || 0 }
                  }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Infants</label>
                <input
                  type="number"
                  min="0"
                  value={formData.beneficiaries.infants}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    beneficiaries: { ...prev.beneficiaries, infants: parseInt(e.target.value) || 0 }
                  }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-blue-800 font-semibold">
                Total: {formData.beneficiaries.adults + formData.beneficiaries.children + formData.beneficiaries.elderly + formData.beneficiaries.infants} people
              </p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setStep(2)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Special Needs & Submit */}
        {step === 4 && (
          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Heart className="w-5 h-5" />
              Special Needs & Urgency
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Urgency Level</label>
              <select
                value={formData.selfDeclaredUrgency}
                onChange={(e) => setFormData(prev => ({ ...prev, selfDeclaredUrgency: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Describe Your Situation</label>
              <textarea
                placeholder="Tell us what happened and what help you need. Mention keywords like: help, emergency, urgent, trapped, etc."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows="4"
              />
              <p className="text-xs text-gray-500 mt-1">💡 System will detect emergency keywords to prioritize your request</p>
            </div>

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.specialNeeds.pregnant}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    specialNeeds: { ...prev.specialNeeds, pregnant: e.target.checked }
                  }))}
                  className="w-5 h-5 text-blue-500 rounded"
                />
                <span className="ml-3 text-gray-800">Pregnant woman present</span>
              </label>
            </div>

            <div>
              <label className="flex items-center mb-3">
                <input
                  type="checkbox"
                  checked={formData.specialNeeds.pets.has}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    specialNeeds: {
                      ...prev.specialNeeds,
                      pets: { ...prev.specialNeeds.pets, has: e.target.checked }
                    }
                  }))}
                  className="w-5 h-5 text-blue-500 rounded"
                />
                <span className="ml-3 text-gray-800">Have pets</span>
              </label>
              {formData.specialNeeds.pets.has && (
                <input
                  type="number"
                  placeholder="Number of pets"
                  value={formData.specialNeeds.pets.count}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    specialNeeds: {
                      ...prev.specialNeeds,
                      pets: { ...prev.specialNeeds.pets, count: parseInt(e.target.value) || 0 }
                    }
                  }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg ml-8"
                />
              )}
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setStep(3)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center"
              >
                {loading ? (
                  <span>Submitting...</span>
                ) : (
                  <>
                    <Send className="w-5 h-5 mr-2" />
                    Submit Request
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
