import * as functions from 'firebase-functions';
import { db } from '../config/firebase';
import { fromWhatsAppFormat, normalizePhoneNumber } from '../utils/phoneUtils';
import { Conversation, Message, TwilioIncomingMessage } from '../types';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

/**
 * Webhook handler for incoming WhatsApp messages from Twilio
 * Accepts messages from any sender (known users or unknown contacts)
 */
export const whatsappWebhook = functions.https.onRequest(async (req, res) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const message: TwilioIncomingMessage = req.body;

    console.log('Received WhatsApp message:', {
      from: message.From,
      to: message.To,
      body: message.Body?.substring(0, 50),
      sid: message.MessageSid
    });

    // Extract phone number from WhatsApp format
    const senderPhone = fromWhatsAppFormat(message.From);
    const recipientPhone = fromWhatsAppFormat(message.To);
    const normalizedSenderPhone = normalizePhoneNumber(senderPhone);

    // Try to find user by whatsappPhone first, then by phone field
    let userDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let userData: FirebaseFirestore.DocumentData | null = null;

    // First try whatsappPhone
    let usersSnapshot = await db.collection('users')
      .where('whatsappPhone', '==', senderPhone)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      // Try normalized phone
      usersSnapshot = await db.collection('users')
        .where('whatsappPhone', '==', normalizedSenderPhone)
        .limit(1)
        .get();
    }

    if (usersSnapshot.empty) {
      // Try phone field
      usersSnapshot = await db.collection('users')
        .where('phone', '==', senderPhone)
        .limit(1)
        .get();
    }

    if (usersSnapshot.empty) {
      // Try normalized phone field
      usersSnapshot = await db.collection('users')
        .where('phone', '==', normalizedSenderPhone)
        .limit(1)
        .get();
    }

    if (!usersSnapshot.empty) {
      userDoc = usersSnapshot.docs[0];
      userData = userDoc.data();
      console.log('Found user:', userDoc.id, userData.name);
    } else {
      console.log('No user found with phone:', senderPhone, '- treating as unknown contact');
    }

    // Find organization by recipient phone (Twilio number)
    const settingsSnapshot = await db.collection('messagingSettings')
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
    let conversationId: string;
    let existingConversation: FirebaseFirestore.QuerySnapshot;

    if (userDoc) {
      // Known user - search by user ID
      existingConversation = await db.collection('conversations')
        .where('organizationId', '==', organizationId)
        .where('participantUserId', '==', userDoc.id)
        .where('status', '==', 'active')
        .limit(1)
        .get();
    } else {
      // Unknown contact - search by phone number
      existingConversation = await db.collection('conversations')
        .where('organizationId', '==', organizationId)
        .where('participantPhone', '==', senderPhone)
        .where('status', '==', 'active')
        .limit(1)
        .get();
    }

    const now = Timestamp.now();
    const sessionExpiry = Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000); // 24 hours

    if (existingConversation.empty) {
      // Create new conversation
      const conversationRef = db.collection('conversations').doc();
      const conversationData: Omit<Conversation, 'id'> = {
        organizationId,
        participantUserId: userDoc?.id || null,
        participantName: userData?.name || message.ProfileName || senderPhone,
        participantPhone: senderPhone,
        participantType: userDoc
          ? (userData?.roles?.some((r: { role: string[] }) => r.role?.includes('player')) ? 'player' : 'guardian')
          : 'unknown',
        participantUserRef: userDoc?.ref || null,
        status: 'active',
        lastMessageAt: now,
        lastMessagePreview: message.Body?.substring(0, 100) || '',
        lastMessageDirection: 'inbound',
        unreadCount: 1,
        sessionActive: true,
        sessionExpiresAt: sessionExpiry,
        createdAt: now,
        updatedAt: now
      } as Omit<Conversation, 'id'>;

      await conversationRef.set(conversationData);
      conversationId = conversationRef.id;
      console.log('Created new conversation:', conversationId, userDoc ? '(known user)' : '(unknown contact)');
    } else {
      conversationId = existingConversation.docs[0].id;

      // Update existing conversation
      await db.collection('conversations').doc(conversationId).update({
        lastMessageAt: now,
        lastMessagePreview: message.Body?.substring(0, 100) || '',
        lastMessageDirection: 'inbound',
        unreadCount: FieldValue.increment(1),
        sessionActive: true,
        sessionExpiresAt: sessionExpiry,
        updatedAt: now
      });
      console.log('Updated conversation:', conversationId);
    }

    // Store the message
    const messageRef = db.collection('conversations').doc(conversationId).collection('messages').doc();
    const messageData: Omit<Message, 'id'> = {
      conversationId,
      direction: 'inbound',
      body: message.Body || '',
      senderPhone,
      senderUserId: userDoc?.id || null,
      senderName: userData?.name || message.ProfileName || senderPhone,
      twilioMessageSid: message.MessageSid,
      twilioStatus: 'received',
      sentAt: now,
      createdAt: now
    } as Omit<Message, 'id'>;

    // Add media if present
    if (message.NumMedia && parseInt(message.NumMedia) > 0 && message.MediaUrl0) {
      (messageData as Message).mediaUrl = message.MediaUrl0;
      (messageData as Message).mediaType = message.MediaContentType0;
    }

    await messageRef.set(messageData);
    console.log('Stored message:', messageRef.id);

    // Respond with 200 OK
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error);
    // Still respond 200 to prevent Twilio retries
    res.status(200).send('OK');
  }
});
