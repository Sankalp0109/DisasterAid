import { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import {
  MapPin,
  Clock,
  Package,
  CheckCircle,
  AlertCircle,
  User,
  Phone,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function RequestTracking({ request, assignments }) {
  const { socket } = useSocket();
  const [expandedAssignment, setExpandedAssignment] = useState(null);

  useEffect(() => {
    if (socket && request._id) {
      // Listen for this request's assignment updates
      socket.on(`request:${request._id}:assignment-update`, (data) => {
        console.log('📍 Received real-time assignment update:', data);
      });

      return () => {
        socket.off(`request:${request._id}:assignment-update`);
      };
    }
  }, [socket, request._id]);

  const getStatusIcon = (status) => {
    const icons = {
      pending: <AlertCircle className="w-5 h-5 text-yellow-500" />,
      new: <AlertCircle className="w-5 h-5 text-yellow-500" />,
      accepted: <CheckCircle className="w-5 h-5 text-blue-500" />,
      'in-progress': <Package className="w-5 h-5 text-purple-500 animate-pulse" />,
      'en-route': <TrendingUp className="w-5 h-5 text-blue-500" />,
      arrived: <MapPin className="w-5 h-5 text-orange-500" />,
      completed: <CheckCircle className="w-5 h-5 text-green-500" />,
      fulfilled: <CheckCircle className="w-5 h-5 text-green-600" />,
    };
    return icons[status] || <AlertCircle className="w-5 h-5 text-gray-500" />;
  };

  const getStatusLabel = (status) => {
    const labels = {
      pending: '⏳ Pending Assignment',
      new: '🆕 New',
      accepted: '✅ Accepted by NGO',
      'in-progress': '🚚 In Progress',
      'en-route': '🗺️ En-Route',
      arrived: '📍 Arrived',
      completed: '✅ Completed',
      fulfilled: '🎉 Fulfilled',
    };
    return labels[status] || status;
  };

  const getStatusBadgeColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      new: 'bg-yellow-100 text-yellow-800',
      accepted: 'bg-blue-100 text-blue-800',
      'in-progress': 'bg-purple-100 text-purple-800',
      'en-route': 'bg-blue-100 text-blue-800',
      arrived: 'bg-orange-100 text-orange-800',
      completed: 'bg-green-100 text-green-800',
      fulfilled: 'bg-green-100 text-green-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (!assignments || assignments.length === 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-blue-800 text-sm flex items-center gap-2">
          <Clock className="w-4 h-4" />
          ⏳ Waiting for NGO assignment...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <MapPin className="w-5 h-5 text-blue-600" />
        📍 Tracking & Updates
      </h3>

      {assignments.map((assignment, idx) => (
        <div key={assignment._id} className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow bg-white">
          {/* Main tracking card */}
          <div
            onClick={() =>
              setExpandedAssignment(
                expandedAssignment === assignment._id ? null : assignment._id
              )
            }
            className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {/* Status and Badge */}
                <div className="flex items-center gap-3 mb-3">
                  {getStatusIcon(assignment.status)}
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeColor(assignment.status)}`}>
                    {getStatusLabel(assignment.status)}
                  </span>
                  {idx > 0 && (
                    <span className="text-xs text-gray-500">Assignment {idx + 1}</span>
                  )}
                </div>

                {/* Category and Details */}
                <div className="mb-2">
                  <p className="text-sm font-medium text-gray-800">
                    {assignment.category} • Qty: {assignment.quantity}
                  </p>
                </div>

                {/* NGO Information */}
                {assignment.assignedTo && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                    <User className="w-4 h-4 flex-shrink-0" />
                    <span>
                      {typeof assignment.assignedTo === 'string'
                        ? 'NGO assigned'
                        : assignment.assignedTo.name || 'NGO'}
                    </span>
                  </div>
                )}

                {/* Timeline Summary */}
                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                  {assignment.createdAt && (
                    <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded">
                      <Clock className="w-3 h-3" />
                      <span>
                        {new Date(assignment.createdAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  )}
                  {assignment.actualArrival && (
                    <div className="flex items-center gap-1 bg-orange-50 px-2 py-1 rounded">
                      <MapPin className="w-3 h-3" />
                      <span>Arrived</span>
                    </div>
                  )}
                  {assignment.actualCompletion && (
                    <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded">
                      <CheckCircle className="w-3 h-3" />
                      <span>Delivered</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Expand Button */}
              <div className="flex flex-col items-end gap-2">
                <div className="text-xs text-gray-500 text-right">
                  <p>Last update:</p>
                  <p className="font-medium text-gray-700">
                    {new Date(assignment.updatedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                {expandedAssignment === assignment._id ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </div>
          </div>

          {/* Expanded Details */}
          {expandedAssignment === assignment._id && (
            <div className="border-t bg-gray-50 p-4 space-y-4">
              {/* Timeline History */}
              {assignment.timeline && assignment.timeline.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    📅 Timeline History
                  </p>
                  <div className="space-y-2 relative pl-4 border-l-2 border-blue-300">
                    {assignment.timeline.map((entry, i) => (
                      <div key={i} className="relative -ml-4">
                        <div className="w-3 h-3 bg-blue-500 rounded-full absolute left-0.5 top-1.5"></div>
                        <div className="ml-4">
                          <p className="text-xs font-semibold text-gray-800 capitalize">
                            {entry.status}
                          </p>
                          <p className="text-xs text-gray-600">
                            {new Date(entry.timestamp).toLocaleString()}
                          </p>
                          {entry.notes && (
                            <p className="text-xs text-gray-700 italic mt-0.5">
                              💬 {entry.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Delivery Proof */}
              {assignment.fulfillmentDetails &&
                assignment.fulfillmentDetails.photos &&
                assignment.fulfillmentDetails.photos.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      📸 Delivery Proof
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {assignment.fulfillmentDetails.photos.map((photo, i) => (
                        <div key={i} className="relative bg-gray-200 rounded border">
                          <img
                            src={photo}
                            alt={`Proof ${i + 1}`}
                            className="w-full h-24 object-cover rounded"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Items Delivered */}
              {assignment.itemsFulfilled &&
                assignment.itemsFulfilled.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      📦 Items Delivered
                    </p>
                    <div className="bg-white border rounded p-2 space-y-1">
                      {assignment.itemsFulfilled.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-xs text-gray-700"
                        >
                          <span className="font-medium">{item.itemType}</span>
                          <span className="flex items-center gap-2">
                            <span className="text-gray-600">
                              {item.delivered}/{item.requested}
                            </span>
                            {item.fulfilled ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-yellow-600" />
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* NGO Contact */}
              {assignment.assignedTo && (
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    📞 NGO Contact
                  </p>
                  {typeof assignment.assignedTo === 'string' ? (
                    <p className="text-xs text-gray-600">NGO ID: {assignment.assignedTo}</p>
                  ) : (
                    <div className="bg-white border rounded p-3 space-y-2 text-xs text-gray-600">
                      <p>
                        <span className="font-medium">Name:</span>{' '}
                        {assignment.assignedTo.name}
                      </p>
                      {assignment.assignedTo.phone && (
                        <p className="flex items-center gap-2">
                          <Phone className="w-3 h-3" />
                          <a
                            href={`tel:${assignment.assignedTo.phone}`}
                            className="text-blue-600 hover:underline"
                          >
                            {assignment.assignedTo.phone}
                          </a>
                        </p>
                      )}
                      {assignment.assignedTo.location && (
                        <p className="flex items-center gap-2">
                          <MapPin className="w-3 h-3" />
                          {assignment.assignedTo.location.address ||
                            `${assignment.assignedTo.location.coordinates[1]}, ${assignment.assignedTo.location.coordinates[0]}`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Fulfillment Details */}
              {assignment.fulfillmentDetails && (
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-2">
                    ✅ Fulfillment Details
                  </p>
                  <div className="bg-white border rounded p-3 space-y-2 text-xs text-gray-600">
                    {assignment.fulfillmentDetails.deliveredAt && (
                      <p>
                        <span className="font-medium">Delivered At:</span>{' '}
                        {new Date(
                          assignment.fulfillmentDetails.deliveredAt
                        ).toLocaleString()}
                      </p>
                    )}
                    {assignment.fulfillmentDetails.notes && (
                      <p>
                        <span className="font-medium">Notes:</span>{' '}
                        {assignment.fulfillmentDetails.notes}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
