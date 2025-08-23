// Algolia configuration
// You need to get these from your Algolia dashboard: https://www.algolia.com/dashboard

export const ALGOLIA_CONFIG = {
  // Direct values for testing (temporarily bypassing env vars)
  APP_ID: process.env.REACT_APP_ALGOLIA_APP_ID || '4TMKVBBDAJ',
  
  // Replace with your Search-Only API Key (safe for frontend)
  SEARCH_API_KEY: process.env.REACT_APP_ALGOLIA_SEARCH_KEY || 'db1ffc6e110922966cc2a9d098cf3ef4',
  
  // Replace with your Admin API Key (NEVER expose this on frontend)
  // This should only be used in backend/cloud functions
  ADMIN_API_KEY: process.env.REACT_APP_ALGOLIA_ADMIN_KEY || '7d52ffb05e0c9a6c2d3775f75f63c073',
  
  // Index names
  INDICES: {
    USERS: process.env.REACT_APP_ALGOLIA_USERS_INDEX || 'users',
    PLAYERS: process.env.REACT_APP_ALGOLIA_PLAYERS_INDEX || 'players',
    TRANSACTIONS: process.env.REACT_APP_ALGOLIA_TRANSACTIONS_INDEX || 'transactions',
  }
};

// Validate configuration
export const validateAlgoliaConfig = () => {
  
  const missingKeys = [];
  
  // Since we hardcoded fallback values, this should never fail now
  if (!ALGOLIA_CONFIG.APP_ID || ALGOLIA_CONFIG.APP_ID === 'YOUR_APP_ID') {
    missingKeys.push('REACT_APP_ALGOLIA_APP_ID');
  }
  
  if (!ALGOLIA_CONFIG.SEARCH_API_KEY || ALGOLIA_CONFIG.SEARCH_API_KEY === 'YOUR_SEARCH_KEY') {
    missingKeys.push('REACT_APP_ALGOLIA_SEARCH_KEY');
  }
  
  if (missingKeys.length > 0) {
    console.error('❌ Algolia config validation failed!');
    console.error('Missing keys:', missingKeys);
    return false;
  }
  
  return true;
};