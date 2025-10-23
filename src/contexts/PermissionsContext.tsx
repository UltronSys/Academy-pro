import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { RolePermission } from '../types';

interface PermissionsContextType {
  rolePermissions: RolePermission[];
  loading: boolean;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export const usePermissionsContext = () => {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissionsContext must be used within a PermissionsProvider');
  }
  return context;
};

interface PermissionsProviderProps {
  children: ReactNode;
}

export const PermissionsProvider: React.FC<PermissionsProviderProps> = ({ children }) => {
  const { currentUser, userData } = useAuth();
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Reset when user logs out
    if (!currentUser || !userData) {
      setRolePermissions([]);
      setLoading(false);
      return;
    }

    // Get the organization ID from user's first role
    const organizationId = userData.roles?.[0]?.organizationId;

    if (!organizationId) {
      setRolePermissions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Set up real-time listener for rolePermissions
    const rolePermissionsRef = collection(db, 'rolePermissions');
    const q = query(
      rolePermissionsRef,
      where('organizationId', '==', organizationId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const permissions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as RolePermission));

        setRolePermissions(permissions);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to rolePermissions:', error);
        setRolePermissions([]);
        setLoading(false);
      }
    );

    // Cleanup listener on unmount or when dependencies change
    return () => {
      unsubscribe();
    };
  }, [currentUser, userData]);

  const value: PermissionsContextType = {
    rolePermissions,
    loading
  };

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
};
