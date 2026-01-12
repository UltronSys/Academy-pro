/**
 * Migration Script: Fix Recurring Products Missing nextReceiptDate
 *
 * This is a one-time migration to update all existing recurring products
 * that are missing the nextReceiptDate field.
 *
 * Run via HTTP POST to: /fixRecurringProductsDates
 */

import * as functions from 'firebase-functions';
import { db, admin } from '../config/firebase';

interface RecurringDuration {
  value: number;
  unit: 'days' | 'weeks' | 'months' | 'years';
}

interface AssignedProduct {
  productId: string;
  productName: string;
  price: number;
  assignedDate: admin.firestore.Timestamp;
  status: 'active' | 'inactive' | 'cancelled';
  invoiceDate: admin.firestore.Timestamp;
  deadlineDate: admin.firestore.Timestamp;
  nextReceiptDate?: admin.firestore.Timestamp;
  receiptStatus?: 'immediate' | 'scheduled' | 'generated';
  productType: 'recurring' | 'one-time';
  recurringDuration?: RecurringDuration;
}

/**
 * Calculate next receipt date based on invoice date and recurring duration
 */
function calculateNextReceiptDate(invoiceDate: Date, duration: RecurringDuration): Date {
  const nextDate = new Date(invoiceDate);

  switch (duration.unit) {
    case 'days':
      nextDate.setDate(nextDate.getDate() + duration.value);
      break;
    case 'weeks':
      nextDate.setDate(nextDate.getDate() + (duration.value * 7));
      break;
    case 'months':
      nextDate.setMonth(nextDate.getMonth() + duration.value);
      break;
    case 'years':
      nextDate.setFullYear(nextDate.getFullYear() + duration.value);
      break;
  }

  return nextDate;
}

/**
 * One-time migration to fix recurring products missing nextReceiptDate
 */
export const fixRecurringProductsDates = functions.https.onRequest(async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed. Use POST.');
    return;
  }

  console.log('🔧 Starting migration: Fix recurring products missing nextReceiptDate...');

  let totalPlayers = 0;
  let playersUpdated = 0;
  let productsFixed = 0;
  let errors = 0;

  try {
    // Get all players
    const playersSnapshot = await db.collection('players').get();
    totalPlayers = playersSnapshot.size;

    console.log(`📊 Found ${totalPlayers} players to check`);

    for (const playerDoc of playersSnapshot.docs) {
      const playerId = playerDoc.id;
      const playerData = playerDoc.data();
      const assignedProducts: AssignedProduct[] = playerData.assignedProducts || [];

      if (assignedProducts.length === 0) {
        continue;
      }

      // Find recurring products that need fixing
      let needsUpdate = false;
      const updatedProducts = assignedProducts.map(ap => {
        // Only fix active recurring products without nextReceiptDate
        if (
          ap.productType === 'recurring' &&
          ap.status === 'active' &&
          !ap.nextReceiptDate
        ) {
          needsUpdate = true;
          productsFixed++;

          // Calculate nextReceiptDate from invoiceDate + duration
          const invoiceDate = ap.invoiceDate?.toDate() || new Date();
          const duration = ap.recurringDuration || { value: 1, unit: 'months' as const };
          const nextReceiptDate = calculateNextReceiptDate(invoiceDate, duration);

          console.log(`📅 Fixing product "${ap.productName}" for player ${playerId}`);
          console.log(`   Invoice date: ${invoiceDate.toLocaleDateString()}`);
          console.log(`   Duration: ${duration.value} ${duration.unit}`);
          console.log(`   Next receipt date: ${nextReceiptDate.toLocaleDateString()}`);

          return {
            ...ap,
            nextReceiptDate: admin.firestore.Timestamp.fromDate(nextReceiptDate),
            receiptStatus: 'scheduled' as const
          };
        }

        return ap;
      });

      // Update player if any products were fixed
      if (needsUpdate) {
        try {
          await db.collection('players').doc(playerId).update({
            assignedProducts: updatedProducts,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          playersUpdated++;
          console.log(`✅ Updated player ${playerId}`);
        } catch (error) {
          errors++;
          console.error(`❌ Error updating player ${playerId}:`, error);
        }
      }
    }

    const summary = {
      message: 'Migration completed',
      totalPlayers,
      playersUpdated,
      productsFixed,
      errors,
      timestamp: new Date().toISOString()
    };

    console.log('🎉 Migration completed:', summary);
    res.status(200).json(summary);

  } catch (error: any) {
    console.error('❌ Migration error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});
