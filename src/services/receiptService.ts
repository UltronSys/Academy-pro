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
  serverTimestamp,
  Timestamp,
  DocumentReference,
  writeBatch,
  collectionGroup
} from 'firebase/firestore';
import { db } from '../firebase';
import { Receipt } from '../types';
import { recalculateAndUpdateUserBalance, recalculateAndUpdateUserOutstandingAndCredits } from './userService';

export const createReceipt = async (
  userId: string,
  receiptData: Omit<Receipt, 'id' | 'createdAt' | 'updatedAt' | 'userRef'>
): Promise<Receipt> => {
  try {
    console.log('🎆 createReceipt: Starting with userId:', userId);
    console.log('🎆 createReceipt: Receipt data:', receiptData);
    
    const userRef = doc(db, 'users', userId);
    const receiptsCollection = collection(userRef, 'receipts');
    const receiptRef = doc(receiptsCollection);
    const now = Timestamp.now();
    
    console.log('📁 createReceipt: Created references:', {
      userRefPath: userRef.path,
      receiptRefPath: receiptRef.path,
      receiptId: receiptRef.id
    });
    
    const receipt: Receipt = {
      ...receiptData,
      id: receiptRef.id,
      userRef,
      status: 'active', // Default status for new receipts
      createdAt: now,
      updatedAt: now
    };
    
    console.log('📦 createReceipt: Final receipt object:', receipt);
    console.log('💾 createReceipt: Saving to Firestore...');
    
    await setDoc(receiptRef, receipt);
    console.log('✅ receiptService: Receipt created successfully:', receiptRef.id, 'for user:', userId);
    console.log('📍 receiptService: Receipt saved at path:', receiptRef.path);
    
    // Update user balance after creating receipt
    try {
      await recalculateAndUpdateUserBalance(userId, receiptData.organizationId);
      await recalculateAndUpdateUserOutstandingAndCredits(userId, receiptData.organizationId);
      console.log('💰 receiptService: User balance and outstanding/credits updated after receipt creation');
    } catch (balanceError) {
      console.error('❌ receiptService: Error updating user balance after receipt creation:', balanceError);
      // Don't throw error here to avoid failing receipt creation
    }
    
    return receipt;
  } catch (error) {
    console.error('receiptService: Error creating receipt:', error);
    throw error;
  }
};

export const createDebitReceipt = async (
  userRef: DocumentReference,
  productRef: DocumentReference,
  productInfo: { name: string; price: number; invoiceDate?: Date; deadline?: Date },
  organizationId: string,
  academyId?: string
): Promise<Receipt> => {
  try {
    console.log('🧾 createDebitReceipt: Starting with:', {
      userRefId: userRef.id,
      userRefPath: userRef.path,
      productRefId: productRef.id,
      productInfo,
      organizationId,
      academyId
    });

    const invoiceDate = productInfo.invoiceDate 
      ? Timestamp.fromDate(productInfo.invoiceDate)
      : Timestamp.now();
    const deadlineTimestamp = productInfo.deadline 
      ? Timestamp.fromDate(productInfo.deadline) 
      : Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); // 30 days from now
    
    const userId = userRef.id;
    console.log('🔑 createDebitReceipt: Using userId:', userId);
    
    console.log('📄 createDebitReceipt: About to create receipt with data:', {
      type: 'debit',
      amount: productInfo.price,
      product: {
        productRef: productRef.path,
        name: productInfo.name,
        price: productInfo.price
      },
      organizationId,
      academyId
    });

    const receiptData: any = {
      type: 'debit',
      amount: productInfo.price,
      product: {
        productRef,
        name: productInfo.name,
        price: productInfo.price,
        invoiceDate,
        deadline: deadlineTimestamp
      },
      siblingReceiptRefs: [],
      organizationId
    };
    
    // Only add academyId if it's defined
    if (academyId !== undefined) {
      receiptData.academyId = academyId;
    }
    
    console.log('💾 createDebitReceipt: Calling createReceipt with userId:', userId);
    console.log('💾 createDebitReceipt: Receipt data to create:', receiptData);
    
    const receipt = await createReceipt(userId, receiptData);
    
    console.log('✅ createDebitReceipt: Receipt created successfully:', receipt.id);
    console.log('✅ createDebitReceipt: Full receipt object:', receipt);
    
    // Automatically apply available credits if any exist
    try {
      await autoApplyAvailableCredits(userId, organizationId, receipt);
      console.log('✅ createDebitReceipt: Automatic credit application completed');
    } catch (creditError) {
      console.error('❌ createDebitReceipt: Error applying available credits (non-blocking):', creditError);
      // Don't throw error to avoid failing receipt creation
    }
    
    return receipt;
  } catch (error: any) {
    console.error('❌ createDebitReceipt: Error creating debit receipt:', error);
    console.error('❌ createDebitReceipt: Error message:', error?.message || error);
    console.error('❌ createDebitReceipt: Error stack:', error?.stack || error);
    console.error('❌ createDebitReceipt: Error details:', {
      userRefId: userRef?.id,
      productInfo,
      organizationId,
      academyId
    });
    throw error;
  }
};


export const getReceiptById = async (userId: string, receiptId: string): Promise<Receipt | null> => {
  try {
    const receiptRef = doc(db, 'users', userId, 'receipts', receiptId);
    const receiptSnap = await getDoc(receiptRef);
    
    if (receiptSnap.exists()) {
      return { id: receiptSnap.id, ...receiptSnap.data() } as Receipt;
    }
    return null;
  } catch (error) {
    console.error('Error getting receipt:', error);
    throw error;
  }
};

export const getReceiptsByUser = async (userId: string): Promise<Receipt[]> => {
  try {
    const userRef = doc(db, 'users', userId);
    const receiptsCollection = collection(userRef, 'receipts');
    const querySnapshot = await getDocs(receiptsCollection);
    
    const receipts = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Receipt[];
    
    return receipts.sort((a, b) => {
      const dateA = a.type === 'debit' && a.product ? a.product.invoiceDate?.toMillis() || 0 : (a.paymentDate?.toMillis() || a.createdAt?.toMillis() || 0);
      const dateB = b.type === 'debit' && b.product ? b.product.invoiceDate?.toMillis() || 0 : (b.paymentDate?.toMillis() || b.createdAt?.toMillis() || 0);
      return dateB - dateA;
    });
  } catch (error) {
    console.error('Error getting receipts by user:', error);
    throw error;
  }
};

export const getReceiptsByOrganization = async (organizationId: string): Promise<Receipt[]> => {
  try {
    // Note: Querying across subcollections requires composite queries or collection group queries
    // For now, we'll use collectionGroup which queries all 'receipts' subcollections
    const q = query(
      collectionGroup(db, 'receipts'),
      where('organizationId', '==', organizationId)
    );
    const querySnapshot = await getDocs(q);
    
    const receipts = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Receipt[];
    
    return receipts.sort((a, b) => {
      const dateA = a.type === 'debit' && a.product ? a.product.invoiceDate?.toMillis() || 0 : (a.paymentDate?.toMillis() || a.createdAt?.toMillis() || 0);
      const dateB = b.type === 'debit' && b.product ? b.product.invoiceDate?.toMillis() || 0 : (b.paymentDate?.toMillis() || b.createdAt?.toMillis() || 0);
      return dateB - dateA;
    });
  } catch (error) {
    console.error('Error getting receipts by organization:', error);
    throw error;
  }
};

// Get unpaid debit receipts (no sibling credit receipts)
export const getUnpaidDebitReceipts = async (organizationId: string): Promise<Receipt[]> => {
  try {
    const q = query(
      collectionGroup(db, 'receipts'),
      where('organizationId', '==', organizationId),
      where('type', '==', 'debit')
    );
    const querySnapshot = await getDocs(q);
    
    const receipts = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Receipt[];
    
    // Filter to only unpaid debits (no sibling receipts)
    const unpaidReceipts = receipts.filter(receipt => 
      !receipt.siblingReceiptRefs || receipt.siblingReceiptRefs.length === 0
    );
    
    return unpaidReceipts.sort((a, b) => {
      const dateA = a.product?.invoiceDate?.toMillis() || a.createdAt?.toMillis() || 0;
      const dateB = b.product?.invoiceDate?.toMillis() || b.createdAt?.toMillis() || 0;
      return dateB - dateA;
    });
  } catch (error) {
    console.error('Error getting unpaid debit receipts:', error);
    throw error;
  }
};

// Get paid debit receipts (have sibling credit receipts)
export const getPaidDebitReceipts = async (organizationId: string): Promise<Receipt[]> => {
  try {
    const q = query(
      collectionGroup(db, 'receipts'),
      where('organizationId', '==', organizationId),
      where('type', '==', 'debit')
    );
    const querySnapshot = await getDocs(q);
    
    const receipts = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Receipt[];
    
    // Filter to only paid debits (have sibling receipts)
    const paidReceipts = receipts.filter(receipt => 
      receipt.siblingReceiptRefs && receipt.siblingReceiptRefs.length > 0
    );
    
    return paidReceipts.sort((a, b) => {
      const dateA = a.product?.invoiceDate?.toMillis() || a.createdAt?.toMillis() || 0;
      const dateB = b.product?.invoiceDate?.toMillis() || b.createdAt?.toMillis() || 0;
      return dateB - dateA;
    });
  } catch (error) {
    console.error('Error getting paid debit receipts:', error);
    throw error;
  }
};

export const getOverdueReceipts = async (organizationId: string): Promise<Receipt[]> => {
  try {
    const now = Timestamp.now();
    // Get all debit receipts for the organization
    const q = query(
      collectionGroup(db, 'receipts'),
      where('organizationId', '==', organizationId),
      where('type', '==', 'debit')
    );
    const querySnapshot = await getDocs(q);
    
    const receipts = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Receipt[];
    
    // Filter overdue receipts: unpaid debits (no sibling receipts) that are past deadline
    const overdueReceipts = receipts.filter(receipt => 
      receipt.type === 'debit' && 
      (!receipt.siblingReceiptRefs || receipt.siblingReceiptRefs.length === 0) &&
      receipt.product && 
      receipt.product.deadline?.toMillis() < now.toMillis()
    );
    
    return overdueReceipts.sort((a, b) => {
      const deadlineA = a.product?.deadline?.toMillis() || 0;
      const deadlineB = b.product?.deadline?.toMillis() || 0;
      return deadlineA - deadlineB;
    });
  } catch (error) {
    console.error('Error getting overdue receipts:', error);
    throw error;
  }
};

export const updateReceipt = async (userId: string, receiptId: string, updates: Partial<Receipt>): Promise<void> => {
  try {
    const receiptRef = doc(db, 'users', userId, 'receipts', receiptId);
    await updateDoc(receiptRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    
    // Get the receipt to find organizationId for balance update
    const updatedReceipt = await getReceiptById(userId, receiptId);
    if (updatedReceipt) {
      try {
        await recalculateAndUpdateUserBalance(userId, updatedReceipt.organizationId);
        await recalculateAndUpdateUserOutstandingAndCredits(userId, updatedReceipt.organizationId);
        console.log('💰 receiptService: User balance and outstanding/credits updated after receipt update');
      } catch (balanceError) {
        console.error('❌ receiptService: Error updating user balance after receipt update:', balanceError);
      }
    }
  } catch (error) {
    console.error('Error updating receipt:', error);
    throw error;
  }
};

// Note: Receipt status is now determined by sibling receipts, not a separate status field

export const deleteReceipt = async (userId: string, receiptId: string): Promise<void> => {
  try {
    // Get the receipt before deleting to find organizationId for balance update
    const receipt = await getReceiptById(userId, receiptId);
    const organizationId = receipt?.organizationId;
    
    const receiptRef = doc(db, 'users', userId, 'receipts', receiptId);
    await deleteDoc(receiptRef);
    
    // Update user balance after deleting receipt
    if (organizationId) {
      try {
        await recalculateAndUpdateUserBalance(userId, organizationId);
        await recalculateAndUpdateUserOutstandingAndCredits(userId, organizationId);
        console.log('💰 receiptService: User balance and outstanding/credits updated after receipt deletion');
      } catch (balanceError) {
        console.error('❌ receiptService: Error updating user balance after receipt deletion:', balanceError);
      }
    }
  } catch (error) {
    console.error('Error deleting receipt:', error);
    throw error;
  }
};

// Helper function to link sibling receipts and check if debit is fully paid
export const linkSiblingReceipts = async (
  debitUserId: string,
  debitReceiptId: string,
  creditUserId: string,
  creditReceiptId: string,
  isFullPayment: boolean = true // Whether this payment fully covers the debit
): Promise<void> => {
  try {
    console.log('🔗 linkSiblingReceipts: Linking and updating status...', {
      debitUserId,
      debitReceiptId,
      creditUserId,
      creditReceiptId
    });
    
    const batch = writeBatch(db);
    
    const debitRef = doc(db, 'users', debitUserId, 'receipts', debitReceiptId);
    const creditRef = doc(db, 'users', creditUserId, 'receipts', creditReceiptId);
    
    // Update debit receipt - add credit link and update status if fully paid
    const debitUpdate: any = {
      siblingReceiptRefs: [creditRef],
      updatedAt: serverTimestamp()
    };
    
    // Only mark as completed if this is a full payment
    if (isFullPayment) {
      debitUpdate.status = 'completed';
      console.log('📋 linkSiblingReceipts: Marking debit receipt as completed (full payment)');
    } else {
      debitUpdate.status = 'paid'; // Partially paid but not fully completed
      console.log('📋 linkSiblingReceipts: Marking debit receipt as paid (partial payment)');
    }
    
    batch.update(debitRef, debitUpdate);
    
    // Update credit receipt - link to debit receipt
    batch.update(creditRef, {
      siblingReceiptRefs: [debitRef],
      updatedAt: serverTimestamp()
    });
    
    await batch.commit();
    console.log('✅ linkSiblingReceipts: Successfully linked receipts and marked debit as completed');
  } catch (error) {
    console.error('Error linking sibling receipts:', error);
    throw error;
  }
};

// Helper function to get user balance from receipts
// Negative balance = user owes money, Positive balance = user has credit
export const calculateUserBalanceFromReceipts = async (userId: string, organizationId?: string): Promise<number> => {
  try {
    const receipts = await getReceiptsByUser(userId);
    
    // Filter by organization if provided
    const filteredReceipts = organizationId 
      ? receipts.filter(r => r.organizationId === organizationId)
      : receipts;
    
    const balance = filteredReceipts.reduce((acc, receipt) => {
      if (receipt.type === 'debit') {
        // Debit receipts represent money owed (negative impact on balance)
        return acc - receipt.amount;
      } else if (receipt.type === 'credit') {
        // Credit receipts represent payments made (positive impact on balance)
        return acc + receipt.amount;
      }
      return acc;
    }, 0);
    
    return balance;
  } catch (error) {
    console.error('Error calculating user balance from receipts:', error);
    throw error;
  }
};

// Backward compatibility
export const getUserBalance = calculateUserBalanceFromReceipts;

// Helper function to get pending debit receipts for a user
export const getPendingDebitReceipts = async (
  userId: string,
  organizationId: string
): Promise<Receipt[]> => {
  try {
    const userReceipts = await getReceiptsByUser(userId);
    const organizationReceipts = userReceipts.filter(r => r.organizationId === organizationId);
    const debitReceipts = organizationReceipts.filter(r => r.type === 'debit');
    const pendingDebits: Receipt[] = [];

    for (const debitReceipt of debitReceipts) {
      // Skip completed debits - they are fully paid and not pending
      if (debitReceipt.status === 'completed') {
        continue;
      }
      
      // Calculate total credits applied to this debit
      const linkedCredits = organizationReceipts.filter(creditReceipt =>
        creditReceipt.type === 'credit' &&
        creditReceipt.siblingReceiptRefs &&
        creditReceipt.siblingReceiptRefs.some(ref => ref.id === debitReceipt.id)
      );
      
      const totalCreditsApplied = linkedCredits.reduce((sum, credit) => sum + credit.amount, 0);
      const remainingDebt = debitReceipt.amount - totalCreditsApplied;
      
      // Only include debits with remaining balance (active or partially paid)
      if (remainingDebt > 0) {
        pendingDebits.push(debitReceipt);
      }
    }

    return pendingDebits.sort((a, b) => {
      const dateA = a.product?.invoiceDate?.toMillis() || a.createdAt?.toMillis() || 0;
      const dateB = b.product?.invoiceDate?.toMillis() || b.createdAt?.toMillis() || 0;
      return dateA - dateB;
    });
  } catch (error) {
    console.error('Error getting pending debit receipts:', error);
    throw error;
  }
};

// Create a credit receipt for payments
export const createCreditReceipt = async (
  userRef: DocumentReference,
  amount: number,
  parentTransactionRef?: DocumentReference,
  siblingReceiptRef?: DocumentReference,
  organizationId?: string,
  academyId?: string,
  description?: string
): Promise<Receipt> => {
  try {
    console.log('💳 createCreditReceipt: Creating credit receipt for:', {
      userRefId: userRef.id,
      amount,
      organizationId,
      academyId,
      description
    });

    const userId = userRef.id;
    
    const creditReceiptData: any = {
      type: 'credit' as const,
      amount: amount,
      description: description || `Credit for payment`,
      organizationId: organizationId || '',
      invoiceDate: Timestamp.now(),
      paidDate: Timestamp.now(),
      siblingReceiptRefs: siblingReceiptRef ? [siblingReceiptRef] : []
    };

    // Only add parentTransactionRef if it's defined
    if (parentTransactionRef) {
      creditReceiptData.parentTransactionRef = parentTransactionRef;
    }

    // Only add academyId if it's defined
    if (academyId !== undefined) {
      creditReceiptData.academyId = academyId;
    }

    const creditReceipt = await createReceipt(userId, creditReceiptData);
    
    console.log('✅ createCreditReceipt: Credit receipt created:', creditReceipt.id);
    
    // If there's a sibling debit receipt, link them and update debit status
    if (siblingReceiptRef) {
      console.log('🔗 Linking credit receipt to debit receipt and updating status...');
      
      // Check if this is a full payment by calculating the remaining debt
      try {
        const debitReceiptDoc = await getDoc(siblingReceiptRef);
        const debitReceiptData = debitReceiptDoc.data() as Receipt;
        
        // Get all existing credit receipts linked to this debit to calculate remaining debt
        const userReceipts = await getReceiptsByUser(userId);
        const existingCreditsForDebit = userReceipts.filter(r => 
          r.type === 'credit' &&
          r.siblingReceiptRefs &&
          r.siblingReceiptRefs.some(ref => ref.id === siblingReceiptRef.id) &&
          r.id !== creditReceipt.id // Don't count the current credit receipt
        );
        
        const totalExistingCredits = existingCreditsForDebit.reduce((sum, r) => sum + r.amount, 0);
        const remainingDebt = debitReceiptData.amount - totalExistingCredits;
        const isFullPayment = amount >= remainingDebt;
        
        console.log('💰 Payment comparison:', {
          debitAmount: debitReceiptData.amount,
          existingCredits: totalExistingCredits,
          remainingDebt: remainingDebt,
          creditAmount: amount,
          isFullPayment
        });
        
        await linkSiblingReceipts(
          userId, // debitUserId
          siblingReceiptRef.id, // debitReceiptId
          userId, // creditUserId (same user)
          creditReceipt.id, // creditReceiptId
          isFullPayment // Pass whether this is a full payment
        );
        
        console.log(`✅ Debit receipt marked as ${isFullPayment ? 'completed' : 'paid'} and linked to credit receipt`);
      } catch (error) {
        console.error('Error checking debit receipt amount:', error);
        // Fallback to not changing status if we can't check
        await linkSiblingReceipts(
          userId,
          siblingReceiptRef.id,
          userId,
          creditReceipt.id,
          false // Default to partial payment if we can't determine
        );
      }
    }
    
    // Update user balance after creating the credit receipt
    await recalculateAndUpdateUserBalance(userId, organizationId);
    await recalculateAndUpdateUserOutstandingAndCredits(userId, organizationId || '');
    
    return creditReceipt;
  } catch (error) {
    console.error('❌ Error creating credit receipt:', error);
    throw error;
  }
};

// Calculate user's outstanding balance (pending debits minus available credits)
// Type for pending debit receipts with remaining amount
export type PendingDebitReceipt = Receipt & { remainingAmount: number };

export const calculateUserOutstandingBalance = async (
  userId: string,
  organizationId: string
): Promise<{
  outstandingDebits: number;
  availableCredits: number;
  netBalance: number;
  pendingDebitReceipts: PendingDebitReceipt[];
  creditReceipts: Receipt[];
}> => {
  try {
    const userReceipts = await getReceiptsByUser(userId);
    // Filter out deleted receipts and get organization-specific receipts
    // Include active, paid, and completed receipts in calculations
    const organizationReceipts = userReceipts.filter(r => 
      r.organizationId === organizationId && r.status !== 'deleted'
    );
    
    // Calculate outstanding debits by checking actual payment coverage
    const debitReceipts = organizationReceipts.filter(r => r.type === 'debit');
    const pendingDebitReceipts: PendingDebitReceipt[] = [];
    let outstandingDebits = 0;

    for (const debitReceipt of debitReceipts) {
      // Skip completed debits - they shouldn't contribute to outstanding balance
      if (debitReceipt.status === 'completed') {
        continue;
      }
      
      // Calculate total credits applied to this debit
      const linkedCredits = organizationReceipts.filter(creditReceipt =>
        creditReceipt.type === 'credit' &&
        creditReceipt.siblingReceiptRefs &&
        creditReceipt.siblingReceiptRefs.some(ref => ref.id === debitReceipt.id)
      );
      
      const totalCreditsApplied = linkedCredits.reduce((sum, credit) => sum + credit.amount, 0);
      const remainingDebt = debitReceipt.amount - totalCreditsApplied;
      
      // Only include in outstanding if there's remaining debt
      // This handles both 'active' (unpaid) and 'paid' (partially paid) statuses
      if (remainingDebt > 0) {
        // Add the debit receipt with its remaining amount
        const pendingDebit: PendingDebitReceipt = {
          ...debitReceipt,
          remainingAmount: remainingDebt
        };
        pendingDebitReceipts.push(pendingDebit);
        outstandingDebits += remainingDebt;
      }
    }
    
    // All credit receipts (payments made)
    const creditReceipts = organizationReceipts.filter(r => 
      r.type === 'credit'
    );
    
    // Only count unlinked credit receipts as available credits
    // (Credits linked to debits are already "used" to pay those debts)
    const availableCredits = creditReceipts
      .filter(r => !r.siblingReceiptRefs || r.siblingReceiptRefs.length === 0)
      .reduce((sum, r) => sum + r.amount, 0);
    
    // netBalance represents the true net financial position
    // Positive = owes money, Negative = has credit balance, Zero = balanced
    const netBalance = outstandingDebits - availableCredits;
    
    
    return {
      outstandingDebits, // Raw pending debit amount
      availableCredits,  // Unlinked credit amount
      netBalance,        // What they actually owe (outstandingDebits - availableCredits, never negative)
      pendingDebitReceipts,
      creditReceipts
    };
  } catch (error) {
    console.error('Error calculating user outstanding balance:', error);
    throw error;
  }
};

// Helper function to get user's receipt summary
export const getUserReceiptSummary = async (
  userId: string,
  organizationId: string
): Promise<{
  totalDebit: number;
  totalCredit: number;
  pendingDebit: number;
  paidDebit: number;
  balance: number;
}> => {
  try {
    const receipts = await getReceiptsByUser(userId);
    const orgReceipts = receipts.filter(r => r.organizationId === organizationId);
    
    const summary = {
      totalDebit: 0,
      totalCredit: 0,
      pendingDebit: 0,
      paidDebit: 0,
      balance: 0
    };
    
    orgReceipts.forEach(receipt => {
      if (receipt.type === 'debit') {
        summary.totalDebit += receipt.amount;
        // Check if debit has sibling credit receipts (paid) or not (pending)
        if (!receipt.siblingReceiptRefs || receipt.siblingReceiptRefs.length === 0) {
          summary.pendingDebit += receipt.amount;
        } else {
          summary.paidDebit += receipt.amount;
        }
      } else if (receipt.type === 'credit') {
        summary.totalCredit += receipt.amount;
      }
    });
    
    summary.balance = summary.totalCredit - summary.totalDebit;
    
    return summary;
  } catch (error) {
    console.error('Error getting user receipt summary:', error);
    throw error;
  }
};

// Automatically apply available credits to new debit receipt via internal transaction
export const autoApplyAvailableCredits = async (
  userId: string,
  organizationId: string,
  newDebitReceipt: Receipt
): Promise<void> => {
  try {
    console.log(`🔄 autoApplyAvailableCredits: Checking for available credits for user ${userId}`);
    
    // Get user's current balance info
    const balanceInfo = await calculateUserOutstandingBalance(userId, organizationId);
    
    if (balanceInfo.availableCredits <= 0) {
      console.log(`💡 autoApplyAvailableCredits: No available credits (${balanceInfo.availableCredits}) - skipping`);
      return;
    }
    
    console.log(`💰 autoApplyAvailableCredits: Found ${balanceInfo.availableCredits} available credits`);
    
    // Calculate how much credit to apply (minimum of available credit and debit amount)
    const creditToApply = Math.min(balanceInfo.availableCredits, newDebitReceipt.amount);
    
    if (creditToApply <= 0) {
      console.log(`💡 autoApplyAvailableCredits: No credit to apply - skipping`);
      return;
    }
    
    console.log(`✨ autoApplyAvailableCredits: Applying ${creditToApply} credit to debit ${newDebitReceipt.id}`);
    
    // Create internal transaction to apply available credits
    const { createTransaction } = await import('./transactionService');
    
    const internalTransactionData: any = {
      amount: creditToApply, // Show the actual credit amount being applied
      paymentMethod: 'Credit Application',
      transactionOwner: {
        name: 'System',
        userRef: newDebitReceipt.userRef
      },
      description: `Automatic credit application of ${creditToApply} for ${newDebitReceipt.product?.name || 'charge'}`,
      date: Timestamp.now(),
      type: 'internal',
      handler: {
        name: 'System',
        userRef: newDebitReceipt.userRef
      },
      status: 'completed',
      organizationId
    };
    
    // Only add academyId if it's defined
    if (newDebitReceipt.academyId !== undefined) {
      internalTransactionData.academyId = newDebitReceipt.academyId;
    }
    
    // Create the internal transaction
    const internalTransaction = await createTransaction(internalTransactionData);
    console.log(`📝 autoApplyAvailableCredits: Created internal transaction ${internalTransaction.id}`);
    
    // Get unlinked credit receipts to consume (oldest first)
    const unlinkedCredits = balanceInfo.creditReceipts.filter(r => 
      !r.siblingReceiptRefs || r.siblingReceiptRefs.length === 0
    ).sort((a, b) => {
      // Use oldest credits first (FIFO)
      const dateA = a.paymentDate?.toMillis() || a.createdAt?.toMillis() || 0;
      const dateB = b.paymentDate?.toMillis() || b.createdAt?.toMillis() || 0;
      return dateA - dateB;
    });
    
    const siblingDebitReceiptRef = doc(db, 'users', userId, 'receipts', newDebitReceipt.id);
    let remainingCreditToApply = creditToApply;
    
    // Consume available credits by linking them to the new debit receipt
    for (const creditReceipt of unlinkedCredits) {
      if (remainingCreditToApply <= 0) break;
      
      const creditAmountToUse = Math.min(remainingCreditToApply, creditReceipt.amount);
      
      if (creditAmountToUse === creditReceipt.amount) {
        // Use the entire credit receipt - just link it to the debit
        await updateReceipt(userId, creditReceipt.id, { 
          siblingReceiptRefs: [siblingDebitReceiptRef]
        });
        console.log(`🔗 autoApplyAvailableCredits: Linked entire credit receipt ${creditReceipt.id} (${creditAmountToUse}) to debit`);
      } else {
        // Partial use - need to split the credit receipt
        const remainingCredit = creditReceipt.amount - creditAmountToUse;
        
        if (remainingCredit > 0) {
          // Update the original to reduce its amount and update description
          await updateReceipt(userId, creditReceipt.id, { 
            amount: remainingCredit,
            description: `${creditReceipt.description || 'Available credit'} (reduced from ${creditReceipt.amount} after ${creditAmountToUse} was applied)`
          });
          console.log(`✂️ autoApplyAvailableCredits: Reduced credit receipt amount to ${remainingCredit}`);
        } else {
          // Mark the original receipt as fully consumed by linking it to the debit
          await updateReceipt(userId, creditReceipt.id, { 
            amount: 0,
            siblingReceiptRefs: [siblingDebitReceiptRef],
            description: `${creditReceipt.description || 'Available credit'} (fully consumed - applied ${creditAmountToUse} to invoice)`,
            status: 'completed'
          });
          console.log(`🔗 autoApplyAvailableCredits: Marked credit receipt ${creditReceipt.id} as fully consumed`);
        }
        
        // Create a new linked credit receipt for the used portion
        await createCreditReceipt(
          newDebitReceipt.userRef,
          creditAmountToUse,
          doc(db, 'transactions', internalTransaction.id),
          siblingDebitReceiptRef,
          organizationId,
          newDebitReceipt.academyId,
          `Automatic credit application from available balance (partial: ${creditAmountToUse})`
        );
        
        console.log(`✂️ autoApplyAvailableCredits: Split credit receipt - used ${creditAmountToUse}, remaining ${remainingCredit}`);
      }
      
      remainingCreditToApply -= creditAmountToUse;
    }
    
    console.log(`💳 autoApplyAvailableCredits: Applied ${creditToApply} credit to debit ${newDebitReceipt.id}`);
    
    // Update the debit receipt to reflect the credit application
    const isFullyPaid = creditToApply >= newDebitReceipt.amount;
    const newStatus = isFullyPaid ? 'completed' : 'paid';
    
    // Get all credit receipts that are now linked to this debit
    const linkedCreditRefs = unlinkedCredits
      .filter((_, index) => {
        // Calculate how much credit was applied from each receipt
        let appliedSoFar = 0;
        for (let i = 0; i <= index; i++) {
          appliedSoFar += Math.min(unlinkedCredits[i].amount, creditToApply - appliedSoFar);
          if (appliedSoFar >= creditToApply) break;
        }
        return appliedSoFar <= creditToApply;
      })
      .map(credit => doc(db, 'users', userId, 'receipts', credit.id));
    
    // Update the debit receipt with links back to credit receipts and new status
    await updateReceipt(userId, newDebitReceipt.id, {
      siblingReceiptRefs: linkedCreditRefs,
      status: newStatus
    });
    
    console.log(`📋 autoApplyAvailableCredits: Updated debit receipt status to '${newStatus}' and linked ${linkedCreditRefs.length} credit receipts`);
    
    // Immediately update the user's stored balance fields to reflect the credit application
    console.log(`🔄 autoApplyAvailableCredits: Updating user balance fields after credit application`);
    await recalculateAndUpdateUserOutstandingAndCredits(userId, organizationId);
    console.log(`✅ autoApplyAvailableCredits: User balance fields updated`);
    
    // The system will now show:
    // - Reduced available credits (as the new credit is linked to a debit)  
    // - Reduced outstanding balance (as the debit now has partial/full payment)
    
    console.log(`✅ autoApplyAvailableCredits: Successfully applied ${creditToApply} credit to new debit receipt`);
    
  } catch (error) {
    console.error('❌ autoApplyAvailableCredits: Error applying available credits:', error);
    // Don't throw error to avoid failing the product addition
  }
};

// Note: Overdue status is now determined by checking deadline vs current date and sibling receipts
// No need for separate status updates - overdue receipts are simply unpaid debits past their deadline

// Helper function to create receipts for player with product assignment
export const createPlayerProductReceipts = async (
  playerId: string,
  playerRef: DocumentReference,
  productRef: DocumentReference,
  productInfo: { name: string; price: number; productType: 'recurring' | 'one-time' },
  organizationId: string,
  academyId?: string
): Promise<Receipt> => {
  try {
    // Create initial debit receipt for the player
    const debitReceipt = await createDebitReceipt(
      playerRef,
      productRef,
      productInfo,
      organizationId,
      academyId
    );
    
    console.log('Created debit receipt for player:', playerId, 'Receipt ID:', debitReceipt.id);
    
    return debitReceipt;
  } catch (error) {
    console.error('Error creating player product receipts:', error);
    throw error;
  }
};