/**
 * Utility script to sync all existing users to Algolia
 * Run this once after setting up Algolia to index all existing users
 */

import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from '../types';
import { algoliaService } from '../services/algoliaService';

export const syncAllUsersToAlgolia = async (organizationId?: string) => {
  try {
    console.log('🚀 Starting Algolia sync for existing users...');
    console.log('🔧 Checking Algolia configuration...');
    
    // Check if Algolia is configured
    const isConfigured = algoliaService.isConfigured();
    console.log('📌 Algolia configured status:', isConfigured);
    
    if (!isConfigured) {
      console.error('❌ Algolia is not configured. Please set up your API keys first.');
      console.error('💡 Make sure you have set REACT_APP_ALGOLIA_APP_ID and REACT_APP_ALGOLIA_SEARCH_KEY in your .env.local file');
      return false;
    }
    
    // Fetch all users from Firestore
    console.log('📊 Fetching users from Firestore...');
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    const users: User[] = [];
    snapshot.forEach((doc) => {
      const userData = { id: doc.id, ...doc.data() } as User;
      
      // If organizationId is provided, only sync users from that organization
      if (organizationId) {
        const userOrgId = userData.roles?.[0]?.organizationId;
        if (userOrgId === organizationId) {
          users.push(userData);
        }
      } else {
        users.push(userData);
      }
    });
    
    console.log(`📋 Found ${users.length} users to sync`);
    
    if (users.length === 0) {
      console.log('ℹ️ No users to sync');
      return true;
    }
    
    // Convert users to Algolia format
    const algoliaRecords = users.map(user => 
      algoliaService.formatUserForAlgolia(user)
    );
    
    // Clear existing index (optional - comment out if you want to keep existing data)
    // console.log('🗑️ Clearing existing Algolia index...');
    // await algoliaService.clearIndex();
    
    // Sync users to Algolia in batches
    console.log('📤 Syncing users to Algolia...');
    await algoliaService.saveUsers(algoliaRecords);
    
    console.log('✅ Successfully synced all users to Algolia!');
    console.log(`📊 Total users synced: ${users.length}`);
    
    return true;
  } catch (error) {
    console.error('❌ Error syncing users to Algolia:', error);
    if (error instanceof Error) {
      console.error('📝 Error details:', error.message);
      if (error.message.includes('Admin API Key')) {
        console.error('🔑 Admin API Key issue detected!');
        console.error('💡 Make sure REACT_APP_ALGOLIA_ADMIN_KEY is set in your .env.local file');
        console.error('💡 After adding the key, restart your development server (npm start)');
      }
    }
    throw error; // Re-throw to show in UI
  }
};

// Function to sync a single organization's users
export const syncOrganizationUsersToAlgolia = async (organizationId: string) => {
  return syncAllUsersToAlgolia(organizationId);
};

// Function to be called from browser console for manual sync
(window as any).syncUsersToAlgolia = async (organizationId?: string) => {
  console.log('='.repeat(50));
  console.log('ALGOLIA SYNC UTILITY');
  console.log('='.repeat(50));
  
  if (!organizationId) {
    console.log('Syncing ALL users from ALL organizations...');
    console.log('To sync only one organization, pass the organizationId as parameter');
    console.log('Example: syncUsersToAlgolia("org123")');
  } else {
    console.log(`Syncing users from organization: ${organizationId}`);
  }
  
  console.log('');
  const result = await syncAllUsersToAlgolia(organizationId);
  
  if (result) {
    console.log('');
    console.log('🎉 Sync completed successfully!');
    console.log('Your users are now searchable via Algolia');
  } else {
    console.log('');
    console.log('⚠️ Sync failed. Please check the errors above.');
  }
  
  console.log('='.repeat(50));
};

// Export for use in components
export default syncAllUsersToAlgolia;