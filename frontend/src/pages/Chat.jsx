import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, ArrowLeft } from 'lucide-react';

export default function Chat() {
  const { requestId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <MessageSquare className="w-8 h-8 text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Chat</h1>
            <p className="text-sm text-gray-500">Request ID: {requestId.slice(-8)}</p>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-md p-12 text-center">
          <MessageSquare className="w-16 h-16 text-blue-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            Chat Interface - Coming Soon
          </h2>
          <p className="text-gray-600 mb-6">
            Real-time messaging between victims and responders.
          </p>
          <div className="text-sm text-gray-500">
            <p>Features to be implemented:</p>
            <ul className="mt-2 space-y-1">
              <li>• Real-time messaging</li>
              <li>• Typing indicators</li>
              <li>• Message history</li>
              <li>• File upload</li>
              <li>• Request details sidebar</li>
            </ul>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="mt-6 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
