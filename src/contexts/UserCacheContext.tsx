import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { useAuth } from './AuthContext';

interface CachedUser {
  user: User;
  timestamp: number;
  synced: boolean;
}

interface UserCacheContextType {
  cachedUsers: User[];
  addUserToCache: (user: User) => void;
  markUserAsSynced: (userId: string) => void;
  removeUserFromCache: (userId: string) => void;
  clearCache: () => void;
  isUserInCache: (userId: string) => boolean;
}

const UserCacheContext = createContext<UserCacheContextType | undefined>(undefined);

export const useUserCache = () => {
  const context = useContext(UserCacheContext);
  if (context === undefined) {
    throw new Error('useUserCache must be used within a UserCacheProvider');
  }
  return context;
};

const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export const UserCacheProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userData } = useAuth();
  const [cache, setCache] = useState<Record<string, CachedUser>>({});

  // Get current organization ID
  const organizationId = userData?.roles?.[0]?.organizationId;

  // Cleanup expired and synced users periodically
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      setCache(prevCache => {
        const now = Date.now();
        const cleaned = { ...prevCache };
        let cleanedCount = 0;

        Object.entries(cleaned).forEach(([userId, cachedUser]) => {
          const isExpired = now - cachedUser.timestamp > CACHE_EXPIRY_MS;
          if (isExpired || cachedUser.synced) {
            delete cleaned[userId];
            cleanedCount++;
          }
        });

        if (cleanedCount > 0) {
          console.log(`🧹 Cleaned up ${cleanedCount} user(s) from cache`);
        }

        return cleaned;
      });
    }, 60000); // Run cleanup every minute

    return () => clearInterval(cleanupInterval);
  }, []);

  // Clear cache when organization changes
  useEffect(() => {
    setCache({});
    console.log('🧹 Cache cleared due to organization change');
  }, [organizationId]);

  // Get cached users for current organization (excluding expired and synced)
  const cachedUsers = React.useMemo(() => {
    if (!organizationId) return [];

    const now = Date.now();
    const validUsers: User[] = [];

    Object.entries(cache).forEach(([_, cachedUser]) => {
      const isExpired = now - cachedUser.timestamp > CACHE_EXPIRY_MS;
      const belongsToOrg = cachedUser.user.roles.some(
        role => role.organizationId === organizationId
      );

      if (!isExpired && !cachedUser.synced && belongsToOrg) {
        validUsers.push(cachedUser.user);
      }
    });

    return validUsers;
  }, [cache, organizationId]);

  // Add or update a user in cache (for newly created or edited users)
  const addUserToCache = useCallback((user: User) => {
    setCache(prevCache => ({
      ...prevCache,
      [user.id]: {
        user,
        timestamp: Date.now(),
        synced: false
      }
    }));
    console.log('✅ User added/updated in context cache:', user.id);
  }, []);

  // Mark a user as synced with Algolia
  const markUserAsSynced = useCallback((userId: string) => {
    setCache(prevCache => {
      if (!prevCache[userId]) return prevCache;

      return {
        ...prevCache,
        [userId]: {
          ...prevCache[userId],
          synced: true
        }
      };
    });
    console.log('✅ User marked as synced in cache:', userId);
  }, []);

  // Remove a specific user from cache
  const removeUserFromCache = useCallback((userId: string) => {
    setCache(prevCache => {
      const newCache = { ...prevCache };
      delete newCache[userId];
      console.log('✅ User removed from cache:', userId);
      return newCache;
    });
  }, []);

  // Clear all cached users
  const clearCache = useCallback(() => {
    setCache({});
    console.log('🧹 User cache cleared');
  }, []);

  // Check if a user exists in cache
  const isUserInCache = useCallback((userId: string): boolean => {
    return cache[userId] !== undefined && !cache[userId].synced;
  }, [cache]);

  const value = {
    cachedUsers,
    addUserToCache,
    markUserAsSynced,
    removeUserFromCache,
    clearCache,
    isUserInCache,
  };

  return (
    <UserCacheContext.Provider value={value}>
      {children}
    </UserCacheContext.Provider>
  );
};
