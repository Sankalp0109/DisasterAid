import { useState } from 'react';
import { X, Send, AlertCircle, CheckCircle, Loader } from 'lucide-react';

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

export default function SmsModal({ isOpen, onClose, onSend, phoneNumber, countryCode: initialCC, recipientName, loading = false }) {
  // ✅ NEW: Accept countryCode as prop
  const defaultPhoneDetails = {
    countryCode: initialCC || '+91',
    phoneNum: phoneNumber || ''
  };
  
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [countryCode, setCountryCode] = useState(defaultPhoneDetails.countryCode);
  const [phoneNum, setPhoneNum] = useState(defaultPhoneDetails.phoneNum);
  const maxChars = 160;

  if (!isOpen) return null;

  const handleSend = async () => {
    setError(null);
    setSuccess(null);

    if (!phoneNum.trim()) {
      setError('Phone number is required');
      return;
    }

    if (!message.trim()) {
      setError('Message cannot be empty');
      return;
    }

    // ✅ Send ONLY phone digits (no country code)
    // Backend will add the country code when sending to Twilio
    const phoneToSend = phoneNum;

    try {
      // Pass phone digits and message to parent
      // Backend will add country code
      await onSend(message, phoneToSend);
      setSuccess('SMS sent successfully!');
      setTimeout(() => {
        setMessage('');
        setPhoneNum('');
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to send SMS');
    }
  };

  const handleClose = () => {
    setMessage('');
    setPhoneNum('');
    setCountryCode('+91');
    setError(null);
    setSuccess(null);
    onClose();
  };

  const charsRemaining = maxChars - message.length;
  const charPercentage = (message.length / maxChars) * 100;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Send SMS</h3>
            <p className="text-sm text-gray-600">To: {recipientName || phoneNumber}</p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Country Code Display */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              🌍 Country Code
            </label>
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
            >
              {COUNTRY_CODES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} - {item.country}
                </option>
              ))}
            </select>
          </div>

          {/* Phone Number Input - Digits Only */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              📱 Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={phoneNum}
              onChange={(e) => setPhoneNum(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter phone number (digits only)"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {phoneNum && (
              <p className="text-xs text-gray-500 mt-1">
                ✅ Country Code: {countryCode} | Phone: {phoneNum}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">Note: Backend will use these separate values</p>
          </div>

          {/* Message Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => {
                const text = e.target.value;
                if (text.length <= maxChars) {
                  setMessage(text);
                }
              }}
              placeholder="Type your message (max 160 characters)..."
              className="w-full h-24 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Character Counter */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Characters:</span>
              <span className={`font-semibold ${charsRemaining < 20 ? 'text-red-600' : 'text-gray-600'}`}>
                {message.length}/{maxChars}
              </span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  charPercentage > 100 ? 'bg-red-500' : charPercentage > 80 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(charPercentage, 100)}%` }}
              />
            </div>
          </div>

          {/* SMS Count Warning */}
          {message.length > 160 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-800">
                Message will be split into {Math.ceil(message.length / 160)} SMS
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-800">{success}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-4 border-t bg-gray-50 rounded-b-lg">
          <button
            onClick={handleClose}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={loading || !message.trim()}
            className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send SMS
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
