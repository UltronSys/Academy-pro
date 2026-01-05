import algoliasearch from 'algoliasearch';
import { User, UserRole, Player } from '../types';
import { ALGOLIA_CONFIG, validateAlgoliaConfig } from '../config/algolia';

// Algolia record structure for users
export interface AlgoliaUserRecord {
  objectID: string; // User ID
  name: string;
  email?: string;
  phone?: string;
  photoURL?: string; // Profile picture URL
  organizationId: string;
  roles: string[]; // Flattened array of role names
  roleDetails: UserRole[]; // Full role details for filtering
  academies: string[]; // Array of academy IDs
  academyNames?: string[]; // Academy names for display
  status?: string; // Player status if applicable
  createdAt?: number; // Timestamp for sorting
  updatedAt?: number;
  // Searchable attributes
  _searchableText?: string; // Combined searchable text
  // Facets for filtering
  hasPlayerRole?: boolean;
  hasCoachRole?: boolean;
  hasGuardianRole?: boolean;
  hasAdminRole?: boolean;
  hasOwnerRole?: boolean;
}

// Search options interface
export interface SearchOptions {
  query?: string;
  organizationId: string;
  filters?: {
    role?: string;
    academyId?: string;
    status?: string;
  };
  page?: number;
  hitsPerPage?: number;
  sortBy?: 'name_asc' | 'name_desc' | 'date_asc' | 'date_desc';
}

// Search results interface
export interface SearchResults {
  users: AlgoliaUserRecord[];
  totalUsers: number;
  currentPage: number;
  totalPages: number;
  processingTimeMS: number;
}

// Algolia record structure for players
export interface AlgoliaPlayerRecord {
  objectID: string; // Player ID (from players collection)
  userId: string; // Reference to user
  userName: string; // Denormalized for search
  userEmail?: string;
  userPhone?: string;
  userPhotoURL?: string;
  organizationId: string;
  academyId: string[]; // Array of academy IDs
  academyNames?: string[]; // Academy names for display
  guardianId?: string[]; // Array of guardian user IDs
  guardianNames?: string[]; // Guardian names for display
  linkedProducts?: string[]; // Product IDs assigned to player
  status?: string;
  createdAt?: number;
  updatedAt?: number;
  // Searchable text
  _searchableText?: string;
}

// Player search options
export interface PlayerSearchOptions {
  query?: string;
  organizationId: string;
  filters?: {
    academyId?: string;
    status?: string;
    hasGuardian?: boolean;
  };
  page?: number;
  hitsPerPage?: number;
  sortBy?: 'name_asc' | 'name_desc' | 'date_asc' | 'date_desc';
}

// Player search results
export interface PlayerSearchResults {
  players: AlgoliaPlayerRecord[];
  totalPlayers: number;
  currentPage: number;
  totalPages: number;
  processingTimeMS: number;
}

class AlgoliaService {
  private client: any = null;
  private adminClient: any = null; // Client with admin key for write operations
  private usersIndex: any = null;
  private adminUsersIndex: any = null; // Index with write permissions
  private playersIndex: any = null;
  private adminPlayersIndex: any = null; // Players index with write permissions
  private isInitialized: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize() {

    if (!validateAlgoliaConfig()) {
      console.warn('Algolia not configured. Search functionality will be limited.');
      return;
    }

    try {
      // Initialize Algolia client with search-only key (safe for frontend)
      this.client = algoliasearch(
        ALGOLIA_CONFIG.APP_ID,
        ALGOLIA_CONFIG.SEARCH_API_KEY
      );

      // Initialize admin client for write operations (if admin key is available)
      if (ALGOLIA_CONFIG.ADMIN_API_KEY && ALGOLIA_CONFIG.ADMIN_API_KEY !== 'YOUR_ADMIN_KEY') {
        this.adminClient = algoliasearch(
          ALGOLIA_CONFIG.APP_ID,
          ALGOLIA_CONFIG.ADMIN_API_KEY
        );
        this.adminUsersIndex = this.adminClient.initIndex(ALGOLIA_CONFIG.INDICES.USERS);
        this.adminPlayersIndex = this.adminClient.initIndex(ALGOLIA_CONFIG.INDICES.PLAYERS);
      } else {
        console.warn('⚠️ Algolia Admin API Key not configured. Write operations will fail.');
      }

      // Initialize indices
      this.usersIndex = this.client.initIndex(ALGOLIA_CONFIG.INDICES.USERS);
      this.playersIndex = this.client.initIndex(ALGOLIA_CONFIG.INDICES.PLAYERS);

      // Configure index settings for optimal search
      this.configureIndex();

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize Algolia:', error);
    }
  }

  private async configureIndex() {
    if (!this.usersIndex) return;

    try {
      // These settings should ideally be set from Algolia dashboard or backend
      // Setting them here for reference
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const settings = {
        searchableAttributes: [
          'name',
          'email',
          'phone',
          '_searchableText'
        ],
        attributesForFaceting: [
          'filterOnly(organizationId)',
          'searchable(roles)',
          'filterOnly(academies)',
          'filterOnly(status)',
          'filterOnly(hasPlayerRole)',
          'filterOnly(hasCoachRole)',
          'filterOnly(hasGuardianRole)',
          'filterOnly(hasAdminRole)',
          'filterOnly(hasOwnerRole)'
        ],
        attributesToRetrieve: [
          'objectID',
          'name',
          'email',
          'phone',
          'photoURL',
          'roles',
          'roleDetails',
          'academies',
          'academyNames',
          'status',
          'createdAt',
          'updatedAt'
        ],
        ranking: [
          'typo',
          'geo',
          'words',
          'filters',
          'proximity',
          'attribute',
          'exact',
          'custom'
        ],
        customRanking: [
          'desc(createdAt)'
        ],
        hitsPerPage: 10,
        paginationLimitedTo: 1000
      };

      // Note: Settings should be configured via dashboard or backend
    } catch (error) {
      console.error('Error configuring index:', error);
    }
  }

  // Convert Firestore User to Algolia record
  public formatUserForAlgolia(user: User, academyNames?: string[]): AlgoliaUserRecord {
    const roles = user.roles?.map(r => 
      Array.isArray(r.role) ? r.role : [r.role]
    ).flat() || [];

    const academies = user.roles?.flatMap(r => {
      if (!r.academyId) return [];
      // Handle both array and string academyId values
      return Array.isArray(r.academyId) ? r.academyId : [r.academyId];
    }) || [];
    const uniqueAcademies = Array.from(new Set(academies));
    
    console.log('🔄 Algolia Format Debug:', {
      userId: user.id,
      userName: user.name,
      userRoles: user.roles?.map(r => ({ role: r.role, academyId: r.academyId })),
      extractedAcademies: uniqueAcademies
    });

    return {
      objectID: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      photoURL: user.photoURL, // Profile picture URL
      organizationId: user.roles?.[0]?.organizationId || '',
      roles,
      roleDetails: user.roles || [],
      academies: uniqueAcademies,
      academyNames: academyNames || [],
      status: (user as any).status, // Player status if available
      createdAt: user.createdAt?.toDate?.()?.getTime(),
      updatedAt: user.updatedAt?.toDate?.()?.getTime(),
      // Searchable text for better search
      _searchableText: `${user.name} ${user.email || ''} ${user.phone || ''} ${roles.join(' ')}`,
      // Facets for filtering
      hasPlayerRole: roles.includes('player'),
      hasCoachRole: roles.includes('coach'),
      hasGuardianRole: roles.includes('guardian'),
      hasAdminRole: roles.includes('admin'),
      hasOwnerRole: roles.includes('owner')
    };
  }

  // Search users with pagination and filters
  public async searchUsers(options: SearchOptions): Promise<SearchResults> {
    
    if (!this.isInitialized || !this.usersIndex) {
      console.warn('Algolia not initialized. Returning empty results.');
      return {
        users: [],
        totalUsers: 0,
        currentPage: 0,
        totalPages: 0,
        processingTimeMS: 0
      };
    }

    const {
      query = '',
      organizationId,
      filters = {},
      page = 0,
      hitsPerPage = 10,
      sortBy = 'date_desc'
    } = options;

    try {
      // Build filter string
      const filterParts = [`organizationId:${organizationId}`];
      
      if (filters.role && filters.role !== 'all') {
        // Support multiple roles separated by comma (e.g., "admin,owner")
        if (filters.role.includes(',')) {
          const roles = filters.role.split(',').map((r: string) => `roles:${r.trim()}`);
          filterParts.push(`(${roles.join(' OR ')})`);
        } else {
          filterParts.push(`roles:${filters.role}`);
        }
      }
      
      if (filters.academyId) {
        // Include users with the specific academy OR organization-wide users (owner/admin/guardian roles)
        // Guardians are organization-wide as they're linked to players, not academies
        filterParts.push(`(academies:${filters.academyId} OR hasOwnerRole:true OR hasAdminRole:true OR hasGuardianRole:true)`);
        console.log('🏫 Adding academy filter (including org-wide users):', filters.academyId);
      }
      
      if (filters.status) {
        filterParts.push(`status:${filters.status}`);
      }

      // Configure sorting
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      let indexName = ALGOLIA_CONFIG.INDICES.USERS;
      switch (sortBy) {
        case 'name_asc':
          indexName = `${ALGOLIA_CONFIG.INDICES.USERS}_name_asc`;
          break;
        case 'name_desc':
          indexName = `${ALGOLIA_CONFIG.INDICES.USERS}_name_desc`;
          break;
        case 'date_asc':
          indexName = `${ALGOLIA_CONFIG.INDICES.USERS}_date_asc`; // eslint-disable-line @typescript-eslint/no-unused-vars
          break;
        case 'date_desc':
        default:
          // Default index is already sorted by date desc
          break;
      }

      // Perform search
      const filterString = filterParts.join(' AND ');
      console.log('🔎 Algolia search - Query:', query, 'Filters:', filterString);

      const searchResults = await this.usersIndex.search(query, {
        filters: filterString,
        page,
        hitsPerPage,
        attributesToRetrieve: [
          'objectID',
          'name',
          'email',
          'phone',
          'photoURL',
          'roles',
          'roleDetails',
          'academies',
          'academyNames',
          'status',
          'createdAt',
          'updatedAt'
        ]
      });

      console.log('🔎 Algolia results:', searchResults.nbHits, 'users found');

      return {
        users: searchResults.hits,
        totalUsers: searchResults.nbHits,
        currentPage: searchResults.page,
        totalPages: searchResults.nbPages,
        processingTimeMS: searchResults.processingTimeMS
      };
    } catch (error) {
      console.error('Algolia search error:', error);
      throw error;
    }
  }

  // Save a single user to Algolia (requires admin key - should be done server-side)
  public async saveUser(user: AlgoliaUserRecord): Promise<void> {
    if (!this.isInitialized) {
      console.warn('Algolia not initialized. Cannot save user.');
      return;
    }

    if (!this.adminUsersIndex) {
      console.error('Algolia Admin API Key not configured. Cannot save user.');
      throw new Error('Admin API Key required for write operations. Please add REACT_APP_ALGOLIA_ADMIN_KEY to your .env.local file');
    }

    try {
      await this.adminUsersIndex.saveObject(user);
      console.log(`✅ User ${user.objectID} synced to Algolia`);
    } catch (error) {
      console.error('Error saving user to Algolia:', error);
      throw error;
    }
  }

  // Delete a user from Algolia (requires admin key - should be done server-side)
  public async deleteUser(userId: string): Promise<void> {
    if (!this.isInitialized) {
      console.warn('Algolia not initialized. Cannot delete user.');
      return;
    }

    if (!this.adminUsersIndex) {
      console.error('Algolia Admin API Key not configured. Cannot delete user.');
      throw new Error('Admin API Key required for write operations. Please add REACT_APP_ALGOLIA_ADMIN_KEY to your .env.local file');
    }

    try {
      await this.adminUsersIndex.deleteObject(userId);
      console.log(`✅ User ${userId} deleted from Algolia`);
    } catch (error) {
      console.error('Error deleting user from Algolia:', error);
      throw error;
    }
  }

  // Batch save multiple users (for initial sync)
  public async saveUsers(users: AlgoliaUserRecord[]): Promise<void> {
    if (!this.isInitialized) {
      console.warn('Algolia not initialized. Cannot save users.');
      return;
    }

    if (!this.adminUsersIndex) {
      console.error('Algolia Admin API Key not configured. Cannot save users.');
      throw new Error('Admin API Key required for write operations. Please add REACT_APP_ALGOLIA_ADMIN_KEY to your .env.local file');
    }

    try {
      // Save in batches of 100 for better performance
      const batchSize = 100;
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        await this.adminUsersIndex.saveObjects(batch);
        console.log(`✅ Synced batch ${i / batchSize + 1} (${batch.length} users)`);
      }
      console.log(`✅ All ${users.length} users synced to Algolia`);
    } catch (error) {
      console.error('Error batch saving users to Algolia:', error);
      throw error;
    }
  }

  // Clear all users from index (use with caution!)
  public async clearIndex(): Promise<void> {
    if (!this.isInitialized) {
      console.warn('Algolia not initialized. Cannot clear index.');
      return;
    }

    if (!this.adminUsersIndex) {
      console.error('Algolia Admin API Key not configured. Cannot clear index.');
      throw new Error('Admin API Key required for write operations. Please add REACT_APP_ALGOLIA_ADMIN_KEY to your .env.local file');
    }

    try {
      await this.adminUsersIndex.clearObjects();
      console.log('✅ Algolia index cleared');
    } catch (error) {
      console.error('Error clearing Algolia index:', error);
      throw error;
    }
  }

  // Check if Algolia is properly configured and initialized
  public isConfigured(): boolean {
    return this.isInitialized;
  }

  // ==================== PLAYER METHODS ====================

  // Convert Firestore Player to Algolia record
  public formatPlayerForAlgolia(
    player: Player,
    userData?: { name: string; email?: string; phone?: string; photoURL?: string },
    academyNames?: string[],
    guardianNames?: string[]
  ): AlgoliaPlayerRecord {
    return {
      objectID: player.id,
      userId: player.userId,
      userName: userData?.name || '',
      userEmail: userData?.email,
      userPhone: userData?.phone,
      userPhotoURL: userData?.photoURL,
      organizationId: player.organizationId,
      academyId: player.academyId || [],
      academyNames: academyNames || [],
      guardianId: player.guardianId || [],
      guardianNames: guardianNames || [],
      linkedProducts: player.assignedProducts?.map((p: { productId: string }) => p.productId) || [],
      status: player.status,
      createdAt: player.createdAt?.toDate?.()?.getTime(),
      updatedAt: player.updatedAt?.toDate?.()?.getTime(),
      _searchableText: `${userData?.name || ''} ${userData?.email || ''} ${userData?.phone || ''} ${guardianNames?.join(' ') || ''}`
    };
  }

  // Search players with pagination and filters
  public async searchPlayers(options: PlayerSearchOptions): Promise<PlayerSearchResults> {
    if (!this.isInitialized || !this.playersIndex) {
      console.warn('Algolia not initialized. Returning empty results.');
      return {
        players: [],
        totalPlayers: 0,
        currentPage: 0,
        totalPages: 0,
        processingTimeMS: 0
      };
    }

    const {
      query = '',
      organizationId,
      filters = {},
      page = 0,
      hitsPerPage = 20,
      sortBy = 'name_asc'
    } = options;

    try {
      // Build filter string
      const filterParts = [`organizationId:${organizationId}`];

      if (filters.academyId) {
        filterParts.push(`academyId:${filters.academyId}`);
      }

      if (filters.status) {
        filterParts.push(`status:${filters.status}`);
      }

      if (filters.hasGuardian !== undefined) {
        if (filters.hasGuardian) {
          filterParts.push('guardianId.length > 0');
        }
      }

      // Configure sorting - use replica indices if available
      let searchIndex = this.playersIndex;
      switch (sortBy) {
        case 'name_asc':
          // Default index or name_asc replica
          break;
        case 'name_desc':
          // Use name_desc replica if configured
          if (this.client) {
            searchIndex = this.client.initIndex(`${ALGOLIA_CONFIG.INDICES.PLAYERS}_name_desc`);
          }
          break;
        case 'date_desc':
          if (this.client) {
            searchIndex = this.client.initIndex(`${ALGOLIA_CONFIG.INDICES.PLAYERS}_date_desc`);
          }
          break;
        case 'date_asc':
          if (this.client) {
            searchIndex = this.client.initIndex(`${ALGOLIA_CONFIG.INDICES.PLAYERS}_date_asc`);
          }
          break;
      }

      const filterString = filterParts.join(' AND ');
      console.log('🔎 Algolia player search - Query:', query, 'Filters:', filterString);

      const searchResults = await searchIndex.search(query, {
        filters: filterString,
        page,
        hitsPerPage,
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
        ]
      });

      console.log('🔎 Algolia player results:', searchResults.nbHits, 'players found');

      return {
        players: searchResults.hits,
        totalPlayers: searchResults.nbHits,
        currentPage: searchResults.page,
        totalPages: searchResults.nbPages,
        processingTimeMS: searchResults.processingTimeMS
      };
    } catch (error) {
      console.error('Algolia player search error:', error);
      throw error;
    }
  }

  // Save a single player to Algolia
  public async savePlayer(player: AlgoliaPlayerRecord): Promise<void> {
    if (!this.isInitialized) {
      console.warn('Algolia not initialized. Cannot save player.');
      return;
    }

    if (!this.adminPlayersIndex) {
      console.error('Algolia Admin API Key not configured. Cannot save player.');
      throw new Error('Admin API Key required for write operations.');
    }

    try {
      await this.adminPlayersIndex.saveObject(player);
      console.log(`✅ Player ${player.objectID} synced to Algolia`);
    } catch (error) {
      console.error('Error saving player to Algolia:', error);
      throw error;
    }
  }

  // Delete a player from Algolia
  public async deletePlayer(playerId: string): Promise<void> {
    if (!this.isInitialized) {
      console.warn('Algolia not initialized. Cannot delete player.');
      return;
    }

    if (!this.adminPlayersIndex) {
      console.error('Algolia Admin API Key not configured. Cannot delete player.');
      throw new Error('Admin API Key required for write operations.');
    }

    try {
      await this.adminPlayersIndex.deleteObject(playerId);
      console.log(`✅ Player ${playerId} deleted from Algolia`);
    } catch (error) {
      console.error('Error deleting player from Algolia:', error);
      throw error;
    }
  }

  // Batch save multiple players (for initial sync)
  public async savePlayers(players: AlgoliaPlayerRecord[]): Promise<void> {
    if (!this.isInitialized) {
      console.warn('Algolia not initialized. Cannot save players.');
      return;
    }

    if (!this.adminPlayersIndex) {
      console.error('Algolia Admin API Key not configured. Cannot save players.');
      throw new Error('Admin API Key required for write operations.');
    }

    try {
      const batchSize = 100;
      for (let i = 0; i < players.length; i += batchSize) {
        const batch = players.slice(i, i + batchSize);
        await this.adminPlayersIndex.saveObjects(batch);
        console.log(`✅ Synced player batch ${Math.floor(i / batchSize) + 1} (${batch.length} players)`);
      }
      console.log(`✅ All ${players.length} players synced to Algolia`);
    } catch (error) {
      console.error('Error batch saving players to Algolia:', error);
      throw error;
    }
  }

  // Clear all players from index
  public async clearPlayersIndex(): Promise<void> {
    if (!this.isInitialized || !this.adminPlayersIndex) {
      console.warn('Algolia not initialized or admin key missing. Cannot clear players index.');
      return;
    }

    try {
      await this.adminPlayersIndex.clearObjects();
      console.log('✅ Algolia players index cleared');
    } catch (error) {
      console.error('Error clearing players index:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const algoliaService = new AlgoliaService();

// Export helper functions for easy access - USERS
export const searchUsers = (options: SearchOptions) => algoliaService.searchUsers(options);
export const syncUserToAlgolia = (user: User, academyNames?: string[]) => {
  const algoliaRecord = algoliaService.formatUserForAlgolia(user, academyNames);
  return algoliaService.saveUser(algoliaRecord);
};
export const deleteUserFromAlgolia = (userId: string) => algoliaService.deleteUser(userId);
export const isAlgoliaConfigured = () => algoliaService.isConfigured();

// Export helper functions for easy access - PLAYERS
export const searchPlayers = (options: PlayerSearchOptions) => algoliaService.searchPlayers(options);
export const syncPlayerToAlgolia = (
  player: Player,
  userData?: { name: string; email?: string; phone?: string; photoURL?: string },
  academyNames?: string[],
  guardianNames?: string[]
) => {
  const algoliaRecord = algoliaService.formatPlayerForAlgolia(player, userData, academyNames, guardianNames);
  return algoliaService.savePlayer(algoliaRecord);
};
export const deletePlayerFromAlgolia = (playerId: string) => algoliaService.deletePlayer(playerId);
export const batchSyncPlayersToAlgolia = (players: AlgoliaPlayerRecord[]) => algoliaService.savePlayers(players);