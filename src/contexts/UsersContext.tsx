import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { useAuth } from './AuthContext';
import { useApp } from './AppContext';
import { searchUsers as searchUsersAlgolia } from '../services/algoliaService';

interface UsersContextType {
  users: User[];
  loading: boolean;
  error: string | null;
  addUser: (user: User) => void;
  updateUser: (user: User) => void;
  removeUser: (userId: string) => void;
  refreshUsers: () => Promise<void>;
  searchUsers: (query: string, roleFilter?: string, page?: number) => Promise<void>;
  totalPages: number;
  totalUsers: number;
  currentPage: number;
}

const UsersContext = createContext<UsersContextType | undefined>(undefined);

export const useUsers = () => {
  const context = useContext(UsersContext);
  if (context === undefined) {
    throw new Error('useUsers must be used within a UsersProvider');
  }
  return context;
};

export const UsersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userData } = useAuth();
  const { selectedAcademy } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);

  const organizationId = userData?.roles?.[0]?.organizationId;
  const academyId = selectedAcademy?.id;

  // Load users from Algolia on mount or when organization/academy changes
  useEffect(() => {
    if (organizationId) {
      loadUsers();
    } else {
      setUsers([]);
    }
  }, [organizationId, academyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadUsers = async () => {
    if (!organizationId) return;

    try {
      setLoading(true);
      setError(null);

      const filters: any = {};
      if (academyId) {
        filters.academyId = academyId;
      }

      console.log('🔍 Loading users with filters:', { organizationId, academyId, filters });

      const results = await searchUsersAlgolia({
        query: '',
        organizationId,
        filters,
        page: 0,
        hitsPerPage: 1000 // Load all users at once
      });

      const algoliaUsers = results.users.map(record => ({
        id: record.objectID,
        name: record.name || '',
        email: record.email || '',
        phone: record.phone || '',
        roles: record.roleDetails || [],
        photoURL: record.photoURL,
        balance: 0,
        outstandingBalance: {},
        availableCredits: {},
        createdAt: record.createdAt ? {
          toDate: () => new Date(record.createdAt!),
          seconds: Math.floor((record.createdAt || 0) / 1000),
          nanoseconds: 0,
          toMillis: () => record.createdAt || 0,
          isEqual: () => false,
          toJSON: () => ({ seconds: Math.floor((record.createdAt || 0) / 1000), nanoseconds: 0 })
        } as any : undefined,
        updatedAt: record.updatedAt ? {
          toDate: () => new Date(record.updatedAt!),
          seconds: Math.floor((record.updatedAt || 0) / 1000),
          nanoseconds: 0,
          toMillis: () => record.updatedAt || 0,
          isEqual: () => false,
          toJSON: () => ({ seconds: Math.floor((record.updatedAt || 0) / 1000), nanoseconds: 0 })
        } as any : undefined
      }));

      setUsers(algoliaUsers);
      setTotalPages(results.totalPages);
      setTotalUsers(results.totalUsers);
      setCurrentPage(results.currentPage);
      console.log('✅ Loaded', algoliaUsers.length, 'users from Algolia');
    } catch (err) {
      console.error('Error loading users:', err);
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  // Add a new user to context (optimistic update)
  const addUser = useCallback((user: User) => {
    setUsers(prevUsers => {
      // Check if user already exists
      const exists = prevUsers.some(u => u.id === user.id);
      if (exists) {
        console.log('⚠️ User already exists, updating instead:', user.id);
        return prevUsers.map(u => u.id === user.id ? user : u);
      }
      console.log('✅ Added user to context:', user.id);
      return [user, ...prevUsers]; // Add to beginning
    });
  }, []);

  // Update an existing user in context (optimistic update)
  const updateUser = useCallback((user: User) => {
    setUsers(prevUsers => {
      const updated = prevUsers.map(u => u.id === user.id ? user : u);
      console.log('✅ Updated user in context:', user.id);
      return updated;
    });
  }, []);

  // Remove a user from context (optimistic update)
  const removeUser = useCallback((userId: string) => {
    setUsers(prevUsers => {
      const filtered = prevUsers.filter(u => u.id !== userId);
      console.log('✅ Removed user from context:', userId);
      return filtered;
    });
  }, []);

  // Refresh users from Algolia
  const refreshUsers = useCallback(async () => {
    await loadUsers();
  }, [organizationId, academyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search users (filters the current context, doesn't reload from Algolia)
  const searchUsers = useCallback(async (query: string, roleFilter?: string, page: number = 0) => {
    if (!organizationId) return;

    try {
      setLoading(true);
      setError(null);

      // Build filters
      const filters: any = {};
      if (roleFilter && roleFilter !== 'all') {
        filters.role = roleFilter;
      }
      if (academyId) {
        filters.academyId = academyId;
      }

      const results = await searchUsersAlgolia({
        query,
        organizationId,
        filters,
        page,
        hitsPerPage: 50
      });

      const algoliaUsers = results.users.map(record => ({
        id: record.objectID,
        name: record.name || '',
        email: record.email || '',
        phone: record.phone || '',
        roles: record.roleDetails || [],
        photoURL: record.photoURL,
        balance: 0,
        outstandingBalance: {},
        availableCredits: {},
        createdAt: record.createdAt ? {
          toDate: () => new Date(record.createdAt!),
          seconds: Math.floor((record.createdAt || 0) / 1000),
          nanoseconds: 0,
          toMillis: () => record.createdAt || 0,
          isEqual: () => false,
          toJSON: () => ({ seconds: Math.floor((record.createdAt || 0) / 1000), nanoseconds: 0 })
        } as any : undefined,
        updatedAt: record.updatedAt ? {
          toDate: () => new Date(record.updatedAt!),
          seconds: Math.floor((record.updatedAt || 0) / 1000),
          nanoseconds: 0,
          toMillis: () => record.updatedAt || 0,
          isEqual: () => false,
          toJSON: () => ({ seconds: Math.floor((record.updatedAt || 0) / 1000), nanoseconds: 0 })
        } as any : undefined
      }));

      setUsers(algoliaUsers);
      setTotalPages(results.totalPages);
      setTotalUsers(results.totalUsers);
      setCurrentPage(results.currentPage);
    } catch (err) {
      console.error('Error searching users:', err);
      setError('Failed to search users');
    } finally {
      setLoading(false);
    }
  }, [organizationId, academyId]);

  const value = {
    users,
    loading,
    error,
    addUser,
    updateUser,
    removeUser,
    refreshUsers,
    searchUsers,
    totalPages,
    totalUsers,
    currentPage,
  };

  return (
    <UsersContext.Provider value={value}>
      {children}
    </UsersContext.Provider>
  );
};
