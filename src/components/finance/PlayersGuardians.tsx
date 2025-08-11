import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, Select, DataTable, Badge, Tabs, Toast } from '../ui';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { getPlayersByOrganization } from '../../services/playerService';
import { getTransactionsByOwner } from '../../services/transactionService';
import { getReceiptsByUser, getReceiptsByOrganization, calculateUserOutstandingBalance } from '../../services/receiptService';
import { getSettingsByOrganization } from '../../services/settingsService';
import { Player, User, Transaction, Receipt } from '../../types';
import { getUserById } from '../../services/userService';

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
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [loading, setLoading] = useState(true);
  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');
  
  // Data state
  const [playerFinancials, setPlayerFinancials] = useState<PlayerFinancialSummary[]>([]);
  const [guardianFinancials, setGuardianFinancials] = useState<GuardianFinancialSummary[]>([]);
  const [selectedGuardian, setSelectedGuardian] = useState<GuardianFinancialSummary | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (selectedOrganization?.id) {
      loadFinancialData();
    }
  }, [selectedOrganization, selectedAcademy]);

  const loadFinancialData = async () => {
    if (!selectedOrganization?.id) return;

    try {
      setLoading(true);
      
      // Load currency from settings
      const settingsData = await getSettingsByOrganization(selectedOrganization.id);
      if (settingsData?.generalSettings?.currency) {
        setDefaultCurrency(settingsData.generalSettings.currency);
      }

      // Load all players for the organization
      const players = await getPlayersByOrganization(selectedOrganization.id);
      
      // Batch load all users first to reduce individual calls
      const userIds = new Set([
        ...players.map(p => p.userId),
        ...players.flatMap(p => p.guardianId || [])
      ]);
      
      const usersMap = new Map<string, User>();
      const userLoadPromises = Array.from(userIds).map(async (userId) => {
        try {
          const user = await getUserById(userId);
          if (user) usersMap.set(userId, user);
        } catch (error) {
          console.error(`Error loading user ${userId}:`, error);
        }
      });
      
      await Promise.all(userLoadPromises);

      // Load basic player summaries with minimal data for initial display
      const playerSummaries: PlayerFinancialSummary[] = [];
      
      for (const player of players) {
        const user = usersMap.get(player.userId);
        if (!user) continue;

        const guardians: User[] = [];
        if (player.guardianId && player.guardianId.length > 0) {
          player.guardianId.forEach(guardianId => {
            const guardian = usersMap.get(guardianId);
            if (guardian) guardians.push(guardian);
          });
        }

        // For initial load, just show basic info with placeholders
        // Detailed financial data will be loaded on demand
        playerSummaries.push({
          player,
          user,
          guardians,
          outstandingDebits: 0, // Will be loaded on demand
          availableCredits: 0,  // Will be loaded on demand
          netBalance: 0,        // Will be loaded on demand
          recentTransactions: [], // Will be loaded on demand
          receipts: [],         // Will be loaded on demand
          totalTransactionAmount: 0
        });
      }

      setPlayerFinancials(playerSummaries);

      // Generate basic guardian summaries
      const guardianMap = new Map<string, GuardianFinancialSummary>();
      
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
          }
          
          const guardianSummary = guardianMap.get(guardian.id)!;
          guardianSummary.linkedPlayers.push(playerSummary);
        });
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
      console.log(`🔍 Starting financial data load for ${playerSummaries.length} players`);
      
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
            console.log(`📊 Processing financial data for ${playerSummary.user.name}`);

            // Get transactions
            let transactions: Transaction[] = [];
            try {
              const userRef = { id: playerSummary.player.userId } as any;
              transactions = await getTransactionsByOwner(selectedOrganization.id, userRef);
              console.log(`✅ Loaded ${transactions.length} transactions for ${playerSummary.user.name}`);
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
              console.log(`✅ Calculated balance for ${playerSummary.user.name}:`, {
                outstandingDebits: balanceInfo.outstandingDebits,
                availableCredits: balanceInfo.availableCredits
              });
            } catch (balanceError) {
              console.error(`Error calculating balance for ${playerSummary.user.name}:`, balanceError);
            }
            
            // Filter receipts for this specific user from organization receipts
            const organizationReceipts = allOrgReceipts.filter(r => {
              return r.userRef && r.userRef.id === playerSummary.player.userId &&
                     r.organizationId === selectedOrganization.id && 
                     (r.status === 'active' || !r.status);
            });

            // Use user's balance field directly for net balance
            const netBalance = playerSummary.user.balance ?? 0;

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
              netBalance: playerSummary.user.balance ?? 0,
              recentTransactions: [],
              receipts: [],
              totalTransactionAmount: 0
            };
          }
        })
      );

      console.log(`✅ Finished processing ${updatedSummaries.length} player summaries`);
      setPlayerFinancials(updatedSummaries);

      // Update guardian summaries with detailed data
      const guardianMap = new Map<string, GuardianFinancialSummary>();
      
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
          }
          
          const guardianSummary = guardianMap.get(guardian.id)!;
          guardianSummary.linkedPlayers.push(playerSummary);
          guardianSummary.totalOutstanding += playerSummary.outstandingDebits;
          guardianSummary.totalCredits += playerSummary.availableCredits;
          guardianSummary.totalNetBalance += playerSummary.netBalance;
          guardianSummary.totalTransactionAmount += playerSummary.totalTransactionAmount;
          guardianSummary.allTransactions.push(...playerSummary.recentTransactions);
          guardianSummary.allReceipts.push(...playerSummary.receipts);
        });
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

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
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
    if (playerSummary.netBalance < 0) return 'overdue'; // Negative balance = owes money
    if (playerSummary.netBalance > 0) return 'credit'; // Positive balance = has credit
    return 'active'; // Zero balance = even
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'overdue':
        return 'error';
      case 'credit':
        return 'primary';
      default:
        return 'secondary';
    }
  };

  const filteredPlayers = playerFinancials
    .filter(playerSummary => {
      const matchesSearch = 
        playerSummary.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        playerSummary.guardians.some(g => 
          g.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
          g.email.toLowerCase().includes(searchTerm.toLowerCase())
        );
      
      const status = getFinancialStatus(playerSummary);
      const matchesStatus = filterStatus === 'all' || status === filterStatus;
      const matchesAcademy = !selectedAcademy || playerSummary.player.academyId?.includes(selectedAcademy.id);
      
      return matchesSearch && matchesStatus && matchesAcademy;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'balance':
          return b.netBalance - a.netBalance;
        case 'outstanding':
          return b.outstandingDebits - a.outstandingDebits;
        case 'credits':
          return b.availableCredits - a.availableCredits;
        default:
          return a.user.name.localeCompare(b.user.name);
      }
    });

  const filteredGuardians = guardianFinancials
    .filter(guardianSummary => {
      const matchesSearch = 
        guardianSummary.guardian.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        guardianSummary.guardian.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        guardianSummary.linkedPlayers.some(p => p.user.name.toLowerCase().includes(searchTerm.toLowerCase()));
      
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
      render: (playerSummary: PlayerFinancialSummary) => (
        <div className="cursor-pointer" onClick={() => navigate(`/users/${playerSummary.user.id}`)}>
          <div className="font-medium text-secondary-900 hover:text-primary-600">{playerSummary.user.name}</div>
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
                <div className="font-medium text-secondary-900 cursor-pointer hover:text-primary-600" 
                     onClick={() => navigate(`/users/${guardian.id}`)}>
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
      render: (playerSummary: PlayerFinancialSummary) => (
        <div className={`font-medium ${playerSummary.netBalance > 0 ? 'text-success-600' : playerSummary.netBalance < 0 ? 'text-error-600' : 'text-secondary-900'}`}>
          Net Balance: {defaultCurrency} {playerSummary.netBalance.toFixed(2)}
        </div>
      )
    },
    { 
      key: 'status', 
      header: 'Status',
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
        <div className="cursor-pointer" onClick={() => navigate(`/users/${guardianSummary.guardian.id}`)}>
          <div className="font-medium text-secondary-900 hover:text-primary-600">{guardianSummary.guardian.name}</div>
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
                    <span className="font-medium text-secondary-900 cursor-pointer hover:text-primary-600"
                          onClick={() => navigate(`/users/${playerSummary.user.id}`)}>
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
            onClick={() => {
              setSelectedGuardian(guardianSummary);
              setShowDetailsModal(true);
            }}
          >
            View Details
          </Button>
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-secondary-600">Total Players</div>
          <div className="text-2xl font-bold text-secondary-900">{filteredPlayers.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-secondary-600">Active Players</div>
          <div className="text-2xl font-bold text-success-600">
            {filteredPlayers.filter(p => getFinancialStatus(p) === 'active').length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-secondary-600">Overdue Accounts</div>
          <div className="text-2xl font-bold text-error-600">
            {filteredPlayers.filter(p => getFinancialStatus(p) === 'overdue').length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-secondary-600">Total Outstanding</div>
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
          showPagination={true}
          itemsPerPage={10}
        />
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
                                <div className="font-medium text-secondary-900 cursor-pointer hover:text-primary-600"
                                     onClick={() => navigate(`/users/${playerSummary.user.id}`)}>
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