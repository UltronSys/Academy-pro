"use strict";
/**
 * Migration Script: Fix Recurring Products Missing nextReceiptDate
 *
 * This is a one-time migration to update all existing recurring products
 * that are missing the nextReceiptDate field.
 *
 * Run via HTTP POST to: /fixRecurringProductsDates
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
exports.backfillPlayerNextReceiptDates = exports.fixRecurringProductsDates = void 0;
const functions = __importStar(require("firebase-functions"));
const firebase_1 = require("../config/firebase");
/**
 * Calculate next receipt date based on invoice date and recurring duration
 */
function calculateNextReceiptDate(invoiceDate, duration) {
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
exports.fixRecurringProductsDates = functions.https.onRequest(async (req, res) => {
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
        const playersSnapshot = await firebase_1.db.collection('players').get();
        totalPlayers = playersSnapshot.size;
        console.log(`📊 Found ${totalPlayers} players to check`);
        for (const playerDoc of playersSnapshot.docs) {
            const playerId = playerDoc.id;
            const playerData = playerDoc.data();
            const assignedProducts = playerData.assignedProducts || [];
            if (assignedProducts.length === 0) {
                continue;
            }
            // Find recurring products that need fixing
            let needsUpdate = false;
            const updatedProducts = assignedProducts.map(ap => {
                var _a;
                // Only fix active recurring products without nextReceiptDate
                if (ap.productType === 'recurring' &&
                    ap.status === 'active' &&
                    !ap.nextReceiptDate) {
                    needsUpdate = true;
                    productsFixed++;
                    // Calculate nextReceiptDate from invoiceDate + duration
                    const invoiceDate = ((_a = ap.invoiceDate) === null || _a === void 0 ? void 0 : _a.toDate()) || new Date();
                    const duration = ap.recurringDuration || { value: 1, unit: 'months' };
                    const nextReceiptDate = calculateNextReceiptDate(invoiceDate, duration);
                    console.log(`📅 Fixing product "${ap.productName}" for player ${playerId}`);
                    console.log(`   Invoice date: ${invoiceDate.toLocaleDateString()}`);
                    console.log(`   Duration: ${duration.value} ${duration.unit}`);
                    console.log(`   Next receipt date: ${nextReceiptDate.toLocaleDateString()}`);
                    return Object.assign(Object.assign({}, ap), { nextReceiptDate: firebase_1.admin.firestore.Timestamp.fromDate(nextReceiptDate), receiptStatus: 'scheduled' });
                }
                return ap;
            });
            // Update player if any products were fixed
            if (needsUpdate) {
                try {
                    await firebase_1.db.collection('players').doc(playerId).update({
                        assignedProducts: updatedProducts,
                        updatedAt: firebase_1.admin.firestore.FieldValue.serverTimestamp()
                    });
                    playersUpdated++;
                    console.log(`✅ Updated player ${playerId}`);
                }
                catch (error) {
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
    }
    catch (error) {
        console.error('❌ Migration error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * Calculate the earliest nextReceiptDate from assigned products
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
 * One-time migration to set player-level nextReceiptDate field
 * This field is used by the scheduler to efficiently query players with due receipts
 *
 * Run via HTTP POST to: /backfillPlayerNextReceiptDates
 */
exports.backfillPlayerNextReceiptDates = functions.https.onRequest(async (req, res) => {
    // Only allow POST requests
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed. Use POST.');
        return;
    }
    console.log('🔧 Starting backfill of player-level nextReceiptDate...');
    let totalPlayers = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    try {
        // Query all players
        const playersSnapshot = await firebase_1.db.collection('players').get();
        totalPlayers = playersSnapshot.size;
        console.log(`📊 Found ${totalPlayers} players to process`);
        for (const playerDoc of playersSnapshot.docs) {
            const playerId = playerDoc.id;
            const playerData = playerDoc.data();
            const assignedProducts = playerData.assignedProducts || [];
            try {
                // Calculate the earliest nextReceiptDate from assigned products
                const earliestDate = calculateEarliestReceiptDate(assignedProducts);
                // Check current value
                const currentNextReceiptDate = playerData.nextReceiptDate;
                if (earliestDate) {
                    // Has scheduled products - set nextReceiptDate
                    await firebase_1.db.collection('players').doc(playerId).update({
                        nextReceiptDate: earliestDate,
                        updatedAt: firebase_1.admin.firestore.FieldValue.serverTimestamp()
                    });
                    updatedCount++;
                    console.log(`✅ Updated player ${playerId} with nextReceiptDate: ${earliestDate.toDate().toLocaleDateString()}`);
                }
                else if (currentNextReceiptDate !== null && currentNextReceiptDate !== undefined) {
                    // No scheduled products but has a nextReceiptDate - clear it
                    await firebase_1.db.collection('players').doc(playerId).update({
                        nextReceiptDate: null,
                        updatedAt: firebase_1.admin.firestore.FieldValue.serverTimestamp()
                    });
                    updatedCount++;
                    console.log(`✅ Cleared nextReceiptDate for player ${playerId} (no scheduled products)`);
                }
                else {
                    // No scheduled products and no existing nextReceiptDate - skip
                    skippedCount++;
                }
            }
            catch (error) {
                errorCount++;
                console.error(`❌ Error processing player ${playerId}:`, error);
            }
        }
        const summary = {
            message: 'Backfill completed',
            totalPlayers,
            updatedCount,
            skippedCount,
            errorCount,
            timestamp: new Date().toISOString()
        };
        console.log('🎉 Backfill completed:', summary);
        res.status(200).json(summary);
    }
    catch (error) {
        console.error('❌ Error in backfill:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
//# sourceMappingURL=fixRecurringProducts.js.map