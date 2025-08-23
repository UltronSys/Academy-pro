import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  DocumentReference,
  writeBatch,
  collectionGroup
} from 'firebase/firestore';
import { db } from '../firebase';
import { Transaction, Receipt, User } from '../types';
import { createCreditReceipt, getReceiptsByUser, calculateUserOutstandingBalance } from './receiptService';

const COLLECTION_NAME = 'transactions';

export const createTransaction = async (
  transactionData: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'receiptRefs'>,
  receipts?: Omit<Receipt, 'id' | 'createdAt' | 'updatedAt' | 'parentTransactionRef'>[]
): Promise<Transaction> => {
  try {
    console.log('transactionService: Starting transaction creation with data:', transactionData);
    
    const batch = writeBatch(db);
    const transactionRef = doc(collection(db, COLLECTION_NAME));
    const receiptRefs: DocumentReference[] = [];
    
    // Create receipts if provided
    if (receipts && receipts.length > 0) {
      for (const receiptData of receipts) {
        // Get userId from the receipt's userRef
        const userId = receiptData.userRef.id;
        const userReceiptsCollection = collection(db, 'users', userId, 'receipts');
        const receiptRef = doc(userReceiptsCollection);
        
        const receipt: Receipt = {
          ...receiptData,
          id: receiptRef.id,
          parentTransactionRef: transactionRef,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        };
        batch.set(receiptRef, receipt);
        receiptRefs.push(receiptRef);
        console.log('transactionService: Added receipt to batch:', receiptRef.id, 'for user:', userId);
      }
    }
    
    const now = Timestamp.now();
    const transaction: any = {
      ...transactionData,
      id: transactionRef.id,
      receiptRefs,
      createdAt: now,
      updatedAt: now
    };
    
    // Remove undefined academyId to avoid Firestore error
    if (transaction.academyId === undefined) {
      delete transaction.academyId;
    }
    
    batch.set(transactionRef, transaction);
    console.log('transactionService: Added transaction to batch:', transactionRef.id);
    
    await batch.commit();
    console.log('transactionService: Batch committed successfully');
    
    return transaction;
  } catch (error) {
    console.error('transactionService: Error creating transaction:', error);
    throw error;
  }
};

export const createIncomeTransaction = async (
  amount: number,
  paymentMethod: string,
  owner: { name: string; userRef: DocumentReference },
  handler: { name: string; userRef: DocumentReference },
  description: string,
  organizationId: string,
  academyId?: string,
  productRef?: DocumentReference,
  productInfo?: { name: string; price: number },
  linkToPendingDebitReceipt: boolean = true
): Promise<Transaction> => {
  try {
    const transactionData: any = {
      amount,
      paymentMethod,
      transactionOwner: owner,
      description,
      date: Timestamp.now(),
      type: 'income',
      handler,
      status: 'completed',
      organizationId
    };
    
    // Only add academyId if it's defined
    if (academyId !== undefined) {
      transactionData.academyId = academyId;
    }
    
    const transaction = await createTransaction(transactionData);
    
    // Get the user ID from the owner reference
    const userId = owner.userRef.id;
    
    // Check for pending debit receipts to link with
    let siblingDebitReceiptRef: DocumentReference | undefined;
    
    if (linkToPendingDebitReceipt) {
      console.log('Checking for pending debit receipts for user:', userId);
      const userReceipts = await getReceiptsByUser(userId);
      
      // Find an unpaid debit receipt that matches the amount or is closest
      const pendingDebits = userReceipts.filter(r => 
        r.type === 'debit' && 
        (!r.siblingReceiptRefs || r.siblingReceiptRefs.length === 0) &&
        r.organizationId === organizationId
      );
      
      if (pendingDebits.length > 0) {
        // Try to find exact amount match first
        let matchingDebit = pendingDebits.find(r => r.amount === amount);
        
        // If no exact match, find the oldest pending debit
        if (!matchingDebit) {
          matchingDebit = pendingDebits.sort((a, b) => {
            const dateA = a.product?.invoiceDate?.toMillis() || a.createdAt?.toMillis() || 0;
            const dateB = b.product?.invoiceDate?.toMillis() || b.createdAt?.toMillis() || 0;
            return dateA - dateB;
          })[0];
        }
        
        if (matchingDebit) {
          siblingDebitReceiptRef = doc(db, 'users', userId, 'receipts', matchingDebit.id);
          console.log('Found pending debit receipt to link:', matchingDebit.id);
        }
      }
    }
    
    // Create credit receipt and link to debit if found
    const creditReceipt = await createCreditReceipt(
      owner.userRef,
      amount,
      doc(db, COLLECTION_NAME, transaction.id),
      siblingDebitReceiptRef,
      organizationId,
      academyId,
      description // Pass transaction description as receipt description
    );
    
    console.log('Credit receipt created:', creditReceipt.id);
    if (siblingDebitReceiptRef) {
      console.log('Successfully linked credit receipt to debit receipt');
    }
    
    return transaction;
  } catch (error) {
    console.error('Error creating income transaction:', error);
    throw error;
  }
};

export const createExpenseTransaction = async (
  amount: number,
  paymentMethod: string,
  vendor: { name: string; userRef?: DocumentReference },
  handler: { name: string; userRef: DocumentReference },
  description: string,
  organizationId: string,
  academyId?: string
): Promise<Transaction> => {
  try {
    const transactionData: any = {
      amount: -Math.abs(amount), // Ensure negative for expense
      paymentMethod,
      transactionOwner: vendor as any, // Vendor might not have userRef
      description,
      date: Timestamp.now(),
      type: 'expense',
      handler,
      status: 'completed',
      organizationId
    };
    
    // Only add academyId if it's defined
    if (academyId !== undefined) {
      transactionData.academyId = academyId;
    }
    
    const transaction = await createTransaction(transactionData, []);
    
    return transaction;
  } catch (error) {
    console.error('Error creating expense transaction:', error);
    throw error;
  }
};

export const getTransactionById = async (transactionId: string): Promise<Transaction | null> => {
  try {
    const transactionRef = doc(db, COLLECTION_NAME, transactionId);
    const transactionSnap = await getDoc(transactionRef);
    
    if (transactionSnap.exists()) {
      return { id: transactionSnap.id, ...transactionSnap.data() } as Transaction;
    }
    return null;
  } catch (error) {
    console.error('Error getting transaction:', error);
    throw error;
  }
};

export const getTransactionsByOrganization = async (
  organizationId: string, 
  includeDeleted: boolean = false
): Promise<Transaction[]> => {
  try {
    
    const q = query(
      collection(db, COLLECTION_NAME), 
      where('organizationId', '==', organizationId)
    );
    const querySnapshot = await getDocs(q);
    
    
    let transactions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Transaction[];
    
    // Filter out deleted transactions unless specifically requested
    if (!includeDeleted) {
      transactions = transactions.filter(transaction => !transaction.isDeleted);
    }
    
    // Sort client-side to avoid index issues
    return transactions.sort((a, b) => {
      const dateA = a.date?.toMillis() || a.createdAt?.toMillis() || 0;
      const dateB = b.date?.toMillis() || b.createdAt?.toMillis() || 0;
      return dateB - dateA;
    });
  } catch (error) {
    console.error('transactionService: Error getting transactions by organization:', error);
    throw error;
  }
};

export const getTransactionsByAcademy = async (organizationId: string, academyId: string): Promise<Transaction[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME), 
      where('organizationId', '==', organizationId),
      where('academyId', '==', academyId)
    );
    const querySnapshot = await getDocs(q);
    
    const transactions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Transaction[];
    
    return transactions.sort((a, b) => {
      const dateA = a.date?.toMillis() || a.createdAt?.toMillis() || 0;
      const dateB = b.date?.toMillis() || b.createdAt?.toMillis() || 0;
      return dateB - dateA;
    });
  } catch (error) {
    console.error('Error getting transactions by academy:', error);
    throw error;
  }
};

export const getTransactionsByOwner = async (organizationId: string, ownerRef: DocumentReference): Promise<Transaction[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME), 
      where('organizationId', '==', organizationId),
      where('transactionOwner.userRef', '==', ownerRef)
    );
    const querySnapshot = await getDocs(q);
    
    const transactions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Transaction[];
    
    return transactions.sort((a, b) => {
      const dateA = a.date?.toMillis() || a.createdAt?.toMillis() || 0;
      const dateB = b.date?.toMillis() || b.createdAt?.toMillis() || 0;
      return dateB - dateA;
    });
  } catch (error) {
    console.error('Error getting transactions by owner:', error);
    throw error;
  }
};

export const getTransactionsByStatus = async (organizationId: string, status: Transaction['status']): Promise<Transaction[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME), 
      where('organizationId', '==', organizationId),
      where('status', '==', status)
    );
    const querySnapshot = await getDocs(q);
    
    const transactions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Transaction[];
    
    return transactions.sort((a, b) => {
      const dateA = a.date?.toMillis() || a.createdAt?.toMillis() || 0;
      const dateB = b.date?.toMillis() || b.createdAt?.toMillis() || 0;
      return dateB - dateA;
    });
  } catch (error) {
    console.error('Error getting transactions by status:', error);
    throw error;
  }
};

export const getTransactionsByType = async (organizationId: string, type: Transaction['type']): Promise<Transaction[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME), 
      where('organizationId', '==', organizationId),
      where('type', '==', type)
    );
    const querySnapshot = await getDocs(q);
    
    const transactions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Transaction[];
    
    return transactions.sort((a, b) => {
      const dateA = a.date?.toMillis() || a.createdAt?.toMillis() || 0;
      const dateB = b.date?.toMillis() || b.createdAt?.toMillis() || 0;
      return dateB - dateA;
    });
  } catch (error) {
    console.error('Error getting transactions by type:', error);
    throw error;
  }
};

export const updateTransaction = async (transactionId: string, updates: Partial<Transaction>): Promise<void> => {
  try {
    const transactionRef = doc(db, COLLECTION_NAME, transactionId);
    await updateDoc(transactionRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating transaction:', error);
    throw error;
  }
};

export const updateTransactionStatus = async (transactionId: string, status: Transaction['status']): Promise<void> => {
  try {
    await updateTransaction(transactionId, { status });
  } catch (error) {
    console.error('Error updating transaction status:', error);
    throw error;
  }
};

export const deleteTransaction = async (transactionId: string): Promise<void> => {
  try {
    const transaction = await getTransactionById(transactionId);
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    const batch = writeBatch(db);
    
    // Delete associated receipts
    if (transaction.receiptRefs && transaction.receiptRefs.length > 0) {
      for (const receiptRef of transaction.receiptRefs) {
        // The receiptRef path should be: users/{userId}/receipts/{receiptId}
        batch.delete(receiptRef);
      }
    }
    
    // Delete transaction
    const transactionRef = doc(db, COLLECTION_NAME, transactionId);
    batch.delete(transactionRef);
    
    await batch.commit();
  } catch (error) {
    console.error('Error deleting transaction:', error);
    throw error;
  }
};

export const softDeleteTransaction = async (
  transactionId: string,
  deletedBy: { name: string; userRef: DocumentReference }
): Promise<void> => {
  try {
    console.log('🗑️ softDeleteTransaction: Starting soft deletion for transaction:', transactionId);
    
    const transaction = await getTransactionById(transactionId);
    
    // First, let's check what users are involved and their current balance states
    console.log('🔍 DEBUGGING: Let me check who will be affected by this deletion...');
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    if (transaction.isDeleted) {
      throw new Error('Transaction is already deleted');
    }
    
    const batch = writeBatch(db);
    const transactionRef = doc(db, COLLECTION_NAME, transactionId);
    
    // Before doing anything, let's see what users will be affected and their current balances
    console.log('👥 PRELIMINARY BALANCE CHECK:');
    if (transaction.receiptRefs && transaction.receiptRefs.length > 0) {
      for (const receiptRef of transaction.receiptRefs) {
        try {
          const receiptDoc = await getDoc(receiptRef);
          if (receiptDoc.exists()) {
            const receipt = receiptDoc.data() as Receipt;
            const userId = receipt.userRef.id;
            
            // Get current balance for this user
            const { calculateUserOutstandingBalance } = require('./receiptService');
            const currentBalance = await calculateUserOutstandingBalance(userId, transaction.organizationId);
            console.log(`👤 User ${userId} CURRENT STATE: Outstanding=${currentBalance.outstandingDebits}, Credits=${currentBalance.availableCredits}, Net=${currentBalance.netBalance}`);
          }
        } catch (error) {
          console.error('Error checking preliminary balance:', error);
        }
      }
    }
    
    // Collect all receipt data and sibling relationships for backup
    const receiptBackups: any[] = [];
    const affectedUserBalances: Map<string, { outstandingBalance: number; availableCredit: number }> = new Map();
    
    console.log('📋 Processing receipts for backup and soft deletion...');
    console.log('🔍 Transaction details:', {
      id: transaction.id,
      amount: transaction.amount,
      type: transaction.type,
      description: transaction.description,
      receiptRefsCount: transaction.receiptRefs?.length || 0,
      receiptRefs: transaction.receiptRefs,
      paymentMaker: transaction.paymentMaker,
      playerPayments: transaction.playerPayments
    });
    
    // CRITICAL DEBUG: Let's see the full transaction object
    console.log('🔍 FULL TRANSACTION OBJECT:', transaction);
    
    // WORKAROUND: Since transaction.receiptRefs might be empty due to a bug in transaction creation,
    // let's query the database to find all receipts that reference this transaction
    let associatedReceipts: any[] = [];
    
    if (transaction.receiptRefs && transaction.receiptRefs.length > 0) {
      console.log(`📦 Found ${transaction.receiptRefs.length} receipt references in transaction`);
      // Use existing receipt references if available
      associatedReceipts = transaction.receiptRefs;
    } else {
      console.log('⚠️ No receipt references found in transaction - querying database for receipts that reference this transaction');
      
      // Query all receipts that have this transaction as their parentTransactionRef
      const allReceipts = await getDocs(collectionGroup(db, 'receipts'));
      const transactionRef = doc(db, COLLECTION_NAME, transactionId);
      
      associatedReceipts = allReceipts.docs
        .filter(receiptDoc => {
          const receiptData = receiptDoc.data();
          return receiptData.parentTransactionRef && receiptData.parentTransactionRef.id === transactionId;
        })
        .map(receiptDoc => receiptDoc.ref);
      
      console.log(`🔍 Found ${associatedReceipts.length} receipts via database query`);
    }
    
    if (associatedReceipts.length > 0) {
      for (const receiptRef of associatedReceipts) {
        try {
          // Get receipt document
          const receiptDoc = await getDoc(receiptRef);
          if (!receiptDoc.exists()) {
            console.warn(`⚠️ Receipt ${receiptRef.id} not found, skipping...`);
            continue;
          }
          
          const receipt = receiptDoc.data() as Receipt;
          const userId = receipt.userRef.id;
          
          console.log(`📄 Processing receipt ${receipt.id} for user ${userId}:`, {
            type: receipt.type,
            amount: receipt.amount,
            siblingCount: receipt.siblingReceiptRefs?.length || 0,
            description: receipt.description
          });
          
          // Store current receipt state for backup
          const receiptBackup: any = {
            receiptId: receipt.id,
            receiptPath: receiptRef.path,
            receiptData: receipt,
            siblingRefs: receipt.siblingReceiptRefs || []
          };
          
          // Collect sibling receipt data for complete restoration
          const siblingBackups: any[] = [];
          if (receipt.siblingReceiptRefs && receipt.siblingReceiptRefs.length > 0) {
            for (const siblingRef of receipt.siblingReceiptRefs) {
              try {
                const siblingDoc = await getDoc(siblingRef);
                if (siblingDoc.exists()) {
                  const siblingReceipt = siblingDoc.data() as Receipt;
                  siblingBackups.push({
                    receiptId: siblingReceipt.id,
                    receiptPath: siblingRef.path,
                    receiptData: siblingReceipt
                  });
                  
                  // For sibling receipts, we need to remove this receipt from their sibling list
                  // to properly break the financial relationship
                  const updatedSiblingRefs = siblingReceipt.siblingReceiptRefs?.filter(
                    ref => ref.id !== receipt.id
                  ) || [];
                  
                  // Update sibling receipt to remove the relationship (but don't delete the sibling)
                  batch.update(siblingRef, {
                    siblingReceiptRefs: updatedSiblingRefs,
                    updatedAt: Timestamp.now()
                  });
                  
                  console.log(`🔗 Removed relationship from sibling receipt: ${siblingReceipt.id}`);
                }
              } catch (error) {
                console.error(`❌ Error processing sibling receipt:`, error);
              }
            }
          }
          
          receiptBackup.siblingBackups = siblingBackups;
          receiptBackups.push(receiptBackup);
          
          // Always track this user as affected (don't check if already exists)
          try {
            const { calculateUserOutstandingBalance } = require('./receiptService');
            const balanceInfo = await calculateUserOutstandingBalance(userId, transaction.organizationId);
            affectedUserBalances.set(userId, {
              outstandingBalance: balanceInfo.outstandingBalance,
              availableCredit: balanceInfo.availableCredits
            });
            console.log(`💰 Current balance for user ${userId} before deletion:`, {
              outstandingDebits: balanceInfo.outstandingDebits,
              availableCredits: balanceInfo.availableCredits,
              netBalance: balanceInfo.netBalance
            });
          } catch (balanceError) {
            console.error(`❌ Error calculating balance for user ${userId}:`, balanceError);
            affectedUserBalances.set(userId, { outstandingBalance: 0, availableCredit: 0 });
          }
          
          // Simply change the receipt status to 'deleted' - much cleaner!
          batch.update(receiptRef, {
            status: 'deleted',
            deletedAt: Timestamp.now(),
            deletedBy,
            updatedAt: Timestamp.now()
          });
          
          console.log(`✅ Prepared soft deletion for receipt: ${receipt.id}`);
          
        } catch (error) {
          console.error(`❌ Error processing receipt ${receiptRef.id}:`, error);
        }
      }
    } else {
      console.log('⚠️ No receipts found to delete - transaction might not have created proper receipts');
    }
    
    // Create comprehensive state backup
    const stateBackup = {
      transactionData: transaction,
      receiptBackups,
      userBalances: Object.fromEntries(affectedUserBalances),
      deletionTimestamp: Date.now(),
      receiptRelationshipMap: receiptBackups.reduce((map, backup) => {
        map[backup.receiptId] = {
          originalSiblings: backup.receiptData.siblingReceiptRefs || [],
          siblingBackups: backup.siblingBackups
        };
        return map;
      }, {} as Record<string, any>)
    };
    
    console.log('🔄 State backup prepared:', {
      transactionId,
      receiptsCount: receiptBackups.length,
      affectedUsers: affectedUserBalances.size
    });
    
    // Soft delete transaction
    batch.update(transactionRef, {
      isDeleted: true,
      deletedAt: Timestamp.now(),
      deletedBy,
      deletionStateBackup: JSON.stringify(stateBackup),
      updatedAt: Timestamp.now()
    });
    
    console.log('💾 Committing soft deletion batch...');
    await batch.commit();
    
    // CRITICAL: Recalculate balances for all affected users
    console.log('🔄 Recalculating balances for affected users...');
    const { recalculateAndUpdateUserBalance, recalculateAndUpdateUserOutstandingAndCredits } = require('./userService');
    
    for (const [userId, balanceInfo] of Array.from(affectedUserBalances.entries())) {
      try {
        console.log(`💰 [BALANCE DELETION] Recalculating balance for user: ${userId}`);
        console.log(`📊 BEFORE DELETION: Outstanding=${balanceInfo.outstandingBalance}, Credits=${balanceInfo.availableCredit}`);
        console.log(`🗑️ DELETING TRANSACTION: Amount=${transaction.amount}, Type=${transaction.type}`);
        
        await recalculateAndUpdateUserBalance(userId, transaction.organizationId);
        await recalculateAndUpdateUserOutstandingAndCredits(userId, transaction.organizationId);
        
        // Log the new balance after recalculation with receipt details
        const { calculateUserOutstandingBalance, getReceiptsByUser } = require('./receiptService');
        const newBalanceInfo = await calculateUserOutstandingBalance(userId, transaction.organizationId);
        
        // Get current receipts to show what remains after deletion
        const remainingReceipts = await getReceiptsByUser(userId);
        const orgReceipts = remainingReceipts.filter((r: any) => r.organizationId === transaction.organizationId);
        const debits = orgReceipts.filter((r: any) => r.type === 'debit');
        const credits = orgReceipts.filter((r: any) => r.type === 'credit');
        
        console.log(`📊 AFTER DELETION: Outstanding=${newBalanceInfo.outstandingDebits}, Credits=${newBalanceInfo.availableCredits}, Net=${newBalanceInfo.netBalance}`);
        console.log(`📄 REMAINING RECEIPTS: ${debits.length} debits, ${credits.length} credits`);
        console.log(`🎯 EXPECTED FOR YOUR CASE: Outstanding=2000, Credits=0 after deleting 3000 payment`);
        console.log(`✅ Balance recalculated for user: ${userId}`);
      } catch (balanceError) {
        console.error(`❌ Error recalculating balance for user ${userId}:`, balanceError);
      }
    }
    
    console.log('✅ Transaction soft deleted successfully and balances updated');
    
  } catch (error) {
    console.error('❌ Error soft deleting transaction:', error);
    throw error;
  }
};

export const restoreTransaction = async (transactionId: string): Promise<void> => {
  try {
    console.log('🔄 restoreTransaction: Starting restoration for transaction:', transactionId);
    
    const transaction = await getTransactionById(transactionId);
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    if (!transaction.isDeleted) {
      throw new Error('Transaction is not deleted');
    }
    
    if (!transaction.deletionStateBackup) {
      throw new Error('No backup data found for restoration');
    }
    
    const batch = writeBatch(db);
    const transactionRef = doc(db, COLLECTION_NAME, transactionId);
    
    // Parse backup data
    const stateBackup = JSON.parse(transaction.deletionStateBackup);
    console.log('📋 Restoring from backup:', {
      receiptsCount: stateBackup.receiptBackups?.length || 0,
      affectedUsers: Object.keys(stateBackup.userBalances || {}).length
    });
    
    // Restore receipts and their relationships
    if (stateBackup.receiptBackups && stateBackup.receiptBackups.length > 0) {
      for (const receiptBackup of stateBackup.receiptBackups) {
        try {
          const receiptRef = doc(db, receiptBackup.receiptPath);
          
          // Simply restore the receipt status to 'active'
          batch.update(receiptRef, {
            status: 'active',
            deletedAt: null,
            deletedBy: null,
            updatedAt: Timestamp.now()
          });
          
          console.log(`🔄 Restored receipt: ${receiptBackup.receiptId}`);
          
          // Restore sibling receipts and their relationships
          if (receiptBackup.siblingBackups && receiptBackup.siblingBackups.length > 0) {
            for (const siblingBackup of receiptBackup.siblingBackups) {
              const siblingRef = doc(db, siblingBackup.receiptPath);
              
              // Restore the original sibling relationships
              batch.update(siblingRef, {
                siblingReceiptRefs: siblingBackup.receiptData.siblingReceiptRefs || [],
                updatedAt: Timestamp.now()
              });
              
              console.log(`🔗 Restored sibling receipt relationships: ${siblingBackup.receiptId}`);
            }
          }
          
        } catch (error) {
          console.error(`❌ Error restoring receipt ${receiptBackup.receiptId}:`, error);
        }
      }
    }
    
    // Restore transaction
    batch.update(transactionRef, {
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      deletionStateBackup: null,
      updatedAt: Timestamp.now()
    });
    
    console.log('💾 Committing restoration batch...');
    await batch.commit();
    
    // CRITICAL: Recalculate balances for all affected users
    console.log('🔄 Recalculating balances for restored users...');
    const { recalculateAndUpdateUserBalance, recalculateAndUpdateUserOutstandingAndCredits } = require('./userService');
    
    // Get affected users from backup data
    const affectedUsers = Object.keys(stateBackup.userBalances || {});
    for (const userId of affectedUsers) {
      try {
        console.log(`💰 Recalculating balance for restored user: ${userId}`);
        await recalculateAndUpdateUserBalance(userId, transaction.organizationId);
        await recalculateAndUpdateUserOutstandingAndCredits(userId, transaction.organizationId);
        console.log(`✅ Balance recalculated for restored user: ${userId}`);
      } catch (balanceError) {
        console.error(`❌ Error recalculating balance for restored user ${userId}:`, balanceError);
      }
    }
    
    console.log('✅ Transaction restored successfully and balances updated');
    
  } catch (error) {
    console.error('❌ Error restoring transaction:', error);
    throw error;
  }
};

export const getDeletedTransactionsByOrganization = async (organizationId: string): Promise<Transaction[]> => {
  try {
    console.log('transactionService: Getting deleted transactions for organization:', organizationId);
    
    const q = query(
      collection(db, COLLECTION_NAME), 
      where('organizationId', '==', organizationId),
      where('isDeleted', '==', true)
    );
    const querySnapshot = await getDocs(q);
    
    
    const transactions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Transaction[];
    
    // Sort by deletion date (most recent first)
    return transactions.sort((a, b) => {
      const dateA = a.deletedAt?.toMillis() || 0;
      const dateB = b.deletedAt?.toMillis() || 0;
      return dateB - dateA;
    });
  } catch (error) {
    console.error('transactionService: Error getting deleted transactions by organization:', error);
    throw error;
  }
};

// Helper function to get transaction summary for a date range
export const getTransactionSummary = async (organizationId: string, startDate?: Date, endDate?: Date) => {
  try {
    let transactions = await getTransactionsByOrganization(organizationId);
    
    // Filter by date range if provided
    if (startDate || endDate) {
      transactions = transactions.filter(transaction => {
        const transactionDate = transaction.date?.toDate() || transaction.createdAt.toDate();
        if (startDate && transactionDate < startDate) return false;
        if (endDate && transactionDate > endDate) return false;
        return true;
      });
    }
    
    const summary = {
      total: transactions.length,
      completed: transactions.filter(t => t.status === 'completed').length,
      pending: transactions.filter(t => t.status === 'pending').length,
      failed: transactions.filter(t => t.status === 'failed').length,
      cancelled: transactions.filter(t => t.status === 'cancelled').length,
      totalIncome: transactions
        .filter(t => t.type === 'income' && t.status === 'completed')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0),
      totalExpenses: Math.abs(transactions
        .filter(t => t.type === 'expense' && t.status === 'completed')
        .reduce((sum, t) => sum + t.amount, 0)),
      netRevenue: transactions
        .filter(t => t.status === 'completed')
        .reduce((sum, t) => sum + t.amount, 0)
    };
    
    return summary;
  } catch (error) {
    console.error('Error getting transaction summary:', error);
    throw error;
  }
};

// Create a multi-player payment transaction
export const createMultiPlayerPaymentTransaction = async (
  paymentMaker: {
    name: string;
    userRef: DocumentReference;
    type: 'player' | 'guardian';
  },
  playerPayments: {
    playerId: string;
    playerName: string;
    amount: number;
    userRef: DocumentReference;
  }[],
  paymentMethod: string,
  handler: {
    name: string;
    userRef: DocumentReference;
  },
  organizationId: string,
  academyId?: string,
  linkToPendingDebitReceipt: boolean = true
): Promise<Transaction> => {
  try {
    console.log('🏦 createMultiPlayerPaymentTransaction: Starting with overpayment detection');
    console.log('Payment maker:', paymentMaker);
    console.log('Player payments:', playerPayments);
    
    const totalAmount = playerPayments.reduce((sum, payment) => sum + payment.amount, 0);
    
    if (totalAmount <= 0) {
      throw new Error('Total payment amount must be greater than 0');
    }

    const transactionData: any = {
      amount: totalAmount,
      paymentMethod,
      transactionOwner: paymentMaker,
      paymentMaker,
      playerPayments,
      description: `Payment by ${paymentMaker.name} (${paymentMaker.type}) for ${playerPayments.length} player(s)`,
      date: Timestamp.now(),
      type: 'income',
      handler,
      status: 'completed',
      organizationId
    };
    
    // Only add academyId if it's defined
    if (academyId !== undefined) {
      transactionData.academyId = academyId;
    }

    // Create the transaction first
    const transaction = await createTransaction(transactionData);
    console.log('✅ createMultiPlayerPaymentTransaction: Transaction created:', transaction.id);

    // Process each player payment with overpayment detection
    const receiptPromises = playerPayments
      .filter(payment => payment.amount > 0) // Only create receipts for positive amounts
      .map(async (payment) => {
        try {
          console.log(`💰 Processing payment for player ${payment.playerName} - Amount: ${payment.amount}`);
          
          // Calculate outstanding balance for this player
          const balanceInfo = await calculateUserOutstandingBalance(payment.userRef.id, organizationId);
          console.log(`📊 Player ${payment.playerName} balance info:`, {
            outstandingDebits: balanceInfo.outstandingDebits,
            availableCredits: balanceInfo.availableCredits,
            netBalance: balanceInfo.netBalance,
            paymentAmount: payment.amount
          });
          
          let amountForDebits = 0;
          let excessAmount = 0;
          
          // Determine how much goes to pending debits vs excess credit
          if (balanceInfo.netBalance > 0) {
            if (payment.amount >= balanceInfo.netBalance) {
              // Payment covers all outstanding balance plus excess
              amountForDebits = balanceInfo.netBalance;
              excessAmount = payment.amount - balanceInfo.netBalance;
              console.log(`💡 Payment covers full balance. Debt: ${amountForDebits}, Excess: ${excessAmount}`);
            } else {
              // Payment partially covers outstanding balance
              amountForDebits = payment.amount;
              excessAmount = 0;
              console.log(`💡 Payment partially covers balance. Debt: ${amountForDebits}`);
            }
          } else {
            // No outstanding balance, entire payment is excess
            amountForDebits = 0;
            excessAmount = payment.amount;
            console.log(`💡 No outstanding balance. Full amount as credit: ${excessAmount}`);
          }
          
          // Handle payment to outstanding debits
          if (amountForDebits > 0 && linkToPendingDebitReceipt) {
            console.log(`🧾 Applying ${amountForDebits} to outstanding debits for ${payment.playerName}`);
            
            // Find and pay pending debits in order (oldest first)
            const pendingDebits = balanceInfo.pendingDebitReceipts.sort((a, b) => {
              const dateA = a.product?.invoiceDate?.toMillis() || a.createdAt?.toMillis() || 0;
              const dateB = b.product?.invoiceDate?.toMillis() || b.createdAt?.toMillis() || 0;
              return dateA - dateB;
            });
            
            let remainingDebitAmount = amountForDebits;
            
            for (const debitReceipt of pendingDebits) {
              if (remainingDebitAmount <= 0) break;
              
              // Use the remaining amount on the debit, not the full amount
              const debitRemainingAmount = debitReceipt.remainingAmount || debitReceipt.amount;
              const amountToPay = Math.min(remainingDebitAmount, debitRemainingAmount);
              
              // Create credit receipt linked to this debit
              const siblingDebitReceiptRef = doc(db, 'users', payment.userRef.id, 'receipts', debitReceipt.id);
              
              await createCreditReceipt(
                payment.userRef,
                amountToPay,
                doc(db, 'transactions', transaction.id),
                siblingDebitReceiptRef,
                organizationId,
                academyId,
                `Payment by ${paymentMaker.name} for ${payment.playerName} - Applied to ${debitReceipt.product?.name || 'charge'} (${amountToPay === debitRemainingAmount ? 'Full payment' : 'Partial payment'})`
              );
              
              console.log(`💳 Created credit receipt for ${amountToPay} linked to debit ${debitReceipt.id} (remaining on debit was ${debitRemainingAmount})`);
              remainingDebitAmount -= amountToPay;
            }
          }
          
          // Handle excess payment as standalone credit
          if (excessAmount > 0) {
            console.log(`🎁 Creating excess credit of ${excessAmount} for ${payment.playerName}`);
            
            await createCreditReceipt(
              payment.userRef,
              excessAmount,
              doc(db, 'transactions', transaction.id),
              undefined, // No sibling receipt for excess
              organizationId,
              academyId,
              `Excess payment credit by ${paymentMaker.name} for ${payment.playerName}`
            );
            
            console.log(`✅ Created excess credit receipt for ${payment.playerName}`);
          }
          
          // If no outstanding debits but we still want to create credit receipt for the full amount
          if (amountForDebits === 0 && excessAmount === 0 && payment.amount > 0) {
            console.log(`💳 Creating standard credit receipt for ${payment.amount} for ${payment.playerName}`);
            
            await createCreditReceipt(
              payment.userRef,
              payment.amount,
              doc(db, 'transactions', transaction.id),
              undefined,
              organizationId,
              academyId,
              `Payment by ${paymentMaker.name} for ${payment.playerName}`
            );
          }
          
          console.log(`✅ Completed payment processing for player ${payment.playerName}`);
          return { 
            playerName: payment.playerName, 
            amountForDebits, 
            excessAmount,
            totalProcessed: payment.amount
          };
          
        } catch (error) {
          console.error(`❌ Error processing payment for player ${payment.playerName}:`, error);
          throw error;
        }
      });

    const results = await Promise.all(receiptPromises);
    console.log('🎉 createMultiPlayerPaymentTransaction: All payments processed successfully');
    
    // Log summary
    const totalExcess = results.reduce((sum, r) => sum + r.excessAmount, 0);
    const totalAppliedToDebits = results.reduce((sum, r) => sum + r.amountForDebits, 0);
    console.log('📈 Payment Summary:', {
      totalAmount,
      totalAppliedToDebits,
      totalExcess,
      playersWithExcess: results.filter(r => r.excessAmount > 0).length
    });

    return transaction;
  } catch (error) {
    console.error('Error creating multi-player payment transaction:', error);
    throw error;
  }
};