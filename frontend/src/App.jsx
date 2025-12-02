import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import ErrorBoundary from './components/ErrorBoundary';
import Loading from './components/Loading';
import AdvisoriesOverlay from './components/AdvisoriesOverlay';

// Eager load critical pages
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

// Lazy load dashboard pages for code splitting
const CreateUser = lazy(() => import('./pages/admin/CreateUser'));
const VictimDashboard = lazy(() => import('./pages/victim/Dashboard'));
const VictimRequest = lazy(() => import('./pages/victim/RequestForm'));
const NGODashboard = lazy(() => import('./pages/ngo/Dashboard'));
const NGOOffers = lazy(() => import('./pages/ngo/Offers'));
const AuthorityDashboard = lazy(() => import('./pages/authority/Dashboard'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const OperatorDashboard = lazy(() => import('./pages/operator/Dashboard'));
const Chat = lazy(() => import('./pages/Chat'));

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <Loading fullScreen message="Authenticating..." />;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" />;
  }

  return children;
};

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" /> : <Register />} />
      <Route path="/forgot-password" element={user ? <Navigate to="/" /> : <ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />

      {/* Victim Routes */}
      <Route
        path="/victim/dashboard"
        element={
          <ProtectedRoute allowedRoles={['victim']}>
            <Suspense fallback={<Loading fullScreen message="Loading Dashboard..." />}>
              <VictimDashboard />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/victim/request"
        element={
          <ProtectedRoute allowedRoles={['victim']}>
            <Suspense fallback={<Loading fullScreen message="Loading Form..." />}>
              <VictimRequest />
            </Suspense>
          </ProtectedRoute>
        }
      />

      {/* NGO Routes */}
      <Route
        path="/ngo/dashboard"
        element={
          <ProtectedRoute allowedRoles={['ngo']}>
            <Suspense fallback={<Loading fullScreen message="Loading Dashboard..." />}>
              <NGODashboard />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/ngo/offers"
        element={
          <ProtectedRoute allowedRoles={['ngo']}>
            <Suspense fallback={<Loading fullScreen message="Loading Offers..." />}>
              <NGOOffers />
            </Suspense>
          </ProtectedRoute>
        }
      />

      {/* Authority Routes */}
      <Route
        path="/authority/dashboard"
        element={
          <ProtectedRoute allowedRoles={['authority','admin']}>
            <Suspense fallback={<Loading fullScreen message="Loading Dashboard..." />}>
              <AuthorityDashboard />
            </Suspense>
          </ProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Suspense fallback={<Loading fullScreen message="Loading Admin Dashboard..." />}>
              <AdminDashboard />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/create-user"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Suspense fallback={<Loading fullScreen message="Loading..." />}>
              <CreateUser />
            </Suspense>
          </ProtectedRoute>
        }
      />

      {/* Operator Routes */}
      <Route
        path="/operator/dashboard"
        element={
          <ProtectedRoute allowedRoles={['operator', 'authority', 'admin']}>
            <Suspense fallback={<Loading fullScreen message="Loading Operator Dashboard..." />}>
              <OperatorDashboard />
            </Suspense>
          </ProtectedRoute>
        }
      />

      {/* Chat Route */}
      <Route
        path="/chat/:requestId"
        element={
          <ProtectedRoute>
            <Suspense fallback={<Loading fullScreen message="Loading Chat..." />}>
              <Chat />
            </Suspense>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SocketProvider>
          <Router>
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
              <AppRoutes />
              <AdvisoriesOverlay />
            </div>
          </Router>
        </SocketProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
