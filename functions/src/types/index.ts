import { Timestamp, DocumentReference } from 'firebase-admin/firestore';

export interface Conversation {
  id: string;
  organizationId: string;
  academyId?: string;

  // Participant info
  participantUserId: string | null; // null for unknown contacts
  participantName: string;
  participantPhone: string; // E.164 format
  participantType: 'player' | 'guardian' | 'unknown';
  participantUserRef: DocumentReference | null; // null for unknown contacts

  // Player context (for guardians)
  relatedPlayerId?: string;
  relatedPlayerName?: string;

  // Conversation state
  status: 'active' | 'archived' | 'blocked';
  lastMessageAt: Timestamp;
  lastMessagePreview: string;
  lastMessageDirection: 'inbound' | 'outbound';
  unreadCount: number;

  // WhatsApp session state (24-hour window)
  sessionActive: boolean;
  sessionExpiresAt?: Timestamp;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Message {
  id: string;
  conversationId: string;

  // Message content
  direction: 'inbound' | 'outbound';
  body: string;
  mediaUrl?: string;
  mediaType?: string;

  // Sender info
  senderUserId?: string;
  senderName?: string;
  senderPhone?: string;

  // Twilio metadata
  twilioMessageSid?: string;
  twilioStatus: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  twilioErrorCode?: string;
  twilioErrorMessage?: string;

  // Timestamps
  sentAt: Timestamp;
  deliveredAt?: Timestamp;
  readAt?: Timestamp;
  createdAt: Timestamp;
}

export interface MessagingSettings {
  id: string;
  organizationId: string;

  // Twilio Configuration
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioWhatsAppNumber: string;

  // Settings
  enabled: boolean;
  autoReplyEnabled: boolean;
  autoReplyMessage?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TwilioIncomingMessage {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
  ProfileName?: string; // WhatsApp profile name of sender
}

export interface TwilioStatusCallback {
  MessageSid: string;
  MessageStatus: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'undelivered';
  ErrorCode?: string;
  ErrorMessage?: string;
}
