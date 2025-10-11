import algoliasearch from 'algoliasearch';
import { User, UserRole } from '../types';
import { ALGOLIA_CONFIG, validateAlgoliaConfig } from '../config/algolia';

// Algolia record structure for users
export interface AlgoliaUserRecord {
  objectID: string; // User ID
  name: string;
  email?: string;
  phone?: string;
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

class AlgoliaService {
  private client: any = null;
  private adminClient: any = null; // Client with admin key for write operations
  private usersIndex: any = null;
  private adminUsersIndex: any = null; // Index with write permissions
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
      } else {
        console.warn('⚠️ Algolia Admin API Key not configured. Write operations will fail.');
      }

      // Initialize indices
      this.usersIndex = this.client.initIndex(ALGOLIA_CONFIG.INDICES.USERS);
      
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
        filterParts.push(`roles:${filters.role}`);
      }
      
      if (filters.academyId) {
        filterParts.push(`academies:${filters.academyId}`);
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
      const searchResults = await this.usersIndex.search(query, {
        filters: filterParts.join(' AND '),
        page,
        hitsPerPage,
        attributesToRetrieve: [
          'objectID',
          'name',
          'email',
          'phone',
          'roles',
          'roleDetails',
          'academies',
          'academyNames',
          'status',
          'createdAt',
          'updatedAt'
        ]
      });

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
}

// Export singleton instance
export const algoliaService = new AlgoliaService();

// Export helper functions for easy access
export const searchUsers = (options: SearchOptions) => algoliaService.searchUsers(options);
export const syncUserToAlgolia = (user: User, academyNames?: string[]) => {
  const algoliaRecord = algoliaService.formatUserForAlgolia(user, academyNames);
  return algoliaService.saveUser(algoliaRecord);
};
export const deleteUserFromAlgolia = (userId: string) => algoliaService.deleteUser(userId);
export const isAlgoliaConfigured = () => algoliaService.isConfigured();