import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Toast, Badge, DataTable } from '../ui';
import { useApp } from '../../contexts/AppContext';
import { getUserById } from '../../services/userService';
import { getReceiptsByUser, calculateUserOutstandingBalance } from '../../services/receiptService';
import { getPlayersByGuardianId } from '../../services/playerService';
import { getSettingsByOrganization } from '../../services/settingsService';
import { User, Receipt, Player } from '../../types';

interface GroupedReceipts {
  [key: string]: Receipt[];
}

interface PlayerSummary {
  player: Player;
  user: User;
  outstandingDebits: number;
  availableCredits: number;
  netBalance: number;
  receipts: Receipt[];
}

const GuardianDetails: React.FC = () => {
  const { guardianId } = useParams<{ guardianId: string }>();
  const navigate = useNavigate();
  const { selectedOrganization } = useApp();
  
  const [loading, setLoading] = useState(true);
  const [guardian, setGuardian] = useState<User | null>(null);
  const [linkedPlayers, setLinkedPlayers] = useState<PlayerSummary[]>([]);
  const [debitReceipts, setDebitReceipts] = useState<Receipt[]>([]);
  const [creditReceipts, setCreditReceipts] = useState<Receipt[]>([]);
  const [groupedDebitReceipts, setGroupedDebitReceipts] = useState<GroupedReceipts>({});
  const [groupedCreditReceipts, setGroupedCreditReceipts] = useState<GroupedReceipts>({});
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [currency, setCurrency] = useState('USD');
  
  // Financial summary
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);
  const [totalNetBalance, setTotalNetBalance] = useState(0);

  useEffect(() => {
    if (guardianId && selectedOrganization?.id) {
      loadGuardianData();
    }
  }, [guardianId, selectedOrganization]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadGuardianData = async () => {
    if (!guardianId || !selectedOrganization?.id) return;

    try {
      setLoading(true);

      // Load currency from settings
      const settingsData = await getSettingsByOrganization(selectedOrganization.id);
      if (settingsData?.generalSettings?.currency) {
        setCurrency(settingsData.generalSettings.currency);
      }

      // Load guardian user data
      const guardianUser = await getUserById(guardianId);
      if (!guardianUser) {
        throw new Error('Guardian not found');
      }
      setGuardian(guardianUser);

      // Load linked players
      const players = await getPlayersByGuardianId(guardianId);
      console.log(`Found ${players.length} players linked to guardian ${guardianId}`);

      // Load guardian's own receipts (invoices and payments specific to guardian)
      let guardianDebitReceipts: Receipt[] = [];
      let guardianCreditReceipts: Receipt[] = [];
      let guardianOutstanding = 0;
      let guardianCredits = 0;
      let guardianNetBalance = 0;

      try {
        // Load guardian's own financial data
        const guardianBalanceInfo = await calculateUserOutstandingBalance(guardianId, selectedOrganization.id);
        guardianOutstanding = guardianBalanceInfo.outstandingDebits;
        guardianCredits = guardianBalanceInfo.availableCredits;
        guardianNetBalance = guardianBalanceInfo.netBalance;

        // Get guardian's own receipts
        const guardianReceipts = await getReceiptsByUser(guardianId);
        guardianDebitReceipts = guardianReceipts.filter(r => r.type === 'debit' && r.organizationId === selectedOrganization.id);
        guardianCreditReceipts = guardianReceipts.filter(r => r.type === 'credit' && r.organizationId === selectedOrganization.id);
        
        console.log(`Guardian financial data:`, {
          outstanding: guardianOutstanding,
          credits: guardianCredits,
          netBalance: guardianNetBalance,
          debitReceipts: guardianDebitReceipts.length,
          creditReceipts: guardianCreditReceipts.length
        });
      } catch (error) {
        console.error('Error loading guardian financial data:', error);
      }

      // Load player summaries (for linked players table only - no need for receipts)
      const playerSummaries: PlayerSummary[] = [];

      for (const player of players) {
        try {
          // Get player user data
          const playerUser = await getUserById(player.userId);
          if (!playerUser) continue;

          // Calculate financial balance
          const balanceInfo = await calculateUserOutstandingBalance(player.userId, selectedOrganization.id);


          playerSummaries.push({
            player,
            user: playerUser,
            outstandingDebits: balanceInfo.outstandingDebits,
            availableCredits: balanceInfo.availableCredits,
            netBalance: balanceInfo.netBalance,
            receipts: [] // Don't load individual player receipts in guardian view
          });
        } catch (error) {
          console.error(`Error loading data for player ${player.id}:`, error);
        }
      }

      setLinkedPlayers(playerSummaries);
      // Set guardian's own receipts instead of aggregated player receipts
      setDebitReceipts(guardianDebitReceipts);
      setCreditReceipts(guardianCreditReceipts);
      // Set guardian's own financial totals instead of aggregated player totals
      setTotalOutstanding(guardianOutstanding);
      setTotalCredits(guardianCredits);
      setTotalNetBalance(guardianNetBalance);

      // Group guardian's receipts by month
      groupReceiptsByMonth(guardianDebitReceipts, guardianCreditReceipts);


    } catch (error) {
      console.error('Error loading guardian data:', error);
      showToast('Failed to load guardian data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const groupReceiptsByMonth = (debits: Receipt[], credits: Receipt[]) => {
    const groupedDebits: GroupedReceipts = {};
    const groupedCredits: GroupedReceipts = {};
    const months = new Set<string>();

    [...debits, ...credits].forEach(receipt => {
      if (receipt.createdAt) {
        const date = receipt.createdAt.toDate();
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        months.add(monthKey);
      }
    });

    debits.forEach(receipt => {
      if (receipt.createdAt) {
        const date = receipt.createdAt.toDate();
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!groupedDebits[monthKey]) groupedDebits[monthKey] = [];
        groupedDebits[monthKey].push(receipt);
      }
    });

    credits.forEach(receipt => {
      if (receipt.createdAt) {
        const date = receipt.createdAt.toDate();
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!groupedCredits[monthKey]) groupedCredits[monthKey] = [];
        groupedCredits[monthKey].push(receipt);
      }
    });

    const sortedMonths = Array.from(months).sort().reverse();
    setAvailableMonths(sortedMonths);
    setSelectedMonth(sortedMonths[0] || '');
    setGroupedDebitReceipts(groupedDebits);
    setGroupedCreditReceipts(groupedCredits);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const getPaymentStatusText = (receipt: Receipt) => {
    const description = receipt.description || '';
    
    // Don't show as available credit if amount is 0 or negative
    if (receipt.amount <= 0) {
      return 'PAYMENT APPLIED';
    }
    
    // Don't show as available credit if it's linked to a debit receipt
    if (receipt.siblingReceiptRefs && receipt.siblingReceiptRefs.length > 0) {
      return 'PAYMENT APPLIED';
    }
    
    // Check if this creates available credit
    if (description.includes('excess') || description.includes('credit')) {
      return 'AVAILABLE CREDIT';
    }
    
    return 'COMPLETED';
  };

  const getReceiptStatusColor = (receipt: Receipt) => {
    if (receipt.type === 'debit') {
      return receipt.status === 'paid' ? 'success' : 'error';
    } else {
      const statusText = getPaymentStatusText(receipt);
      if (statusText === 'AVAILABLE CREDIT') return 'primary';
      if (statusText === 'PAYMENT APPLIED') return 'secondary';
      return 'success';
    }
  };

  const currentDebitReceipts = selectedMonth ? (groupedDebitReceipts[selectedMonth] || []) : debitReceipts;
  const currentCreditReceipts = selectedMonth ? (groupedCreditReceipts[selectedMonth] || []) : creditReceipts;

  // Player columns for linked players table
  const playerColumns = [
    {
      key: 'player',
      header: 'Player',
      render: (playerSummary: PlayerSummary) => (
        <div>
          <div className="font-medium text-secondary-900">{playerSummary.user.name}</div>
          <div className="text-sm text-secondary-600">{playerSummary.user.email}</div>
        </div>
      )
    },
    {
      key: 'financial',
      header: 'Financial Status',
      render: (playerSummary: PlayerSummary) => (
        <div className={`font-medium ${
          playerSummary.netBalance > 0 ? 'text-error-600' : 
          playerSummary.netBalance < 0 ? 'text-success-600' : 'text-secondary-900'
        }`}>
          Net Balance: {currency} {playerSummary.netBalance.toFixed(2)}
        </div>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (playerSummary: PlayerSummary) => (
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => navigate(`/finance/player/${playerSummary.player.id}`)}
        >
          View Player Details
        </Button>
      )
    }
  ];

  // Receipt columns
  const receiptColumns = [
    {
      key: 'date',
      header: 'Date',
      render: (receipt: Receipt) => (
        <div className="text-sm">
          {receipt.createdAt ? receipt.createdAt.toDate().toLocaleDateString() : 'N/A'}
        </div>
      )
    },
    {
      key: 'description',
      header: 'Description',
      render: (receipt: Receipt) => (
        <div>
          <div className="font-medium">{receipt.description}</div>
          {receipt.type === 'debit' && receipt.product && (
            <div className="text-sm text-secondary-600">
              {receipt.product.name} - Due: {receipt.product.deadline?.toDate().toLocaleDateString()}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (receipt: Receipt) => (
        <div className={`font-medium ${receipt.type === 'debit' ? 'text-error-600' : 'text-success-600'}`}>
          {receipt.type === 'debit' ? '+' : '-'}{currency} {Math.abs(receipt.amount).toFixed(2)}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (receipt: Receipt) => (
        <Badge variant={getReceiptStatusColor(receipt)}>
          {receipt.type === 'debit' 
            ? (receipt.status === 'paid' ? 'PAID' : 'OUTSTANDING')
            : getPaymentStatusText(receipt)
          }
        </Badge>
      )
    }
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!guardian) {
    return (
      <div className="text-center py-8">
        <h3 className="text-lg font-medium text-secondary-900 mb-2">Guardian Not Found</h3>
        <p className="text-secondary-600 mb-4">The requested guardian could not be found.</p>
        <Button onClick={() => navigate(-1)}>
          Back to Players & Guardians
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow-sm rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-3">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate(-1)}
              >
                ← Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{guardian.name}</h1>
                <p className="text-gray-600">{guardian.email}</p>
                {guardian.phone && <p className="text-gray-600">{guardian.phone}</p>}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="outline" onClick={loadGuardianData}>
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Guardian Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="text-sm text-secondary-600 mb-2">Guardian Outstanding</div>
          <div className="text-2xl font-bold text-error-600">
            {currency} {totalOutstanding.toFixed(2)}
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-secondary-600 mb-2">Guardian Credits</div>
          <div className="text-2xl font-bold text-success-600">
            {currency} {totalCredits.toFixed(2)}
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-secondary-600 mb-2">Guardian Net Balance</div>
          <div className={`text-2xl font-bold ${
            totalNetBalance > 0 ? 'text-error-600' : 
            totalNetBalance < 0 ? 'text-success-600' : 'text-secondary-900'
          }`}>
            {currency} {totalNetBalance.toFixed(2)}
          </div>
        </Card>
      </div>

      {/* Linked Players */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-secondary-900 mb-4">
          Linked Players ({linkedPlayers.length})
        </h3>
        <DataTable
          data={linkedPlayers}
          columns={playerColumns}
          emptyMessage="No players linked to this guardian"
          showPagination={false}
        />
      </Card>

      {/* Receipts Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-secondary-900">Guardian Financial History</h3>
          {availableMonths.length > 1 && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Months</option>
              {availableMonths.map(month => (
                <option key={month} value={month}>
                  {new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="space-y-6">
          {/* Debit Receipts */}
          {currentDebitReceipts.length > 0 && (
            <div>
              <h4 className="text-md font-medium text-secondary-900 mb-3">
                Guardian Invoices ({currentDebitReceipts.length})
              </h4>
              <DataTable
                data={currentDebitReceipts}
                columns={receiptColumns}
                emptyMessage="No invoices found"
                showPagination={false}
              />
            </div>
          )}

          {/* Credit Receipts */}
          {currentCreditReceipts.length > 0 && (
            <div>
              <h4 className="text-md font-medium text-secondary-900 mb-3">
                Guardian Payments ({currentCreditReceipts.length})
              </h4>
              <DataTable
                data={currentCreditReceipts}
                columns={receiptColumns}
                emptyMessage="No payments found"
                showPagination={false}
              />
            </div>
          )}

          {currentDebitReceipts.length === 0 && currentCreditReceipts.length === 0 && (
            <div className="text-center py-8 text-secondary-500">
              No financial records found for the selected period
            </div>
          )}
        </div>
      </Card>

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

export default GuardianDetails;