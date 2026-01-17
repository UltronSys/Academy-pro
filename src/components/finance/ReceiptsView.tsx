import React, { useState, useEffect } from 'react';
import { Card, DataTable, Badge, Toast, Button, Input, Label } from '../ui';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  getReceiptsByOrganization,
  getUserReceiptSummary,
  updateDebitReceipt,
  deleteDebitReceiptWithCreditConversion,
  updateReceipt
} from '../../services/receiptService';
import { getPlayersByOrganization } from '../../services/playerService';
import { Receipt, Transaction } from '../../types';
import { getUserById } from '../../services/userService';
import { getDoc, doc, deleteField } from 'firebase/firestore';
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

  // Discount modal state
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [discountingReceipt, setDiscountingReceipt] = useState<Receipt | null>(null);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [discountReason, setDiscountReason] = useState<string>('');
  const [discountLoading, setDiscountLoading] = useState(false);

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

  // Discount handlers
  const handleDiscountClick = (receipt: Receipt) => {
    if (receipt.type !== 'debit' || receipt.status !== 'active') {
      showToast('Only unpaid invoices can be discounted', 'error');
      return;
    }
    setDiscountingReceipt(receipt);
    setDiscountType('percentage');
    setDiscountValue('');
    setDiscountReason('');
    setDiscountModalOpen(true);
  };

  const handleDiscountSubmit = async () => {
    if (!discountingReceipt) return;

    const numericValue = parseFloat(discountValue);
    if (isNaN(numericValue) || numericValue <= 0) {
      showToast('Please enter a valid discount value', 'error');
      return;
    }

    const originalAmount = discountingReceipt.amount;

    // Validate percentage is between 0 and 100
    if (discountType === 'percentage' && numericValue > 100) {
      showToast('Percentage discount cannot exceed 100%', 'error');
      return;
    }

    // Validate fixed discount doesn't exceed invoice amount
    if (discountType === 'fixed' && numericValue > originalAmount) {
      showToast('Discount cannot exceed invoice amount', 'error');
      return;
    }

    try {
      setDiscountLoading(true);
      const userId = discountingReceipt.userRef.id;

      // Calculate the new price
      let newAmount = originalAmount;
      if (discountType === 'percentage') {
        newAmount = originalAmount - (originalAmount * numericValue / 100);
      } else {
        newAmount = originalAmount - numericValue;
      }

      // Build description with discount info
      const discountInfo = discountType === 'percentage'
        ? `${numericValue}% discount`
        : `USD ${numericValue.toFixed(2)} discount`;
      const reasonText = discountReason.trim() ? ` (${discountReason.trim()})` : '';

      // Update the receipt with the discounted amount
      await updateReceipt(userId, discountingReceipt.id, {
        amount: newAmount,
        product: discountingReceipt.product ? {
          ...discountingReceipt.product,
          price: newAmount,
          originalPrice: discountingReceipt.product.originalPrice || originalAmount,
          discountApplied: discountInfo + reasonText
        } : undefined
      });

      showToast(`Discount applied successfully! New amount: USD ${newAmount.toFixed(2)}`, 'success');
      setDiscountModalOpen(false);
      setDiscountingReceipt(null);
      await reloadReceipts();

    } catch (error) {
      console.error('Error applying discount:', error);
      showToast('Failed to apply discount', 'error');
    } finally {
      setDiscountLoading(false);
    }
  };

  // Calculate discounted amount for preview
  const getDiscountedAmount = () => {
    if (!discountingReceipt || !discountValue) return null;
    const numericValue = parseFloat(discountValue);
    if (isNaN(numericValue) || numericValue <= 0) return null;

    const originalAmount = discountingReceipt.amount;
    if (discountType === 'percentage') {
      return originalAmount - (originalAmount * numericValue / 100);
    }
    return originalAmount - numericValue;
  };

  const handleRemoveDiscount = async () => {
    if (!discountingReceipt) return;

    // Check if there's a discount to remove
    if (!discountingReceipt.product?.originalPrice) {
      showToast('No discount to remove', 'error');
      return;
    }

    try {
      setDiscountLoading(true);
      const userId = discountingReceipt.userRef.id;
      const originalPrice = discountingReceipt.product.originalPrice;

      // Build a clean product object without the discount fields
      const cleanProduct: Record<string, any> = {
        productRef: discountingReceipt.product.productRef,
        name: discountingReceipt.product.name,
        price: originalPrice,
        invoiceDate: discountingReceipt.product.invoiceDate,
        deadline: discountingReceipt.product.deadline
      };

      // Update the receipt to restore original amount and remove discount info
      // Using deleteField() to properly remove nested fields
      await updateReceipt(userId, discountingReceipt.id, {
        amount: originalPrice,
        product: cleanProduct,
        'product.originalPrice': deleteField(),
        'product.discountApplied': deleteField()
      } as any);

      showToast(`Discount removed. Amount restored to USD ${originalPrice.toFixed(2)}`, 'success');
      setDiscountModalOpen(false);
      setDiscountingReceipt(null);
      await reloadReceipts();

    } catch (error) {
      console.error('Error removing discount:', error);
      showToast('Failed to remove discount', 'error');
    } finally {
      setDiscountLoading(false);
    }
  };

  const getStatusColor = (receipt: Receipt) => {
    if (receipt.type === 'credit') {
      return 'success'; // Credit receipts are always "paid" (completed payments)
    }

    if (receipt.type === 'debit') {
      // First check explicit status field
      if (receipt.status === 'completed') {
        return 'success'; // Fully paid
      }
      if (receipt.status === 'paid') {
        return 'primary'; // Partially paid (blue)
      }
      if (receipt.status === 'deleted') {
        return 'secondary';
      }

      // Fall back to checking sibling refs for legacy data
      if (receipt.siblingReceiptRefs && receipt.siblingReceiptRefs.length > 0) {
        return 'success'; // Has payments linked
      }

      // Check if overdue (past deadline and unpaid)
      if (receipt.product?.deadline && receipt.product.deadline.toMillis() < Date.now()) {
        return 'error'; // Overdue
      }

      return 'warning'; // Pending/Unpaid
    }

    return 'secondary'; // Default
  };

  const getReceiptStatus = (receipt: Receipt): string => {
    if (receipt.type === 'credit') {
      return 'PAID';
    }

    if (receipt.type === 'debit') {
      // First check explicit status field
      if (receipt.status === 'completed') {
        return 'FULLY PAID';
      }
      if (receipt.status === 'paid') {
        return 'PARTIALLY PAID';
      }
      if (receipt.status === 'deleted') {
        return 'DELETED';
      }

      // Fall back to checking sibling refs for legacy data
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
        const hasDiscount = receipt.product?.discountApplied;

        return (
          <div>
            <div className="font-medium text-secondary-900">
              {receipt.type === 'credit'
                ? receipt.description || 'Payment Received'
                : receipt.product?.name || 'Service'
              }
            </div>
            <div className="text-sm text-secondary-600">
              {hasDiscount ? (
                <>
                  <span className="text-success-600 font-medium">USD {receipt.amount.toFixed(2)}</span>
                  {receipt.product?.originalPrice && (
                    <span className="ml-2 line-through text-secondary-400">
                      USD {receipt.product.originalPrice.toFixed(2)}
                    </span>
                  )}
                </>
              ) : (
                <>Amount: USD {receipt.amount.toFixed(2)}</>
              )}
              {receipt.type === 'credit' && isOverpay && (
                <span className="ml-2 text-green-600 font-medium">(Overpayment)</span>
              )}
            </div>
            {hasDiscount && (
              <div className="text-xs text-primary-600 font-medium">
                {receipt.product?.discountApplied}
              </div>
            )}
            <div className={`text-xs font-medium ${receipt.status === 'active' ? 'text-green-600' : 'text-red-600'}`}>
              Status: {receipt.status?.toUpperCase() || 'ACTIVE'}
            </div>
            {receipt.product && !hasDiscount && (
              <div className="text-xs text-secondary-500">
                Product: {receipt.product.name}
              </div>
            )}
            {isInternal && (
              <div className="text-xs text-blue-600 font-medium">
                Internal Transaction
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
      render: (receipt: Receipt) => {
        // Check if invoice is truly unpaid (no sibling refs = no payments)
        const isUnpaid = receipt.type === 'debit' &&
          (!receipt.siblingReceiptRefs || receipt.siblingReceiptRefs.length === 0) &&
          receipt.status !== 'completed' &&
          receipt.status !== 'paid';

        return (
          <div className="flex gap-2 flex-wrap">
            {receipt.type === 'debit' && receipt.status !== 'deleted' && (
              <>
                {isUnpaid && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDiscountClick(receipt)}
                      className="text-primary-600 hover:text-primary-700 border-primary-300 hover:border-primary-400"
                    >
                      Discount
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleEditClick(receipt)}
                    >
                      Edit
                    </Button>
                  </>
                )}
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
        );
      }
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
                    label="Due Date"
                    type="date"
                    value={editForm.deadline}
                    onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                    helperText="Cannot be in the past"
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

      {/* Discount Modal */}
      {discountModalOpen && discountingReceipt && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !discountLoading) {
              setDiscountModalOpen(false);
              setDiscountingReceipt(null);
            }
          }}
        >
          <div className="w-full max-w-md">
            <Card className="w-full">
              <div className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-secondary-900">Apply Discount to Invoice</h3>
                </div>

                <div className="space-y-4">
                  {/* Invoice Info */}
                  <div className="bg-secondary-50 p-4 rounded-lg">
                    <p className="font-medium text-secondary-900">{discountingReceipt.product?.name || 'Invoice'}</p>
                    <p className="text-secondary-600">Current Amount: USD {discountingReceipt.amount.toFixed(2)}</p>
                    {discountingReceipt.product?.discountApplied && (
                      <p className="text-xs text-primary-600 mt-1">
                        Previous discount: {discountingReceipt.product.discountApplied}
                      </p>
                    )}
                  </div>

                  {/* Discount Type */}
                  <div>
                    <Label>Discount Type</Label>
                    <div className="flex gap-4 mt-2">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="discountType"
                          value="percentage"
                          checked={discountType === 'percentage'}
                          onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
                          className="form-radio text-primary-600"
                        />
                        <span className="text-sm">Percentage (%)</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="discountType"
                          value="fixed"
                          checked={discountType === 'fixed'}
                          onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
                          className="form-radio text-primary-600"
                        />
                        <span className="text-sm">Fixed Amount (USD)</span>
                      </label>
                    </div>
                  </div>

                  {/* Discount Value */}
                  <div>
                    <Label htmlFor="discount-value">
                      Discount Value {discountType === 'percentage' ? '(%)' : '(USD)'}
                    </Label>
                    <Input
                      id="discount-value"
                      type="number"
                      min="0"
                      max={discountType === 'percentage' ? '100' : discountingReceipt.amount.toString()}
                      step={discountType === 'percentage' ? '1' : '0.01'}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={discountType === 'percentage' ? 'e.g., 10' : 'e.g., 50.00'}
                      className="mt-1"
                    />
                    {(() => {
                      const discountedAmount = getDiscountedAmount();
                      if (discountedAmount !== null && discountedAmount >= 0) {
                        return (
                          <div className="text-sm text-success-600 mt-1 font-medium">
                            New amount: USD {discountedAmount.toFixed(2)}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {/* Discount Reason */}
                  <div>
                    <Label htmlFor="discount-reason">Reason (Optional)</Label>
                    <Input
                      id="discount-reason"
                      type="text"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      placeholder="e.g., Early payment discount, Promotional offer"
                      className="mt-1"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex justify-between mt-6">
                    <div>
                      {discountingReceipt?.product?.originalPrice && (
                        <Button
                          variant="outline"
                          onClick={handleRemoveDiscount}
                          disabled={discountLoading}
                          className="text-error-600 hover:text-error-700 border-error-300 hover:border-error-400"
                        >
                          Remove Discount
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setDiscountModalOpen(false);
                          setDiscountingReceipt(null);
                        }}
                        disabled={discountLoading}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleDiscountSubmit}
                        disabled={discountLoading || !discountValue || parseFloat(discountValue) <= 0}
                      >
                        {discountLoading ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Applying...
                          </>
                        ) : (
                          'Apply Discount'
                        )}
                      </Button>
                    </div>
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