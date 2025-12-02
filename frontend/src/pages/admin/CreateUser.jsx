import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, MapPin, Loader, Copy, Check } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function CreateUser() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    countryCode: '+91',
    phone: '',
    role: 'authority',
    organizationName: '',
    ngoLocation: null,
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [copiedField, setCopiedField] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData({ ...formData, password });
  };

  const getGPSLocation = () => {
    setLocationLoading(true);
    setError('');

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
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
          
          setFormData({
            ...formData,
            ngoLocation: {
              lat: latitude,
              lng: longitude,
              address: address
            }
          });
        } catch (err) {
          setFormData({
            ...formData,
            ngoLocation: {
              lat: latitude,
              lng: longitude,
              address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
            }
          });
        }
        
        setLocationLoading(false);
      },
      (error) => {
        console.error('GPS Error:', error);
        setError(`Location error: ${error.message}`);
        setLocationLoading(false);
      }
    );
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(null);

    if (!formData.password) {
      setError('Please set a password or generate one');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/admin/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(data);
        // Reset form
        setFormData({
          name: '',
          email: '',
          password: '',
          countryCode: '+91',
          phone: '',
          role: 'authority',
          organizationName: '',
          ngoLocation: null,
        });
      } else {
        setError(data.message || 'Failed to create user');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 py-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/admin/dashboard')}
            className="text-blue-600 hover:text-blue-700 mb-4"
          >
            ← Back to Dashboard
          </button>
          <div className="flex items-center gap-3 mb-2">
            <UserPlus className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-800">Create New User</h1>
          </div>
          <p className="text-gray-600">Create accounts for NGOs, Authorities, Operators, or Admins</p>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-6 bg-green-50 border-2 border-green-300 rounded-lg p-6">
            <h3 className="text-lg font-bold text-green-800 mb-3">✅ User Created Successfully!</h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Name</p>
                <p className="text-lg text-gray-900">{success.user.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Role</p>
                <p className="text-lg text-gray-900 uppercase">{success.user.role}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Login Credentials</p>
                <div className="bg-white p-4 rounded border border-green-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Email:</span>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">{success.credentials.email}</code>
                      <button
                        onClick={() => copyToClipboard(success.credentials.email, 'email')}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        {copiedField === 'email' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Password:</span>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">{success.credentials.temporaryPassword}</code>
                      <button
                        onClick={() => copyToClipboard(success.credentials.temporaryPassword, 'password')}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        {copiedField === 'password' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-amber-700 mt-2">⚠️ Save these credentials! Provide them to the user via secure channel.</p>
              </div>
            </div>
            <button
              onClick={() => setSuccess(null)}
              className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Create Another User
            </button>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Form */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Role Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                User Role <span className="text-red-500">*</span>
              </label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="authority">Authority (Control Room Staff)</option>
                <option value="operator">Operator (Dispatch/Triage)</option>
                <option value="ngo">NGO/Volunteer Organization</option>
                <option value="admin">Platform Administrator</option>
              </select>
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="user@example.com"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter or generate password"
                />
                <button
                  type="button"
                  onClick={generatePassword}
                  className="px-4 py-3 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-sm font-medium"
                >
                  Generate
                </button>
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone (Optional)
              </label>
              <div className="flex gap-2">
                <select
                  name="countryCode"
                  value={formData.countryCode}
                  onChange={handleChange}
                  className="w-24 px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="+1">+1</option>
                  <option value="+44">+44</option>
                  <option value="+91">+91</option>
                  <option value="+86">+86</option>
                </select>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="9876543210"
                />
              </div>
            </div>

            {/* NGO-specific fields */}
            {formData.role === 'ngo' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Organization Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="organizationName"
                    value={formData.organizationName}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Red Cross Mumbai"
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    📍 <strong>Note:</strong> NGO location will be captured when creating their first offer/resource listing.
                  </p>
                </div>
              </>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating User...' : 'Create User Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
