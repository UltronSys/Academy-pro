import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  DocumentReference
} from 'firebase/firestore';
import { db } from '../firebase';
import { Receipt } from '../types';
import { createReceipt, calculateUserOutstandingBalance, createCreditReceipt } from './receiptService';
import { getPlayersByGuardianId } from './playerService';
import { getUserById } from './userService';
import { createTransaction } from './transactionService';

export interface GuardianPaymentDistribution {
  playerId: string;
  playerName: string;
  amountPaid: number;
  remainingBalance: number;
}

export interface GuardianPaymentResult {
  guardianReceiptId: string;
  totalAmount: number;
  distributedAmount: number;
  excessAmount: number;
  distributions: GuardianPaymentDistribution[];
  playersFullyPaid: number;
}

/**
 * Create a guardian-level debit receipt that represents combined invoices for all linked players
 */
export const createGuardianDebitReceipt = async (
  guardianId: string,
  organizationId: string,
  description: string,
  linkedPlayerData: { playerId: string; playerName: string; amount: number; dueDate: Date }[]
): Promise<Receipt> => {
  try {
    console.log('🏷️ Creating guardian debit receipt for:', guardianId);
    
    const totalAmount = linkedPlayerData.reduce((sum, player) => sum + player.amount, 0);
    
    // Create a guardian-level product representation
    const guardianProduct = {
      productRef: doc(db, 'products', `guardian_${guardianId}_${Date.now()}`), // Placeholder reference
      name: description,
      price: totalAmount,
      invoiceDate: Timestamp.now(),
      deadline: Timestamp.fromDate(linkedPlayerData[0]?.dueDate || new Date())
    };

    const receiptData = {
      type: 'debit' as const,
      amount: totalAmount,
      description,
      organizationId,
      product: guardianProduct,
      status: 'active' as const,
      siblingReceiptRefs: []
    };

    const guardianReceipt = await createReceipt(guardianId, receiptData);
    console.log('✅ Guardian debit receipt created:', guardianReceipt.id);
    
    return guardianReceipt;
  } catch (error) {
    console.error('❌ Error creating guardian debit receipt:', error);
    throw error;
  }
};

/**
 * Create a guardian-level credit receipt and distribute payment across linked players
 */
export const createGuardianCreditReceiptWithDistribution = async (
  guardianId: string,
  organizationId: string,
  amount: number,
  description: string,
  _paymentMethod: string = 'Cash'
): Promise<GuardianPaymentResult> => {
  try {
    console.log('💰 Creating guardian credit receipt with distribution');
    console.log('Guardian:', guardianId, 'Amount:', amount);

    // Get all linked players
    const linkedPlayers = await getPlayersByGuardianId(guardianId);
    console.log(`📋 Found ${linkedPlayers.length} linked players`);

    if (linkedPlayers.length === 0) {
      throw new Error('No players linked to this guardian');
    }

    // Get player financial data and sort by outstanding balance (highest first)
    const playersWithBalances = await Promise.all(
      linkedPlayers.map(async (player) => {
        const balanceInfo = await calculateUserOutstandingBalance(player.userId, organizationId);
        const user = await getUserById(player.userId);
        return {
          player,
          user,
          outstandingBalance: balanceInfo.outstandingDebits,
          netBalance: balanceInfo.netBalance
        };
      })
    );

    // Sort players by outstanding balance (highest debt first)
    const sortedPlayers = playersWithBalances
      .filter(p => p.outstandingBalance > 0) // Only players with outstanding debt
      .sort((a, b) => b.outstandingBalance - a.outstandingBalance);

    console.log('📊 Players with outstanding balances:', sortedPlayers.map(p => ({
      name: p.user?.name,
      outstanding: p.outstandingBalance
    })));

    // Create the guardian-level credit receipt using the proper function
    const guardianReceipt = await createCreditReceipt(
      doc(db, 'users', guardianId),
      amount,
      undefined, // No parent transaction
      undefined, // No specific debit to link to
      organizationId,
      undefined, // No academy for guardian
      `${description} - General Payment for ${linkedPlayers.length} players`
    );
    console.log('✅ Guardian credit receipt created:', guardianReceipt.id);

    // Distribute payment across players
    let remainingAmount = amount;
    const distributions: GuardianPaymentDistribution[] = [];
    let playersFullyPaid = 0;

    for (const playerData of sortedPlayers) {
      if (remainingAmount <= 0) break;

      const { player, user, outstandingBalance } = playerData;
      if (!user || outstandingBalance <= 0) continue;

      const amountToPay = Math.min(remainingAmount, outstandingBalance);
      
      console.log(`💳 Paying ${amountToPay} to ${user.name} (outstanding: ${outstandingBalance})`);

      // Use the proper createCreditReceipt function which handles linking automatically
      const playerReceipt = await createCreditReceipt(
        doc(db, 'users', player.userId),
        amountToPay,
        undefined, // No parent transaction for individual credits
        undefined, // Let the system auto-link to appropriate debit receipts
        organizationId,
        playerData.player.academyId?.[0], // Use first academy if available
        `Guardian Payment - ${description}`
      );

      console.log(`✅ Created credit receipt ${playerReceipt.id} for player ${user.name}`);

      // Force balance recalculation for this player
      try {
        const { recalculateAndUpdateUserOutstandingAndCredits } = await import('./userService');
        await recalculateAndUpdateUserOutstandingAndCredits(player.userId, organizationId);
        console.log(`💰 Recalculated balance for player ${user.name}`);
      } catch (recalcError) {
        console.error(`❌ Error recalculating balance for player ${player.id}:`, recalcError);
      }

      remainingAmount -= amountToPay;
      const newBalance = outstandingBalance - amountToPay;
      
      distributions.push({
        playerId: player.id,
        playerName: user.name,
        amountPaid: amountToPay,
        remainingBalance: Math.max(0, newBalance)
      });

      if (newBalance <= 0) {
        playersFullyPaid++;
      }

      console.log(`✅ Player ${user.name} paid: ${amountToPay}, remaining balance: ${newBalance}`);
    }

    // Handle excess amount - create credit for guardian
    if (remainingAmount > 0) {
      console.log(`💰 Excess amount: ${remainingAmount} - Creating guardian credit`);
      
      await createCreditReceipt(
        doc(db, 'users', guardianId),
        remainingAmount,
        undefined, // No parent transaction
        undefined, // No specific debit to link to
        organizationId,
        undefined, // No academy for guardian
        `Excess payment - Available Guardian Credit`
      );
      
      // Update guardian's stored balance as well
      try {
        const { recalculateAndUpdateUserOutstandingAndCredits } = await import('./userService');
        await recalculateAndUpdateUserOutstandingAndCredits(guardianId, organizationId);
      } catch (error) {
        console.error('❌ Error updating guardian balance:', error);
      }
    }

    const result: GuardianPaymentResult = {
      guardianReceiptId: guardianReceipt.id,
      totalAmount: amount,
      distributedAmount: amount - remainingAmount,
      excessAmount: remainingAmount,
      distributions,
      playersFullyPaid
    };

    // Final step: Recalculate balances for all affected users
    console.log('🔄 Final balance recalculation for all affected users...');
    try {
      const { recalculateAndUpdateUserOutstandingAndCredits } = await import('./userService');
      
      // Recalculate guardian balance
      await recalculateAndUpdateUserOutstandingAndCredits(guardianId, organizationId);
      
      // Recalculate all linked player balances
      for (const playerData of playersWithBalances) {
        await recalculateAndUpdateUserOutstandingAndCredits(playerData.player.userId, organizationId);
      }
      
      console.log('✅ All user balances recalculated successfully');
    } catch (recalcError) {
      console.error('❌ Error in final balance recalculation:', recalcError);
    }

    console.log('🎉 Guardian payment distribution completed:', result);
    return result;

  } catch (error) {
    console.error('❌ Error creating guardian credit receipt with distribution:', error);
    throw error;
  }
};

/**
 * Create a guardian payment transaction that distributes across linked players
 */
export const createGuardianPaymentTransaction = async (
  guardianId: string,
  amount: number,
  paymentMethod: string,
  handler: { name: string; userRef: DocumentReference },
  description: string,
  organizationId: string,
  academyId?: string
): Promise<{ transaction: any; paymentResult: GuardianPaymentResult }> => {
  try {
    console.log('🏦 Creating guardian payment transaction');

    // Get guardian data
    const guardian = await getUserById(guardianId);
    if (!guardian) {
      throw new Error('Guardian not found');
    }

    // Create the transaction record
    const transactionData: any = {
      type: 'income',
      amount,
      description: `Guardian Payment - ${description}`,
      paymentMethod,
      owner: {
        name: guardian.name,
        userRef: doc(db, 'users', guardianId)
      },
      handler,
      organizationId,
      guardianPayment: true, // Flag to identify guardian payments
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    if (academyId) {
      transactionData.academyId = academyId;
    }

    const transaction = await createTransaction(transactionData);
    console.log('✅ Guardian transaction created:', transaction.id);

    // Create guardian credit receipt and distribute payment
    const paymentResult = await createGuardianCreditReceiptWithDistribution(
      guardianId,
      organizationId,
      amount,
      description,
      paymentMethod
    );

    console.log('🎊 Guardian payment transaction completed successfully');
    
    return {
      transaction,
      paymentResult
    };

  } catch (error) {
    console.error('❌ Error creating guardian payment transaction:', error);
    throw error;
  }
};

/**
 * Get all guardian-level receipts (both debit and credit)
 */
export const getGuardianReceipts = async (
  guardianId: string,
  organizationId: string
): Promise<Receipt[]> => {
  try {
    const userRef = doc(db, 'users', guardianId);
    const receiptsCollection = collection(userRef, 'receipts');
    const q = query(
      receiptsCollection,
      where('organizationId', '==', organizationId),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    const receipts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Receipt[];

    console.log(`📄 Retrieved ${receipts.length} guardian receipts`);
    return receipts;

  } catch (error) {
    console.error('❌ Error getting guardian receipts:', error);
    throw error;
  }
};

/**
 * Calculate guardian's total financial summary across all linked players
 */
export const calculateGuardianFinancialSummary = async (
  guardianId: string,
  organizationId: string
): Promise<{
  totalOutstanding: number;
  totalCredits: number;
  netBalance: number;
  playerCount: number;
  guardianCredits: number;
}> => {
  try {
    console.log('📊 Calculating guardian financial summary for:', guardianId);

    // Get linked players
    const linkedPlayers = await getPlayersByGuardianId(guardianId);
    
    // Calculate totals across all players
    let totalOutstanding = 0;
    let totalCredits = 0;
    let netBalance = 0;

    for (const player of linkedPlayers) {
      const balanceInfo = await calculateUserOutstandingBalance(player.userId, organizationId);
      totalOutstanding += balanceInfo.outstandingDebits;
      totalCredits += balanceInfo.availableCredits;
      netBalance += balanceInfo.netBalance;
    }

    // Get guardian's own credits (excess payments)
    const guardianBalance = await calculateUserOutstandingBalance(guardianId, organizationId);
    const guardianCredits = guardianBalance.availableCredits;

    const summary = {
      totalOutstanding,
      totalCredits,
      netBalance: netBalance - guardianCredits, // Subtract guardian credits from net balance
      playerCount: linkedPlayers.length,
      guardianCredits
    };

    console.log('📈 Guardian financial summary:', summary);
    return summary;

  } catch (error) {
    console.error('❌ Error calculating guardian financial summary:', error);
    throw error;
  }
};