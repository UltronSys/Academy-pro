import React, { useState, useEffect } from 'react';
import { Button, Card, Input, Label, Select, DataTable, Badge, Toast, ConfirmModal } from '../ui';
import PaymentMaker from './PaymentMaker';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import {
  createExpenseTransaction,
  createMultiPlayerPaymentTransaction,
  getTransactionsByOrganization,
  getTransactionsByAcademy,
  updateTransactionStatus,
  softDeleteTransaction,
  restoreTransaction,
  getDeletedTransactionsByOrganization
} from '../../services/transactionService';
import { calculateUserOutstandingBalance } from '../../services/receiptService';
import { createGuardianPaymentTransaction } from '../../services/guardianFinanceService';
import { Transaction, Player, User } from '../../types';
import {
  searchTransactions,
  syncTransactionToAlgolia,
  deleteTransactionFromAlgolia
} from '../../services/algoliaTransactionService';
import { searchUsers } from '../../services/algoliaService';
import { doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { getSettingsByOrganization } from '../../services/settingsService';


const Transactions: React.FC = () => {
  const { selectedAcademy, selectedOrganization } = useApp();
  const { userData } = useAuth();
  const { canWrite, canDelete } = usePermissions();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [algoliaSearching, setAlgoliaSearching] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ 
    isOpen: boolean; 
    title: string; 
    message: string; 
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: 'primary' | 'error' | 'success';
    onConfirm: () => void;
  } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeletedTransactions, setShowDeletedTransactions] = useState(false);
  const [deletedTransactions, setDeletedTransactions] = useState<Transaction[]>([]);
  const [restoreLoading, setRestoreLoading] = useState<string | null>(null);
  const [viewTransaction, setViewTransaction] = useState<Transaction | null>(null);
  const [playerBalances, setPlayerBalances] = useState<Record<string, {
    outstandingBalance: number;
    availableCredits: number;
    netBalance: number;
  }>>({});
  // const [summary, setSummary] = useState<any>(null); // Summary removed for cleaner UI
  const [selectedTransactionType, setSelectedTransactionType] = useState<'income' | 'expense' | 'internal'>('income');
  
  // PaymentMaker component state
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [selectedPlayerNames, setSelectedPlayerNames] = useState<string[]>([]);
  const [pendingReceipts, setPendingReceipts] = useState<any[]>([]);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [selectedPaymentMaker, setSelectedPaymentMaker] = useState<{
    name: string;
    userRef: any;
    type: 'player' | 'guardian';
  } | null>(null);
  const [playerPayments, setPlayerPayments] = useState<{
    playerId: string;
    playerName: string;
    amount: number;
    outstandingBalance: number; // Raw outstanding debits
    availableCredits: number; // Available credit balance
    netBalance: number; // Net amount (positive = owes, negative = credit balance, zero = balanced)
    userRef: any;
  }[]>([]);

  // Guardian payment state  
  const [guardianGeneralPaymentAmount, setGuardianGeneralPaymentAmount] = useState<string>('');


  // Load transactions and products on component mount
  useEffect(() => {
    const loadData = async () => {
      if (!selectedOrganization?.id) return;
      
      try {
        setLoading(true);
        
        // Always use Algolia for transactions
        await performAlgoliaSearch();
        
        // Sync existing transactions to Algolia in background
        const transactionsData = selectedAcademy?.id 
          ? await getTransactionsByAcademy(selectedOrganization.id, selectedAcademy.id)
          : await getTransactionsByOrganization(selectedOrganization.id);
        
        transactionsData.forEach(transaction => {
          syncTransactionToAlgolia(transaction).catch(console.error);
        });
        
        // Load players and users from Algolia
        
        // Load players (users with player role)
        const playersSearchResult = await searchUsers({
          organizationId: selectedOrganization.id,
          filters: { role: 'player' },
          hitsPerPage: 1000 // Get all players
        });
        
        // Convert Algolia user records to Player format
        const playersData = playersSearchResult.users.map(user => ({
          id: user.objectID,
          name: user.name,
          email: user.email || '',
          phone: user.phone || '',
          userId: user.objectID,
          organizationId: selectedOrganization.id,
          academyId: user.academies || (selectedAcademy?.id ? [selectedAcademy.id] : []),
          status: user.status || 'active',
          dob: new Date(), // Default date - not stored in Algolia user index
          gender: '', // Default empty - not stored in Algolia user index
          guardianId: [], // Default empty array - not stored in Algolia user index
          playerParameters: {}, // Default empty parameters
          createdAt: user.createdAt ? { toDate: () => new Date(user.createdAt!) } : { toDate: () => new Date() },
          updatedAt: user.updatedAt ? { toDate: () => new Date(user.updatedAt!) } : undefined
        } as unknown as Player));
        setPlayers(playersData);
        
        // Load all users (players, guardians, coaches, etc.)
        const usersSearchResult = await searchUsers({
          organizationId: selectedOrganization.id,
          hitsPerPage: 1000 // Get all users
        });
        
        // Convert Algolia user records to User format
        const usersData = usersSearchResult.users.map(user => ({
          id: user.objectID,
          name: user.name,
          email: user.email || '',
          phone: user.phone || '',
          roles: user.roleDetails || [],
          createdAt: user.createdAt ? { toDate: () => new Date(user.createdAt!) } : { toDate: () => new Date() },
          updatedAt: user.updatedAt ? { toDate: () => new Date(user.updatedAt!) } : undefined
        } as unknown as User));
        
        setUsers(usersData);
        
        // Debug: Also check if we can find players from all users (fallback)
        
        
        // Load payment methods and currency from settings
        const settingsData = await getSettingsByOrganization(selectedOrganization.id);
        if (settingsData?.paymentMethods && settingsData.paymentMethods.length > 0) {
          setPaymentMethods(settingsData.paymentMethods);
        } else {
          // No payment methods configured - leave empty
          setPaymentMethods([]);
        }
        
        if (settingsData?.generalSettings?.currency) {
          setDefaultCurrency(settingsData.generalSettings.currency);
        }
        
        // Summary loading removed for cleaner UI
        // const summaryData = await getTransactionSummary(selectedOrganization.id);
        // setSummary(summaryData);
        
      } catch (error) {
        console.error('Error loading data:', error);
        showToast('Failed to load transactions', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedOrganization?.id, selectedAcademy?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Perform Algolia search
  const performAlgoliaSearch = async () => {
    if (!selectedOrganization?.id) return;
    
    try {
      setAlgoliaSearching(true);
      
      const searchResults = await searchTransactions({
        query: searchTerm,
        organizationId: selectedOrganization.id,
        academyId: selectedAcademy?.id,
        filters: {
          type: filterType as any,
          status: filterStatus as any,
          dateRange: dateRange as any
        },
        page: currentPage,
        hitsPerPage: 10
      });
      
      // Convert Algolia records back to Transaction format
      const transactionsData = searchResults.transactions.map(record => ({
        id: record.objectID,
        description: record.description,
        amount: record.amount,
        type: record.type,
        status: record.status,
        paymentMethod: record.paymentMethod,
        organizationId: selectedOrganization.id,
        academyId: record.academyId,
        transactionOwner: record.transactionOwner ? {
          name: record.transactionOwner.name,
          userRef: record.transactionOwner.userId ? doc(db, 'users', record.transactionOwner.userId) : undefined
        } : undefined,
        handler: record.handler ? {
          name: record.handler.name,
          userRef: record.handler.userId ? doc(db, 'users', record.handler.userId) : undefined
        } : undefined,
        paymentMaker: record.paymentMaker,
        playerPayments: record.playerPayments,
        date: record.date ? { toDate: () => new Date(record.date) } : undefined,
        createdAt: { toDate: () => new Date(record.createdAt) },
        updatedAt: record.updatedAt ? { toDate: () => new Date(record.updatedAt!) } : undefined
      } as Transaction));
      
      setTransactions(transactionsData);
      setTotalTransactions(searchResults.totalTransactions);
      setTotalPages(searchResults.totalPages);
      
    } catch (error) {
      console.error('Algolia search error:', error);
      showToast('Search error. Please check your Algolia configuration.', 'error');
      setTransactions([]);
    } finally {
      setAlgoliaSearching(false);
    }
  };
  
  // Trigger Algolia search when filters change
  useEffect(() => {
    if (selectedOrganization?.id) {
      const debounceTimer = setTimeout(() => {
        performAlgoliaSearch();
      }, 300); // Debounce search
      
      return () => clearTimeout(debounceTimer);
    }
  }, [searchTerm, filterStatus, filterType, dateRange, currentPage, selectedAcademy?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Load deleted transactions
  const loadDeletedTransactions = async () => {
    if (!selectedOrganization?.id) return;
    
    try {
      const deletedData = await getDeletedTransactionsByOrganization(selectedOrganization.id);
      setDeletedTransactions(deletedData);
    } catch (error) {
      console.error('Error loading deleted transactions:', error);
      showToast('Failed to load deleted transactions', 'error');
    }
  };
  
  // Load deleted transactions when toggling view
  useEffect(() => {
    if (showDeletedTransactions) {
      loadDeletedTransactions();
    }
  }, [showDeletedTransactions, selectedOrganization?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const handleCloseModal = () => {
    setShowAddTransaction(false);
    setSubmitting(false);
    // Reset form state
    setSelectedTransactionType('income');
    setSelectedPlayerIds([]);
    setSelectedPlayerNames([]);
    setPendingReceipts([]);
    setSelectedReceiptId(null);
    setSelectedPaymentMaker(null);
    setPlayerPayments([]);
    setPlayerBalances({});
    setGuardianGeneralPaymentAmount('');
  };

  const handleViewTransaction = async (transaction: Transaction) => {
    setViewTransaction(transaction);
    
    // Load balance information for players involved in this transaction
    if (transaction.playerPayments && transaction.playerPayments.length > 0 && selectedOrganization?.id) {
      const balances: Record<string, {
        outstandingBalance: number;
        availableCredits: number;
        netBalance: number;
      }> = {};
      
      try {
        for (const payment of transaction.playerPayments) {
          const balanceInfo = await calculateUserOutstandingBalance(payment.userRef.id, selectedOrganization.id);
          balances[payment.playerId] = {
            outstandingBalance: balanceInfo.outstandingDebits,
            availableCredits: balanceInfo.availableCredits,
            netBalance: balanceInfo.netBalance
          };
        }
        setPlayerBalances(balances);
      } catch (error) {
        console.error('Error loading player balances for transaction view:', error);
      }
    } else {
      setPlayerBalances({});
    }
  };

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const typeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'income', label: 'Income' },
    { value: 'expense', label: 'Expense' },
    { value: 'internal', label: 'Internal' },
  ];

  const dateRangeOptions = [
    { value: 'all', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'year', label: 'This Year' },
  ];

  const getStatusColor = (transaction: Transaction) => {
    // For completed income transactions, differentiate between payments and available credits
    if (transaction.status === 'completed' && transaction.type === 'income') {
      const description = transaction.description?.toLowerCase() || '';
      
      // Check if this creates available credit (excess payment)
      if (description.includes('excess') || description.includes('credit')) {
        return 'primary'; // Blue for available credit
      }
      
      // Check if this was applied to existing invoices
      if (description.includes('applied to') || description.includes('payment by')) {
        return 'success'; // Green for payments applied to invoices
      }
      
      // Default for completed income
      return 'success';
    }
    
    // Standard status colors for other cases
    switch (transaction.status) {
      case 'completed':
        return 'success';
      case 'pending':
        return 'warning';
      case 'failed':
        return 'error';
      case 'cancelled':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  const getStatusDisplayText = (transaction: Transaction) => {
    if (transaction.status === 'completed' && transaction.type === 'income') {
      const description = transaction.description?.toLowerCase() || '';
      
      // Check if this creates available credit
      if (description.includes('excess') || description.includes('credit')) {
        return 'Available Credit';
      }
      
      // Check if this was applied to existing invoices
      if (description.includes('applied to')) {
        return 'Payment Applied';
      }
      
      // General payment completed
      return 'Payment Completed';
    }
    
    // Standard status text for other cases
    switch (transaction.status) {
      case 'completed':
        return 'Completed';
      case 'pending':
        return 'Pending';
      case 'failed':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return transaction.status;
    }
  };

  const getTypeColor = (type: Transaction['type']) => {
    switch (type) {
      case 'income':
        return 'success';
      case 'expense':
        return 'warning';
      case 'internal':
        return 'primary';
      default:
        return 'secondary';
    }
  };

  const handleSubmitTransaction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedOrganization?.id || !userData) {
      showToast('No organization selected or user not authenticated', 'error');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const type = formData.get('transactionType') as 'income' | 'expense' | 'internal';
    const vendor = formData.get('vendor') as string;
    const paymentMethod = formData.get('paymentMethod') as string;
    const description = formData.get('description') as string;
    const amount = parseFloat(formData.get('amount') as string);

    // Basic validation
    if (!description.trim()) {
      showToast('Transaction description is required', 'error');
      return;
    }

    // Amount validation - different for PaymentMaker vs guardian payment vs manual input
    if (type === 'income' && selectedPaymentMaker) {
      // For PaymentMaker transactions, validate that we have valid payments
      const totalAmount = playerPayments.reduce((sum, p) => sum + p.amount, 0);
      const guardianAmount = selectedPaymentMaker.type === 'guardian' && guardianGeneralPaymentAmount 
        ? parseFloat(guardianGeneralPaymentAmount) || 0 
        : 0;
      
      if (totalAmount <= 0 && guardianAmount <= 0) {
        showToast('Please enter payment amounts for at least one player or use general payment', 'error');
        return;
      }
    } else if (type === 'income' && selectedPaymentMaker?.type === 'guardian' && guardianGeneralPaymentAmount) {
      // For guardian payment transactions, validate guardian selection and amount
      if (!selectedPaymentMaker.userRef) {
        showToast('Please select a guardian', 'error');
        return;
      }
      const guardianAmount = parseFloat(guardianGeneralPaymentAmount);
      if (isNaN(guardianAmount) || guardianAmount <= 0) {
        showToast('Please enter a valid payment amount for the guardian', 'error');
        return;
      }
    } else {
      // For manual amount input (expense transactions or legacy income)
      if (isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
      }
    }
    
    // Check if payment methods are available
    if (paymentMethods.length === 0) {
      showToast('No payment methods configured. Please add payment methods in Settings first.', 'error');
      return;
    }
    
    if (!paymentMethod) {
      showToast('Please select a payment method', 'error');
      return;
    }

    try {
      setSubmitting(true);
      
      // Create handler reference
      const handlerRef = doc(db, 'users', userData.id);
      const handler = {
        name: userData.name,
        userRef: handlerRef
      };

      let newTransaction: Transaction;

      if (type === 'income') {
        if (selectedPaymentMaker?.type === 'guardian' && guardianGeneralPaymentAmount && parseFloat(guardianGeneralPaymentAmount) > 0) {
          // Guardian general payment
          const guardianAmount = parseFloat(guardianGeneralPaymentAmount);
          const guardianPaymentResult = await createGuardianPaymentTransaction(
            selectedPaymentMaker.userRef.id,
            guardianAmount,
            paymentMethod,
            handler,
            description.trim(),
            selectedOrganization.id,
            selectedAcademy?.id
          );
          
          newTransaction = guardianPaymentResult.transaction;
          
          // Show payment distribution summary
          const { paymentResult } = guardianPaymentResult;
          let distributionSummary = `Payment distributed: ${paymentResult.distributedAmount.toFixed(2)} across ${paymentResult.distributions.length} players, ${paymentResult.playersFullyPaid} fully paid`;
          if (paymentResult.excessAmount > 0) {
            distributionSummary += `, ${paymentResult.excessAmount.toFixed(2)} as guardian credit`;
          }
          showToast(distributionSummary, 'success');
          
        } else if (selectedPaymentMaker && playerPayments.length > 0) {
          // PaymentMaker transactions
          if (!selectedPaymentMaker) {
            showToast('Please select who is making the payment', 'error');
            return;
          }
          
          if (playerPayments.length === 0) {
            showToast('Please add at least one player payment', 'error');
            return;
          }
          
          const validPayments = playerPayments.filter(p => p.amount > 0);
          const guardianAmount = selectedPaymentMaker.type === 'guardian' && guardianGeneralPaymentAmount 
            ? parseFloat(guardianGeneralPaymentAmount) || 0 
            : 0;
          
          if (validPayments.length === 0 && guardianAmount <= 0) {
            showToast('Please enter payment amounts for at least one player or use general payment', 'error');
            return;
          }
          
          newTransaction = await createMultiPlayerPaymentTransaction(
            selectedPaymentMaker,
            validPayments,
            paymentMethod,
            handler,
            selectedOrganization.id,
            selectedAcademy?.id,
            true // linkToPendingDebitReceipt
          );
        } else {
          showToast('Please select a payment method (individual payments or guardian general payment)', 'error');
          return;
        }
      } else if (type === 'expense') {
        // For expense, we need a vendor
        const vendorName = vendor || 'Unknown Vendor';
        const vendorData = {
          name: vendorName,
          userRef: undefined // Vendors typically don't have user references
        };

        newTransaction = await createExpenseTransaction(
          amount,
          paymentMethod,
          vendorData,
          handler,
          description.trim(),
          selectedOrganization.id,
          selectedAcademy?.id
        );
      } else {
        showToast('Internal transactions not yet implemented', 'error');
        return;
      }
      setTransactions(prev => [newTransaction, ...prev]);
      
      // Sync new transaction to Algolia
      syncTransactionToAlgolia(newTransaction).catch(console.error);
      
      // Summary refresh removed for cleaner UI
      // const summaryData = await getTransactionSummary(selectedOrganization.id);
      // setSummary(summaryData);
      
      handleCloseModal();
      showToast('Transaction added successfully!', 'success');
    } catch (error: any) {
      console.error('Error creating transaction:', error);
      
      let errorMessage = 'Failed to create transaction. Please try again.';
      if (error?.code === 'permission-denied') {
        errorMessage = 'Permission denied. You may not have access to create transactions.';
      } else if (error?.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      showToast(errorMessage, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProcessTransaction = async (transactionId: string) => {
    try {
      await updateTransactionStatus(transactionId, 'completed');
      setTransactions(prev => 
        prev.map(transaction => 
          transaction.id === transactionId 
            ? { ...transaction, status: 'completed' as Transaction['status'] }
            : transaction
        )
      );
      
      // Summary refresh removed for cleaner UI
      // if (selectedOrganization?.id) {
      //   const summaryData = await getTransactionSummary(selectedOrganization.id);
      //   setSummary(summaryData);
      // }
      
      showToast('Transaction processed successfully', 'success');
    } catch (error) {
      console.error('Error processing transaction:', error);
      showToast('Failed to process transaction', 'error');
    }
  };

  const handleDeleteTransaction = (transaction: Transaction) => {
    const description = transaction.description || (transaction as any).title || 'Transaction';
    const owner = transaction.transactionOwner?.name || 
                  (transaction as any).playerNames?.join(', ') || 
                  (transaction as any).vendor || 
                  'Unknown';
    const transactionDescription = `"${description}" (${owner})`;
        
    setConfirmModal({
      isOpen: true,
      title: 'Delete Transaction',
      message: `Are you sure you want to delete this transaction ${transactionDescription}? This will reverse all related receipts and balances. You can restore it later from the deleted transactions view.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmVariant: 'error',
      onConfirm: () => confirmDeleteTransaction(transaction.id)
    });
  };

  const confirmDeleteTransaction = async (transactionId: string) => {
    if (!userData) return;
    
    try {
      setDeleteLoading(true);
      const deletedBy = {
        name: userData.name,
        userRef: doc(db, 'users', userData.id)
      };
      
      await softDeleteTransaction(transactionId, deletedBy);
      setTransactions(prev => prev.filter(transaction => transaction.id !== transactionId));
      
      // Remove from Algolia
      deleteTransactionFromAlgolia(transactionId).catch(console.error);
      
      showToast('Transaction deleted successfully. You can restore it from the deleted transactions view.', 'success');
      setConfirmModal(null);
    } catch (error) {
      console.error('Error deleting transaction:', error);
      showToast('Failed to delete transaction. Please try again.', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };
  
  const handleRestoreTransaction = (transaction: Transaction) => {
    setConfirmModal({
      isOpen: true,
      title: 'Restore Transaction',
      message: `Are you sure you want to restore this transaction? This will restore all related receipts and balance relationships.`,
      confirmText: 'Restore',
      cancelText: 'Cancel',
      confirmVariant: 'success', // Use success variant for restore action
      onConfirm: () => confirmRestoreTransaction(transaction.id)
    });
  };
  
  const confirmRestoreTransaction = async (transactionId: string) => {
    try {
      setRestoreLoading(transactionId);
      await restoreTransaction(transactionId);
      
      // Remove from deleted list and reload active transactions
      setDeletedTransactions(prev => prev.filter(transaction => transaction.id !== transactionId));
      
      // Reload active transactions to show the restored one
      if (selectedOrganization?.id) {
        let transactionsData: Transaction[];
        if (selectedAcademy?.id) {
          transactionsData = await getTransactionsByAcademy(selectedOrganization.id, selectedAcademy.id);
        } else {
          transactionsData = await getTransactionsByOrganization(selectedOrganization.id);
        }
        setTransactions(transactionsData);
        
        // Re-sync restored transaction to Algolia
        const restoredTransaction = transactionsData.find(t => t.id === transactionId);
        if (restoredTransaction) {
          syncTransactionToAlgolia(restoredTransaction).catch(console.error);
        }
      }
      
      showToast('Transaction restored successfully', 'success');
      setConfirmModal(null);
    } catch (error) {
      console.error('Error restoring transaction:', error);
      showToast('Failed to restore transaction. Please try again.', 'error');
    } finally {
      setRestoreLoading(null);
    }
  };

  // Algolia handles all filtering - no client-side filtering needed
  const filteredTransactions = transactions;

  const columns = [
    { 
      key: 'id', 
      header: 'Transaction ID',
      render: (transaction: Transaction) => (
        <span className="font-mono text-sm">{transaction.id}</span>
      )
    },
    { 
      key: 'details', 
      header: 'Details',
      render: (transaction: Transaction) => (
        <div>
          <div className="font-medium text-secondary-900">
            {transaction.description || (transaction as any).title || 'No description'}
          </div>
          {/* Add context for income transactions */}
          {transaction.type === 'income' && (
            <div className="text-xs text-secondary-500 mt-1">
              {(() => {
                const description = transaction.description?.toLowerCase() || '';
                if (description.includes('excess') || description.includes('credit')) {
                  return '💳 Creates available credit for future use';
                } else if (description.includes('applied to')) {
                  return '✅ Applied to existing invoices';
                } else {
                  return '💰 Payment received';
                }
              })()}
            </div>
          )}
          <div className="text-sm text-secondary-600">
            {transaction.handler?.name ? `by ${transaction.handler.name}` : ''}
          </div>
          <div className="text-xs text-secondary-500 mt-1">
            {(transaction.date || transaction.createdAt)?.toDate().toLocaleDateString()} {' '}
            {(transaction.date || transaction.createdAt)?.toDate().toLocaleTimeString()}
          </div>
        </div>
      )
    },
    { 
      key: 'owner', 
      header: 'Transaction Owner',
      render: (transaction: Transaction) => (
        <div>
          <div className="font-medium text-secondary-900">
            {transaction.transactionOwner?.name || 
             (transaction as any).playerNames?.join(', ') || 
             (transaction as any).vendor || 
             'Unknown'}
          </div>
          <div className="text-sm text-secondary-600">
            {transaction.type === 'income' ? 'Payer' : transaction.type === 'expense' ? 'Vendor' : 'Internal'}
          </div>
        </div>
      )
    },
    { 
      key: 'amount', 
      header: 'Amount',
      render: (transaction: Transaction) => {
        const isInternal = transaction.type === 'internal';
        const colorClass = isInternal 
          ? 'text-primary-600' 
          : transaction.amount < 0 
            ? 'text-error-600' 
            : 'text-success-600';
        const prefix = isInternal ? '' : transaction.amount < 0 ? '-' : '+';
        
        return (
          <div className={`font-medium ${colorClass}`}>
            {prefix}{defaultCurrency} {Math.abs(transaction.amount).toFixed(2)}
          </div>
        );
      }
    },
    { 
      key: 'type', 
      header: 'Type',
      render: (transaction: Transaction) => (
        <Badge variant={getTypeColor(transaction.type)}>
          {transaction.type}
        </Badge>
      )
    },
    { 
      key: 'status', 
      header: 'Status',
      render: (transaction: Transaction) => (
        <Badge variant={getStatusColor(transaction)}>
          {getStatusDisplayText(transaction)}
        </Badge>
      )
    },
    { 
      key: 'method', 
      header: 'Payment Method',
      render: (transaction: Transaction) => (
        <span className="text-sm">{transaction.paymentMethod || 'N/A'}</span>
      )
    },
    { 
      key: 'actions', 
      header: 'Actions',
      render: (transaction: Transaction) => (
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => handleViewTransaction(transaction)}
          >
            View
          </Button>
          {transaction.status === 'pending' && canWrite('finance') && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-success-600 hover:text-success-700"
              onClick={() => handleProcessTransaction(transaction.id)}
            >
              Process
            </Button>
          )}
          {canDelete('finance') && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-error-600 hover:text-error-700"
              onClick={() => handleDeleteTransaction(transaction)}
            >
              Delete
            </Button>
          )}
        </div>
      )
    },
  ];
  
  // Columns for deleted transactions
  const deletedColumns = [
    { 
      key: 'description', 
      header: 'Description',
      render: (transaction: Transaction) => (
        <div>
          <div className="font-medium text-secondary-900">
            {transaction.description || 'No description'}
          </div>
          <div className="text-sm text-secondary-600">
            {transaction.transactionOwner?.name || 'Unknown Owner'}
          </div>
          <div className="text-xs text-red-600 font-medium">
            DELETED
          </div>
        </div>
      )
    },
    { 
      key: 'type', 
      header: 'Type',
      render: (transaction: Transaction) => (
        <Badge variant={transaction.type === 'income' ? 'success' : transaction.type === 'expense' ? 'error' : 'primary'}>
          {transaction.type.toUpperCase()}
        </Badge>
      )
    },
    { 
      key: 'amount', 
      header: 'Amount',
      render: (transaction: Transaction) => {
        const isInternal = transaction.type === 'internal';
        const colorClass = isInternal 
          ? 'text-primary-600' 
          : transaction.amount < 0 
            ? 'text-error-600' 
            : 'text-success-600';
        const prefix = isInternal ? '' : transaction.amount < 0 ? '-' : '+';
        return (
          <div className={`font-medium ${colorClass}`}>
            {prefix}{defaultCurrency} {Math.abs(transaction.amount).toFixed(2)}
          </div>
        );
      }
    },
    { 
      key: 'deletionInfo', 
      header: 'Deletion Info',
      render: (transaction: Transaction) => (
        <div className="text-sm">
          <div className="text-secondary-600">
            Deleted: {transaction.deletedAt?.toDate().toLocaleDateString()}
          </div>
          <div className="text-secondary-600">
            By: {transaction.deletedBy?.name || 'Unknown'}
          </div>
        </div>
      )
    },
    { 
      key: 'date', 
      header: 'Original Date',
      render: (transaction: Transaction) => (
        <div className="text-sm text-secondary-600">
          {transaction.date?.toDate().toLocaleDateString() || 
           transaction.createdAt.toDate().toLocaleDateString()}
        </div>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (transaction: Transaction) => (
        <div className="flex items-center space-x-2">
          {canWrite('finance') && (
            <Button 
              variant="outline" 
              size="sm" 
              className="text-green-600 hover:text-green-700"
              onClick={() => handleRestoreTransaction(transaction)}
              disabled={restoreLoading === transaction.id}
            >
              {restoreLoading === transaction.id ? 'Restoring...' : 'Restore'}
            </Button>
          )}
        </div>
      )
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Add Transaction button */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-secondary-900">
          {showDeletedTransactions ? 'Deleted Transactions' : 'Transactions'}
          <span className="ml-2 text-sm font-normal text-primary-600">
            (Powered by Algolia)
          </span>
        </h2>
        <div className="flex items-center space-x-3">
          <Button 
            variant="outline"
            onClick={() => setShowDeletedTransactions(!showDeletedTransactions)}
          >
            {showDeletedTransactions ? 'Show Active' : 'Show Deleted'}
          </Button>
          {!showDeletedTransactions && canWrite('finance') && (
            <Button onClick={() => setShowAddTransaction(true)}>
              Add Transaction
            </Button>
          )}
        </div>
      </div>

      {/* Filters - Only show for active transactions */}
      {!showDeletedTransactions && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Input
          type="text"
          placeholder="Search transactions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full"
        />
        <Select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
        <Select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          {typeOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
        <Select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
        >
          {dateRangeOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      </div>
      )}

      {/* Search Stats */}
      {totalTransactions > 0 && !showDeletedTransactions && (
        <div className="text-sm text-secondary-600">
          Found {totalTransactions} transactions
          {searchTerm && ` matching "${searchTerm}"`}
        </div>
      )}


      {/* Transactions Table */}
      {loading || algoliaSearching ? (
        <div className="flex justify-center items-center min-h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <Card>
          <DataTable
            data={showDeletedTransactions ? deletedTransactions : filteredTransactions}
            columns={showDeletedTransactions ? deletedColumns : columns}
            emptyMessage={showDeletedTransactions ? "No deleted transactions found" : "No transactions found"}
            showPagination={false}
            itemsPerPage={10}
          />
        </Card>
      )}

      {/* Algolia Pagination */}
      {totalPages > 1 && !showDeletedTransactions && (
        <div className="flex justify-center items-center space-x-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
          >
            Previous
          </Button>
          <span className="text-sm text-secondary-600">
            Page {currentPage + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
            disabled={currentPage >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      )}

      {/* Export Button */}
      <div className="flex justify-end">
        <Button variant="outline">
          Export Transactions
        </Button>
      </div>

      {/* Transaction Details Modal */}
      {viewTransaction && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setViewTransaction(null);
              setPlayerBalances({});
            }
          }}
        >
          <div className="w-full max-w-2xl my-8">
            <Card className="w-full">
              <div className="p-6 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-semibold text-secondary-900">Transaction Details</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setViewTransaction(null);
                      setPlayerBalances({});
                    }}
                  >
                    ✕
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {/* Transaction ID and Status */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-secondary-700">Transaction ID</Label>
                      <p className="font-mono text-sm text-secondary-900 mt-1">{viewTransaction.id}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-secondary-700">Status</Label>
                      <div className="mt-1">
                        <Badge variant={getStatusColor(viewTransaction)}>
                          {getStatusDisplayText(viewTransaction)}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Amount and Type */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-secondary-700">Amount</Label>
                      <p className={`text-lg font-semibold mt-1 ${viewTransaction.amount < 0 ? 'text-error-600' : 'text-success-600'}`}>
                        {viewTransaction.amount < 0 ? '-' : '+'}{defaultCurrency} {Math.abs(viewTransaction.amount).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-secondary-700">Type</Label>
                      <div className="mt-1">
                        <Badge variant={getTypeColor(viewTransaction.type)}>
                          {viewTransaction.type}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <Label className="text-sm font-medium text-secondary-700">Description</Label>
                    <p className="text-secondary-900 mt-1">{viewTransaction.description || 'No description'}</p>
                  </div>

                  {/* Transaction Owner */}
                  <div>
                    <Label className="text-sm font-medium text-secondary-700">Transaction Owner</Label>
                    <p className="text-secondary-900 mt-1">
                      {viewTransaction.transactionOwner?.name || 
                       (viewTransaction as any).playerNames?.join(', ') || 
                       (viewTransaction as any).vendor || 
                       'Unknown'}
                    </p>
                  </div>

                  {/* Payment Method */}
                  <div>
                    <Label className="text-sm font-medium text-secondary-700">Payment Method</Label>
                    <p className="text-secondary-900 mt-1">{viewTransaction.paymentMethod || 'N/A'}</p>
                  </div>

                  {/* Payment Maker (for income transactions) */}
                  {viewTransaction.paymentMaker && (
                    <div>
                      <Label className="text-sm font-medium text-secondary-700">Payment Made By</Label>
                      <p className="text-secondary-900 mt-1">
                        {viewTransaction.paymentMaker.name} ({viewTransaction.paymentMaker.type})
                      </p>
                    </div>
                  )}

                  {/* Player Payments (for multi-player transactions) */}
                  {viewTransaction.playerPayments && viewTransaction.playerPayments.length > 0 && (
                    <div>
                      <Label className="text-sm font-medium text-secondary-700">Player Payments & Current Balances</Label>
                      <div className="mt-2 space-y-2">
                        {viewTransaction.playerPayments.map((payment, index) => {
                          const balance = playerBalances[payment.playerId];
                          return (
                            <div key={index} className="p-3 bg-secondary-50 rounded-lg">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="font-medium text-secondary-900">{payment.playerName}</div>
                                  <div className="text-sm text-secondary-600 mt-1">
                                    Paid: {defaultCurrency} {payment.amount.toFixed(2)}
                                  </div>
                                  {balance && (
                                    <div className="text-xs text-secondary-500 mt-1 space-y-1">
                                      <div className={balance.netBalance > 0 ? 'text-red-600' : 'text-green-600'}>
                                        Current Outstanding: {balance.netBalance > 0 
                                          ? `${defaultCurrency} ${balance.netBalance.toFixed(2)} owed` 
                                          : 'Up to date'
                                        }
                                      </div>
                                      {balance.availableCredits > 0 && (
                                        <div className="text-blue-600">
                                          Available Credit: {defaultCurrency} {balance.availableCredits.toFixed(2)}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="text-success-600 font-semibold">
                                  {defaultCurrency} {payment.amount.toFixed(2)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Handler */}
                  <div>
                    <Label className="text-sm font-medium text-secondary-700">Processed By</Label>
                    <p className="text-secondary-900 mt-1">{viewTransaction.handler?.name || 'Unknown'}</p>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-secondary-700">Transaction Date</Label>
                      <p className="text-secondary-900 text-sm mt-1">
                        {(viewTransaction.date || viewTransaction.createdAt)?.toDate().toLocaleDateString()} {' '}
                        {(viewTransaction.date || viewTransaction.createdAt)?.toDate().toLocaleTimeString()}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-secondary-700">Created At</Label>
                      <p className="text-secondary-900 text-sm mt-1">
                        {viewTransaction.createdAt?.toDate().toLocaleDateString()} {' '}
                        {viewTransaction.createdAt?.toDate().toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3 pt-6 border-t mt-6">
                  {viewTransaction.status === 'pending' && canWrite('finance') && (
                    <Button 
                      variant="outline"
                      onClick={() => {
                        handleProcessTransaction(viewTransaction.id);
                        setViewTransaction(null);
                      }}
                    >
                      Process Transaction
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => {
                      setViewTransaction(null);
                      setPlayerBalances({});
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {showAddTransaction && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) {
              handleCloseModal();
            }
          }}
        >
          <div className="w-full max-w-4xl my-8">
            <Card className="w-full">
              <div className="p-6 max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-semibold text-secondary-900 mb-4">Add New Transaction</h3>
                <form className="space-y-4" onSubmit={handleSubmitTransaction}>
                  <div>
                    <Label htmlFor="transactionType">Transaction Type</Label>
                    <Select 
                      id="transactionType" 
                      name="transactionType" 
                      value={selectedTransactionType}
                      onChange={(e) => {
                        const type = e.target.value as Transaction['type'];
                        setSelectedTransactionType(type);
                        // Reset player selection when changing type
                        if (type === 'expense') {
                          setSelectedPlayerIds([]);
                          setSelectedPlayerNames([]);
                        }
                      }}
                      required
                    >
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                    </Select>
                  </div>
                  
                  
                  {/* Payment maker and player selection - only show for income transactions */}
                  {selectedTransactionType === 'income' && (
                    <PaymentMaker
                      users={users}
                      players={players}
                      onPaymentMakerChange={setSelectedPaymentMaker}
                      onPlayerPaymentsChange={setPlayerPayments}
                      selectedPaymentMaker={selectedPaymentMaker}
                      playerPayments={playerPayments}
                      currency={defaultCurrency}
                      onGuardianGeneralPaymentChange={setGuardianGeneralPaymentAmount}
                      guardianGeneralPaymentAmount={guardianGeneralPaymentAmount}
                    />
                  )}

                  
                  
                  {/* Vendor field - show for expense transactions */}
                  {selectedTransactionType === 'expense' && (
                    <div>
                      <Label htmlFor="vendor">Vendor/Recipient</Label>
                      <Input
                        id="vendor"
                        name="vendor"
                        type="text"
                        placeholder="Who was paid? (e.g., John's Sports Store, Electric Company)"
                      />
                    </div>
                  )}
                  
                  {/* Amount field - only show manual input for expense transactions or when not using PaymentMaker */}
                  {selectedTransactionType === 'expense' && (
                    <div>
                      <Label htmlFor="amount">Amount ({defaultCurrency})</Label>
                      <Input
                        id="amount"
                        name="amount"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        required
                      />
                    </div>
                  )}
                  
                  {/* Hidden input for PaymentMaker calculated amount */}
                  {selectedTransactionType === 'income' && selectedPaymentMaker && playerPayments.length > 0 && (
                    <input type="hidden" name="amount" value={playerPayments.reduce((sum, p) => sum + p.amount, 0)} />
                  )}
                  
                  <div>
                    <Label htmlFor="paymentMethod">Payment Method</Label>
                    {paymentMethods.length > 0 ? (
                      <Select id="paymentMethod" name="paymentMethod" required>
                        <option value="">Select payment method</option>
                        {paymentMethods.map(method => (
                          <option key={method} value={method}>{method}</option>
                        ))}
                      </Select>
                    ) : (
                      <>
                        <Select id="paymentMethod" name="paymentMethod" disabled>
                          <option value="">No payment methods configured</option>
                        </Select>
                        <p className="text-xs text-amber-600 mt-1 font-medium">
                          ⚠️ No payment methods available. Please add payment methods in Settings → Payment Methods.
                        </p>
                      </>
                    )}
                  </div>
                  
                  <div>
                    <Label htmlFor="description">Description/Notes</Label>
                    <textarea
                      id="description"
                      name="description"
                      className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      rows={3}
                      placeholder={
                        selectedTransactionType === 'income' ? 'e.g., January 2024 training fee, Tournament registration' :
                        'e.g., Office supplies, Equipment purchase, Facility rent'
                      }
                      required
                    />
                  </div>
                  
                  <div className="flex justify-end space-x-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCloseModal}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      {submitting && (
                        <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                      {submitting ? 'Adding Transaction...' : 'Add Transaction'}
                    </Button>
                  </div>
                </form>
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

      {/* Confirm Modal */}
      {confirmModal && (
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText || "Confirm"}
          cancelText={confirmModal.cancelText || "Cancel"}
          confirmVariant={confirmModal.confirmVariant || "primary"}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
          loading={deleteLoading || (restoreLoading !== null)}
        />
      )}
    </div>
  );
};

export default Transactions;