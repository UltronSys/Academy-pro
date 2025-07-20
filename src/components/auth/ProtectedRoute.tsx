import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { ResourceType, PermissionAction } from '../../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredResource?: ResourceType;
  requiredAction?: PermissionAction;
  fallbackPath?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredResource, 
  requiredAction,
  fallbackPath = '/dashboard'
}) => {
  const { currentUser, loading: authLoading, userData } = useAuth();
  const { loading: permissionsLoading, hasPermission } = usePermissions();
  const [hasAccess, setHasAccess] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const checkAccess = async () => {
      if (!requiredResource || !requiredAction) {
        setHasAccess(true);
        return;
      }

      const allowed = await hasPermission(requiredResource, requiredAction);
      setHasAccess(allowed);
    };

    if (!authLoading && !permissionsLoading && currentUser) {
      checkAccess();
    }
  }, [authLoading, permissionsLoading, currentUser, requiredResource, requiredAction, hasPermission]);

  if (authLoading || permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // If permission check is still pending, show loading
  if (hasAccess === null && requiredResource && requiredAction) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // If user doesn't have required permission, redirect to fallback or show access denied
  if (hasAccess === false) {
    if (fallbackPath) {
      return <Navigate to={fallbackPath} replace />;
    }
    
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-secondary-900 mb-2">Access Denied</h2>
          <p className="text-secondary-600">You don't have permission to access this page.</p>
          <button
            onClick={() => window.history.back()}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;