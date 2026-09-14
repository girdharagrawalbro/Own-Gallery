import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/auth';
import { UploadProvider } from './context/UploadContext';
import AlbumDetail from './pages/AlbumDetail';
import Albums from './pages/Albums';
import Favorites from './pages/Favorites';
import Login from './pages/Login';
import MediaGrid from './pages/MediaGrid';
import Register from './pages/Register';
import Search from './pages/Search';
import TrashGrid from './pages/TrashGrid';

const FullPageSpinner = () => (
  <div className="full-page-center">
    <div className="spinner" aria-label="Loading" />
  </div>
);

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PublicOnlyRoute = ({ children }: { children: ReactNode }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullPageSpinner />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
    <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
    <Route
      element={
        <ProtectedRoute>
          <UploadProvider>
            <Layout />
          </UploadProvider>
        </ProtectedRoute>
      }
    >
      <Route path="/" element={<MediaGrid />} />
      <Route path="/favorites" element={<Favorites />} />
      <Route path="/albums" element={<Albums />} />
      <Route path="/albums/:id" element={<AlbumDetail />} />
      <Route path="/search" element={<Search />} />
      <Route path="/trash" element={<TrashGrid />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
