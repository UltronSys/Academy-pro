/**
 * Utility script to sync all existing players to Algolia
 * Run this once after setting up Algolia to index all existing players
 */

import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Player, User } from '../types';
import { algoliaService, AlgoliaPlayerRecord } from '../services/algoliaService';

// Helper to get user by ID
const getUserById = async (userId: string): Promise<User | null> => {
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      return { id: userSnap.id, ...userSnap.data() } as User;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching user ${userId}:`, error);
    return null;
  }
};

// Configure players index settings
const configurePlayersIndex = async () => {
  try {
    const algoliasearch = (await import('algoliasearch')).default;
    const { ALGOLIA_CONFIG } = await import('../config/algolia');

    if (!ALGOLIA_CONFIG.ADMIN_API_KEY || ALGOLIA_CONFIG.ADMIN_API_KEY === 'YOUR_ADMIN_KEY') {
      console.warn('⚠️ Admin API key not available, skipping index configuration');
      console.warn('💡 To configure the index, set REACT_APP_ALGOLIA_ADMIN_KEY in your .env.local file');
      console.warn('💡 You can still sync data if the index facets are already configured in Algolia dashboard');
      return;
    }

    const client = algoliasearch(ALGOLIA_CONFIG.APP_ID, ALGOLIA_CONFIG.ADMIN_API_KEY);
    const index = client.initIndex(ALGOLIA_CONFIG.INDICES.PLAYERS);

    console.log('⚙️ Configuring players index settings...');
    console.log('📌 Index name:', ALGOLIA_CONFIG.INDICES.PLAYERS);

    await index.setSettings({
      searchableAttributes: [
        'userName',
        'userEmail',
        'userPhone',
        '_searchableText'
      ],
      attributesForFaceting: [
        'filterOnly(organizationId)',
        'filterOnly(academyId)',
        'filterOnly(status)',
        'filterOnly(guardianId)'
      ],
      attributesToRetrieve: [
        'objectID',
        'userId',
        'userName',
        'userEmail',
        'userPhone',
        'userPhotoURL',
        'organizationId',
        'academyId',
        'academyNames',
        'guardianId',
        'guardianNames',
        'linkedProducts',
        'status',
        'createdAt',
        'updatedAt'
      ],
      customRanking: ['asc(userName)'],
      hitsPerPage: 20
    });

    console.log('✅ Players index configured successfully');
    console.log('📌 Configured facets: organizationId, academyId, status, guardianId');
  } catch (error) {
    console.error('Error configuring players index:', error);
    if (error instanceof Error) {
      console.error('💡 Error message:', error.message);
      if (error.message.includes('Invalid Application-ID')) {
        console.error('💡 Check that REACT_APP_ALGOLIA_APP_ID is correct in your .env.local');
      }
      if (error.message.includes('Invalid API key')) {
        console.error('💡 Check that REACT_APP_ALGOLIA_ADMIN_KEY is correct in your .env.local');
      }
    }
  }
};

export const syncAllPlayersToAlgolia = async (organizationId?: string) => {
  try {
    console.log('🚀 Starting Algolia sync for existing players...');
    console.log('🔧 Checking Algolia configuration...');

    // Check if Algolia is configured
    const isConfigured = algoliaService.isConfigured();
    console.log('📌 Algolia configured status:', isConfigured);

    if (!isConfigured) {
      console.error('❌ Algolia is not configured. Please set up your API keys first.');
      console.error('💡 Make sure you have set REACT_APP_ALGOLIA_APP_ID and REACT_APP_ALGOLIA_SEARCH_KEY in your .env.local file');
      return false;
    }

    // Configure index settings first (IMPORTANT: do this before syncing data)
    console.log('⚙️ Configuring players index (this may take a moment)...');
    await configurePlayersIndex();
    console.log('✅ Index configuration complete');

    // Fetch all players from Firestore
    console.log('📊 Fetching players from Firestore...');
    const playersRef = collection(db, 'players');
    const snapshot = await getDocs(playersRef);

    const players: Player[] = [];
    snapshot.forEach((doc) => {
      const playerData = { id: doc.id, ...doc.data() } as Player;

      // If organizationId is provided, only sync players from that organization
      if (organizationId) {
        if (playerData.organizationId === organizationId) {
          players.push(playerData);
        }
      } else {
        players.push(playerData);
      }
    });

    console.log(`📋 Found ${players.length} players to sync`);

    if (players.length === 0) {
      console.log('ℹ️ No players to sync');
      return true;
    }

    // Collect all unique user IDs to batch fetch user data
    const userIds = new Set(players.map(p => p.userId));
    const guardianIds = new Set(players.flatMap(p => p.guardianId || []));

    console.log(`📤 Loading user data for ${userIds.size} players and ${guardianIds.size} guardians...`);

    // Fetch all users
    const usersMap = new Map<string, User>();
    const allUserIds = [...Array.from(userIds), ...Array.from(guardianIds)];

    for (const userId of allUserIds) {
      const user = await getUserById(userId);
      if (user) {
        usersMap.set(userId, user);
      }
    }

    console.log(`✅ Loaded ${usersMap.size} user records`);

    // Convert players to Algolia format
    const algoliaRecords: AlgoliaPlayerRecord[] = [];

    for (const player of players) {
      const user = usersMap.get(player.userId);
      const guardianNames = (player.guardianId || [])
        .map(gId => usersMap.get(gId)?.name)
        .filter(Boolean) as string[];

      const record = algoliaService.formatPlayerForAlgolia(
        player,
        user ? {
          name: user.name,
          email: user.email,
          phone: user.phone,
          photoURL: user.photoURL
        } : undefined,
        undefined, // academyNames - could be loaded if needed
        guardianNames
      );

      algoliaRecords.push(record);
    }

    // Sync players to Algolia in batches
    console.log('📤 Syncing players to Algolia...');
    await algoliaService.savePlayers(algoliaRecords);

    console.log('✅ Successfully synced all players to Algolia!');
    console.log(`📊 Total players synced: ${players.length}`);

    return true;
  } catch (error) {
    console.error('❌ Error syncing players to Algolia:', error);
    if (error instanceof Error) {
      console.error('📝 Error details:', error.message);
      if (error.message.includes('Admin API Key')) {
        console.error('🔑 Admin API Key issue detected!');
        console.error('💡 Make sure REACT_APP_ALGOLIA_ADMIN_KEY is set in your .env.local file');
        console.error('💡 After adding the key, restart your development server (npm start)');
      }
    }
    throw error;
  }
};

// Function to sync a single organization's players
export const syncOrganizationPlayersToAlgolia = async (organizationId: string) => {
  return syncAllPlayersToAlgolia(organizationId);
};

// Function to be called from browser console for manual sync
(window as any).syncPlayersToAlgolia = async (organizationId?: string) => {
  console.log('='.repeat(50));
  console.log('ALGOLIA PLAYERS SYNC UTILITY');
  console.log('='.repeat(50));

  if (!organizationId) {
    console.log('Syncing ALL players from ALL organizations...');
    console.log('To sync only one organization, pass the organizationId as parameter');
    console.log('Example: syncPlayersToAlgolia("org123")');
  } else {
    console.log(`Syncing players from organization: ${organizationId}`);
  }

  console.log('');
  const result = await syncAllPlayersToAlgolia(organizationId);

  if (result) {
    console.log('');
    console.log('🎉 Sync completed successfully!');
    console.log('Your players are now searchable via Algolia');
  } else {
    console.log('');
    console.log('⚠️ Sync failed. Please check the errors above.');
  }

  console.log('='.repeat(50));
};

// Export for use in components
export default syncAllPlayersToAlgolia;
