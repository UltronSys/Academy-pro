import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { Settings } from '../types';

interface SettingsContextType {
  organizationSettings: Settings | null;
  loading: boolean;
  refreshSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettingsContext = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettingsContext must be used within a SettingsProvider');
  }
  return context;
};

interface SettingsProviderProps {
  children: ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const { currentUser, userData } = useAuth();
  const [organizationSettings, setOrganizationSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    // Reset when user logs out
    if (!currentUser || !userData) {
      setOrganizationSettings(null);
      setLoading(false);
      return;
    }

    // Get the organization ID from user's first role
    const organizationId = userData.roles?.[0]?.organizationId;

    if (!organizationId) {
      setOrganizationSettings(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Set up real-time listener for organization settings
    const settingsDocRef = doc(db, 'settings', organizationId);

    const unsubscribe = onSnapshot(
      settingsDocRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const settings = {
            id: docSnapshot.id,
            ...docSnapshot.data()
          } as Settings;

          console.log('📋 Settings loaded from listener:', settings);
          setOrganizationSettings(settings);
        } else {
          console.log('⚠️ No settings document found for organization:', organizationId);
          setOrganizationSettings(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('❌ Error listening to settings:', error);
        setOrganizationSettings(null);
        setLoading(false);
      }
    );

    // Cleanup listener on unmount or when dependencies change
    return () => {
      unsubscribe();
    };
  }, [currentUser, userData, refreshTrigger]);

  const refreshSettings = () => {
    console.log('🔄 Manually refreshing settings...');
    setRefreshTrigger(prev => prev + 1);
  };

  const value: SettingsContextType = {
    organizationSettings,
    loading,
    refreshSettings
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};
