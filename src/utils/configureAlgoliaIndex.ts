/**
 * Utility to configure Algolia index settings
 * Run this once to set up proper faceting for filtering
 */

import algoliasearch from 'algoliasearch';

export const configureAlgoliaIndex = async () => {
  
  const APP_ID = process.env.REACT_APP_ALGOLIA_APP_ID;
  const ADMIN_KEY = process.env.REACT_APP_ALGOLIA_ADMIN_KEY;
  const INDEX_NAME = process.env.REACT_APP_ALGOLIA_USERS_INDEX || 'users';
  
  if (!APP_ID || !ADMIN_KEY) {
    console.error('❌ Missing Algolia credentials');
    return false;
  }
  
  try {
    const client = algoliasearch(APP_ID, ADMIN_KEY);
    const index = client.initIndex(INDEX_NAME);
    
    
    const settings = {
      searchableAttributes: [
        'name',
        'email', 
        'phone',
        '_searchableText',
        'academyNames'
      ],
      attributesForFaceting: [
        'filterOnly(organizationId)',
        'roles',  // Changed: not filterOnly so it can be used in faceted search
        'academies',  // Changed: not filterOnly so it can be used in faceted search
        'filterOnly(status)',
        'filterOnly(hasPlayerRole)',
        'filterOnly(hasCoachRole)',
        'filterOnly(hasGuardianRole)',
        'filterOnly(hasAdminRole)',
        'filterOnly(hasOwnerRole)',
        'filterOnly(hasAcademies)'  // Filter for organization-wide users
      ],
      customRanking: [
        'desc(updatedAt)',
        'asc(name)'
      ]
    };
    
    await index.setSettings(settings);
    
    
    // Verify the settings were applied
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const currentSettings = await index.getSettings();
    
    
    return true;
  } catch (error) {
    console.error('❌ Error configuring index:', error);
    return false;
  }
};

// Make it available in browser console
(window as any).configureAlgoliaIndex = configureAlgoliaIndex;

export default configureAlgoliaIndex;