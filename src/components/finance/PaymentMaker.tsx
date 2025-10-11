import React, { useState, useEffect, useRef } from 'react';
import { Button, Label, Select, Input, Card } from '../ui';
import { User, Player } from '../../types';
import { calculateUserOutstandingBalance } from '../../services/receiptService';
import { recalculateAndUpdateUserOutstandingAndCredits } from '../../services/userService';
import { useApp } from '../../contexts/AppContext';
import { doc } from 'firebase/firestore';
import { db } from '../../firebase';

interface PlayerPayment {
  playerId: string;
  playerName: string;
  amount: number;
  outstandingBalance: number; // Raw outstanding debits
  availableCredits: number; // Available credit balance
  netBalance: number; // Net amount (positive = owes, negative = credit balance, zero = balanced)
  userRef: any;
}

interface PaymentMakerProps {
  users: User[];
  players: Player[];
  onPaymentMakerChange: (paymentMaker: {
    name: string;
    userRef: any;
    type: 'player' | 'guardian';
  } | null) => void;
  onPlayerPaymentsChange: (payments: PlayerPayment[]) => void;
  selectedPaymentMaker: {
    name: string;
    userRef: any;
    type: 'player' | 'guardian';
  } | null;
  playerPayments: PlayerPayment[];
  currency?: string;
  // Guardian general payment props
  onGuardianGeneralPaymentChange?: (amount: string) => void;
  guardianGeneralPaymentAmount?: string;
}

const PaymentMaker: React.FC<PaymentMakerProps> = ({
  users,
  players,
  onPaymentMakerChange,
  onPlayerPaymentsChange,
  selectedPaymentMaker,
  playerPayments,
  currency = 'USD',
  onGuardianGeneralPaymentChange,
  guardianGeneralPaymentAmount = ''
}) => {
  const { selectedOrganization } = useApp();
  const [availablePlayersForSelection, setAvailablePlayersForSelection] = useState<Player[]>([]);
  const [showAdditionalPlayerSelection, setShowAdditionalPlayerSelection] = useState(false);
  const [selectedAdditionalPlayerId, setSelectedAdditionalPlayerId] = useState('');
  const [loadingGuardianData, setLoadingGuardianData] = useState(false);
  const [loadingAdditionalPlayer, setLoadingAdditionalPlayer] = useState(false);
  const [guardianBalance, setGuardianBalance] = useState<{
    outstandingDebits: number;
    availableCredits: number;
    netBalance: number;
  } | null>(null);
  
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [userTypeFilter, setUserTypeFilter] = useState<'all' | 'players' | 'guardians'>('all');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedSearchUser, setSelectedSearchUser] = useState<User | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Helper function to get balance info - optimized for speed
  const getBalanceInfo = async (userId: string, organizationId: string) => {
    try {
      // Just calculate fresh values without waiting for storage update
      const calculatedValues = await calculateUserOutstandingBalance(userId, organizationId);
      
      // Update stored values in background without waiting (fire and forget)
      recalculateAndUpdateUserOutstandingAndCredits(userId, organizationId).catch(err => {
        console.warn(`Background balance update failed for ${userId}:`, err);
      });
      
      return calculatedValues;
    } catch (error) {
      console.error(`Error getting balance for user ${userId}:`, error);
      return { outstandingDebits: 0, availableCredits: 0, netBalance: 0, pendingDebitReceipts: [], creditReceipts: [] };
    }
  };

  // Get guardians and players for selection
  const guardians = users.filter(user => 
    user.roles.some(role => role.role.includes('guardian'))
  );
  const playersAsUsers = users.filter(user => 
    user.roles.some(role => role.role.includes('player'))
  );
  
  // Filter users based on search term and user type filter
  const filterUsers = (userList: User[], userType: 'guardian' | 'player') => {
    return userList.filter(user => {
      // Filter by search term (name or email)
      const matchesSearch = searchTerm === '' || 
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filter by user type
      const matchesType = userTypeFilter === 'all' || 
        (userTypeFilter === 'guardians' && userType === 'guardian') ||
        (userTypeFilter === 'players' && userType === 'player');
      
      return matchesSearch && matchesType;
    });
  };
  
  const filteredGuardians = filterUsers(guardians, 'guardian');
  const filteredPlayersAsUsers = filterUsers(playersAsUsers, 'player');
  const filteredAllUsers = userTypeFilter === 'all' && guardians.length === 0 && playersAsUsers.length === 0 
    ? users.filter(user => 
        searchTerm === '' || 
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];


  // Handle click outside to close search results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const loadGuardianPlayersAndBalances = async () => {
      if (!selectedPaymentMaker || selectedPaymentMaker.type !== 'guardian') {
        setGuardianBalance(null);
        // Don't clear playerPayments here if it's a player type - it's handled in handlePaymentMakerChange
        if (selectedPaymentMaker?.type !== 'player') {
          onPlayerPaymentsChange([]);
          setLoadingGuardianData(false);
        }
        return;
      }

      try {
        setLoadingGuardianData(true);
        
        // Load complete player data from Firestore to get guardian relationships
        // The players prop from Transactions may not have complete guardian data
        console.log('📊 Loading complete player data to find guardian relationships for:', selectedPaymentMaker.userRef.id);
        console.log('📊 Available players in props:', players.length);
        console.log('📊 Sample player guardianId data from props:', players.slice(0, 3).map(p => ({
          id: p.id,
          userId: p.userId,
          guardianId: p.guardianId
        })));
        
        // Import and load full player data
        const { getPlayersByOrganization } = await import('../../services/playerService');
        const fullPlayersData = await getPlayersByOrganization(selectedOrganization!.id);
        console.log('📊 Full player data loaded from Firestore:', fullPlayersData.length);
        console.log('📊 Sample full player guardianId data:', fullPlayersData.slice(0, 3).map(p => ({
          id: p.id,
          userId: p.userId,
          guardianId: p.guardianId
        })));
        
        // Filter players that have this guardian ID
        const linkedPlayers = fullPlayersData.filter(player => {
          // Filter players that have this guardian ID - ensure guardianId exists and is array
          if (!player.guardianId || !Array.isArray(player.guardianId)) {
            console.log(`❌ Player ${player.id} has no valid guardianId array:`, player.guardianId);
            return false;
          }
          const hasGuardian = player.guardianId.includes(selectedPaymentMaker.userRef.id);
          console.log(`🔍 Player ${player.id} guardianId:`, player.guardianId, 'includes', selectedPaymentMaker.userRef.id, ':', hasGuardian);
          return hasGuardian;
        });
        
        console.log(`📊 Found ${linkedPlayers.length} players linked to guardian`);

        // Load guardian's own balance (excess payments/credits)
        if (selectedOrganization?.id) {
          try {
            const guardianBalanceInfo = await getBalanceInfo(selectedPaymentMaker.userRef.id, selectedOrganization.id);
            setGuardianBalance({
              outstandingDebits: guardianBalanceInfo.outstandingDebits,
              availableCredits: guardianBalanceInfo.availableCredits,
              netBalance: guardianBalanceInfo.netBalance
            });
            console.log(`💰 Guardian balance loaded:`, guardianBalanceInfo);
          } catch (error) {
            console.error('❌ Error loading guardian balance:', error);
            setGuardianBalance(null);
          }
        }

        // Fetch all player balances in parallel for faster loading
        const balancePromises = linkedPlayers.map(async (player) => {
          console.log(`💰 Loading balance for player ${player.id} (userId: ${player.userId})`);
          const balanceInfo = selectedOrganization?.id 
            ? await getBalanceInfo(player.userId, selectedOrganization.id)
            : { outstandingDebits: 0, availableCredits: 0, netBalance: 0, pendingDebitReceipts: [], creditReceipts: [] };
          
          const playerUser = users.find(u => u.id === player.userId);
          console.log(`💰 Player ${player.id} user found:`, playerUser ? playerUser.name : 'NOT FOUND');
          
          return {
            playerId: player.id,
            playerName: playerUser?.name || 'Unknown Player',
            amount: 0,
            outstandingBalance: balanceInfo.outstandingDebits,
            availableCredits: balanceInfo.availableCredits,
            netBalance: balanceInfo.netBalance,
            userRef: doc(db, 'users', player.userId)
          };
        });

        // Wait for all balances to load in parallel
        const paymentsWithBalances = await Promise.all(balancePromises);
        onPlayerPaymentsChange(paymentsWithBalances);
      } catch (error) {
        console.error('❌ Error loading guardian players:', error);
      } finally {
        setLoadingGuardianData(false);
      }
    };

    loadGuardianPlayersAndBalances();
  }, [selectedPaymentMaker, users, players, selectedOrganization]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Set available players for additional selection (excluding already included ones)
    const currentPlayerIds = playerPayments.map(p => p.playerId);
    const available = players.filter(player => !currentPlayerIds.includes(player.id));
    setAvailablePlayersForSelection(available);
  }, [players, playerPayments]);

  const handleSearchUserSelect = async (user: User, type: 'player' | 'guardian') => {
    setSelectedSearchUser(user);
    setSearchTerm(user.name);
    setShowSearchResults(false);

    const paymentMaker = {
      name: user.name,
      userRef: doc(db, 'users', user.id),
      type: type
    };

    onPaymentMakerChange(paymentMaker);

    // If it's a player making payment, add them to the payment list
    if (type === 'player') {
      // Clear previous payments first to show loading state
      onPlayerPaymentsChange([]);
      setLoadingGuardianData(true); // Reuse loading state for player as well
      
      try {
        const player = players.find(p => p.userId === user.id);
        if (player) {
          // Get detailed balance info including outstanding debits and credits
          const balanceInfo = selectedOrganization?.id 
            ? await getBalanceInfo(user.id, selectedOrganization.id)
            : { outstandingDebits: 0, availableCredits: 0, netBalance: 0, pendingDebitReceipts: [], creditReceipts: [] };
          
          onPlayerPaymentsChange([{
            playerId: player.id,
            playerName: user.name,
            amount: 0,
            outstandingBalance: balanceInfo.outstandingDebits,
            availableCredits: balanceInfo.availableCredits,
            netBalance: balanceInfo.netBalance,
            userRef: doc(db, 'users', user.id)
          }]);
        }
      } catch (error) {
        console.error('Error loading player balance:', error);
        onPlayerPaymentsChange([]); // Clear on error
      } finally {
        setLoadingGuardianData(false);
      }
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handlePaymentMakerChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (!value) {
      onPaymentMakerChange(null);
      return;
    }

    const [type, userId] = value.split(':');
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const paymentMaker = {
      name: user.name,
      userRef: doc(db, 'users', user.id),
      type: type as 'player' | 'guardian'
    };

    onPaymentMakerChange(paymentMaker);

    // If it's a player making payment, add them to the payment list
    if (type === 'player') {
      // Clear previous payments first to show loading state
      onPlayerPaymentsChange([]);
      setLoadingGuardianData(true); // Reuse loading state for player as well
      
      try {
        const player = players.find(p => p.userId === userId);
        if (player) {
          // Get detailed balance info including outstanding debits and credits
          const balanceInfo = selectedOrganization?.id 
            ? await getBalanceInfo(userId, selectedOrganization.id)
            : { outstandingDebits: 0, availableCredits: 0, netBalance: 0, pendingDebitReceipts: [], creditReceipts: [] };
          
          onPlayerPaymentsChange([{
            playerId: player.id,
            playerName: user.name,
            amount: 0,
            outstandingBalance: balanceInfo.outstandingDebits,
            availableCredits: balanceInfo.availableCredits,
            netBalance: balanceInfo.netBalance,
            userRef: doc(db, 'users', userId)
          }]);
        }
      } catch (error) {
        console.error('Error loading player balance:', error);
        onPlayerPaymentsChange([]); // Clear on error
      } finally {
        setLoadingGuardianData(false);
      }
    }
  };

  const handlePlayerAmountChange = (playerId: string, amount: string) => {
    const numAmount = parseFloat(amount) || 0;
    const updatedPayments = playerPayments.map(payment =>
      payment.playerId === playerId
        ? { ...payment, amount: numAmount }
        : payment
    );
    onPlayerPaymentsChange(updatedPayments);
  };

  const handleAddAdditionalPlayer = async () => {
    if (!selectedAdditionalPlayerId) return;

    try {
      setLoadingAdditionalPlayer(true);

      const player = players.find(p => p.id === selectedAdditionalPlayerId);
      if (!player) return;

      const user = users.find(u => u.id === player.userId);
      if (!user) return;

      // Get detailed balance info including outstanding debits and credits
      const balanceInfo = selectedOrganization?.id 
        ? await getBalanceInfo(player.userId, selectedOrganization.id)
        : { outstandingDebits: 0, availableCredits: 0, netBalance: 0, pendingDebitReceipts: [], creditReceipts: [] };
      
      const newPayment: PlayerPayment = {
        playerId: player.id,
        playerName: user.name,
        amount: 0,
        outstandingBalance: balanceInfo.outstandingDebits,
        availableCredits: balanceInfo.availableCredits,
        netBalance: balanceInfo.netBalance,
        userRef: doc(db, 'users', player.userId)
      };

      onPlayerPaymentsChange([...playerPayments, newPayment]);
      setSelectedAdditionalPlayerId('');
      setShowAdditionalPlayerSelection(false);
    } catch (error) {
      console.error('Error adding additional player:', error);
    } finally {
      setLoadingAdditionalPlayer(false);
    }
  };

  const handleRemovePlayer = (playerId: string) => {
    const updatedPayments = playerPayments.filter(payment => payment.playerId !== playerId);
    onPlayerPaymentsChange(updatedPayments);
  };

  const getTotalAmount = () => {
    const playerTotal = playerPayments.reduce((total, payment) => total + payment.amount, 0);
    const guardianAmount = selectedPaymentMaker?.type === 'guardian' && guardianGeneralPaymentAmount 
      ? parseFloat(guardianGeneralPaymentAmount) || 0 
      : 0;
    return playerTotal + guardianAmount;
  };

  return (
    <div className="space-y-6">
      {/* Payment Maker Selection */}
      <div>
        <Label htmlFor="paymentMaker">Who is making the payment?</Label>
        
        {/* Search Input */}
        <div className="relative mt-2" ref={searchContainerRef}>
          <Input
            type="text"
            placeholder="Type player or guardian name to search..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowSearchResults(e.target.value.length > 0);
              if (e.target.value.length === 0) {
                setSelectedSearchUser(null);
                onPaymentMakerChange(null);
              }
            }}
            onFocus={() => setShowSearchResults(searchTerm.length > 0)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowSearchResults(false);
              }
            }}
            className="w-full"
          />
          
          {/* Search Results Dropdown */}
          {showSearchResults && searchTerm.length > 0 && (
            <div className="absolute z-50 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto mt-1">
              {/* Filter Tabs */}
              <div className="flex border-b border-gray-200">
                <button
                  type="button"
                  className={`flex-1 px-3 py-2 text-xs font-medium ${
                    userTypeFilter === 'players' 
                      ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-500' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setUserTypeFilter('players')}
                >
                  Players
                </button>
                <button
                  type="button"
                  className={`flex-1 px-3 py-2 text-xs font-medium ${
                    userTypeFilter === 'guardians' 
                      ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-500' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setUserTypeFilter('guardians')}
                >
                  Guardians
                </button>
                <button
                  type="button"
                  className={`flex-1 px-3 py-2 text-xs font-medium ${
                    userTypeFilter === 'all' 
                      ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-500' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setUserTypeFilter('all')}
                >
                  All
                </button>
              </div>

              {/* Search Results */}
              <div className="max-h-48 overflow-y-auto">
                {/* Players */}
                {(userTypeFilter === 'all' || userTypeFilter === 'players') && filteredPlayersAsUsers.length > 0 && (
                  <div>
                    {userTypeFilter === 'all' && <div className="px-3 py-1 text-xs font-medium text-gray-500 bg-gray-50">Players</div>}
                    {filteredPlayersAsUsers.map(player => (
                      <button
                        key={`player:${player.id}`}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                        onClick={() => handleSearchUserSelect(player, 'player')}
                      >
                        <div className="font-medium text-gray-900">{player.name}</div>
                        <div className="text-sm text-gray-500">{player.email}</div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Guardians */}
                {(userTypeFilter === 'all' || userTypeFilter === 'guardians') && filteredGuardians.length > 0 && (
                  <div>
                    {userTypeFilter === 'all' && <div className="px-3 py-1 text-xs font-medium text-gray-500 bg-gray-50">Guardians</div>}
                    {filteredGuardians.map(guardian => (
                      <button
                        key={`guardian:${guardian.id}`}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                        onClick={() => handleSearchUserSelect(guardian, 'guardian')}
                      >
                        <div className="font-medium text-gray-900">{guardian.name}</div>
                        <div className="text-sm text-gray-500">{guardian.email}</div>
                      </button>
                    ))}
                  </div>
                )}

                {/* All Users (when no specific roles found) */}
                {userTypeFilter === 'all' && filteredGuardians.length === 0 && filteredPlayersAsUsers.length === 0 && filteredAllUsers.length > 0 && (
                  <div>
                    <div className="px-3 py-1 text-xs font-medium text-gray-500 bg-gray-50">All Users</div>
                    {filteredAllUsers.map(user => (
                      <button
                        key={`user:${user.id}`}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                        onClick={() => handleSearchUserSelect(user, 'guardian')}
                      >
                        <div className="font-medium text-gray-900">{user.name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </button>
                    ))}
                  </div>
                )}

                {/* No Results */}
                {filteredGuardians.length === 0 && filteredPlayersAsUsers.length === 0 && filteredAllUsers.length === 0 && (
                  <div className="px-3 py-4 text-center text-sm text-gray-500">
                    No users found matching "{searchTerm}"
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Selected User Display */}
        {selectedSearchUser && (
          <div className="mt-2 p-3 bg-primary-50 border border-primary-200 rounded-md">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-primary-900">{selectedSearchUser.name}</div>
                <div className="text-sm text-primary-700">{selectedSearchUser.email}</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedSearchUser(null);
                  setSearchTerm('');
                  onPaymentMakerChange(null);
                }}
                className="text-primary-600 hover:text-primary-700"
              >
                Clear
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Loading Payment Maker Data */}
      {selectedPaymentMaker && loadingGuardianData && (
        <div className="space-y-4">
          <div className="flex items-center justify-center py-4">
            <div className="flex items-center space-x-3">
              <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <div>
                <div className="font-medium text-secondary-900">
                  Loading {selectedPaymentMaker.type === 'guardian' ? 'Guardian' : 'Player'} Data...
                </div>
                <div className="text-sm text-secondary-600">
                  {selectedPaymentMaker.type === 'guardian' 
                    ? 'Fetching linked players and their balances' 
                    : 'Fetching player balance information'
                  }
                </div>
              </div>
            </div>
          </div>
          
          {/* Skeleton loader for both player and guardian */}
          <div className="animate-pulse">
            <Card className="p-4">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="h-5 bg-gray-200 rounded w-32 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-48"></div>
                  </div>
                  <div className="h-8 bg-gray-200 rounded w-24"></div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <div className="h-4 bg-gray-200 rounded w-40"></div>
                  <div className="h-10 bg-gray-200 rounded w-32"></div>
                </div>
              </div>
            </Card>
            
            {/* Show multiple skeleton cards for guardian since they can have multiple players */}
            {selectedPaymentMaker.type === 'guardian' && (
              <div className="mt-3">
                <Card className="p-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="h-5 bg-gray-200 rounded w-32 mb-2"></div>
                        <div className="h-4 bg-gray-200 rounded w-48"></div>
                      </div>
                      <div className="h-8 bg-gray-200 rounded w-24"></div>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <div className="h-4 bg-gray-200 rounded w-40"></div>
                      <div className="h-10 bg-gray-200 rounded w-32"></div>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No Players Found for Guardian */}
      {selectedPaymentMaker && selectedPaymentMaker.type === 'guardian' && playerPayments.length === 0 && !loadingGuardianData && (
        <div className="text-center py-8">
          <div className="text-secondary-500 mb-4">
            <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
            </svg>
            <h3 className="text-lg font-medium text-secondary-900 mb-2">No Players Found</h3>
            <p className="text-secondary-600 mb-4">
              This guardian doesn't have any linked players yet.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAdditionalPlayerSelection(true)}
              className="text-primary-600 border-primary-600 hover:bg-primary-50"
            >
              + Add Player
            </Button>
          </div>
        </div>
      )}

      {/* Player Payments Section */}
      {selectedPaymentMaker && playerPayments.length > 0 && !loadingGuardianData && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium text-secondary-900">
              {selectedPaymentMaker.type === 'guardian' ? 'Players under this Guardian' : 'Payment for Players'}
            </h4>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                console.log('Opening additional player selection modal');
                setShowAdditionalPlayerSelection(true);
              }}
              className="text-primary-600 border-primary-600 hover:bg-primary-50"
            >
              + Add Other Player
            </Button>
          </div>

          {/* Guardian General Payment Field */}
          {selectedPaymentMaker.type === 'guardian' && onGuardianGeneralPaymentChange && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label htmlFor="guardianGeneralPayment" className="text-sm font-medium text-blue-900 mb-2 block">
                    General Payment for Guardian
                  </Label>
                  <p className="text-xs text-blue-700 mb-3">
                    This payment will be automatically distributed across linked players with outstanding balances (highest balance first)
                  </p>
                </div>
                <div className="ml-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-blue-700">{currency}</span>
                    <Input
                      id="guardianGeneralPayment"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={guardianGeneralPaymentAmount}
                      onChange={(e) => onGuardianGeneralPaymentChange(e.target.value)}
                      className="w-32 border-blue-300 focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Guardian Available Credits Display */}
          {selectedPaymentMaker.type === 'guardian' && guardianBalance && guardianBalance.availableCredits > 0 && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-green-900">Available Guardian Credits</div>
                  <div className="text-xs text-green-700">
                    Excess payments that can be applied to future invoices
                  </div>
                </div>
                <div className="text-lg font-bold text-green-700">
                  {currency} {guardianBalance.availableCredits.toFixed(2)}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {playerPayments.map((payment) => (
              <Card key={payment.playerId} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-secondary-900">{payment.playerName}</div>
                    <div className="text-xs text-secondary-600 space-y-1">
                      {/* Net Balance (what they owe or credit they have) */}
                      <div className={`${payment.netBalance > 0 ? 'text-red-600' : payment.netBalance < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                        {payment.netBalance > 0 
                          ? `Owes ${currency} ${payment.netBalance.toFixed(2)}` 
                          : payment.netBalance < 0 
                            ? `Credit Balance: ${currency} ${Math.abs(payment.netBalance).toFixed(2)}`
                            : 'Up to date'
                        }
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      <Label htmlFor={`amount-${payment.playerId}`} className="text-sm">
                        Payment:
                      </Label>
                      <Input
                        id={`amount-${payment.playerId}`}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={payment.amount || ''}
                        onChange={(e) => handlePlayerAmountChange(payment.playerId, e.target.value)}
                        className="w-24"
                      />
                    </div>
                    
                    {/* Only show remove button if this isn't the payment maker themselves or if there are multiple players */}
                    {(selectedPaymentMaker.type === 'guardian' || playerPayments.length > 1) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemovePlayer(payment.playerId)}
                        className="text-red-600 hover:text-red-700"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Total Amount Display */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="font-medium text-secondary-900">Total Payment Amount:</span>
              <span className="text-lg font-bold text-primary-600">
                {currency} {getTotalAmount().toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Additional Player Selection Modal */}
      {showAdditionalPlayerSelection && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-secondary-900 mb-4">
                Add Additional Player
              </h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="additionalPlayer">Select Player</Label>
                  <Select
                    id="additionalPlayer"
                    value={selectedAdditionalPlayerId}
                    onChange={(e) => setSelectedAdditionalPlayerId(e.target.value)}
                  >
                    <option value="">Select a player...</option>
                    {availablePlayersForSelection.length > 0 ? (
                      availablePlayersForSelection.map(player => {
                        const user = users.find(u => u.id === player.userId);
                        return (
                          <option key={player.id} value={player.id}>
                            {user?.name || 'Unknown Player'}
                          </option>
                        );
                      })
                    ) : (
                      players.map(player => {
                        const user = users.find(u => u.id === player.userId);
                        return (
                          <option key={player.id} value={player.id}>
                            {user?.name || 'Unknown Player'} (All Players)
                          </option>
                        );
                      })
                    )}
                  </Select>
                  <div className="mt-2 text-xs text-gray-500">
                    Available: {availablePlayersForSelection.length}, Total Players: {players.length}
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAdditionalPlayerSelection(false);
                    setSelectedAdditionalPlayerId('');
                  }}
                  disabled={loadingAdditionalPlayer}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleAddAdditionalPlayer}
                  disabled={!selectedAdditionalPlayerId || loadingAdditionalPlayer}
                >
                  {loadingAdditionalPlayer && (
                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {loadingAdditionalPlayer ? 'Adding Player...' : 'Add Player'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default PaymentMaker;