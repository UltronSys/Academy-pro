/**
 * Cloud Function: Generate Scheduled Receipts
 *
 * Runs daily to create receipts for products with upcoming due dates.
 * - For recurring products: Creates receipt, updates dates, calculates next receipt date
 * - For one-time scheduled products: Creates receipt, removes from assignedProducts, unlinks from product
 */

import * as functions from 'firebase-functions';
import { db, admin } from '../config/firebase';

// Types
interface RecurringDuration {
  value: number;
  unit: 'days' | 'weeks' | 'months' | 'years';
}

interface Discount {
  type: 'percentage' | 'fixed';
  value: number;
  reason?: string;
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
  discount?: Discount;
}

interface Player {
  id: string;
  userId: string;
  organizationId: string;
  academyId: string[];
  assignedProducts?: AssignedProduct[];
}

interface Settings {
  financeSettings?: {
    defaultDeadlineDays: number;
  };
}

// Default deadline days if not configured
const DEFAULT_DEADLINE_DAYS = 30;

/**
 * Calculate the discounted price based on discount configuration
 */
function calculateDiscountedPrice(price: number, discount?: Discount): number {
  if (!discount || discount.value <= 0) {
    return price;
  }

  if (discount.type === 'percentage') {
    return price * (1 - discount.value / 100);
  } else {
    // Fixed discount
    return Math.max(0, price - discount.value);
  }
}

/**
 * Calculate the next receipt date based on recurring duration
 */
function calculateNextReceiptDate(currentDate: Date, duration: RecurringDuration): Date {
  const nextDate = new Date(currentDate);

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
 * Get deadline days from organization settings
 */
async function getDeadlineDays(organizationId: string): Promise<number> {
  try {
    const settingsQuery = await db.collection('settings')
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    if (!settingsQuery.empty) {
      const settings = settingsQuery.docs[0].data() as Settings;
      return settings.financeSettings?.defaultDeadlineDays || DEFAULT_DEADLINE_DAYS;
    }
  } catch (error) {
    console.error('Error fetching settings for organization:', organizationId, error);
  }

  return DEFAULT_DEADLINE_DAYS;
}

/**
 * Create a debit receipt for a user
 */
async function createDebitReceipt(
  userId: string,
  productId: string,
  productName: string,
  amount: number,
  invoiceDate: Date,
  deadline: Date,
  organizationId: string,
  academyId?: string
): Promise<string> {
  const receiptData: any = {
    type: 'debit',
    amount,
    product: {
      productRef: db.doc(`products/${productId}`),
      name: productName,
      price: amount,
      invoiceDate: admin.firestore.Timestamp.fromDate(invoiceDate),
      deadline: admin.firestore.Timestamp.fromDate(deadline)
    },
    siblingReceiptRefs: [],
    organizationId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  if (academyId) {
    receiptData.academyId = academyId;
  }

  const receiptRef = await db.collection('users').doc(userId).collection('receipts').add(receiptData);

  console.log(`✅ Created receipt ${receiptRef.id} for user ${userId}`);
  return receiptRef.id;
}

/**
 * Unlink a player from a product's linkedPlayerIds
 */
async function unlinkPlayerFromProduct(productId: string, userId: string): Promise<void> {
  try {
    const productRef = db.collection('products').doc(productId);
    const productDoc = await productRef.get();

    if (productDoc.exists) {
      const productData = productDoc.data();
      const linkedPlayerIds = productData?.linkedPlayerIds || [];
      const linkedPlayerNames = productData?.linkedPlayerNames || [];

      // Find the index of the user to remove
      const index = linkedPlayerIds.indexOf(userId);
      if (index > -1) {
        linkedPlayerIds.splice(index, 1);
        linkedPlayerNames.splice(index, 1);

        await productRef.update({
          linkedPlayerIds,
          linkedPlayerNames,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ Unlinked player ${userId} from product ${productId}`);
      }
    }
  } catch (error) {
    console.error(`Error unlinking player ${userId} from product ${productId}:`, error);
  }
}

/**
 * Process a single assigned product that is due
 */
async function processAssignedProduct(
  playerRef: admin.firestore.DocumentReference,
  player: Player,
  assignedProduct: AssignedProduct,
  deadlineDays: number
): Promise<{ success: boolean; action: string }> {
  const now = new Date();
  const invoiceDate = now;
  const deadlineDate = new Date(now.getTime() + deadlineDays * 24 * 60 * 60 * 1000);

  // Calculate the final price (with discount if applicable)
  const finalPrice = calculateDiscountedPrice(assignedProduct.price, assignedProduct.discount);

  try {
    // Create the debit receipt
    await createDebitReceipt(
      player.userId,
      assignedProduct.productId,
      assignedProduct.productName,
      finalPrice,
      invoiceDate,
      deadlineDate,
      player.organizationId,
      player.academyId?.[0]
    );

    if (assignedProduct.productType === 'recurring') {
      // For recurring products: Update dates and calculate next receipt date
      const duration = assignedProduct.recurringDuration || { value: 1, unit: 'months' as const };
      const nextReceiptDate = calculateNextReceiptDate(now, duration);

      // Get current assignedProducts and update the specific one
      const playerDoc = await playerRef.get();
      const currentAssignedProducts = playerDoc.data()?.assignedProducts || [];

      const updatedAssignedProducts = currentAssignedProducts.map((ap: AssignedProduct) => {
        if (ap.productId === assignedProduct.productId) {
          return {
            ...ap,
            invoiceDate: admin.firestore.Timestamp.fromDate(invoiceDate),
            deadlineDate: admin.firestore.Timestamp.fromDate(deadlineDate),
            nextReceiptDate: admin.firestore.Timestamp.fromDate(nextReceiptDate),
            receiptStatus: 'scheduled'
          };
        }
        return ap;
      });

      await playerRef.update({
        assignedProducts: updatedAssignedProducts,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Recurring product ${assignedProduct.productName} updated. Next receipt: ${nextReceiptDate.toLocaleDateString()}`);
      return { success: true, action: 'recurring_updated' };

    } else {
      // For one-time scheduled products: Remove from assignedProducts and unlink from product
      const playerDoc = await playerRef.get();
      const currentAssignedProducts = playerDoc.data()?.assignedProducts || [];

      // Filter out the one-time product
      const updatedAssignedProducts = currentAssignedProducts.filter(
        (ap: AssignedProduct) => ap.productId !== assignedProduct.productId
      );

      await playerRef.update({
        assignedProducts: updatedAssignedProducts,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Unlink player from product
      await unlinkPlayerFromProduct(assignedProduct.productId, player.userId);

      console.log(`✅ One-time product ${assignedProduct.productName} completed and removed`);
      return { success: true, action: 'one_time_completed' };
    }
  } catch (error) {
    console.error(`❌ Error processing product ${assignedProduct.productName} for player ${player.userId}:`, error);
    return { success: false, action: 'error' };
  }
}

/**
 * Calculate the earliest nextReceiptDate from assigned products
 * Used to update player-level nextReceiptDate after processing
 */
function calculateEarliestReceiptDate(assignedProducts: AssignedProduct[]): admin.firestore.Timestamp | null {
  if (!assignedProducts || assignedProducts.length === 0) {
    return null;
  }

  // Filter for active, scheduled products with a nextReceiptDate
  const scheduledProducts = assignedProducts.filter(
    ap => ap.status === 'active' &&
          ap.receiptStatus === 'scheduled' &&
          ap.nextReceiptDate
  );

  if (scheduledProducts.length === 0) {
    return null;
  }

  // Find the earliest date
  let earliest: admin.firestore.Timestamp | null = null;
  for (const product of scheduledProducts) {
    if (product.nextReceiptDate) {
      if (!earliest || product.nextReceiptDate.toMillis() < earliest.toMillis()) {
        earliest = product.nextReceiptDate;
      }
    }
  }

  return earliest;
}

/**
 * Main scheduled function - runs daily
 */
export const generateScheduledReceipts = functions.pubsub
  .schedule('every day 06:00')
  .timeZone('Africa/Nairobi') // Adjust timezone as needed
  .onRun(async (context) => {
    console.log('🚀 Starting scheduled receipt generation...');

    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    let totalProcessed = 0;
    let successCount = 0;
    let errorCount = 0;

    try {
      // Query only players with nextReceiptDate <= next24Hours (efficient!)
      const playersSnapshot = await db.collection('players')
        .where('nextReceiptDate', '<=', admin.firestore.Timestamp.fromDate(next24Hours))
        .get();

      console.log(`📊 Found ${playersSnapshot.size} players with due receipts`);

      for (const playerDoc of playersSnapshot.docs) {
        const player = { id: playerDoc.id, ...playerDoc.data() } as Player;

        if (!player.assignedProducts || player.assignedProducts.length === 0) {
          continue;
        }

        // Filter for products that are due (still needed since player may have multiple products)
        const dueProducts = player.assignedProducts.filter(ap => {
          // Only process active, scheduled products
          if (ap.status !== 'active' || ap.receiptStatus !== 'scheduled') {
            return false;
          }

          // Check if nextReceiptDate (for recurring) or invoiceDate (for one-time scheduled) is due
          const checkDate = ap.nextReceiptDate || ap.invoiceDate;
          if (!checkDate) {
            return false;
          }

          const dueDate = checkDate.toDate();
          return dueDate <= next24Hours;
        });

        if (dueProducts.length === 0) {
          continue;
        }

        console.log(`📋 Player ${player.userId} has ${dueProducts.length} product(s) due`);

        // Get deadline days for this organization
        const deadlineDays = await getDeadlineDays(player.organizationId);
        const playerRef = db.collection('players').doc(playerDoc.id);

        // Process each due product
        for (const assignedProduct of dueProducts) {
          totalProcessed++;

          const result = await processAssignedProduct(
            playerRef,
            player,
            assignedProduct,
            deadlineDays
          );

          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        }

        // After processing, recalculate and update player-level nextReceiptDate
        const updatedPlayerDoc = await playerRef.get();
        const updatedAssignedProducts = updatedPlayerDoc.data()?.assignedProducts || [];
        const newEarliestDate = calculateEarliestReceiptDate(updatedAssignedProducts);

        await playerRef.update({
          nextReceiptDate: newEarliestDate,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ Updated player ${player.userId} nextReceiptDate to:`, newEarliestDate?.toDate());
      }

      console.log('🎉 Scheduled receipt generation completed!');
      console.log(`📊 Summary: ${totalProcessed} processed, ${successCount} successful, ${errorCount} errors`);

      return null;
    } catch (error) {
      console.error('❌ Error in scheduled receipt generation:', error);
      throw error;
    }
  });

/**
 * HTTP endpoint to manually trigger receipt generation (for testing)
 */
export const triggerReceiptGeneration = functions.https.onRequest(async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  console.log('🔧 Manual trigger: Starting scheduled receipt generation...');

  const now = new Date();
  const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  let totalProcessed = 0;
  let successCount = 0;
  let errorCount = 0;

  try {
    // Query only players with nextReceiptDate <= next24Hours (efficient!)
    const playersSnapshot = await db.collection('players')
      .where('nextReceiptDate', '<=', admin.firestore.Timestamp.fromDate(next24Hours))
      .get();

    console.log(`📊 Found ${playersSnapshot.size} players with due receipts`);

    for (const playerDoc of playersSnapshot.docs) {
      const player = { id: playerDoc.id, ...playerDoc.data() } as Player;

      if (!player.assignedProducts || player.assignedProducts.length === 0) {
        continue;
      }

      const dueProducts = player.assignedProducts.filter(ap => {
        if (ap.status !== 'active' || ap.receiptStatus !== 'scheduled') {
          return false;
        }

        const checkDate = ap.nextReceiptDate || ap.invoiceDate;
        if (!checkDate) {
          return false;
        }

        const dueDate = checkDate.toDate();
        return dueDate <= next24Hours;
      });

      if (dueProducts.length === 0) {
        continue;
      }

      console.log(`📋 Player ${player.userId} has ${dueProducts.length} product(s) due`);

      const deadlineDays = await getDeadlineDays(player.organizationId);
      const playerRef = db.collection('players').doc(playerDoc.id);

      for (const assignedProduct of dueProducts) {
        totalProcessed++;

        const result = await processAssignedProduct(
          playerRef,
          player,
          assignedProduct,
          deadlineDays
        );

        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      }

      // After processing, recalculate and update player-level nextReceiptDate
      const updatedPlayerDoc = await playerRef.get();
      const updatedAssignedProducts = updatedPlayerDoc.data()?.assignedProducts || [];
      const newEarliestDate = calculateEarliestReceiptDate(updatedAssignedProducts);

      await playerRef.update({
        nextReceiptDate: newEarliestDate,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Updated player ${player.userId} nextReceiptDate to:`, newEarliestDate?.toDate());
    }

    const summary = {
      message: 'Scheduled receipt generation completed',
      totalProcessed,
      successCount,
      errorCount,
      timestamp: new Date().toISOString()
    };

    console.log('🎉 Manual trigger completed:', summary);
    res.status(200).json(summary);
  } catch (error: any) {
    console.error('❌ Error in manual receipt generation:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});
