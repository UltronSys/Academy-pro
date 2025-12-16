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
exports.markConversationRead = exports.sendWhatsAppMessage = void 0;
const functions = __importStar(require("firebase-functions"));
const firebase_1 = require("../config/firebase");
const twilio_1 = require("../config/twilio");
const phoneUtils_1 = require("../utils/phoneUtils");
const firestore_1 = require("firebase-admin/firestore");
/**
 * Callable function to send WhatsApp message
 */
exports.sendWhatsAppMessage = functions.https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { conversationId, body, organizationId } = data;
    if (!conversationId || !body || !organizationId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }
    try {
        // Get messaging settings for the organization
        const settingsDoc = await firebase_1.db.collection('messagingSettings').doc(organizationId).get();
        if (!settingsDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Messaging not configured for this organization');
        }
        const settings = settingsDoc.data();
        if (!settings.enabled) {
            throw new functions.https.HttpsError('failed-precondition', 'Messaging is disabled for this organization');
        }
        // Get conversation
        const conversationDoc = await firebase_1.db.collection('conversations').doc(conversationId).get();
        if (!conversationDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Conversation not found');
        }
        const conversation = conversationDoc.data();
        if (!conversation) {
            throw new functions.https.HttpsError('not-found', 'Conversation data not found');
        }
        // Verify organization match
        if (conversation.organizationId !== organizationId) {
            throw new functions.https.HttpsError('permission-denied', 'Organization mismatch');
        }
        // Get sender info
        const senderDoc = await firebase_1.db.collection('users').doc(context.auth.uid).get();
        const senderData = senderDoc.data();
        const senderName = (senderData === null || senderData === void 0 ? void 0 : senderData.name) || 'Staff';
        // Initialize Twilio client
        const twilioClient = (0, twilio_1.getTwilioClient)(settings.twilioAccountSid, settings.twilioAuthToken);
        // Send message via Twilio
        const now = firestore_1.Timestamp.now();
        const recipientWhatsApp = (0, phoneUtils_1.toWhatsAppFormat)(conversation.participantPhone);
        const twilioMessage = await twilioClient.messages.create({
            body,
            from: settings.twilioWhatsAppNumber,
            to: recipientWhatsApp,
            statusCallback: `https://${process.env.GCLOUD_PROJECT}.cloudfunctions.net/whatsappStatusCallback`
        });
        console.log('Sent WhatsApp message:', twilioMessage.sid);
        // Store message in Firestore
        const messageRef = firebase_1.db.collection('conversations').doc(conversationId).collection('messages').doc();
        const messageData = {
            conversationId,
            direction: 'outbound',
            body,
            senderUserId: context.auth.uid,
            senderName,
            twilioMessageSid: twilioMessage.sid,
            twilioStatus: 'queued',
            sentAt: now,
            createdAt: now
        };
        await messageRef.set(messageData);
        // Update conversation
        await conversationDoc.ref.update({
            lastMessageAt: now,
            lastMessagePreview: body.substring(0, 100),
            lastMessageDirection: 'outbound',
            updatedAt: now
        });
        return {
            success: true,
            messageId: messageRef.id,
            twilioSid: twilioMessage.sid
        };
    }
    catch (error) {
        console.error('Error sending WhatsApp message:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to send message');
    }
});
/**
 * Callable function to mark conversation as read
 */
exports.markConversationRead = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { conversationId } = data;
    if (!conversationId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing conversationId');
    }
    try {
        await firebase_1.db.collection('conversations').doc(conversationId).update({
            unreadCount: 0,
            updatedAt: firestore_1.Timestamp.now()
        });
        return { success: true };
    }
    catch (error) {
        console.error('Error marking conversation as read:', error);
        throw new functions.https.HttpsError('internal', 'Failed to mark as read');
    }
});
//# sourceMappingURL=sendMessage.js.map