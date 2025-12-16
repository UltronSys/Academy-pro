"use strict";
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
exports.whatsappStatusCallback = void 0;
const functions = __importStar(require("firebase-functions"));
const firebase_1 = require("../config/firebase");
const firestore_1 = require("firebase-admin/firestore");
/**
 * Webhook handler for Twilio message status callbacks
 */
exports.whatsappStatusCallback = functions.https.onRequest(async (req, res) => {
    // Only accept POST requests
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    try {
        const status = req.body;
        console.log('Received status callback:', {
            sid: status.MessageSid,
            status: status.MessageStatus
        });
        // Find message by Twilio SID
        const messagesSnapshot = await firebase_1.db.collectionGroup('messages')
            .where('twilioMessageSid', '==', status.MessageSid)
            .limit(1)
            .get();
        if (messagesSnapshot.empty) {
            console.log('Message not found for SID:', status.MessageSid);
            res.status(200).send('OK');
            return;
        }
        const messageDoc = messagesSnapshot.docs[0];
        const updateData = {
            twilioStatus: status.MessageStatus,
            updatedAt: firestore_1.Timestamp.now()
        };
        // Add delivery/read timestamps
        if (status.MessageStatus === 'delivered') {
            updateData.deliveredAt = firestore_1.Timestamp.now();
        }
        else if (status.MessageStatus === 'read') {
            updateData.readAt = firestore_1.Timestamp.now();
        }
        // Add error info if failed
        if (status.MessageStatus === 'failed' || status.MessageStatus === 'undelivered') {
            updateData.twilioErrorCode = status.ErrorCode || '';
            updateData.twilioErrorMessage = status.ErrorMessage || '';
        }
        await messageDoc.ref.update(updateData);
        console.log('Updated message status:', messageDoc.id, status.MessageStatus);
        res.status(200).send('OK');
    }
    catch (error) {
        console.error('Error processing status callback:', error);
        res.status(200).send('OK');
    }
});
//# sourceMappingURL=statusCallback.js.map