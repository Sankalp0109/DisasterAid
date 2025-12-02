import { useState, useEffect } from 'react';
import { Phone, SendIcon, TrendingUp, Loader, AlertCircle } from 'lucide-react';
import { useSms } from '../hooks/useSms';

export default function SmsHistory({ phoneNumber, requestId, limit = 10 }) {
  const { smsHistory, fetchSmsHistory, loading, error } = useSms();
  const [expandedIndex, setExpandedIndex] = useState(null);

  useEffect(() => {
    const filter = {};
    if (phoneNumber) filter.phoneNumber = phoneNumber;
    if (requestId) filter.requestId = requestId;
    if (limit) filter.limit = limit;

    fetchSmsHistory(filter);
  }, [phoneNumber, requestId, limit, fetchSmsHistory]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-800">Error loading SMS history</p>
          <p className="text-sm text-red-700 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!smsHistory || smsHistory.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
        <Phone className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 font-medium">No SMS history yet</p>
        <p className="text-sm text-gray-500 mt-1">SMS messages will appear here</p>
      </div>
    );
  }

  const outboundCount = smsHistory.filter(s => s.direction === 'outbound').length;
  const inboundCount = smsHistory.filter(s => s.direction === 'inbound').length;
  const deliveredCount = smsHistory.filter(s => s.status === 'delivered').length;

  return (
    <div className="space-y-4">
      {/* Statistics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-600 font-semibold">Total SMS</p>
          <p className="text-2xl font-bold text-blue-700">{smsHistory.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs text-green-600 font-semibold">Sent</p>
          <p className="text-2xl font-bold text-green-700">{outboundCount}</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
          <p className="text-xs text-purple-600 font-semibold">Received</p>
          <p className="text-2xl font-bold text-purple-700">{inboundCount}</p>
        </div>
      </div>

      {/* SMS Messages */}
      <div className="space-y-2">
        {smsHistory.map((sms, index) => (
          <div
            key={sms._id || index}
            onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
            className={`border rounded-lg p-4 cursor-pointer transition-all ${
              sms.direction === 'outbound'
                ? 'bg-green-50 border-green-200 hover:border-green-300'
                : 'bg-blue-50 border-blue-200 hover:border-blue-300'
            }`}
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {sms.direction === 'outbound' ? (
                    <>
                      <SendIcon className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-semibold text-green-800">Sent</span>
                    </>
                  ) : (
                    <>
                      <Phone className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-semibold text-blue-800">Received</span>
                    </>
                  )}

                  {/* Status Badge */}
                  <span
                    className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${
                      sms.status === 'delivered'
                        ? 'bg-green-100 text-green-800'
                        : sms.status === 'sent'
                        ? 'bg-blue-100 text-blue-800'
                        : sms.status === 'failed'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {sms.status || 'pending'}
                  </span>
                </div>

                {/* Phone Number */}
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">📱</span> {sms.phoneNumber}
                </p>

                {/* Timestamp */}
                <p className="text-xs text-gray-600 mt-1">
                  {new Date(sms.createdAt).toLocaleString()}
                </p>
              </div>

              {/* Expand Indicator */}
              <div
                className={`transition-transform ${expandedIndex === index ? 'rotate-180' : ''}`}
              >
                ▼
              </div>
            </div>

            {/* Message Preview (always visible) */}
            <div className="mt-2 p-2 bg-white bg-opacity-50 rounded">
              <p className="text-sm text-gray-800 line-clamp-2">{sms.message}</p>
            </div>

            {/* Expanded Details */}
            {expandedIndex === index && (
              <div className="mt-3 pt-3 border-t border-current border-opacity-10 space-y-2">
                {/* Full Message */}
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">Message:</p>
                  <div className="bg-white rounded p-2 border">
                    <p className="text-sm text-gray-800 break-words">{sms.message}</p>
                  </div>
                </div>

                {/* Message ID */}
                {sms.messageId && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">Message ID:</p>
                    <p className="text-xs text-gray-600 font-mono bg-white rounded p-2 border">{sms.messageId}</p>
                  </div>
                )}

                {/* Delivery Status */}
                {sms.deliveredAt && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">✅ Delivered:</p>
                    <p className="text-xs text-gray-600">{new Date(sms.deliveredAt).toLocaleString()}</p>
                  </div>
                )}

                {/* Request ID */}
                {sms.requestId && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">Request ID:</p>
                    <p className="text-xs text-gray-600 font-mono bg-white rounded p-2 border">{sms.requestId}</p>
                  </div>
                )}

                {/* User ID */}
                {sms.userId && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">Sent By:</p>
                    <p className="text-xs text-gray-600 font-mono">{sms.userId}</p>
                  </div>
                )}

                {/* Additional Info */}
                {sms.status === 'failed' && sms.errorMessage && (
                  <div className="bg-red-100 rounded p-2 border border-red-300">
                    <p className="text-xs font-semibold text-red-800 mb-1">Error:</p>
                    <p className="text-xs text-red-700">{sms.errorMessage}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination Info */}
      <div className="text-center text-xs text-gray-600 pt-4 border-t">
        Showing {Math.min(limit, smsHistory.length)} of {smsHistory.length} messages
      </div>
    </div>
  );
}
