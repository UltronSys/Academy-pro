import * as functions from 'firebase-functions';
import { db } from '../config/firebase';
import { TwilioStatusCallback } from '../types';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * Webhook handler for Twilio message status callbacks
 */
export const whatsappStatusCallback = functions.https.onRequest(async (req, res) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const status: TwilioStatusCallback = req.body;

    console.log('Received status callback:', {
      sid: status.MessageSid,
      status: status.MessageStatus
    });

    // Find message by Twilio SID
    const messagesSnapshot = await db.collectionGroup('messages')
      .where('twilioMessageSid', '==', status.MessageSid)
      .limit(1)
      .get();

    if (messagesSnapshot.empty) {
      console.log('Message not found for SID:', status.MessageSid);
      res.status(200).send('OK');
      return;
    }

    const messageDoc = messagesSnapshot.docs[0];
    const updateData: Record<string, unknown> = {
      twilioStatus: status.MessageStatus,
      updatedAt: Timestamp.now()
    };

    // Add delivery/read timestamps
    if (status.MessageStatus === 'delivered') {
      updateData.deliveredAt = Timestamp.now();
    } else if (status.MessageStatus === 'read') {
      updateData.readAt = Timestamp.now();
    }

    // Add error info if failed
    if (status.MessageStatus === 'failed' || status.MessageStatus === 'undelivered') {
      updateData.twilioErrorCode = status.ErrorCode || '';
      updateData.twilioErrorMessage = status.ErrorMessage || '';
    }

    await messageDoc.ref.update(updateData);
    console.log('Updated message status:', messageDoc.id, status.MessageStatus);

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing status callback:', error);
    res.status(200).send('OK');
  }
});
