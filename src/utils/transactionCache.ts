/**
 * Transaction Cache Utility
 * Manages localStorage caching of newly created/updated transactions for instant UI updates
 * while waiting for Algolia to sync
 */

import { Transaction } from '../types';

const CACHE_KEY = 'academy_pro_transaction_cache';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

interface CachedTransaction {
  transaction: Transaction;
  timestamp: number;
  synced: boolean;
  operation: 'add' | 'update' | 'delete';
}

interface TransactionCache {
  [transactionId: string]: CachedTransaction;
}

/**
 * Get all cached transactions from localStorage
 */
export const getCachedTransactions = (organizationId: string): { transaction: Transaction; operation: string }[] => {
  try {
    const cacheData = localStorage.getItem(CACHE_KEY);
    if (!cacheData) return [];

    const cache: TransactionCache = JSON.parse(cacheData);
    const now = Date.now();
    const validTransactions: { transaction: Transaction; operation: string }[] = [];

    // Filter out expired or synced transactions, and only return transactions from the current organization
    Object.entries(cache).forEach(([_transactionId, cachedTransaction]) => {
      const isExpired = now - cachedTransaction.timestamp > CACHE_EXPIRY_MS;
      const belongsToOrg = cachedTransaction.transaction.organizationId === organizationId;

      if (!isExpired && !cachedTransaction.synced && belongsToOrg) {
        validTransactions.push({
          transaction: cachedTransaction.transaction,
          operation: cachedTransaction.operation
        });
      }
    });

    return validTransactions;
  } catch (error) {
    console.error('Error reading transaction cache:', error);
    return [];
  }
};

/**
 * Add a newly created/updated transaction to localStorage cache
 */
export const addTransactionToCache = (transaction: Transaction, operation: 'add' | 'update' | 'delete' = 'add'): void => {
  try {
    const cacheData = localStorage.getItem(CACHE_KEY);
    const cache: TransactionCache = cacheData ? JSON.parse(cacheData) : {};

    // Normalize transaction for localStorage (convert Firestore Timestamps to ISO strings)
    const normalizedTransaction = {
      ...transaction,
      date: transaction.date && typeof transaction.date === 'object' && 'toDate' in transaction.date
        ? (transaction.date as any).toDate().toISOString()
        : transaction.date,
      createdAt: transaction.createdAt && typeof transaction.createdAt === 'object' && 'toDate' in transaction.createdAt
        ? (transaction.createdAt as any).toDate().toISOString()
        : transaction.createdAt,
      updatedAt: transaction.updatedAt && typeof transaction.updatedAt === 'object' && 'toDate' in transaction.updatedAt
        ? (transaction.updatedAt as any).toDate().toISOString()
        : transaction.updatedAt
    };

    // Add transaction to cache
    cache[transaction.id] = {
      transaction: normalizedTransaction as Transaction,
      timestamp: Date.now(),
      synced: false,
      operation
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    console.log(`✅ Transaction ${operation} cached to localStorage:`, transaction.id);
  } catch (error) {
    console.error('Error adding transaction to cache:', error);
  }
};

/**
 * Mark a transaction as synced with Algolia (can be removed from cache)
 */
export const markTransactionAsSynced = (transactionId: string): void => {
  try {
    const cacheData = localStorage.getItem(CACHE_KEY);
    if (!cacheData) return;

    const cache: TransactionCache = JSON.parse(cacheData);

    if (cache[transactionId]) {
      cache[transactionId].synced = true;
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      console.log('✅ Transaction marked as synced in cache:', transactionId);
    }
  } catch (error) {
    console.error('Error marking transaction as synced:', error);
  }
};

/**
 * Remove a specific transaction from cache
 */
export const removeTransactionFromCache = (transactionId: string): void => {
  try {
    const cacheData = localStorage.getItem(CACHE_KEY);
    if (!cacheData) return;

    const cache: TransactionCache = JSON.parse(cacheData);
    delete cache[transactionId];

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    console.log('✅ Transaction removed from cache:', transactionId);
  } catch (error) {
    console.error('Error removing transaction from cache:', error);
  }
};

/**
 * Clean up expired and synced transactions from cache
 */
export const cleanupTransactionCache = (): void => {
  try {
    const cacheData = localStorage.getItem(CACHE_KEY);
    if (!cacheData) return;

    const cache: TransactionCache = JSON.parse(cacheData);
    const now = Date.now();
    let cleanedCount = 0;

    Object.entries(cache).forEach(([transactionId, cachedTransaction]) => {
      const isExpired = now - cachedTransaction.timestamp > CACHE_EXPIRY_MS;

      // Remove if expired or already synced
      if (isExpired || cachedTransaction.synced) {
        delete cache[transactionId];
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      console.log(`🧹 Cleaned up ${cleanedCount} transaction(s) from cache`);
    }
  } catch (error) {
    console.error('Error cleaning up transaction cache:', error);
  }
};

/**
 * Clear all cached transactions (useful for logout or organization switch)
 */
export const clearTransactionCache = (): void => {
  try {
    localStorage.removeItem(CACHE_KEY);
    console.log('🧹 Transaction cache cleared');
  } catch (error) {
    console.error('Error clearing transaction cache:', error);
  }
};

/**
 * Check if a transaction exists in cache
 */
export const isTransactionInCache = (transactionId: string): boolean => {
  try {
    const cacheData = localStorage.getItem(CACHE_KEY);
    if (!cacheData) return false;

    const cache: TransactionCache = JSON.parse(cacheData);
    return cache[transactionId] !== undefined && !cache[transactionId].synced;
  } catch (error) {
    console.error('Error checking transaction cache:', error);
    return false;
  }
};
