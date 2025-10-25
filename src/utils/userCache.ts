/**
 * User Cache Utility
 * Manages localStorage caching of newly created users for faster retrieval
 * while waiting for Algolia to sync
 */

import { User } from '../types';

const CACHE_KEY = 'academy_pro_user_cache';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

interface CachedUser {
  user: User;
  timestamp: number;
  synced: boolean;
}

interface UserCache {
  [userId: string]: CachedUser;
}

/**
 * Get all cached users from localStorage
 */
export const getCachedUsers = (organizationId: string): User[] => {
  try {
    const cacheData = localStorage.getItem(CACHE_KEY);
    if (!cacheData) return [];

    const cache: UserCache = JSON.parse(cacheData);
    const now = Date.now();
    const validUsers: User[] = [];

    // Filter out expired or synced users, and only return users from the current organization
    Object.entries(cache).forEach(([userId, cachedUser]) => {
      const isExpired = now - cachedUser.timestamp > CACHE_EXPIRY_MS;
      const belongsToOrg = cachedUser.user.roles.some(
        role => role.organizationId === organizationId
      );

      if (!isExpired && !cachedUser.synced && belongsToOrg) {
        validUsers.push(cachedUser.user);
      }
    });

    return validUsers;
  } catch (error) {
    console.error('Error reading user cache:', error);
    return [];
  }
};

/**
 * Add a newly created user to localStorage cache
 */
export const addUserToCache = (user: User): void => {
  try {
    const cacheData = localStorage.getItem(CACHE_KEY);
    const cache: UserCache = cacheData ? JSON.parse(cacheData) : {};

    // Add new user to cache
    cache[user.id] = {
      user,
      timestamp: Date.now(),
      synced: false
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    console.log('✅ User added to localStorage cache:', user.id);
  } catch (error) {
    console.error('Error adding user to cache:', error);
  }
};

/**
 * Mark a user as synced with Algolia (can be removed from cache)
 */
export const markUserAsSynced = (userId: string): void => {
  try {
    const cacheData = localStorage.getItem(CACHE_KEY);
    if (!cacheData) return;

    const cache: UserCache = JSON.parse(cacheData);

    if (cache[userId]) {
      cache[userId].synced = true;
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      console.log('✅ User marked as synced in cache:', userId);
    }
  } catch (error) {
    console.error('Error marking user as synced:', error);
  }
};

/**
 * Remove a specific user from cache
 */
export const removeUserFromCache = (userId: string): void => {
  try {
    const cacheData = localStorage.getItem(CACHE_KEY);
    if (!cacheData) return;

    const cache: UserCache = JSON.parse(cacheData);
    delete cache[userId];

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    console.log('✅ User removed from cache:', userId);
  } catch (error) {
    console.error('Error removing user from cache:', error);
  }
};

/**
 * Clean up expired and synced users from cache
 */
export const cleanupUserCache = (): void => {
  try {
    const cacheData = localStorage.getItem(CACHE_KEY);
    if (!cacheData) return;

    const cache: UserCache = JSON.parse(cacheData);
    const now = Date.now();
    let cleanedCount = 0;

    Object.entries(cache).forEach(([userId, cachedUser]) => {
      const isExpired = now - cachedUser.timestamp > CACHE_EXPIRY_MS;

      // Remove if expired or already synced
      if (isExpired || cachedUser.synced) {
        delete cache[userId];
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      console.log(`🧹 Cleaned up ${cleanedCount} user(s) from cache`);
    }
  } catch (error) {
    console.error('Error cleaning up user cache:', error);
  }
};

/**
 * Clear all cached users (useful for logout or organization switch)
 */
export const clearUserCache = (): void => {
  try {
    localStorage.removeItem(CACHE_KEY);
    console.log('🧹 User cache cleared');
  } catch (error) {
    console.error('Error clearing user cache:', error);
  }
};

/**
 * Check if a user exists in cache
 */
export const isUserInCache = (userId: string): boolean => {
  try {
    const cacheData = localStorage.getItem(CACHE_KEY);
    if (!cacheData) return false;

    const cache: UserCache = JSON.parse(cacheData);
    return cache[userId] !== undefined && !cache[userId].synced;
  } catch (error) {
    console.error('Error checking user cache:', error);
    return false;
  }
};
