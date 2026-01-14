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
 * Get the last day of a given month
 */
function getLastDayOfMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}
/**
 * Calculate the next invoice date based on invoiceDay (number: 1-31 or -1 for last day)
 */
function calculateNextInvoiceDateFromInvoiceDay(invoiceDay, // 1-31 for specific day, -1 for last day of month
recurringDuration, lastGeneratedDate) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    // For non-monthly recurring products, calculate from last generated date
    if (recurringDuration && recurringDuration.unit !== 'months') {
        const baseDate = lastGeneratedDate || now;
        const nextDate = new Date(baseDate);
        switch (recurringDuration.unit) {
            case 'days':
                nextDate.setDate(nextDate.getDate() + recurringDuration.value);
                break;
            case 'weeks':
                nextDate.setDate(nextDate.getDate() + (recurringDuration.value * 7));
                break;
            case 'years':
                nextDate.setFullYear(nextDate.getFullYear() + recurringDuration.value);
                break;
        }
        return nextDate;
    }
    // For monthly recurring (or default), use invoiceDay to determine next date
    const getAdjustedDay = (date, requestedDay) => {
        const lastDay = getLastDayOfMonth(date.getFullYear(), date.getMonth());
        if (requestedDay === -1)
            return lastDay; // End of month
        return Math.min(requestedDay, lastDay);
    };
    const currentDay = now.getDate();
    let nextDate = new Date(now);
    const adjustedDay = getAdjustedDay(nextDate, invoiceDay);
    if (currentDay < adjustedDay) {
        // Target day is still ahead this month
        nextDate.setDate(adjustedDay);
    }
    else {
        // Target day has passed, use next month
        nextDate.setMonth(nextDate.getMonth() + 1);
        const nextMonthAdjustedDay = getAdjustedDay(nextDate, invoiceDay);
        nextDate.setDate(nextMonthAdjustedDay);
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
async function processAssignedProduct(playerRef, player, assignedProduct, defaultDeadlineDays) {
    var _a, _b, _c;
    const now = new Date();
    const invoiceDate = now;
    // Use product's deadlineDay if set, otherwise use org default
    const deadlineDays = assignedProduct.deadlineDay || defaultDeadlineDays;
    const deadlineDate = new Date(now.getTime() + deadlineDays * 24 * 60 * 60 * 1000);
    // Calculate the final price (with discount if applicable)
    const finalPrice = calculateDiscountedPrice(assignedProduct.price, assignedProduct.discount);
    try {
        // Create the debit receipt
        await createDebitReceipt(player.userId, assignedProduct.productId, assignedProduct.productName, finalPrice, invoiceDate, deadlineDate, player.organizationId, (_a = player.academyId) === null || _a === void 0 ? void 0 : _a[0]);
        if (assignedProduct.productType === 'recurring') {
            // For recurring products: Update invoiceDate to next receipt date and set lastGeneratedDate
            // Calculate next receipt date from invoiceDay
            const nextReceiptDate = calculateNextInvoiceDateFromInvoiceDay(assignedProduct.invoiceDay, assignedProduct.recurringDuration, now);
            // Calculate next deadline date
            const nextDeadlineDate = new Date(nextReceiptDate.getTime() + deadlineDays * 24 * 60 * 60 * 1000);
            // Get current assignedProducts and update the specific one
            const playerDoc = await playerRef.get();
            const currentAssignedProducts = ((_b = playerDoc.data()) === null || _b === void 0 ? void 0 : _b.assignedProducts) || [];
            const updatedAssignedProducts = currentAssignedProducts.map((ap) => {
                if (ap.productId === assignedProduct.productId) {
                    return Object.assign(Object.assign({}, ap), { invoiceDate: firebase_1.admin.firestore.Timestamp.fromDate(nextReceiptDate), deadlineDate: firebase_1.admin.firestore.Timestamp.fromDate(nextDeadlineDate), lastGeneratedDate: firebase_1.admin.firestore.Timestamp.fromDate(now) // Track when we generated the receipt
                     });
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
 * Calculate the earliest nextReceiptDate from assigned products using invoiceDay
 * Used to update player-level nextReceiptDate after processing
 */
function calculateEarliestReceiptDate(assignedProducts) {
    var _a;
    if (!assignedProducts || assignedProducts.length === 0) {
        return null;
    }
    let earliest = null;
    // Check recurring products - calculate from invoiceDay
    const activeRecurringProducts = assignedProducts.filter(ap => ap.status === 'active' && ap.productType === 'recurring' && ap.invoiceDay);
    for (const product of activeRecurringProducts) {
        const nextDate = calculateNextInvoiceDateFromInvoiceDay(product.invoiceDay, product.recurringDuration, (_a = product.lastGeneratedDate) === null || _a === void 0 ? void 0 : _a.toDate());
        if (!earliest || nextDate < earliest) {
            earliest = nextDate;
        }
    }
    // Check one-time scheduled products - use invoiceDate directly
    const activeOneTimeScheduled = assignedProducts.filter(ap => ap.status === 'active' && ap.productType === 'one-time' && ap.receiptStatus === 'scheduled' && ap.invoiceDate);
    for (const product of activeOneTimeScheduled) {
        const invoiceDate = product.invoiceDate.toDate();
        if (!earliest || invoiceDate < earliest) {
            earliest = invoiceDate;
        }
    }
    return earliest ? firebase_1.admin.firestore.Timestamp.fromDate(earliest) : null;
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
                var _a, _b;
                // Only process active products
                if (ap.status !== 'active') {
                    return false;
                }
                // For recurring products, calculate due date from invoiceDay
                if (ap.productType === 'recurring' && ap.invoiceDay) {
                    const dueDate = calculateNextInvoiceDateFromInvoiceDay(ap.invoiceDay, ap.recurringDuration, (_a = ap.lastGeneratedDate) === null || _a === void 0 ? void 0 : _a.toDate());
                    return dueDate <= next24Hours;
                }
                // For one-time scheduled products, use invoiceDate
                if (ap.productType === 'one-time' && ap.receiptStatus === 'scheduled') {
                    const dueDate = (_b = ap.invoiceDate) === null || _b === void 0 ? void 0 : _b.toDate();
                    return dueDate && dueDate <= next24Hours;
                }
                return false;
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
            // Filter for products that are due (same logic as scheduled function)
            const dueProducts = player.assignedProducts.filter(ap => {
                var _a, _b;
                // Only process active products
                if (ap.status !== 'active') {
                    return false;
                }
                // For recurring products, calculate due date from invoiceDay
                if (ap.productType === 'recurring' && ap.invoiceDay) {
                    const dueDate = calculateNextInvoiceDateFromInvoiceDay(ap.invoiceDay, ap.recurringDuration, (_a = ap.lastGeneratedDate) === null || _a === void 0 ? void 0 : _a.toDate());
                    return dueDate <= next24Hours;
                }
                // For one-time scheduled products, use invoiceDate
                if (ap.productType === 'one-time' && ap.receiptStatus === 'scheduled') {
                    const dueDate = (_b = ap.invoiceDate) === null || _b === void 0 ? void 0 : _b.toDate();
                    return dueDate && dueDate <= next24Hours;
                }
                return false;
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