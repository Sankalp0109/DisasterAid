import { useState } from 'react';
import { X, Send, AlertCircle, CheckCircle, Loader, Plus, Trash2 } from 'lucide-react';

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

export default function BulkSmsModal({ isOpen, onClose, onSend, recipients, loading = false }) {
  const [message, setMessage] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState(
    recipients ? recipients.map(r => r._id) : []
  );
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [countryCode, setCountryCode] = useState('+91');
  const [customPhoneNumbers, setCustomPhoneNumbers] = useState('');
  const maxChars = 160;

  if (!isOpen) return null;

  const handleSend = async () => {
    setError(null);
    setSuccess(null);

    if (!message.trim()) {
      setError('Message cannot be empty');
      return;
    }

    if (selectedRecipients.length === 0 && !customPhoneNumbers.trim()) {
      setError('Please select at least one recipient');
      return;
    }

    try {
      // Combine selected recipients with custom phone numbers
      const phoneNumbers = [
        ...selectedRecipients.map(id => {
          const recipient = recipients.find(r => r._id === id);
          return recipient?.phoneNumber || recipient?.phone;
        }),
        ...customPhoneNumbers.split('\n').filter(p => p.trim()).map(num => `${countryCode}${num.replace(/\D/g, '')}`)
      ].filter(Boolean);

      if (phoneNumbers.length === 0) {
        setError('No valid phone numbers found');
        return;
      }

      await onSend(message, phoneNumbers);
      setSuccess(`SMS sent successfully to ${phoneNumbers.length} recipients!`);
      setTimeout(() => {
        setMessage('');
        setSelectedRecipients([]);
        setCustomPhoneNumbers('');
        setCountryCode('+91');
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to send bulk SMS');
    }
  };

  const handleClose = () => {
    setMessage('');
    setSelectedRecipients([]);
    setCustomPhoneNumbers('');
    setError(null);
    setSuccess(null);
    onClose();
  };

  const toggleRecipient = (recipientId) => {
    setSelectedRecipients(prev =>
      prev.includes(recipientId)
        ? prev.filter(id => id !== recipientId)
        : [...prev, recipientId]
      );
  };

  const selectAll = () => {
    if (selectedRecipients.length === recipients?.length) {
      setSelectedRecipients([]);
    } else {
      setSelectedRecipients(recipients?.map(r => r._id) || []);
    }
  };

  const charsRemaining = maxChars - message.length;
  const charPercentage = (message.length / maxChars) * 100;
  const customPhoneCount = customPhoneNumbers.split('\n').filter(p => p.trim()).length;
  const totalRecipients = selectedRecipients.length + customPhoneCount;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Bulk Send SMS</h3>
            <p className="text-sm text-gray-600">Send to multiple recipients</p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Recipients Count */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-900">
              <span className="font-semibold">👥 Recipients Selected:</span> {totalRecipients}
            </p>
          </div>

          {/* Recipients List */}
          {recipients && recipients.length > 0 && (
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-800">Select Recipients</h4>
                <button
                  onClick={selectAll}
                  className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  {selectedRecipients.length === recipients.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto">
                {recipients.map(recipient => (
                  <label key={recipient._id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRecipients.includes(recipient._id)}
                      onChange={() => toggleRecipient(recipient._id)}
                      className="w-4 h-4 text-blue-500 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{recipient.name}</p>
                      <p className="text-xs text-gray-600">{recipient.phoneNumber || recipient.phone}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Custom Phone Numbers */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Add Custom Phone Numbers (Optional)
            </label>
            <div className="space-y-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
              >
                {COUNTRY_CODES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code} {item.country}
                  </option>
                ))}
              </select>
              <textarea
                value={customPhoneNumbers}
                onChange={(e) => setCustomPhoneNumbers(e.target.value)}
                placeholder="Enter phone numbers (one per line)&#10;e.g., 9876543210&#10;9876543211"
                className="w-full h-20 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <p className="text-xs text-gray-500">📍 Country code {countryCode} will be added to all numbers</p>
            </div>
            {customPhoneCount > 0 && (
              <p className="text-xs text-gray-600 mt-1">
                {customPhoneCount} custom phone number{customPhoneCount !== 1 ? 's' : ''} added
              </p>
            )}
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
                Each message will be split into {Math.ceil(message.length / 160)} SMS
              </p>
            </div>
          )}

          {/* Cost Estimate */}
          {totalRecipients > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-sm text-purple-900">
                <span className="font-semibold">💰 Estimate:</span> ~{totalRecipients * Math.ceil(message.length / 160)} SMS credits
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
            disabled={loading || !message.trim() || totalRecipients === 0}
            className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Sending to {totalRecipients}...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send to {totalRecipients}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
