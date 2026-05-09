import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getDefaultRoute, isPathAllowed } from './routeUtils';

const AuthSplash = () => (
  <div className="auth-splash">
    <div className="auth-splash__panel">
      <div className="auth-splash__badge">SAP</div>
      <h1>Preparing your workspace</h1>
      <p>Loading company session and menu rights.</p>
    </div>
  </div>
);

export const PublicOnlyRoute = ({ children }) => {
  const { isAuthenticated, defaultRoute } = useAuth();

  if (isAuthenticated) {
    return <Navigate to={defaultRoute} replace />;
  }

  return children;
};

export const RequirePendingSelection = ({ children }) => {
  const { isAuthenticated, hasPendingSelection, defaultRoute } = useAuth();

  if (isAuthenticated) {
    return <Navigate to={defaultRoute} replace />;
  }

  if (!hasPendingSelection) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export const RequireAuth = () => {
  const { isAuthenticated, hasPendingSelection, isBootstrapping, menuPaths } = useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return <AuthSplash />;
  }

  if (!isAuthenticated) {
    if (hasPendingSelection) {
      return <Navigate to="/login" replace />;
    }

    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!isPathAllowed(menuPaths, location.pathname)) {
    return <Navigate to={getDefaultRoute(menuPaths)} replace />;
  }

  return <Outlet />;
};

export const RouteFallback = () => {
  const { isAuthenticated, hasPendingSelection, defaultRoute } = useAuth();

  if (isAuthenticated) {
    return <Navigate to={defaultRoute} replace />;
  }

  if (hasPendingSelection) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to="/login" replace />;
};
