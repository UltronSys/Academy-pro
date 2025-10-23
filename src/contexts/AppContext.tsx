import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { Organization, Academy } from '../types';

interface AppContextType {
  selectedOrganization: Organization | null;
  selectedAcademy: Academy | null;
  organizations: Organization[];
  academies: Academy[];
  loading: boolean;
  setSelectedOrganization: (org: Organization | null) => void;
  setSelectedAcademy: (academy: Academy | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, userData } = useAuth();
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [selectedAcademy, setSelectedAcademy] = useState<Academy | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [loading, setLoading] = useState(true);

  // Set up real-time listener for organizations and academies
  useEffect(() => {
    if (!currentUser || !userData) {
      setOrganizations([]);
      setAcademies([]);
      setSelectedOrganization(null);
      setSelectedAcademy(null);
      setLoading(false);
      return;
    }

    const organizationId = userData.roles?.[0]?.organizationId;

    if (!organizationId) {
      setOrganizations([]);
      setAcademies([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Fetch the organization document
    const fetchOrganization = async () => {
      try {
        const orgDoc = await getDoc(doc(db, 'organizations', organizationId));
        if (orgDoc.exists()) {
          const org = { id: orgDoc.id, ...orgDoc.data() } as Organization;
          setOrganizations([org]);

          // Auto-select organization if not already selected
          if (!selectedOrganization) {
            setSelectedOrganization(org);
          }
        }
      } catch (error) {
        console.error('Error fetching organization:', error);
      }
    };

    fetchOrganization();

    // Set up real-time listener for academies
    const academiesRef = collection(db, 'organizations', organizationId, 'academies');
    const unsubscribe = onSnapshot(
      academiesRef,
      (snapshot) => {
        const academyList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Academy));

        setAcademies(academyList);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to academies:', error);
        setAcademies([]);
        setLoading(false);
      }
    );

    // Cleanup listener on unmount
    return () => {
      unsubscribe();
    };
  }, [currentUser, userData, selectedOrganization]);

  const value = {
    selectedOrganization,
    selectedAcademy,
    organizations,
    academies,
    loading,
    setSelectedOrganization,
    setSelectedAcademy,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};