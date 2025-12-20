import React, { useState, useEffect } from 'react';
import { Card, DataTable, Badge, Toast, Button, Input, ConfirmModal } from '../ui';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  getReceiptsByOrganization,
  getUserReceiptSummary,
  updateDebitReceipt,
  deleteDebitReceiptWithCreditConversion
} from '../../services/receiptService';
import { getPlayersByOrganization } from '../../services/playerService';
import { Receipt, Transaction } from '../../types';
import { getUserById } from '../../services/userService';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';

const ReceiptsView: React.FC = () => {
  const { selectedOrganization } = useApp();
  const { currentUser } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [playerSummaries, setPlayerSummaries] = useState<Map<string, any>>(new Map());
  const [transactionInfo, setTransactionInfo] = useState<Map<string, Transaction>>(new Map());

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
  const [editForm, setEditForm] = useState({
    productName: '',
    amount: 0,
    invoiceDate: '',
    deadline: ''
  });
  const [editLoading, setEditLoading] = useState(false);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingReceipt, setDeletingReceipt] = useState<Receipt | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      if (!selectedOrganization?.id) return;
      
      try {
        setLoading(true);
        
        // Load all receipts for the organization
        const receiptsData = await getReceiptsByOrganization(selectedOrganization.id);
        setReceipts(receiptsData);
        
        // Load transaction information for receipts that have parentTransactionRef
        const transactionMap = new Map<string, Transaction>();
        for (const receipt of receiptsData) {
          if (receipt.parentTransactionRef) {
            try {
              const transactionDoc = await getDoc(receipt.parentTransactionRef);
              if (transactionDoc.exists()) {
                const transactionData = { 
                  id: transactionDoc.id, 
                  ...transactionDoc.data() 
                } as Transaction;
                transactionMap.set(receipt.id, transactionData);
              }
            } catch (error) {
              console.error('Error loading transaction for receipt:', receipt.id, error);
            }
          }
        }
        setTransactionInfo(transactionMap);
        
        // Load players
        const playersData = await getPlayersByOrganization(selectedOrganization.id);
        
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

  // Reload receipts data
  const reloadReceipts = async () => {
    if (!selectedOrganization?.id) return;
    try {
      const receiptsData = await getReceiptsByOrganization(selectedOrganization.id);
      setReceipts(receiptsData);
    } catch (error) {
      console.error('Error reloading receipts:', error);
    }
  };

  // Edit handlers
  const handleEditClick = (receipt: Receipt) => {
    if (receipt.type !== 'debit') {
      showToast('Only invoices (debit receipts) can be edited', 'error');
      return;
    }
    setEditingReceipt(receipt);
    setEditForm({
      productName: receipt.product?.name || '',
      amount: receipt.amount,
      invoiceDate: receipt.product?.invoiceDate
        ? receipt.product.invoiceDate.toDate().toISOString().split('T')[0]
        : '',
      deadline: receipt.product?.deadline
        ? receipt.product.deadline.toDate().toISOString().split('T')[0]
        : ''
    });
    setEditModalOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!editingReceipt || !currentUser) return;

    try {
      setEditLoading(true);
      const userId = editingReceipt.userRef.id;

      await updateDebitReceipt(userId, editingReceipt.id, {
        productName: editForm.productName,
        amount: editForm.amount,
        invoiceDate: editForm.invoiceDate ? new Date(editForm.invoiceDate) : undefined,
        deadline: editForm.deadline ? new Date(editForm.deadline) : undefined
      });

      showToast('Invoice updated successfully', 'success');
      setEditModalOpen(false);
      setEditingReceipt(null);
      await reloadReceipts();
    } catch (error: any) {
      console.error('Error updating receipt:', error);
      showToast(error.message || 'Failed to update invoice', 'error');
    } finally {
      setEditLoading(false);
    }
  };

  // Delete handlers
  const handleDeleteClick = (receipt: Receipt) => {
    if (receipt.type !== 'debit') {
      showToast('Only invoices (debit receipts) can be deleted', 'error');
      return;
    }
    setDeletingReceipt(receipt);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingReceipt || !currentUser) return;

    try {
      setDeleteLoading(true);
      const userId = deletingReceipt.userRef.id;
      const userRef = doc(db, 'users', currentUser.uid);

      const result = await deleteDebitReceiptWithCreditConversion(
        userId,
        deletingReceipt.id,
        { name: currentUser.displayName || currentUser.email || 'Unknown', userRef }
      );

      if (result.convertedCredits > 0) {
        showToast(
          `Invoice deleted. ${result.convertedCredits.toFixed(2)} USD converted to available credit.`,
          'success'
        );
      } else {
        showToast('Invoice deleted successfully', 'success');
      }

      setDeleteModalOpen(false);
      setDeletingReceipt(null);
      await reloadReceipts();
    } catch (error: any) {
      console.error('Error deleting receipt:', error);
      showToast(error.message || 'Failed to delete invoice', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Check if receipt has linked payments
  const hasLinkedPayments = (receipt: Receipt): boolean => {
    return receipt.type === 'debit' &&
      receipt.siblingReceiptRefs &&
      receipt.siblingReceiptRefs.length > 0;
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

  const isOverpayment = (receipt: Receipt): boolean => {
    if (receipt.type !== 'credit') return false;
    
    // Check if this credit receipt has sibling debit receipts
    if (!receipt.siblingReceiptRefs || receipt.siblingReceiptRefs.length === 0) {
      // If no linked invoices, this might be an overpayment or prepayment
      return true;
    }
    
    // Calculate total debit amount from sibling receipts
    const linkedDebits = receipts.filter(r => 
      receipt.siblingReceiptRefs.some(ref => ref.id === r.id) && r.type === 'debit'
    );
    
    const totalDebitAmount = linkedDebits.reduce((sum, debit) => sum + debit.amount, 0);
    
    // If credit amount is greater than linked debit amounts, it's an overpayment
    return receipt.amount > totalDebitAmount;
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
  
  const getPaymentTypeColor = (receipt: Receipt) => {
    if (receipt.type === 'credit') {
      // Show overpayments in green, regular payments in gray
      return isOverpayment(receipt) ? 'success' : 'secondary';
    }
    return getTypeColor(receipt.type);
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
      render: (receipt: Receipt) => {
        const transaction = transactionInfo.get(receipt.id);
        const isInternal = transaction?.type === 'internal';
        const isOverpay = isOverpayment(receipt);
        
        return (
          <div>
            <div className="font-medium text-secondary-900">
              {receipt.type === 'credit' 
                ? receipt.description || 'Payment Received'
                : receipt.product?.name || 'Service'
              }
            </div>
            <div className="text-sm text-secondary-600">
              Amount: USD {receipt.amount.toFixed(2)}
              {receipt.type === 'credit' && isOverpay && (
                <span className="ml-2 text-green-600 font-medium">(Overpayment)</span>
              )}
            </div>
            <div className={`text-xs font-medium ${receipt.status === 'active' ? 'text-green-600' : 'text-red-600'}`}>
              Status: {receipt.status?.toUpperCase() || 'ACTIVE'}
            </div>
            {receipt.product && (
              <div className="text-xs text-secondary-500">
                Product: {receipt.product.name}
              </div>
            )}
            {isInternal && (
              <div className="text-xs text-blue-600 font-medium">
                🤖 Internal Transaction
              </div>
            )}
            {transaction && !isInternal && (
              <div className="text-xs text-secondary-500">
                Payment Method: {transaction.paymentMethod}
              </div>
            )}
          </div>
        );
      }
    },
    { 
      key: 'status', 
      header: 'Payment Status',
      render: (receipt: Receipt) => {
        const status = getReceiptStatus(receipt);
        const statusVariant = getStatusColor(receipt);
        const paymentVariant = getPaymentTypeColor(receipt);
        
        // For invoices, clearly show PAID status
        if (receipt.type === 'debit') {
          return (
            <Badge variant={statusVariant}>
              {status === 'PAID' ? '✅ PAID' : status}
            </Badge>
          );
        }
        
        // For payments, show payment type info
        if (receipt.type === 'credit') {
          const isOverpay = isOverpayment(receipt);
          const transaction = transactionInfo.get(receipt.id);
          
          return (
            <div className="space-y-1">
              <Badge variant={paymentVariant}>
                {isOverpay ? '💰 OVERPAYMENT' : '💳 PAYMENT'}
              </Badge>
              {transaction?.type === 'internal' && (
                <div className="text-xs text-blue-600">System Generated</div>
              )}
            </div>
          );
        }
        
        return (
          <Badge variant={statusVariant}>
            {status}
          </Badge>
        );
      }
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
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (receipt: Receipt) => (
        <div className="flex gap-2">
          {receipt.type === 'debit' && receipt.status !== 'deleted' && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleEditClick(receipt)}
              >
                Edit
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDeleteClick(receipt)}
              >
                Delete
              </Button>
            </>
          )}
          {receipt.status === 'deleted' && (
            <span className="text-sm text-secondary-500 italic">Deleted</span>
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

      {/* Edit Invoice Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md">
            <Card className="w-full">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-secondary-900 mb-4">Edit Invoice</h3>
                <div className="space-y-4">
                  <Input
                    label="Product/Service Name"
                    value={editForm.productName}
                    onChange={(e) => setEditForm({ ...editForm, productName: e.target.value })}
                  />
                  <Input
                    label="Amount (USD)"
                    type="number"
                    step="0.01"
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: parseFloat(e.target.value) || 0 })}
                  />
                  <Input
                    label="Invoice Date"
                    type="date"
                    value={editForm.invoiceDate}
                    onChange={(e) => setEditForm({ ...editForm, invoiceDate: e.target.value })}
                  />
                  <Input
                    label="Due Date"
                    type="date"
                    value={editForm.deadline}
                    onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                  />
                  <div className="flex justify-end gap-3 mt-6">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditModalOpen(false);
                        setEditingReceipt(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleEditSubmit}
                      disabled={editLoading}
                    >
                      {editLoading ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Delete Invoice Modal */}
      {deleteModalOpen && deletingReceipt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md">
            <Card className="w-full">
              <div className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-error-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-error-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-secondary-900">Delete Invoice</h3>
                </div>
                <div className="space-y-4">
                  <p className="text-secondary-700">
                    Are you sure you want to delete this invoice?
                  </p>
                  <div className="bg-secondary-50 p-4 rounded-lg">
                    <p className="font-medium">{deletingReceipt.product?.name || 'Unknown Product'}</p>
                    <p className="text-secondary-600">Amount: USD {deletingReceipt.amount.toFixed(2)}</p>
                  </div>
                  {hasLinkedPayments(deletingReceipt) && (
                    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                      <p className="text-yellow-800 font-medium">This invoice has linked payments</p>
                      <p className="text-yellow-700 text-sm mt-1">
                        The payments will be converted to available credit that can be applied to future invoices.
                      </p>
                    </div>
                  )}
                  <div className="flex justify-end gap-3 mt-6">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDeleteModalOpen(false);
                        setDeletingReceipt(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleDeleteConfirm}
                      disabled={deleteLoading}
                      className="bg-error-600 hover:bg-error-700 text-white border-error-600"
                    >
                      {deleteLoading ? 'Deleting...' : 'Delete Invoice'}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
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

export default ReceiptsView;