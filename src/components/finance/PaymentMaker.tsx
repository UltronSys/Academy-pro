import React, { useState, useEffect } from 'react';
import { Button, Label, Select, Input, Card } from '../ui';
import { User, Player } from '../../types';
import { getPlayersByGuardianId } from '../../services/playerService';
import { calculateUserOutstandingBalance } from '../../services/receiptService';
import { getUserStoredOutstandingAndCredits, recalculateAndUpdateUserOutstandingAndCredits } from '../../services/userService';
import { useApp } from '../../contexts/AppContext';
import { doc } from 'firebase/firestore';
import { db } from '../../firebase';

interface PlayerPayment {
  playerId: string;
  playerName: string;
  amount: number;
  outstandingBalance: number; // Net outstanding amount (debits - credits)
  availableCredits: number; // Available credit balance
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
}

const PaymentMaker: React.FC<PaymentMakerProps> = ({
  users,
  players,
  onPaymentMakerChange,
  onPlayerPaymentsChange,
  selectedPaymentMaker,
  playerPayments,
  currency = 'USD'
}) => {
  const { selectedOrganization } = useApp();
  const [guardianPlayers, setGuardianPlayers] = useState<Player[]>([]);
  const [availablePlayersForSelection, setAvailablePlayersForSelection] = useState<Player[]>([]);
  const [showAdditionalPlayerSelection, setShowAdditionalPlayerSelection] = useState(false);
  const [selectedAdditionalPlayerId, setSelectedAdditionalPlayerId] = useState('');
  const [loadingGuardianData, setLoadingGuardianData] = useState(false);
  const [loadingAdditionalPlayer, setLoadingAdditionalPlayer] = useState(false);
  
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [userTypeFilter, setUserTypeFilter] = useState<'all' | 'players' | 'guardians'>('all');

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


  useEffect(() => {
    const loadGuardianPlayersAndBalances = async () => {
      if (!selectedPaymentMaker || selectedPaymentMaker.type !== 'guardian') {
        setGuardianPlayers([]);
        // Don't clear playerPayments here if it's a player type - it's handled in handlePaymentMakerChange
        if (selectedPaymentMaker?.type !== 'player') {
          onPlayerPaymentsChange([]);
          setLoadingGuardianData(false);
        }
        return;
      }

      try {
        setLoadingGuardianData(true);
        
        // Get players linked to this guardian
        const linkedPlayers = await getPlayersByGuardianId(selectedPaymentMaker.userRef.id);
        setGuardianPlayers(linkedPlayers);

        // Fetch all player balances in parallel for faster loading
        const balancePromises = linkedPlayers.map(async (player) => {
          const balanceInfo = selectedOrganization?.id 
            ? await getBalanceInfo(player.userId, selectedOrganization.id)
            : { outstandingDebits: 0, availableCredits: 0, netBalance: 0, pendingDebitReceipts: [], creditReceipts: [] };
          
          return {
            playerId: player.id,
            playerName: users.find(u => u.id === player.userId)?.name || 'Unknown Player',
            amount: 0,
            outstandingBalance: balanceInfo.outstandingDebits,
            availableCredits: balanceInfo.availableCredits,
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
  }, [selectedPaymentMaker, users]);

  useEffect(() => {
    // Set available players for additional selection (excluding already included ones)
    const currentPlayerIds = playerPayments.map(p => p.playerId);
    const available = players.filter(player => !currentPlayerIds.includes(player.id));
    console.log('Available players for selection:', {
      totalPlayers: players.length,
      currentPlayerIds,
      available: available.length,
      availablePlayers: available.map(p => ({ id: p.id, userId: p.userId, name: users.find(u => u.id === p.userId)?.name }))
    });
    setAvailablePlayersForSelection(available);
  }, [players, playerPayments]);

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
    return playerPayments.reduce((total, payment) => total + payment.amount, 0);
  };

  return (
    <div className="space-y-6">
      {/* Payment Maker Selection */}
      <div>
        <Label htmlFor="paymentMaker">Who is making the payment?</Label>
        
        {/* Search and Filter Controls */}
        <div className="flex gap-3 mt-2 mb-3">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="w-40">
            <Select
              value={userTypeFilter}
              onChange={(e) => setUserTypeFilter(e.target.value as 'all' | 'players' | 'guardians')}
            >
              <option value="all">All Users</option>
              <option value="players">Players Only</option>
              <option value="guardians">Guardians Only</option>
            </Select>
          </div>
        </div>
        <Select
          id="paymentMaker"
          value={selectedPaymentMaker ? `${selectedPaymentMaker.type}:${selectedPaymentMaker.userRef.id}` : ''}
          onChange={handlePaymentMakerChange}
          required
        >
          <option value="">Select payment maker...</option>
          
          {/* Show filtered results based on search and filter */}
          {filteredAllUsers.length > 0 && (
            <optgroup label="All Users">
              {filteredAllUsers.map(user => (
                <option key={`user:${user.id}`} value={`guardian:${user.id}`}>
                  {user.name} ({user.email})
                </option>
              ))}
            </optgroup>
          )}
          
          {filteredGuardians.length > 0 && (
            <optgroup label="Guardians">
              {filteredGuardians.map(guardian => (
                <option key={`guardian:${guardian.id}`} value={`guardian:${guardian.id}`}>
                  {guardian.name} ({guardian.email})
                </option>
              ))}
            </optgroup>
          )}
          
          {filteredPlayersAsUsers.length > 0 && (
            <optgroup label="Players">
              {filteredPlayersAsUsers.map(player => (
                <option key={`player:${player.id}`} value={`player:${player.id}`}>
                  {player.name} ({player.email})
                </option>
              ))}
            </optgroup>
          )}
          
          {/* Show message when no results found */}
          {searchTerm && filteredGuardians.length === 0 && filteredPlayersAsUsers.length === 0 && filteredAllUsers.length === 0 && (
            <option value="" disabled>
              No users found matching "{searchTerm}"
            </option>
          )}
        </Select>
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

          <div className="space-y-3">
            {playerPayments.map((payment) => (
              <Card key={payment.playerId} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-secondary-900">{payment.playerName}</div>
                    <div className="text-xs text-secondary-600 space-y-1">
                      {/* Outstanding Balance (what they owe) */}
                      <div className={`${payment.outstandingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        Outstanding: {payment.outstandingBalance > 0 
                          ? `Owes ${currency} ${payment.outstandingBalance.toFixed(2)}` 
                          : 'Up to date'
                        }
                      </div>
                      {/* Available Credits */}
                      {payment.availableCredits > 0 && (
                        <div className="text-blue-600">
                          Available Credit: {currency} {payment.availableCredits.toFixed(2)}
                        </div>
                      )}
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