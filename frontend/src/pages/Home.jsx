import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, Heart, Shield, Users, LogOut } from 'lucide-react';

export default function Home() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getDashboardRoute = () => {
    switch (user?.role) {
      case 'victim':
        return '/victim/dashboard';
      case 'ngo':
        return '/ngo/dashboard';
      case 'authority':
        return '/authority/dashboard';
      case 'operator':
        return '/operator/dashboard';
      case 'admin':
        return '/admin/dashboard';
      default:
        return '/';
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-800">DisasterAid</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-800">{user?.name}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-800 mb-4">
            Welcome to DisasterAid
          </h2>
          <p className="text-xl text-gray-600">
            Crisis Relief Coordination Platform
          </p>
        </div>

        {/* Role-specific dashboard link */}
        <div className="max-w-2xl mx-auto mb-12">
          <button
            onClick={() => navigate(getDashboardRoute())}
            className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold py-6 px-8 rounded-2xl shadow-xl transform transition-all hover:scale-105"
          >
            <div className="flex items-center gap-3">
              {user?.role === 'victim' && <AlertCircle className="w-8 h-8" />}
              {user?.role === 'ngo' && <Heart className="w-8 h-8" />}
              {user?.role === 'operator' && <Shield className="w-8 h-8" />}
              {(user?.role === 'authority' || user?.role === 'admin') && <Shield className="w-8 h-8" />}
              <span className="text-2xl">Go to Dashboard</span>
            </div>
          </button>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              Emergency Requests
            </h3>
            <p className="text-gray-600 text-sm">
              Submit and track emergency assistance requests in real-time
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Heart className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              NGO Coordination
            </h3>
            <p className="text-gray-600 text-sm">
              Manage offers and respond to requests efficiently
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              Authority Dashboard
            </h3>
            <p className="text-gray-600 text-sm">
              Monitor crisis load and strategize resource deployment
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              Smart Matching
            </h3>
            <p className="text-gray-600 text-sm">
              Automatic clustering and intelligent NGO matching
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-yellow-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              Admin Controls
            </h3>
            <p className="text-gray-600 text-sm">
              System administration and data management
            </p>
          </div>
        </div>

        {/* Quick Stats
        {(user?.role === 'authority' || user?.role === 'operator') && (
          <div className="mt-12 bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">
              System Overview
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">-</p>
                <p className="text-sm text-gray-600">Active Requests</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-red-600">-</p>
                <p className="text-sm text-gray-600">SoS Alerts</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">-</p>
                <p className="text-sm text-gray-600">Active Assignments</p>
              </div>
            </div>
          </div>
        )} */}
      </div>
    </div>
  );
}
