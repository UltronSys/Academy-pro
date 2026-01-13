"use strict";
/**
 * Cloud Function: Generate Scheduled Receipts
 *
 * Runs daily to create receipts for products with upcoming due dates.
 * - For recurring products: Creates receipt, updates dates, calculates next receipt date
 * - For one-time scheduled products: Creates receipt, removes from assignedProducts, unlinks from product
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerReceiptGeneration = exports.generateScheduledReceipts = void 0;
const functions = __importStar(require("firebase-functions"));
const firebase_1 = require("../config/firebase");
// Default deadline days if not configured
const DEFAULT_DEADLINE_DAYS = 30;
/**
 * Calculate the discounted price based on discount configuration
 */
function calculateDiscountedPrice(price, discount) {
    if (!discount || discount.value <= 0) {
        return price;
    }
    if (discount.type === 'percentage') {
        return price * (1 - discount.value / 100);
    }
    else {
        // Fixed discount
        return Math.max(0, price - discount.value);
    }
}
/**
 * Calculate the next receipt date based on recurring duration
 */
function calculateNextReceiptDate(currentDate, duration) {
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
async function getDeadlineDays(organizationId) {
    var _a;
    try {
        const settingsQuery = await firebase_1.db.collection('settings')
            .where('organizationId', '==', organizationId)
            .limit(1)
            .get();
        if (!settingsQuery.empty) {
            const settings = settingsQuery.docs[0].data();
            return ((_a = settings.financeSettings) === null || _a === void 0 ? void 0 : _a.defaultDeadlineDays) || DEFAULT_DEADLINE_DAYS;
        }
    }
    catch (error) {
        console.error('Error fetching settings for organization:', organizationId, error);
    }
    return DEFAULT_DEADLINE_DAYS;
}
/**
 * Create a debit receipt for a user
 */
async function createDebitReceipt(userId, productId, productName, amount, invoiceDate, deadline, organizationId, academyId) {
    const receiptData = {
        type: 'debit',
        amount,
        product: {
            productRef: firebase_1.db.doc(`products/${productId}`),
            name: productName,
            price: amount,
            invoiceDate: firebase_1.admin.firestore.Timestamp.fromDate(invoiceDate),
            deadline: firebase_1.admin.firestore.Timestamp.fromDate(deadline)
        },
        siblingReceiptRefs: [],
        organizationId,
        createdAt: firebase_1.admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase_1.admin.firestore.FieldValue.serverTimestamp()
    };
    if (academyId) {
        receiptData.academyId = academyId;
    }
    const receiptRef = await firebase_1.db.collection('users').doc(userId).collection('receipts').add(receiptData);
    console.log(`✅ Created receipt ${receiptRef.id} for user ${userId}`);
    return receiptRef.id;
}
/**
 * Unlink a player from a product's linkedPlayerIds
 */
async function unlinkPlayerFromProduct(productId, userId) {
    try {
        const productRef = firebase_1.db.collection('products').doc(productId);
        const productDoc = await productRef.get();
        if (productDoc.exists) {
            const productData = productDoc.data();
            const linkedPlayerIds = (productData === null || productData === void 0 ? void 0 : productData.linkedPlayerIds) || [];
            const linkedPlayerNames = (productData === null || productData === void 0 ? void 0 : productData.linkedPlayerNames) || [];
            // Find the index of the user to remove
            const index = linkedPlayerIds.indexOf(userId);
            if (index > -1) {
                linkedPlayerIds.splice(index, 1);
                linkedPlayerNames.splice(index, 1);
                await productRef.update({
                    linkedPlayerIds,
                    linkedPlayerNames,
                    updatedAt: firebase_1.admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`✅ Unlinked player ${userId} from product ${productId}`);
            }
        }
    }
    catch (error) {
        console.error(`Error unlinking player ${userId} from product ${productId}:`, error);
    }
}
/**
 * Process a single assigned product that is due
 */
async function processAssignedProduct(playerRef, player, assignedProduct, deadlineDays) {
    var _a, _b, _c;
    const now = new Date();
    const invoiceDate = now;
    const deadlineDate = new Date(now.getTime() + deadlineDays * 24 * 60 * 60 * 1000);
    // Calculate the final price (with discount if applicable)
    const finalPrice = calculateDiscountedPrice(assignedProduct.price, assignedProduct.discount);
    try {
        // Create the debit receipt
        await createDebitReceipt(player.userId, assignedProduct.productId, assignedProduct.productName, finalPrice, invoiceDate, deadlineDate, player.organizationId, (_a = player.academyId) === null || _a === void 0 ? void 0 : _a[0]);
        if (assignedProduct.productType === 'recurring') {
            // For recurring products: Update dates and calculate next receipt date
            const duration = assignedProduct.recurringDuration || { value: 1, unit: 'months' };
            const nextReceiptDate = calculateNextReceiptDate(now, duration);
            // Get current assignedProducts and update the specific one
            const playerDoc = await playerRef.get();
            const currentAssignedProducts = ((_b = playerDoc.data()) === null || _b === void 0 ? void 0 : _b.assignedProducts) || [];
            const updatedAssignedProducts = currentAssignedProducts.map((ap) => {
                if (ap.productId === assignedProduct.productId) {
                    return Object.assign(Object.assign({}, ap), { invoiceDate: firebase_1.admin.firestore.Timestamp.fromDate(invoiceDate), deadlineDate: firebase_1.admin.firestore.Timestamp.fromDate(deadlineDate), nextReceiptDate: firebase_1.admin.firestore.Timestamp.fromDate(nextReceiptDate), receiptStatus: 'scheduled' });
                }
                return ap;
            });
            await playerRef.update({
                assignedProducts: updatedAssignedProducts,
                updatedAt: firebase_1.admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`✅ Recurring product ${assignedProduct.productName} updated. Next receipt: ${nextReceiptDate.toLocaleDateString()}`);
            return { success: true, action: 'recurring_updated' };
        }
        else {
            // For one-time scheduled products: Remove from assignedProducts and unlink from product
            const playerDoc = await playerRef.get();
            const currentAssignedProducts = ((_c = playerDoc.data()) === null || _c === void 0 ? void 0 : _c.assignedProducts) || [];
            // Filter out the one-time product
            const updatedAssignedProducts = currentAssignedProducts.filter((ap) => ap.productId !== assignedProduct.productId);
            await playerRef.update({
                assignedProducts: updatedAssignedProducts,
                updatedAt: firebase_1.admin.firestore.FieldValue.serverTimestamp()
            });
            // Unlink player from product
            await unlinkPlayerFromProduct(assignedProduct.productId, player.userId);
            console.log(`✅ One-time product ${assignedProduct.productName} completed and removed`);
            return { success: true, action: 'one_time_completed' };
        }
    }
    catch (error) {
        console.error(`❌ Error processing product ${assignedProduct.productName} for player ${player.userId}:`, error);
        return { success: false, action: 'error' };
    }
}
/**
 * Calculate the earliest nextReceiptDate from assigned products
 * Used to update player-level nextReceiptDate after processing
 */
function calculateEarliestReceiptDate(assignedProducts) {
    if (!assignedProducts || assignedProducts.length === 0) {
        return null;
    }
    // Filter for active, scheduled products with a nextReceiptDate
    const scheduledProducts = assignedProducts.filter(ap => ap.status === 'active' &&
        ap.receiptStatus === 'scheduled' &&
        ap.nextReceiptDate);
    if (scheduledProducts.length === 0) {
        return null;
    }
    // Find the earliest date
    let earliest = null;
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
exports.generateScheduledReceipts = functions.pubsub
    .schedule('every day 06:00')
    .timeZone('Africa/Nairobi') // Adjust timezone as needed
    .onRun(async (context) => {
    var _a;
    console.log('🚀 Starting scheduled receipt generation...');
    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    let totalProcessed = 0;
    let successCount = 0;
    let errorCount = 0;
    try {
        // Query only players with nextReceiptDate <= next24Hours (efficient!)
        const playersSnapshot = await firebase_1.db.collection('players')
            .where('nextReceiptDate', '<=', firebase_1.admin.firestore.Timestamp.fromDate(next24Hours))
            .get();
        console.log(`📊 Found ${playersSnapshot.size} players with due receipts`);
        for (const playerDoc of playersSnapshot.docs) {
            const player = Object.assign({ id: playerDoc.id }, playerDoc.data());
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
            const playerRef = firebase_1.db.collection('players').doc(playerDoc.id);
            // Process each due product
            for (const assignedProduct of dueProducts) {
                totalProcessed++;
                const result = await processAssignedProduct(playerRef, player, assignedProduct, deadlineDays);
                if (result.success) {
                    successCount++;
                }
                else {
                    errorCount++;
                }
            }
            // After processing, recalculate and update player-level nextReceiptDate
            const updatedPlayerDoc = await playerRef.get();
            const updatedAssignedProducts = ((_a = updatedPlayerDoc.data()) === null || _a === void 0 ? void 0 : _a.assignedProducts) || [];
            const newEarliestDate = calculateEarliestReceiptDate(updatedAssignedProducts);
            await playerRef.update({
                nextReceiptDate: newEarliestDate,
                updatedAt: firebase_1.admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`✅ Updated player ${player.userId} nextReceiptDate to:`, newEarliestDate === null || newEarliestDate === void 0 ? void 0 : newEarliestDate.toDate());
        }
        console.log('🎉 Scheduled receipt generation completed!');
        console.log(`📊 Summary: ${totalProcessed} processed, ${successCount} successful, ${errorCount} errors`);
        return null;
    }
    catch (error) {
        console.error('❌ Error in scheduled receipt generation:', error);
        throw error;
    }
});
/**
 * HTTP endpoint to manually trigger receipt generation (for testing)
 */
exports.triggerReceiptGeneration = functions.https.onRequest(async (req, res) => {
    var _a;
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
        const playersSnapshot = await firebase_1.db.collection('players')
            .where('nextReceiptDate', '<=', firebase_1.admin.firestore.Timestamp.fromDate(next24Hours))
            .get();
        console.log(`📊 Found ${playersSnapshot.size} players with due receipts`);
        for (const playerDoc of playersSnapshot.docs) {
            const player = Object.assign({ id: playerDoc.id }, playerDoc.data());
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
            const playerRef = firebase_1.db.collection('players').doc(playerDoc.id);
            for (const assignedProduct of dueProducts) {
                totalProcessed++;
                const result = await processAssignedProduct(playerRef, player, assignedProduct, deadlineDays);
                if (result.success) {
                    successCount++;
                }
                else {
                    errorCount++;
                }
            }
            // After processing, recalculate and update player-level nextReceiptDate
            const updatedPlayerDoc = await playerRef.get();
            const updatedAssignedProducts = ((_a = updatedPlayerDoc.data()) === null || _a === void 0 ? void 0 : _a.assignedProducts) || [];
            const newEarliestDate = calculateEarliestReceiptDate(updatedAssignedProducts);
            await playerRef.update({
                nextReceiptDate: newEarliestDate,
                updatedAt: firebase_1.admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`✅ Updated player ${player.userId} nextReceiptDate to:`, newEarliestDate === null || newEarliestDate === void 0 ? void 0 : newEarliestDate.toDate());
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
    }
    catch (error) {
        console.error('❌ Error in manual receipt generation:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
//# sourceMappingURL=generateScheduledReceipts.js.map