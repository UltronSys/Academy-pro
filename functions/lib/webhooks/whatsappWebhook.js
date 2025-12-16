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
exports.whatsappWebhook = void 0;
const functions = __importStar(require("firebase-functions"));
const firebase_1 = require("../config/firebase");
const phoneUtils_1 = require("../utils/phoneUtils");
const firestore_1 = require("firebase-admin/firestore");
/**
 * Webhook handler for incoming WhatsApp messages from Twilio
 * Accepts messages from any sender (known users or unknown contacts)
 */
exports.whatsappWebhook = functions.https.onRequest(async (req, res) => {
    var _a, _b, _c, _d;
    // Only accept POST requests
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    try {
        const message = req.body;
        console.log('Received WhatsApp message:', {
            from: message.From,
            to: message.To,
            body: (_a = message.Body) === null || _a === void 0 ? void 0 : _a.substring(0, 50),
            sid: message.MessageSid
        });
        // Extract phone number from WhatsApp format
        const senderPhone = (0, phoneUtils_1.fromWhatsAppFormat)(message.From);
        const recipientPhone = (0, phoneUtils_1.fromWhatsAppFormat)(message.To);
        const normalizedSenderPhone = (0, phoneUtils_1.normalizePhoneNumber)(senderPhone);
        // Try to find user by whatsappPhone first, then by phone field
        let userDoc = null;
        let userData = null;
        // First try whatsappPhone
        let usersSnapshot = await firebase_1.db.collection('users')
            .where('whatsappPhone', '==', senderPhone)
            .limit(1)
            .get();
        if (usersSnapshot.empty) {
            // Try normalized phone
            usersSnapshot = await firebase_1.db.collection('users')
                .where('whatsappPhone', '==', normalizedSenderPhone)
                .limit(1)
                .get();
        }
        if (usersSnapshot.empty) {
            // Try phone field
            usersSnapshot = await firebase_1.db.collection('users')
                .where('phone', '==', senderPhone)
                .limit(1)
                .get();
        }
        if (usersSnapshot.empty) {
            // Try normalized phone field
            usersSnapshot = await firebase_1.db.collection('users')
                .where('phone', '==', normalizedSenderPhone)
                .limit(1)
                .get();
        }
        if (!usersSnapshot.empty) {
            userDoc = usersSnapshot.docs[0];
            userData = userDoc.data();
            console.log('Found user:', userDoc.id, userData.name);
        }
        else {
            console.log('No user found with phone:', senderPhone, '- treating as unknown contact');
        }
        // Find organization by recipient phone (Twilio number)
        const settingsSnapshot = await firebase_1.db.collection('messagingSettings')
            .where('twilioWhatsAppNumber', '==', `whatsapp:${recipientPhone}`)
            .limit(1)
            .get();
        if (settingsSnapshot.empty) {
            console.log('No messaging settings found for number:', recipientPhone);
            res.status(200).send('OK');
            return;
        }
        const settingsDoc = settingsSnapshot.docs[0];
        const organizationId = settingsDoc.id;
        // Find or create conversation
        let conversationId;
        let existingConversation;
        if (userDoc) {
            // Known user - search by user ID
            existingConversation = await firebase_1.db.collection('conversations')
                .where('organizationId', '==', organizationId)
                .where('participantUserId', '==', userDoc.id)
                .where('status', '==', 'active')
                .limit(1)
                .get();
        }
        else {
            // Unknown contact - search by phone number
            existingConversation = await firebase_1.db.collection('conversations')
                .where('organizationId', '==', organizationId)
                .where('participantPhone', '==', senderPhone)
                .where('status', '==', 'active')
                .limit(1)
                .get();
        }
        const now = firestore_1.Timestamp.now();
        const sessionExpiry = firestore_1.Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000); // 24 hours
        if (existingConversation.empty) {
            // Create new conversation
            const conversationRef = firebase_1.db.collection('conversations').doc();
            const conversationData = {
                organizationId,
                participantUserId: (userDoc === null || userDoc === void 0 ? void 0 : userDoc.id) || null,
                participantName: (userData === null || userData === void 0 ? void 0 : userData.name) || message.ProfileName || senderPhone,
                participantPhone: senderPhone,
                participantType: userDoc
                    ? (((_b = userData === null || userData === void 0 ? void 0 : userData.roles) === null || _b === void 0 ? void 0 : _b.some((r) => { var _a; return (_a = r.role) === null || _a === void 0 ? void 0 : _a.includes('player'); })) ? 'player' : 'guardian')
                    : 'unknown',
                participantUserRef: (userDoc === null || userDoc === void 0 ? void 0 : userDoc.ref) || null,
                status: 'active',
                lastMessageAt: now,
                lastMessagePreview: ((_c = message.Body) === null || _c === void 0 ? void 0 : _c.substring(0, 100)) || '',
                lastMessageDirection: 'inbound',
                unreadCount: 1,
                sessionActive: true,
                sessionExpiresAt: sessionExpiry,
                createdAt: now,
                updatedAt: now
            };
            await conversationRef.set(conversationData);
            conversationId = conversationRef.id;
            console.log('Created new conversation:', conversationId, userDoc ? '(known user)' : '(unknown contact)');
        }
        else {
            conversationId = existingConversation.docs[0].id;
            // Update existing conversation
            await firebase_1.db.collection('conversations').doc(conversationId).update({
                lastMessageAt: now,
                lastMessagePreview: ((_d = message.Body) === null || _d === void 0 ? void 0 : _d.substring(0, 100)) || '',
                lastMessageDirection: 'inbound',
                unreadCount: firestore_1.FieldValue.increment(1),
                sessionActive: true,
                sessionExpiresAt: sessionExpiry,
                updatedAt: now
            });
            console.log('Updated conversation:', conversationId);
        }
        // Store the message
        const messageRef = firebase_1.db.collection('conversations').doc(conversationId).collection('messages').doc();
        const messageData = {
            conversationId,
            direction: 'inbound',
            body: message.Body || '',
            senderPhone,
            senderUserId: (userDoc === null || userDoc === void 0 ? void 0 : userDoc.id) || null,
            senderName: (userData === null || userData === void 0 ? void 0 : userData.name) || message.ProfileName || senderPhone,
            twilioMessageSid: message.MessageSid,
            twilioStatus: 'received',
            sentAt: now,
            createdAt: now
        };
        // Add media if present
        if (message.NumMedia && parseInt(message.NumMedia) > 0 && message.MediaUrl0) {
            messageData.mediaUrl = message.MediaUrl0;
            messageData.mediaType = message.MediaContentType0;
        }
        await messageRef.set(messageData);
        console.log('Stored message:', messageRef.id);
        // Respond with 200 OK
        res.status(200).send('OK');
    }
    catch (error) {
        console.error('Error processing WhatsApp webhook:', error);
        // Still respond 200 to prevent Twilio retries
        res.status(200).send('OK');
    }
});
//# sourceMappingURL=whatsappWebhook.js.map