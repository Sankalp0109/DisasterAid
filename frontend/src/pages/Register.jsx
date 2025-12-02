import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, MapPin, Loader } from 'lucide-react';

export default function Register() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    countryCode: '+91',
    phone: '',
    role: 'victim',
    organizationName: '',
    ngoLocation: null, // { lat, lng, address }
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
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
        
        // Reverse geocode to get address
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
          // Fallback to coordinates only
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
        setError(`Location error: ${error.message}. Please enter address manually.`);
        setLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    setLoading(true);

    // Send country code and phone separately (don't combine)
    const submitData = {
      name: formData.name,
      email: formData.email,
      password: formData.password,
      countryCode: formData.countryCode,
      phone: formData.phone,
      role: formData.role,
      organizationName: formData.organizationName,
      ngoLocation: formData.ngoLocation
    };

    const result = await register(submitData);

    if (result.success) {
      // Redirect based on role
      if (formData.role === 'victim') navigate('/victim/dashboard');
      else if (formData.role === 'ngo') navigate('/ngo/dashboard');
      else if (formData.role === 'authority') navigate('/authority/dashboard');
      else if (formData.role === 'operator') navigate('/operator/dashboard');
      else if (formData.role === 'admin') navigate('/admin/dashboard');
      else navigate('/');
    } else {
      // Enhanced error message for restricted roles
      if (result.message.includes('cannot self-register') || result.message.includes('Contact system administrator')) {
        setError(
          `${result.message}\n\n` +
          `To create an ${formData.role} account:\n` +
          `1. Ask your system administrator to run: node backend/scripts/createAuthorityUser.js\n` +
          `2. Or use the seed script: node backend/scripts/seedDatabase.js --purge\n` +
          `3. Login with: ${formData.role}@test.com / password`
        );
      } else {
        setError(result.message);
      }
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-12">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <AlertCircle className="w-12 h-12 text-red-500" />
          </div>
          <h1 className="text-4xl font-bold text-gray-800 mb-2">DisasterAid</h1>
          <p className="text-gray-600">Create your account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <pre className="whitespace-pre-wrap font-sans">{error}</pre>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone
              </label>
              <div className="flex gap-2">
                <select
                  name="countryCode"
                  value={formData.countryCode || '+91'}
                  onChange={(e) => setFormData({ ...formData, countryCode: e.target.value })}
                  className="w-24 px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                >
                  <option value="+1">+1 (USA)</option>
                  <option value="+44">+44 (UK)</option>
                  <option value="+91">+91 (India)</option>
                  <option value="+86">+86 (China)</option>
                  <option value="+81">+81 (Japan)</option>
                  <option value="+61">+61 (Australia)</option>
                  <option value="+33">+33 (France)</option>
                  <option value="+49">+49 (Germany)</option>
                  <option value="+55">+55 (Brazil)</option>
                </select>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={(e) => {
                    let phoneValue = e.target.value.replace(/\D/g, ''); // Extract only digits
                    
                    // Remove country code prefix if user accidentally included it
                    // E.g., if they enter 919876543210, remove the 91 prefix
                    const ccDigits = formData.countryCode.replace('+', ''); // e.g., '91'
                    if (phoneValue.startsWith(ccDigits) && phoneValue.length > ccDigits.length) {
                      phoneValue = phoneValue.substring(ccDigits.length); // Remove CC prefix
                    }
                    
                    setFormData({ ...formData, phone: phoneValue });
                  }}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="9876543210"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">📍 Select country code + enter phone number</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                I am a...
              </label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="victim">Victim/Reporter (Self-Registration)</option>
              </select>
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800">
                  <strong>ℹ️ For NGO, Authority, Operator, or Admin accounts:</strong>
                  <br />
                  These accounts must be created by the Platform Administrator for security and verification purposes. 
                  If you need such an account, please contact your system administrator who will create your credentials and provide you with login details.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-500 hover:text-blue-600 font-semibold">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
