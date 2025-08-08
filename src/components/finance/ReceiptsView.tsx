import React, { useState, useEffect } from 'react';
import { Button, Card, DataTable, Badge, Toast } from '../ui';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { getReceiptsByOrganization, getUserReceiptSummary } from '../../services/receiptService';
import { getPlayersByOrganization } from '../../services/playerService';
import { Receipt, Player } from '../../types';
import { getUserById } from '../../services/userService';

const ReceiptsView: React.FC = () => {
  const { selectedOrganization } = useApp();
  const { userData } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [playerSummaries, setPlayerSummaries] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    const loadData = async () => {
      if (!selectedOrganization?.id) return;
      
      try {
        setLoading(true);
        
        // Load all receipts for the organization
        const receiptsData = await getReceiptsByOrganization(selectedOrganization.id);
        console.log('Loaded receipts:', receiptsData.length);
        setReceipts(receiptsData);
        
        // Load players
        const playersData = await getPlayersByOrganization(selectedOrganization.id);
        setPlayers(playersData);
        
        // Calculate summaries for each player
        const summaries = new Map();
        for (const player of playersData) {
          try {
            // Get player's user data to get their name
            const userData = await getUserById(player.userId);
            const summary = await getUserReceiptSummary(player.userId, selectedOrganization.id);
            summaries.set(player.userId, {
              ...summary,
              playerName: userData?.name || 'Unknown Player',
              playerId: player.id
            });
          } catch (error) {
            console.error(`Error getting summary for player ${player.id}:`, error);
          }
        }
        setPlayerSummaries(summaries);
        
      } catch (error) {
        console.error('Error loading receipts:', error);
        showToast('Failed to load receipts', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedOrganization?.id]);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const getStatusColor = (receipt: Receipt) => {
    if (receipt.type === 'credit') {
      return 'success'; // Credit receipts are always "paid" (completed payments)
    }
    
    if (receipt.type === 'debit') {
      // Check if debit has sibling credit receipts (paid)
      if (receipt.siblingReceiptRefs && receipt.siblingReceiptRefs.length > 0) {
        return 'success'; // Paid
      }
      
      // Check if overdue (past deadline and unpaid)
      if (receipt.product?.deadline && receipt.product.deadline.toMillis() < Date.now()) {
        return 'error'; // Overdue
      }
      
      return 'warning'; // Pending
    }
    
    return 'secondary'; // Default
  };

  const getReceiptStatus = (receipt: Receipt): string => {
    if (receipt.type === 'credit') {
      return 'PAID';
    }
    
    if (receipt.type === 'debit') {
      // Check if debit has sibling credit receipts (paid)
      if (receipt.siblingReceiptRefs && receipt.siblingReceiptRefs.length > 0) {
        return 'PAID';
      }
      
      // Check if overdue (past deadline and unpaid)
      if (receipt.product?.deadline && receipt.product.deadline.toMillis() < Date.now()) {
        return 'OVERDUE';
      }
      
      return 'PENDING';
    }
    
    return 'UNKNOWN';
  };

  const getTypeColor = (type: Receipt['type']) => {
    switch (type) {
      case 'credit':
        return 'success';
      case 'debit':
        return 'warning';
      case 'excess':
        return 'primary';
      default:
        return 'secondary';
    }
  };

  const receiptColumns = [
    { 
      key: 'id', 
      header: 'Receipt ID',
      render: (receipt: Receipt) => (
        <span className="font-mono text-xs">{receipt.id.substring(0, 8)}...</span>
      )
    },
    { 
      key: 'type', 
      header: 'Type',
      render: (receipt: Receipt) => (
        <Badge variant={getTypeColor(receipt.type)}>
          {receipt.type.toUpperCase()}
        </Badge>
      )
    },
    { 
      key: 'details', 
      header: 'Details',
      render: (receipt: Receipt) => (
        <div>
          <div className="font-medium text-secondary-900">
            {receipt.type === 'credit' 
              ? receipt.description || 'Payment Received'
              : receipt.product?.name || 'Service'
            }
          </div>
          <div className="text-sm text-secondary-600">
            Amount: USD {receipt.amount.toFixed(2)}
          </div>
          <div className={`text-xs font-medium ${receipt.status === 'active' ? 'text-green-600' : 'text-red-600'}`}>
            Status: {receipt.status?.toUpperCase() || 'ACTIVE'}
          </div>
          {receipt.product && (
            <div className="text-xs text-secondary-500">
              Product: {receipt.product.name}
            </div>
          )}
        </div>
      )
    },
    { 
      key: 'status', 
      header: 'Status',
      render: (receipt: Receipt) => (
        <Badge variant={getStatusColor(receipt)}>
          {getReceiptStatus(receipt)}
        </Badge>
      )
    },
    { 
      key: 'dates', 
      header: 'Dates',
      render: (receipt: Receipt) => (
        <div className="text-sm">
          {receipt.type === 'debit' && receipt.product ? (
            <>
              <div>Invoice: {receipt.product.invoiceDate.toDate().toLocaleDateString()}</div>
              <div className="text-secondary-600">
                Due: {receipt.product.deadline.toDate().toLocaleDateString()}
              </div>
            </>
          ) : receipt.type === 'credit' && receipt.paymentDate ? (
            <div>Payment: {receipt.paymentDate.toDate().toLocaleDateString()}</div>
          ) : (
            <div className="text-secondary-500">No date info</div>
          )}
        </div>
      )
    },
    { 
      key: 'linkedReceipts', 
      header: 'Linked',
      render: (receipt: Receipt) => (
        <div>
          {receipt.siblingReceiptRefs && receipt.siblingReceiptRefs.length > 0 ? (
            <Badge variant="primary">Linked</Badge>
          ) : (
            <span className="text-secondary-500 text-sm">No links</span>
          )}
        </div>
      )
    }
  ];

  const summaryColumns = [
    { 
      key: 'player', 
      header: 'Player',
      render: (summary: any) => (
        <div>
          <div className="font-medium text-secondary-900">{summary.playerName}</div>
          <div className="text-sm text-secondary-600">ID: {summary.playerId}</div>
        </div>
      )
    },
    { 
      key: 'debit', 
      header: 'Total Charged',
      render: (summary: any) => (
        <div className="text-warning-600 font-medium">
          USD {summary.totalDebit.toFixed(2)}
        </div>
      )
    },
    { 
      key: 'credit', 
      header: 'Total Paid',
      render: (summary: any) => (
        <div className="text-success-600 font-medium">
          USD {summary.totalCredit.toFixed(2)}
        </div>
      )
    },
    { 
      key: 'pending', 
      header: 'Pending',
      render: (summary: any) => (
        <div className="text-warning-600">
          USD {summary.pendingDebit.toFixed(2)}
        </div>
      )
    },
    { 
      key: 'balance', 
      header: 'Balance',
      render: (summary: any) => (
        <div className={`font-bold ${summary.balance >= 0 ? 'text-success-600' : 'text-error-600'}`}>
          USD {summary.balance.toFixed(2)}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-secondary-900 mb-4">Receipt Management</h2>
        
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-sm text-secondary-600">Total Receipts</div>
            <div className="text-2xl font-bold text-secondary-900">{receipts.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-secondary-600">Pending Receipts</div>
            <div className="text-2xl font-bold text-warning-600">
              {receipts.filter(r => getReceiptStatus(r) === 'PENDING').length}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-secondary-600">Paid Receipts</div>
            <div className="text-2xl font-bold text-success-600">
              {receipts.filter(r => getReceiptStatus(r) === 'PAID').length}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-secondary-600">Linked Receipts</div>
            <div className="text-2xl font-bold text-primary-600">
              {receipts.filter(r => r.siblingReceiptRefs && r.siblingReceiptRefs.length > 0).length}
            </div>
          </Card>
        </div>

        {/* Player Summaries */}
        {loading ? (
          <div className="flex justify-center items-center min-h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <Card className="mb-6">
            <div className="p-4 border-b border-secondary-200">
              <h3 className="font-semibold text-secondary-900">Player Financial Summaries</h3>
            </div>
            <DataTable
              data={Array.from(playerSummaries.values())}
              columns={summaryColumns}
              emptyMessage="No player summaries available"
            />
          </Card>
        )}

        {/* All Receipts */}
        {!loading && (
          <Card>
            <div className="p-4 border-b border-secondary-200">
              <h3 className="font-semibold text-secondary-900">All Receipts</h3>
            </div>
            <DataTable
              data={receipts}
              columns={receiptColumns}
              emptyMessage="No receipts found"
            />
          </Card>
        )}
      </div>

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

export default ReceiptsView;