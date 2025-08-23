import algoliasearch from 'algoliasearch';
import { Transaction } from '../types';
import { ALGOLIA_CONFIG, validateAlgoliaConfig } from '../config/algolia';

// Algolia record structure for transactions
export interface AlgoliaTransactionRecord {
  objectID: string; // Transaction ID
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'internal';
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  paymentMethod?: string;
  organizationId: string;
  academyId?: string;
  transactionOwner?: {
    name: string;
    userId?: string;
  };
  handler?: {
    name: string;
    userId?: string;
  };
  paymentMaker?: {
    name: string;
    type: 'player' | 'guardian';
  };
  playerPayments?: Array<{
    playerId: string;
    playerName: string;
    amount: number;
  }>;
  date: number; // Timestamp for sorting
  createdAt: number;
  updatedAt?: number;
  // Searchable text
  _searchableText?: string;
  // Additional facets for filtering
  month?: string; // Format: "2024-01" for monthly filtering
  year?: number;
  hasPlayerPayments?: boolean;
}

// Search options interface
export interface TransactionSearchOptions {
  query?: string;
  organizationId: string;
  academyId?: string;
  filters?: {
    type?: 'all' | 'income' | 'expense' | 'internal';
    status?: 'all' | 'pending' | 'completed' | 'failed' | 'cancelled';
    paymentMethod?: string;
    dateRange?: 'all' | 'today' | 'week' | 'month' | 'year';
    customDateRange?: {
      start: Date;
      end: Date;
    };
  };
  page?: number;
  hitsPerPage?: number;
  sortBy?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
}

// Search results interface
export interface TransactionSearchResults {
  transactions: AlgoliaTransactionRecord[];
  totalTransactions: number;
  currentPage: number;
  totalPages: number;
  processingTimeMS: number;
  facets?: {
    types?: Record<string, number>;
    statuses?: Record<string, number>;
    paymentMethods?: Record<string, number>;
  };
}

class AlgoliaTransactionService {
  private client: any = null;
  private adminClient: any = null;
  private transactionsIndex: any = null;
  private adminTransactionsIndex: any = null;
  private isInitialized: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    
    if (!validateAlgoliaConfig()) {
      throw new Error('Algolia is not configured. Please set up your Algolia API keys in the .env file.');
    }

    try {
      // Initialize Algolia client with search-only key
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
        this.adminTransactionsIndex = this.adminClient.initIndex(ALGOLIA_CONFIG.INDICES.TRANSACTIONS);
      } else {
        console.warn('⚠️ Algolia Admin API Key not configured. Transaction write operations will fail.');
      }

      // Initialize indices
      this.transactionsIndex = this.client.initIndex(ALGOLIA_CONFIG.INDICES.TRANSACTIONS);
      
      // Configure index settings for optimal search
      this.configureIndex();
      
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize Algolia Transaction service:', error);
    }
  }

  private async configureIndex() {
    if (!this.transactionsIndex) return;

    try {
      // Index settings configuration
      const settings = {
        searchableAttributes: [
          'description',
          'transactionOwner.name',
          'handler.name',
          'paymentMaker.name',
          'playerPayments.playerName',
          '_searchableText'
        ],
        attributesForFaceting: [
          'filterOnly(organizationId)',
          'filterOnly(academyId)',
          'searchable(type)',
          'searchable(status)',
          'searchable(paymentMethod)',
          'filterOnly(month)',
          'filterOnly(year)',
          'filterOnly(hasPlayerPayments)'
        ],
        attributesToRetrieve: [
          'objectID',
          'description',
          'amount',
          'type',
          'status',
          'paymentMethod',
          'transactionOwner',
          'handler',
          'paymentMaker',
          'playerPayments',
          'date',
          'createdAt',
          'updatedAt'
        ],
        customRanking: [
          'desc(date)',
          'desc(createdAt)'
        ],
        hitsPerPage: 10,
        paginationLimitedTo: 1000
      };

    } catch (error) {
      console.error('Error configuring transaction index:', error);
    }
  }

  // Convert Firestore Transaction to Algolia record
  public formatTransactionForAlgolia(transaction: Transaction): AlgoliaTransactionRecord {
    const date = transaction.date?.toDate() || transaction.createdAt?.toDate() || new Date();
    const dateTimestamp = date.getTime();
    
    // Format month for faceting (e.g., "2024-01")
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const year = date.getFullYear();

    // Build searchable text from all relevant fields
    const searchableTextParts = [
      transaction.description || '',
      transaction.transactionOwner?.name || '',
      transaction.handler?.name || '',
      transaction.paymentMaker?.name || '',
      transaction.paymentMethod || '',
      transaction.type || '',
      transaction.status || ''
    ];
    
    if (transaction.playerPayments && transaction.playerPayments.length > 0) {
      searchableTextParts.push(...transaction.playerPayments.map(p => p.playerName));
    }

    return {
      objectID: transaction.id,
      description: transaction.description || '',
      amount: transaction.amount,
      type: transaction.type,
      status: transaction.status,
      paymentMethod: transaction.paymentMethod,
      organizationId: transaction.organizationId,
      academyId: transaction.academyId,
      transactionOwner: transaction.transactionOwner ? {
        name: transaction.transactionOwner.name,
        userId: transaction.transactionOwner.userRef?.id
      } : undefined,
      handler: transaction.handler ? {
        name: transaction.handler.name,
        userId: transaction.handler.userRef?.id
      } : undefined,
      paymentMaker: transaction.paymentMaker,
      playerPayments: transaction.playerPayments,
      date: dateTimestamp,
      createdAt: transaction.createdAt?.toDate()?.getTime() || dateTimestamp,
      updatedAt: transaction.updatedAt?.toDate()?.getTime(),
      _searchableText: searchableTextParts.join(' '),
      month,
      year,
      hasPlayerPayments: !!(transaction.playerPayments && transaction.playerPayments.length > 0)
    };
  }

  // Search transactions with pagination and filters
  public async searchTransactions(options: TransactionSearchOptions): Promise<TransactionSearchResults> {
    
    if (!this.isInitialized || !this.transactionsIndex) {
      throw new Error('Algolia Transaction service not initialized. Please check your Algolia configuration.');
    }

    const {
      query = '',
      organizationId,
      academyId,
      filters = {},
      page = 0,
      hitsPerPage = 10,
      sortBy = 'date_desc'
    } = options;

    try {
      // Build filter string
      const filterParts = [`organizationId:${organizationId}`];
      
      if (academyId) {
        filterParts.push(`academyId:${academyId}`);
      }
      
      if (filters.type && filters.type !== 'all') {
        filterParts.push(`type:${filters.type}`);
      }
      
      if (filters.status && filters.status !== 'all') {
        filterParts.push(`status:${filters.status}`);
      }
      
      if (filters.paymentMethod) {
        filterParts.push(`paymentMethod:"${filters.paymentMethod}"`);
      }
      
      // Date range filtering
      if (filters.dateRange && filters.dateRange !== 'all') {
        const now = new Date();
        let startDate: Date;
        
        switch (filters.dateRange) {
          case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            filterParts.push(`date >= ${startDate.getTime()}`);
            break;
          case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            filterParts.push(`date >= ${startDate.getTime()}`);
            break;
          case 'month':
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            filterParts.push(`month:${currentMonth}`);
            break;
          case 'year':
            filterParts.push(`year:${now.getFullYear()}`);
            break;
        }
      }
      
      // Custom date range
      if (filters.customDateRange) {
        const { start, end } = filters.customDateRange;
        filterParts.push(`date >= ${start.getTime()} AND date <= ${end.getTime()}`);
      }

      // Configure sorting
      let indexName = ALGOLIA_CONFIG.INDICES.TRANSACTIONS;
      // Note: For sorting, you would typically create replica indices in Algolia dashboard
      // For now, we'll use the default index and rely on custom ranking

      // Perform search
      const searchResults = await this.transactionsIndex.search(query, {
        filters: filterParts.join(' AND '),
        page,
        hitsPerPage,
        facets: ['type', 'status', 'paymentMethod'],
        attributesToRetrieve: [
          'objectID',
          'description',
          'amount',
          'type',
          'status',
          'paymentMethod',
          'transactionOwner',
          'handler',
          'paymentMaker',
          'playerPayments',
          'date',
          'createdAt',
          'updatedAt'
        ]
      });

      return {
        transactions: searchResults.hits,
        totalTransactions: searchResults.nbHits,
        currentPage: searchResults.page,
        totalPages: searchResults.nbPages,
        processingTimeMS: searchResults.processingTimeMS,
        facets: searchResults.facets
      };
    } catch (error) {
      console.error('Algolia transaction search error:', error);
      throw error;
    }
  }

  // Save a single transaction to Algolia
  public async saveTransaction(transaction: AlgoliaTransactionRecord): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Algolia not initialized. Cannot save transaction.');
    }

    if (!this.adminTransactionsIndex) {
      console.warn('Algolia Admin API Key not configured. Cannot save transaction to search index.');
      return; // Still allow the app to work but won't index new data
    }

    try {
      await this.adminTransactionsIndex.saveObject(transaction);
    } catch (error) {
      console.error('Error saving transaction to Algolia:', error);
    }
  }

  // Delete a transaction from Algolia
  public async deleteTransaction(transactionId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Algolia not initialized. Cannot delete transaction.');
    }

    if (!this.adminTransactionsIndex) {
      console.warn('Algolia Admin API Key not configured. Cannot delete transaction from search index.');
      return; // Still allow the app to work but won't remove from index
    }

    try {
      await this.adminTransactionsIndex.deleteObject(transactionId);
      console.log(`✅ Transaction ${transactionId} deleted from Algolia`);
    } catch (error) {
      console.error('Error deleting transaction from Algolia:', error);
    }
  }

  // Batch save multiple transactions
  public async saveTransactions(transactions: AlgoliaTransactionRecord[]): Promise<void> {
    if (!this.isInitialized) {
      console.warn('Algolia not initialized. Cannot save transactions.');
      return;
    }

    if (!this.adminTransactionsIndex) {
      console.error('Algolia Admin API Key not configured. Cannot save transactions.');
      return;
    }

    try {
      // Save in batches of 100 for better performance
      const batchSize = 100;
      for (let i = 0; i < transactions.length; i += batchSize) {
        const batch = transactions.slice(i, i + batchSize);
        await this.adminTransactionsIndex.saveObjects(batch);
        console.log(`✅ Synced batch ${i / batchSize + 1} (${batch.length} transactions)`);
      }
    } catch (error) {
      console.error('Error batch saving transactions to Algolia:', error);
    }
  }

  // Check if Algolia is properly configured and initialized
  public isConfigured(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const algoliaTransactionService = new AlgoliaTransactionService();

// Export helper functions for easy access
export const searchTransactions = (options: TransactionSearchOptions) => 
  algoliaTransactionService.searchTransactions(options);

export const syncTransactionToAlgolia = (transaction: Transaction) => {
  const algoliaRecord = algoliaTransactionService.formatTransactionForAlgolia(transaction);
  return algoliaTransactionService.saveTransaction(algoliaRecord);
};

export const deleteTransactionFromAlgolia = (transactionId: string) => 
  algoliaTransactionService.deleteTransaction(transactionId);

export const isAlgoliaTransactionConfigured = () => 
  algoliaTransactionService.isConfigured();