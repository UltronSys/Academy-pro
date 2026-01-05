import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, Select, DataTable, Badge, Tabs, Toast } from '../ui';
import { useApp } from '../../contexts/AppContext';
import { usePermissions } from '../../hooks/usePermissions';
import { updatePlayer } from '../../services/playerService';
import { getTransactionsByOwner } from '../../services/transactionService';
import { getReceiptsByOrganization, calculateUserOutstandingBalance } from '../../services/receiptService';
import { getSettingsByOrganization } from '../../services/settingsService';
import { Player, User, Transaction, Receipt } from '../../types';
import { searchPlayers } from '../../services/algoliaService';

interface PlayerFinancialSummary {
  player: Player;
  user: User;
  guardians: User[];
  outstandingDebits: number;
  availableCredits: number;
  netBalance: number;
  recentTransactions: Transaction[];
  receipts: Receipt[];
  totalTransactionAmount: number;
}

interface GuardianFinancialSummary {
  guardian: User;
  linkedPlayers: PlayerFinancialSummary[];
  totalOutstanding: number;
  totalCredits: number;
  totalNetBalance: number;
  allTransactions: Transaction[];
  allReceipts: Receipt[];
  totalTransactionAmount: number;
}

const PlayersGuardians: React.FC = () => {
  const { selectedOrganization, selectedAcademy } = useApp();
  const { canWrite } = usePermissions();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');

  // Algolia pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [hitsPerPage] = useState(20); // Load 20 players per page from Algolia

  // Data state
  const [playerFinancials, setPlayerFinancials] = useState<PlayerFinancialSummary[]>([]);
  const [guardianFinancials, setGuardianFinancials] = useState<GuardianFinancialSummary[]>([]);
  const [selectedGuardian, setSelectedGuardian] = useState<GuardianFinancialSummary | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showLinkPlayersModal, setShowLinkPlayersModal] = useState(false);
  const [selectedGuardianForLinking, setSelectedGuardianForLinking] = useState<GuardianFinancialSummary | null>(null);
  const [selectedPlayersToLink, setSelectedPlayersToLink] = useState<string[]>([]);
  const [availablePlayersForLinking, setAvailablePlayersForLinking] = useState<PlayerFinancialSummary[]>([]);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(0); // Reset to first page on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load data when organization, academy, search, or page changes (sorting is done locally)
  useEffect(() => {
    if (selectedOrganization?.id) {
      loadFinancialData();
    }
  }, [selectedOrganization, selectedAcademy, debouncedSearchTerm, currentPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh data when the page becomes visible (user returns from transaction page)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && selectedOrganization?.id) {
        console.log('📊 Page became visible, refreshing financial data...');
        loadFinancialData();
      }
    };

    const handleFocus = () => {
      if (selectedOrganization?.id) {
        console.log('📊 Window focused, refreshing financial data...');
        loadFinancialData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [selectedOrganization?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFinancialData = async () => {
    if (!selectedOrganization?.id) return;

    try {
      setLoading(true);

      // Load currency from settings
      const settingsData = await getSettingsByOrganization(selectedOrganization.id);
      if (settingsData?.generalSettings?.currency) {
        setDefaultCurrency(settingsData.generalSettings.currency);
      }

      // Use Algolia PLAYERS index directly (much more efficient)
      console.log('🔎 Searching players via Algolia players index...');
      console.log('📌 Organization ID:', selectedOrganization.id);
      console.log('📌 Academy ID filter:', selectedAcademy?.id || 'none');

      let algoliaResults;
      try {
        // Algolia handles search and filtering, sorting is done locally
        algoliaResults = await searchPlayers({
          query: debouncedSearchTerm,
          organizationId: selectedOrganization.id,
          filters: {
            academyId: selectedAcademy?.id
          },
          page: currentPage,
          hitsPerPage: hitsPerPage
        });
      } catch (algoliaError) {
        console.error('❌ Algolia search failed:', algoliaError);
        showToast('Search failed. The players index may not be configured. Run syncPlayersToAlgolia() in console.', 'error');
        setPlayerFinancials([]);
        setGuardianFinancials([]);
        setLoading(false);
        return;
      }

      console.log(`✅ Algolia returned ${algoliaResults.players.length} players (page ${algoliaResults.currentPage + 1}/${algoliaResults.totalPages})`);
      console.log('📊 Total players in index:', algoliaResults.totalPlayers);

      // Update pagination state
      setTotalPages(algoliaResults.totalPages);
      setTotalPlayers(algoliaResults.totalPlayers);

      // If no results, show helpful message
      if (algoliaResults.players.length === 0) {
        console.warn('⚠️ No players found in Algolia. You may need to run syncPlayersToAlgolia() in the browser console.');
        if (algoliaResults.totalPlayers === 0 && !debouncedSearchTerm) {
          showToast('No players in index. Open browser console and run: syncPlayersToAlgolia()', 'info');
        }
        setPlayerFinancials([]);
        setGuardianFinancials([]);
        setLoading(false);
        return;
      }

      // Build player summaries directly from Algolia player data (no Firebase calls needed)
      const playerSummaries: PlayerFinancialSummary[] = [];

      for (const algoliaPlayer of algoliaResults.players) {
        // Convert Algolia player to Player type
        const player: Player = {
          id: algoliaPlayer.objectID,
          userId: algoliaPlayer.userId,
          organizationId: algoliaPlayer.organizationId,
          academyId: algoliaPlayer.academyId || [],
          guardianId: algoliaPlayer.guardianId || [],
          dob: new Date(),
          gender: '',
          playerParameters: {},
          status: algoliaPlayer.status,
          createdAt: algoliaPlayer.createdAt ? {
            toDate: () => new Date(algoliaPlayer.createdAt!),
            seconds: Math.floor((algoliaPlayer.createdAt || 0) / 1000),
            nanoseconds: 0,
            toMillis: () => algoliaPlayer.createdAt || 0,
            isEqual: () => false,
            toJSON: () => ({ seconds: Math.floor((algoliaPlayer.createdAt || 0) / 1000), nanoseconds: 0 })
          } as any : { toDate: () => new Date() } as any,
          updatedAt: algoliaPlayer.updatedAt ? {
            toDate: () => new Date(algoliaPlayer.updatedAt!),
            seconds: Math.floor((algoliaPlayer.updatedAt || 0) / 1000),
            nanoseconds: 0,
            toMillis: () => algoliaPlayer.updatedAt || 0,
            isEqual: () => false,
            toJSON: () => ({ seconds: Math.floor((algoliaPlayer.updatedAt || 0) / 1000), nanoseconds: 0 })
          } as any : { toDate: () => new Date() } as any
        };

        // Convert Algolia player user data to User type
        const user: User = {
          id: algoliaPlayer.userId,
          name: algoliaPlayer.userName || '',
          email: algoliaPlayer.userEmail || '',
          phone: algoliaPlayer.userPhone,
          photoURL: algoliaPlayer.userPhotoURL,
          roles: [],
          createdAt: player.createdAt,
          updatedAt: player.updatedAt
        };

        // Build guardians from Algolia data (guardianId + guardianNames)
        const guardians: User[] = [];
        if (algoliaPlayer.guardianId && algoliaPlayer.guardianId.length > 0) {
          algoliaPlayer.guardianId.forEach((guardianId, index) => {
            const guardianName = algoliaPlayer.guardianNames?.[index] || 'Guardian';
            guardians.push({
              id: guardianId,
              name: guardianName,
              email: '', // Not available in player record
              roles: [],
              createdAt: player.createdAt,
              updatedAt: player.updatedAt
            });
          });
        }

        // For initial load, just show basic info with placeholders
        playerSummaries.push({
          player,
          user,
          guardians,
          outstandingDebits: 0,
          availableCredits: 0,
          netBalance: 0,
          recentTransactions: [],
          receipts: [],
          totalTransactionAmount: 0
        });
      }

      setPlayerFinancials(playerSummaries);

      // Generate basic guardian summaries
      const guardianMap = new Map<string, GuardianFinancialSummary>();
      const processedPlayersByGuardian = new Map<string, Set<string>>();

      playerSummaries.forEach(playerSummary => {
        playerSummary.guardians.forEach(guardian => {
          if (!guardianMap.has(guardian.id)) {
            guardianMap.set(guardian.id, {
              guardian,
              linkedPlayers: [],
              totalOutstanding: 0,
              totalCredits: 0,
              totalNetBalance: 0,
              allTransactions: [],
              allReceipts: [],
              totalTransactionAmount: 0
            });
            processedPlayersByGuardian.set(guardian.id, new Set());
          }

          const guardianSummary = guardianMap.get(guardian.id)!;
          const processedPlayers = processedPlayersByGuardian.get(guardian.id)!;

          // Prevent double-counting the same player
          if (!processedPlayers.has(playerSummary.player.userId)) {
            processedPlayers.add(playerSummary.player.userId);
            guardianSummary.linkedPlayers.push(playerSummary);
          }
        });
      });

      // Check if any guardian is also a player and add them to their own linked players list
      guardianMap.forEach((guardianSummary, guardianId) => {
        const processedPlayers = processedPlayersByGuardian.get(guardianId) || new Set();

        // Find if this guardian is also a player - check multiple possible matches
        const guardianAsPlayer = playerSummaries.find(
          ps => ps.player.userId === guardianId || ps.user.id === guardianId
        );

        if (guardianAsPlayer) {
          const alreadyIncluded = processedPlayers.has(guardianAsPlayer.player.userId) ||
            guardianSummary.linkedPlayers.some(
              lp => lp.player.userId === guardianAsPlayer.player.userId || lp.player.id === guardianAsPlayer.player.id
            );

          if (!alreadyIncluded) {
            // Add to linked players with a flag to identify it's their own account
            guardianSummary.linkedPlayers.unshift({
              ...guardianAsPlayer,
              user: {
                ...guardianAsPlayer.user,
                name: `${guardianAsPlayer.user.name} (Own Account)`
              }
            });
            processedPlayers.add(guardianAsPlayer.player.userId);
          }
        }
      });

      setGuardianFinancials(Array.from(guardianMap.values()));

      // Load financial data in background for better performance
      setTimeout(() => {
        loadDetailedFinancialData(playerSummaries).catch(error => {
          console.error('Background financial data loading failed:', error);
          showToast('Some financial data may be incomplete', 'info');
        });
      }, 100);

    } catch (error) {
      console.error('Error loading financial data:', error);
      showToast('Failed to load financial data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadDetailedFinancialData = async (playerSummaries: PlayerFinancialSummary[]) => {
    if (!selectedOrganization?.id) {
      console.warn('No organization selected for financial data loading');
      return;
    }

    try {
      
      // Load all organization receipts once for efficiency
      let allOrgReceipts: Receipt[] = [];
      try {
        allOrgReceipts = await getReceiptsByOrganization(selectedOrganization.id);
        console.log(`✅ Loaded ${allOrgReceipts.length} total receipts for organization`);
      } catch (receiptError) {
        console.error('Error loading organization receipts:', receiptError);
        // Continue with empty array - don't fail completely
      }

      // Load financial data for each player in smaller batches
      const updatedSummaries = await Promise.all(
        playerSummaries.map(async (playerSummary) => {
          try {

            // Get transactions
            let transactions: Transaction[] = [];
            try {
              const userRef = { id: playerSummary.player.userId } as any;
              transactions = await getTransactionsByOwner(selectedOrganization.id, userRef);
            } catch (transactionError) {
              console.error(`Error loading transactions for ${playerSummary.user.name}:`, transactionError);
            }
            
            // Use the working calculateUserOutstandingBalance function for outstanding/credits
            let balanceInfo = {
              outstandingDebits: 0,
              availableCredits: 0,
              netBalance: 0,
              pendingDebitReceipts: [] as Receipt[],
              creditReceipts: [] as Receipt[]
            };
            
            try {
              balanceInfo = await calculateUserOutstandingBalance(
                playerSummary.player.userId, 
                selectedOrganization.id
              );
            } catch (balanceError) {
              console.error(`Error calculating balance for ${playerSummary.user.name}:`, balanceError);
            }
            
            // Filter receipts for this specific user from organization receipts (exclude deleted)
            const organizationReceipts = allOrgReceipts.filter(r => {
              return r.userRef && r.userRef.id === playerSummary.player.userId &&
                     r.organizationId === selectedOrganization.id &&
                     r.status !== 'deleted' &&
                     (r.status === 'active' || r.status === 'paid' || r.status === 'completed' || !r.status);
            });

            // Calculate net balance from outstanding debits and available credits
            // Negative = owes money, Positive = has credit
            const netBalance = balanceInfo.availableCredits - balanceInfo.outstandingDebits;

            // Calculate total transaction amount
            const totalAmount = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

            return {
              ...playerSummary,
              outstandingDebits: balanceInfo.outstandingDebits,
              availableCredits: balanceInfo.availableCredits,
              netBalance,
              recentTransactions: transactions.slice(0, 5),
              receipts: organizationReceipts,
              totalTransactionAmount: totalAmount
            };

          } catch (playerError) {
            console.error(`Error processing player ${playerSummary.user.name}:`, playerError);
            // Return original player summary with zero financial data rather than failing
            return {
              ...playerSummary,
              outstandingDebits: 0,
              availableCredits: 0,
              netBalance: 0, // Reset to 0 on error instead of using stale stored balance
              recentTransactions: [],
              receipts: [],
              totalTransactionAmount: 0
            };
          }
        })
      );

      setPlayerFinancials(updatedSummaries);

      // Update guardian summaries with detailed data
      const guardianMap = new Map<string, GuardianFinancialSummary>();

      // Track which player userIds have been processed for each guardian to prevent double-counting
      const processedPlayersByGuardian = new Map<string, Set<string>>();

      updatedSummaries.forEach(playerSummary => {
        playerSummary.guardians.forEach(guardian => {
          if (!guardianMap.has(guardian.id)) {
            guardianMap.set(guardian.id, {
              guardian,
              linkedPlayers: [],
              totalOutstanding: 0,
              totalCredits: 0,
              totalNetBalance: 0,
              allTransactions: [],
              allReceipts: [],
              totalTransactionAmount: 0
            });
            processedPlayersByGuardian.set(guardian.id, new Set());
          }

          const guardianSummary = guardianMap.get(guardian.id)!;
          const processedPlayers = processedPlayersByGuardian.get(guardian.id)!;

          // Prevent double-counting the same player
          if (!processedPlayers.has(playerSummary.player.userId)) {
            processedPlayers.add(playerSummary.player.userId);
            guardianSummary.linkedPlayers.push(playerSummary);
            guardianSummary.totalOutstanding += playerSummary.outstandingDebits;
            guardianSummary.totalCredits += playerSummary.availableCredits;
            guardianSummary.totalNetBalance += playerSummary.netBalance;
            guardianSummary.totalTransactionAmount += playerSummary.totalTransactionAmount;
            guardianSummary.allTransactions.push(...playerSummary.recentTransactions);
            guardianSummary.allReceipts.push(...playerSummary.receipts);
          }
        });
      });

      // Check if any guardian is also a player and add their own financial data
      guardianMap.forEach((guardianSummary, guardianId) => {
        const processedPlayers = processedPlayersByGuardian.get(guardianId) || new Set();

        // Find if this guardian is also a player - check multiple possible matches
        const guardianAsPlayer = updatedSummaries.find(
          ps => ps.player.userId === guardianId || ps.user.id === guardianId
        );

        if (guardianAsPlayer) {
          // Check if we haven't already counted this player
          const alreadyIncluded = processedPlayers.has(guardianAsPlayer.player.userId) ||
            guardianSummary.linkedPlayers.some(
              lp => lp.player.userId === guardianAsPlayer.player.userId || lp.player.id === guardianAsPlayer.player.id
            );

          if (!alreadyIncluded) {
            console.log(`📊 Guardian ${guardianSummary.guardian.name} is also a player - adding their own financial data`);
            console.log(`📊 Guardian own data - Outstanding: ${guardianAsPlayer.outstandingDebits}, Credits: ${guardianAsPlayer.availableCredits}, NetBalance: ${guardianAsPlayer.netBalance}`);

            // Add guardian's own financial data to totals
            guardianSummary.totalOutstanding += guardianAsPlayer.outstandingDebits;
            guardianSummary.totalCredits += guardianAsPlayer.availableCredits;
            guardianSummary.totalNetBalance += guardianAsPlayer.netBalance;
            guardianSummary.totalTransactionAmount += guardianAsPlayer.totalTransactionAmount;
            guardianSummary.allTransactions.push(...guardianAsPlayer.recentTransactions);
            guardianSummary.allReceipts.push(...guardianAsPlayer.receipts);

            // Add to linked players with a flag to identify it's their own account
            guardianSummary.linkedPlayers.unshift({
              ...guardianAsPlayer,
              // Mark this as the guardian's own account (for UI display purposes)
              user: {
                ...guardianAsPlayer.user,
                name: `${guardianAsPlayer.user.name} (Own Account)`
              }
            });

            // Mark as processed
            processedPlayers.add(guardianAsPlayer.player.userId);
          } else {
            console.log(`📊 Guardian ${guardianSummary.guardian.name} already has their own data included`);
          }
        }
      });

      // Log final guardian totals for debugging
      guardianMap.forEach((guardianSummary) => {
        console.log(`📊 Guardian ${guardianSummary.guardian.name} final totals - Outstanding: ${guardianSummary.totalOutstanding}, Credits: ${guardianSummary.totalCredits}, NetBalance: ${guardianSummary.totalNetBalance}, LinkedPlayers: ${guardianSummary.linkedPlayers.length}`);
      });

      setGuardianFinancials(Array.from(guardianMap.values()));

    } catch (error) {
      console.error('Error loading detailed financial data:', error);
      showToast(`Failed to load financial data: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      
      // Don't leave the UI in a broken state - ensure we have basic data
      if (playerSummaries.length > 0) {
        const fallbackSummaries = playerSummaries.map(summary => ({
          ...summary,
          outstandingDebits: 0,
          availableCredits: 0,
          netBalance: summary.user.balance ?? 0,
          recentTransactions: [],
          receipts: [],
          totalTransactionAmount: 0
        }));
        setPlayerFinancials(fallbackSummaries);
      }
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const handleOpenLinkPlayersModal = (guardian: GuardianFinancialSummary) => {
    setSelectedGuardianForLinking(guardian);
    
    // Get players without guardians or not linked to this guardian
    const unlinkedPlayers = playerFinancials.filter(player => {
      return !player.guardians.some(g => g.id === guardian.guardian.id);
    });
    
    setAvailablePlayersForLinking(unlinkedPlayers);
    setSelectedPlayersToLink([]);
    setShowLinkPlayersModal(true);
  };

  const handleLinkPlayers = async () => {
    if (!selectedGuardianForLinking || selectedPlayersToLink.length === 0) return;
    
    try {
      const guardianId = selectedGuardianForLinking.guardian.id;
      
      // Update each selected player to add this guardian
      const updatePromises = selectedPlayersToLink.map(async (playerId) => {
        const player = playerFinancials.find(p => p.player.id === playerId)?.player;
        if (player) {
          const currentGuardianIds = player.guardianId || [];
          if (!currentGuardianIds.includes(guardianId)) {
            await updatePlayer(player.id, {
              guardianId: [...currentGuardianIds, guardianId]
            });
          }
        }
      });
      
      await Promise.all(updatePromises);
      
      showToast(`Successfully linked ${selectedPlayersToLink.length} player(s) to ${selectedGuardianForLinking.guardian.name}`, 'success');
      setShowLinkPlayersModal(false);
      setSelectedGuardianForLinking(null);
      setSelectedPlayersToLink([]);
      
      // Reload data to reflect changes
      loadFinancialData();
    } catch (error) {
      console.error('Error linking players:', error);
      showToast('Failed to link players to guardian', 'error');
    }
  };

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Paid Up' },
    { value: 'pending', label: 'Pending Payment' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'credit', label: 'Has Credits' }
  ];

  const sortOptions = [
    { value: 'name', label: 'Name' },
    { value: 'balance', label: 'Net Balance' },
    { value: 'outstanding', label: 'Outstanding' },
    { value: 'credits', label: 'Credits' }
  ];

  const getFinancialStatus = (playerSummary: PlayerFinancialSummary) => {
    // Check if player has any credit (positive balance)
    if (playerSummary.netBalance > 0) return 'credit';

    // Check if player has no outstanding balance
    if (playerSummary.netBalance >= 0) return 'active';

    // Player has outstanding balance (netBalance < 0)
    // Check if any unpaid receipts are past their deadline
    const now = new Date();
    const hasOverdueReceipts = playerSummary.receipts.some(receipt => {
      if (receipt.type !== 'debit') return false;
      if (receipt.status === 'completed' || receipt.status === 'deleted') return false;

      // Check if deadline has passed
      const deadline = receipt.product?.deadline?.toDate?.();
      if (deadline && deadline < now) {
        return true; // This receipt is overdue
      }
      return false;
    });

    if (hasOverdueReceipts) return 'overdue';

    // Has outstanding balance but no overdue receipts yet
    return 'pending';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'pending':
        return 'warning';
      case 'overdue':
        return 'error';
      case 'credit':
        return 'primary';
      default:
        return 'secondary';
    }
  };

  const handleSort = (key: string) => {
    if (sortBy === key) {
      // Toggle direction if same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortBy(key);
      setSortDirection('asc');
    }
    // No page reset needed - sorting is done locally on current page
  };

  // Players are already filtered by Algolia (search + academy), only apply status filter locally
  const filteredPlayers = playerFinancials
    .filter(playerSummary => {
      // Status filtering must be done locally since it depends on financial data
      const status = getFinancialStatus(playerSummary);
      const matchesStatus = filterStatus === 'all' || status === filterStatus;
      return matchesStatus;
    })
    .sort((a, b) => {
      // All sorting done locally on current page results
      const direction = sortDirection === 'asc' ? 1 : -1;
      switch (sortBy) {
        case 'name':
          return a.user.name.localeCompare(b.user.name) * direction;
        case 'balance':
          return (a.netBalance - b.netBalance) * direction;
        case 'outstanding':
          return (a.outstandingDebits - b.outstandingDebits) * direction;
        case 'credits':
          return (a.availableCredits - b.availableCredits) * direction;
        case 'status':
          const statusOrder: Record<string, number> = { 'overdue': 0, 'pending': 1, 'active': 2, 'credit': 3 };
          const statusA = getFinancialStatus(a);
          const statusB = getFinancialStatus(b);
          return ((statusOrder[statusA] || 0) - (statusOrder[statusB] || 0)) * direction;
        default:
          return 0;
      }
    });

  // Guardians filtering - search is done locally since guardians come from player summaries
  const filteredGuardians = guardianFinancials
    .filter(guardianSummary => {
      const matchesSearch =
        guardianSummary.guardian.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        guardianSummary.guardian.email.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        guardianSummary.linkedPlayers.some(p => p.user.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()));

      const hasStatus = guardianSummary.linkedPlayers.some(p => {
        const status = getFinancialStatus(p);
        return filterStatus === 'all' || status === filterStatus;
      });

      return matchesSearch && hasStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'balance':
          return b.totalNetBalance - a.totalNetBalance;
        case 'outstanding':
          return b.totalOutstanding - a.totalOutstanding;
        case 'credits':
          return b.totalCredits - a.totalCredits;
        default:
          return a.guardian.name.localeCompare(b.guardian.name);
      }
    });

  const playerColumns = [
    {
      key: 'player',
      header: 'Player',
      sortable: true,
      sortKey: 'name',
      render: (playerSummary: PlayerFinancialSummary) => (
        <div>
          <div className="font-medium text-secondary-900">{playerSummary.user.name}</div>
          <div className="text-sm text-secondary-600">{playerSummary.user.email}</div>
          {playerSummary.player.createdAt && (
            <div className="text-xs text-secondary-500">
              Joined: {playerSummary.player.createdAt.toDate().toLocaleDateString()}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'guardian',
      header: 'Guardian(s)',
      render: (playerSummary: PlayerFinancialSummary) => (
        <div>
          {playerSummary.guardians.length > 0 ? (
            playerSummary.guardians.map((guardian, index) => (
              <div key={guardian.id} className={`${index > 0 ? 'mt-2 pt-2 border-t' : ''}`}>
                <div className="font-medium text-secondary-900">
                  {guardian.name}
                </div>
                <div className="text-sm text-secondary-600">{guardian.email}</div>
                {guardian.phone && (
                  <div className="text-xs text-secondary-500">{guardian.phone}</div>
                )}
              </div>
            ))
          ) : (
            <span className="text-secondary-500">No guardian assigned</span>
          )}
        </div>
      )
    },
    {
      key: 'financialSummary',
      header: 'Financial Summary',
      sortable: true,
      sortKey: 'balance',
      render: (playerSummary: PlayerFinancialSummary) => (
        <div className={`font-medium ${playerSummary.netBalance > 0 ? 'text-success-600' : playerSummary.netBalance < 0 ? 'text-error-600' : 'text-secondary-900'}`}>
          Net Balance: {defaultCurrency} {playerSummary.netBalance.toFixed(2)}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      sortKey: 'status',
      render: (playerSummary: PlayerFinancialSummary) => {
        const status = getFinancialStatus(playerSummary);
        return (
          <Badge variant={getStatusColor(status)}>
            {status.toUpperCase()}
          </Badge>
        );
      }
    },
    { 
      key: 'actions', 
      header: 'Actions',
      render: (playerSummary: PlayerFinancialSummary) => (
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate(`/finance/player/${playerSummary.player.id}`)}
          >
            View Details
          </Button>
          {canWrite('finance') && playerSummary.netBalance > 0 && (
            <Button variant="ghost" size="sm" className="text-primary-600 hover:text-primary-700">
              Send Reminder
            </Button>
          )}
        </div>
      )
    },
  ];

  const guardianColumns = [
    { 
      key: 'guardian', 
      header: 'Guardian',
      render: (guardianSummary: GuardianFinancialSummary) => (
        <div>
          <div className="font-medium text-secondary-900">{guardianSummary.guardian.name}</div>
          <div className="text-sm text-secondary-600">{guardianSummary.guardian.email}</div>
          {guardianSummary.guardian.phone && (
            <div className="text-xs text-secondary-500">{guardianSummary.guardian.phone}</div>
          )}
        </div>
      )
    },
    { 
      key: 'linkedPlayers', 
      header: 'Linked Players',
      render: (guardianSummary: GuardianFinancialSummary) => {
        const displayLimit = 2;
        const hasMore = guardianSummary.linkedPlayers.length > displayLimit;
        const displayPlayers = guardianSummary.linkedPlayers.slice(0, displayLimit);
        
        return (
          <div className="space-y-1">
            {displayPlayers.map((playerSummary, index) => {
              const status = getFinancialStatus(playerSummary);
              return (
                <div key={index} className="text-sm">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-secondary-900">
                      {playerSummary.user.name}
                    </span>
                    <Badge variant={getStatusColor(status)} className="text-xs py-0 px-1">
                      {status}
                    </Badge>
                  </div>
                </div>
              );
            })}
            {hasMore && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-xs text-primary-600 hover:text-primary-700 p-0"
                onClick={() => {
                  setSelectedGuardian(guardianSummary);
                  setShowDetailsModal(true);
                }}
              >
                +{guardianSummary.linkedPlayers.length - displayLimit} more players
              </Button>
            )}
          </div>
        );
      }
    },
    { 
      key: 'financialSummary', 
      header: 'Financial Summary',
      render: (guardianSummary: GuardianFinancialSummary) => (
        <div className={`font-medium text-lg ${guardianSummary.totalNetBalance > 0 ? 'text-success-600' : guardianSummary.totalNetBalance < 0 ? 'text-error-600' : 'text-secondary-900'}`}>
          Net Balance: {defaultCurrency} {guardianSummary.totalNetBalance.toFixed(2)}
        </div>
      )
    },
    { 
      key: 'actions', 
      header: 'Actions',
      render: (guardianSummary: GuardianFinancialSummary) => (
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate(`/finance/guardian/${guardianSummary.guardian.id}`)}
          >
            View Details
          </Button>
          {canWrite('users') && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-primary-600 hover:text-primary-700"
              onClick={() => handleOpenLinkPlayersModal(guardianSummary)}
            >
              Link Players
            </Button>
          )}
          {canWrite('finance') && guardianSummary.totalNetBalance > 0 && (
            <Button variant="ghost" size="sm" className="text-primary-600 hover:text-primary-700">
              Send Invoice
            </Button>
          )}
        </div>
      )
    },
  ];

  const playersTab = (
    <div className="space-y-6">
      {/* Summary Cards for Players */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="text-sm text-secondary-600">Total Players</div>
          <div className="text-2xl font-bold text-secondary-900">{totalPlayers}</div>
          <div className="text-xs text-secondary-500">Showing {filteredPlayers.length} on this page</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-secondary-600">Paid Up</div>
          <div className="text-2xl font-bold text-success-600">
            {filteredPlayers.filter(p => getFinancialStatus(p) === 'active').length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-secondary-600">Pending Payment</div>
          <div className="text-2xl font-bold text-warning-600">
            {filteredPlayers.filter(p => getFinancialStatus(p) === 'pending').length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-secondary-600">Overdue</div>
          <div className="text-2xl font-bold text-error-600">
            {filteredPlayers.filter(p => getFinancialStatus(p) === 'overdue').length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-secondary-600">Page Outstanding</div>
          <div className="text-2xl font-bold text-error-600">
            {defaultCurrency} {filteredPlayers.filter(p => p.netBalance < 0).reduce((sum, p) => sum + Math.abs(p.netBalance), 0).toFixed(2)}
          </div>
        </Card>
      </div>

      {/* Players Table */}
      <Card>
        <DataTable
          data={filteredPlayers}
          columns={playerColumns}
          emptyMessage="No players found"
          showPagination={false}
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
        />

        {/* Algolia Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-secondary-600">
              Page {currentPage + 1} of {totalPages} ({totalPlayers} total players)
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                disabled={currentPage === 0 || loading}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                disabled={currentPage >= totalPages - 1 || loading}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );

  const guardiansTab = (
    <div className="space-y-6">
      {/* Summary Cards for Guardians */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-secondary-600">Total Guardians</div>
          <div className="text-2xl font-bold text-secondary-900">{filteredGuardians.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-secondary-600">Total Players</div>
          <div className="text-2xl font-bold text-primary-600">
            {filteredGuardians.reduce((sum, g) => sum + g.linkedPlayers.length, 0)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-secondary-600">Guardians with Overdue</div>
          <div className="text-2xl font-bold text-error-600">
            {filteredGuardians.filter(g => g.totalNetBalance < 0).length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-secondary-600">Total Outstanding</div>
          <div className="text-2xl font-bold text-error-600">
            {defaultCurrency} {filteredGuardians.filter(g => g.totalNetBalance < 0).reduce((sum, g) => sum + Math.abs(g.totalNetBalance), 0).toFixed(2)}
          </div>
        </Card>
      </div>

      {/* Guardians Table */}
      <Card>
        <DataTable
          data={filteredGuardians}
          columns={guardianColumns}
          emptyMessage="No guardians found"
          showPagination={true}
          itemsPerPage={10}
        />
      </Card>
    </div>
  );

  const tabs = [
    { label: 'Players', content: playersTab },
    { label: 'Guardians', content: guardiansTab }
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow-sm rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Players & Guardians</h1>
            <p className="text-gray-600 mt-1">Financial overview and management</p>
          </div>
          <Button 
            variant="outline" 
            onClick={loadFinancialData}
            disabled={loading}
          >
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex-1 w-full sm:max-w-md">
          <Input
            type="text"
            placeholder="Search players or guardians..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="flex items-center space-x-3">
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-40"
          >
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-40"
          >
            {sortOptions.map(opt => (
              <option key={opt.value} value={opt.value}>Sort by {opt.label}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <Card>
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      </Card>

      {/* Action Buttons */}
      {canWrite('finance') && (
        <div className="flex justify-end space-x-3">
          <Button variant="outline">
            {activeTab === 0 ? 'Send Bulk Reminders' : 'Send Bulk Invoices'}
          </Button>
          <Button variant="outline">
            Export Financial Report
          </Button>
        </div>
      )}

      {/* Guardian Financial Details Modal */}
      {showDetailsModal && selectedGuardian && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-full p-4">
            <div className="w-full max-w-6xl my-8">
              <Card className="w-full">
                <div className="p-6 border-b bg-white">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-bold text-secondary-900">Guardian Financial Details</h3>
                      <p className="text-sm text-secondary-600 mt-1">
                        Guardian: {selectedGuardian.guardian.name} • {selectedGuardian.guardian.email}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setShowDetailsModal(false);
                        setSelectedGuardian(null);
                      }}
                      className="text-secondary-400 hover:text-secondary-600"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div className="p-6">
                  {/* Financial Summary */}
                  <div className="mb-6">
                    <h4 className="text-lg font-semibold text-secondary-900 mb-4">Financial Overview</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card className={`p-4 ${
                        (selectedGuardian.totalOutstanding || 0) > 0 
                          ? 'bg-gradient-to-br from-red-50 to-orange-100 border-red-200' 
                          : 'bg-gradient-to-br from-green-50 to-emerald-100 border-green-200'
                      }`}>
                        <div className="text-sm text-secondary-600">Outstanding Balance</div>
                        <div className={`text-2xl font-bold ${
                          (selectedGuardian.totalOutstanding || 0) > 0 
                            ? 'text-red-700' 
                            : 'text-green-700'
                        }`}>
                          {defaultCurrency} {(selectedGuardian.totalOutstanding || 0).toFixed(2)}
                        </div>
                      </Card>
                      
                      <Card className="p-4 bg-gradient-to-br from-blue-50 to-indigo-100 border-blue-200">
                        <div className="text-sm text-secondary-600">Available Credits</div>
                        <div className="text-2xl font-bold text-blue-700">
                          {defaultCurrency} {(selectedGuardian.totalCredits || 0).toFixed(2)}
                        </div>
                      </Card>
                      
                      <Card className={`p-4 ${
                        (selectedGuardian.totalNetBalance || 0) > 0 
                          ? 'bg-gradient-to-br from-red-50 to-orange-100 border-red-200' 
                          : 'bg-gradient-to-br from-green-50 to-emerald-100 border-green-200'
                      }`}>
                        <div className="text-sm text-secondary-600">Net Amount Due</div>
                        <div className={`text-2xl font-bold ${
                          (selectedGuardian.totalNetBalance || 0) > 0 
                            ? 'text-red-700' 
                            : 'text-green-700'
                        }`}>
                          {defaultCurrency} {(selectedGuardian.totalNetBalance || 0).toFixed(2)}
                        </div>
                      </Card>
                    </div>
                  </div>

                  {/* Guardian's Linked Players */}
                  {selectedGuardian && (
                    <div className="mb-6">
                      <h4 className="text-lg font-semibold text-secondary-900 mb-4">Linked Players</h4>
                      <div className="space-y-2">
                        {selectedGuardian.linkedPlayers.map((playerSummary, index) => {
                          const status = getFinancialStatus(playerSummary);
                          return (
                            <div key={index} className="flex justify-between items-center p-3 bg-secondary-50 rounded-lg">
                              <div>
                                <div className="font-medium text-secondary-900">
                                  {playerSummary.user.name}
                                </div>
                                <div className="text-sm text-secondary-600">
                                  Outstanding: {defaultCurrency} {playerSummary.outstandingDebits.toFixed(2)}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`font-medium ${
                                  playerSummary.netBalance > 0 ? 'text-error-600' : 
                                  playerSummary.netBalance < 0 ? 'text-success-600' : 'text-secondary-900'
                                }`}>
                                  {defaultCurrency} {playerSummary.netBalance.toFixed(2)}
                                </div>
                                <Badge variant={getStatusColor(status)} className="mt-1">
                                  {status.toUpperCase()}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}


                  {/* Footer */}
                  <div className="flex justify-end space-x-3">
                    <Button variant="outline" size="sm">
                      Export Report
                    </Button>
                    <Button
                      onClick={() => {
                        setShowDetailsModal(false);
                        setSelectedGuardian(null);
                      }}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Link Players Modal */}
      {showLinkPlayersModal && selectedGuardianForLinking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-full p-4">
            <div className="w-full max-w-2xl my-8">
              <Card className="w-full">
                <div className="p-6 border-b bg-white">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-bold text-secondary-900">Link Players to Guardian</h3>
                      <p className="text-sm text-secondary-600 mt-1">
                        Guardian: {selectedGuardianForLinking.guardian.name}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setShowLinkPlayersModal(false);
                        setSelectedGuardianForLinking(null);
                        setSelectedPlayersToLink([]);
                      }}
                      className="text-secondary-400 hover:text-secondary-600"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div className="p-6">
                  {/* Search for players */}
                  <div className="mb-4">
                    <Input
                      type="text"
                      placeholder="Search players..."
                      className="w-full"
                      onChange={(e) => {
                        const searchValue = e.target.value.toLowerCase();
                        const filtered = playerFinancials.filter(player => {
                          return !player.guardians.some(g => g.id === selectedGuardianForLinking.guardian.id) &&
                                 (player.user.name.toLowerCase().includes(searchValue) ||
                                  player.user.email.toLowerCase().includes(searchValue));
                        });
                        setAvailablePlayersForLinking(filtered);
                      }}
                    />
                  </div>

                  {/* Players list */}
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-secondary-700 mb-2">
                      Select players to link ({selectedPlayersToLink.length} selected)
                    </h4>
                    <div className="max-h-96 overflow-y-auto border rounded-lg">
                      {availablePlayersForLinking.length > 0 ? (
                        <div className="divide-y">
                          {availablePlayersForLinking.map((player) => (
                            <div
                              key={player.player.id}
                              className="flex items-center justify-between p-3 hover:bg-secondary-50"
                            >
                              <div className="flex items-center space-x-3">
                                <input
                                  type="checkbox"
                                  checked={selectedPlayersToLink.includes(player.player.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedPlayersToLink([...selectedPlayersToLink, player.player.id]);
                                    } else {
                                      setSelectedPlayersToLink(selectedPlayersToLink.filter(id => id !== player.player.id));
                                    }
                                  }}
                                  className="h-4 w-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500"
                                />
                                <div>
                                  <div className="font-medium text-secondary-900">{player.user.name}</div>
                                  <div className="text-sm text-secondary-600">{player.user.email}</div>
                                  {player.guardians.length > 0 && (
                                    <div className="text-xs text-secondary-500">
                                      Current guardians: {player.guardians.map(g => g.name).join(', ')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 text-center text-secondary-500">
                          No available players to link
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex justify-end space-x-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowLinkPlayersModal(false);
                        setSelectedGuardianForLinking(null);
                        setSelectedPlayersToLink([]);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleLinkPlayers}
                      disabled={selectedPlayersToLink.length === 0}
                    >
                      Link {selectedPlayersToLink.length} Player{selectedPlayersToLink.length !== 1 ? 's' : ''}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default PlayersGuardians;