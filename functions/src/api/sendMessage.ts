import * as functions from 'firebase-functions';
import { db } from '../config/firebase';
import { getTwilioClient } from '../config/twilio';
import { toWhatsAppFormat } from '../utils/phoneUtils';
import { Message, MessagingSettings } from '../types';
import { Timestamp } from 'firebase-admin/firestore';

interface SendMessageData {
  conversationId: string;
  body: string;
  organizationId: string;
}

/**
 * Callable function to send WhatsApp message
 */
export const sendWhatsAppMessage = functions.https.onCall(async (data: SendMessageData, context) => {
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
    const settingsDoc = await db.collection('messagingSettings').doc(organizationId).get();

    if (!settingsDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Messaging not configured for this organization');
    }

    const settings = settingsDoc.data() as MessagingSettings;

    if (!settings.enabled) {
      throw new functions.https.HttpsError('failed-precondition', 'Messaging is disabled for this organization');
    }

    // Get conversation
    const conversationDoc = await db.collection('conversations').doc(conversationId).get();

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
    const senderDoc = await db.collection('users').doc(context.auth.uid).get();
    const senderData = senderDoc.data();
    const senderName = senderData?.name || 'Staff';

    // Initialize Twilio client
    const twilioClient = getTwilioClient(settings.twilioAccountSid, settings.twilioAuthToken);

    // Send message via Twilio
    const now = Timestamp.now();
    const recipientWhatsApp = toWhatsAppFormat(conversation.participantPhone);

    const twilioMessage = await twilioClient.messages.create({
      body,
      from: settings.twilioWhatsAppNumber,
      to: recipientWhatsApp,
      statusCallback: `https://${process.env.GCLOUD_PROJECT}.cloudfunctions.net/whatsappStatusCallback`
    });

    console.log('Sent WhatsApp message:', twilioMessage.sid);

    // Store message in Firestore
    const messageRef = db.collection('conversations').doc(conversationId).collection('messages').doc();
    const messageData: Omit<Message, 'id'> = {
      conversationId,
      direction: 'outbound',
      body,
      senderUserId: context.auth.uid,
      senderName,
      twilioMessageSid: twilioMessage.sid,
      twilioStatus: 'queued',
      sentAt: now,
      createdAt: now
    } as Omit<Message, 'id'>;

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
  } catch (error) {
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
export const markConversationRead = functions.https.onCall(async (data: { conversationId: string }, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { conversationId } = data;

  if (!conversationId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing conversationId');
  }

  try {
    await db.collection('conversations').doc(conversationId).update({
      unreadCount: 0,
      updatedAt: Timestamp.now()
    });

    return { success: true };
  } catch (error) {
    console.error('Error marking conversation as read:', error);
    throw new functions.https.HttpsError('internal', 'Failed to mark as read');
  }
});
