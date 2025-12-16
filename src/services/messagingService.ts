import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  Unsubscribe
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { Conversation, Message, MessagingSettings } from '../types';

const CONVERSATIONS_COLLECTION = 'conversations';
const MESSAGES_COLLECTION = 'messages';
const MESSAGING_SETTINGS_COLLECTION = 'messagingSettings';

// ==================== CONVERSATION OPERATIONS ====================

/**
 * Get all conversations for an organization
 */
export const getConversationsByOrganization = async (
  organizationId: string,
  status: 'active' | 'archived' | 'all' = 'active'
): Promise<Conversation[]> => {
  try {
    let q = query(
      collection(db, CONVERSATIONS_COLLECTION),
      where('organizationId', '==', organizationId),
      orderBy('lastMessageAt', 'desc')
    );

    if (status !== 'all') {
      q = query(
        collection(db, CONVERSATIONS_COLLECTION),
        where('organizationId', '==', organizationId),
        where('status', '==', status),
        orderBy('lastMessageAt', 'desc')
      );
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Conversation[];
  } catch (error) {
    console.error('Error getting conversations:', error);
    throw error;
  }
};

/**
 * Get a single conversation by ID
 */
export const getConversationById = async (conversationId: string): Promise<Conversation | null> => {
  try {
    const docRef = doc(db, CONVERSATIONS_COLLECTION, conversationId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return {
      id: docSnap.id,
      ...docSnap.data()
    } as Conversation;
  } catch (error) {
    console.error('Error getting conversation:', error);
    throw error;
  }
};

/**
 * Archive a conversation
 */
export const archiveConversation = async (conversationId: string): Promise<void> => {
  try {
    const docRef = doc(db, CONVERSATIONS_COLLECTION, conversationId);
    await updateDoc(docRef, {
      status: 'archived',
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error archiving conversation:', error);
    throw error;
  }
};

/**
 * Unarchive a conversation
 */
export const unarchiveConversation = async (conversationId: string): Promise<void> => {
  try {
    const docRef = doc(db, CONVERSATIONS_COLLECTION, conversationId);
    await updateDoc(docRef, {
      status: 'active',
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error unarchiving conversation:', error);
    throw error;
  }
};

/**
 * Subscribe to conversations (real-time updates)
 */
export const subscribeToConversations = (
  organizationId: string,
  callback: (conversations: Conversation[]) => void,
  status: 'active' | 'archived' = 'active'
): Unsubscribe => {
  const q = query(
    collection(db, CONVERSATIONS_COLLECTION),
    where('organizationId', '==', organizationId),
    where('status', '==', status),
    orderBy('lastMessageAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const conversations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Conversation[];
    callback(conversations);
  }, (error) => {
    console.error('Error in conversations subscription:', error);
  });
};

/**
 * Subscribe to total unread count
 */
export const subscribeToUnreadCount = (
  organizationId: string,
  callback: (count: number) => void
): Unsubscribe => {
  const q = query(
    collection(db, CONVERSATIONS_COLLECTION),
    where('organizationId', '==', organizationId),
    where('status', '==', 'active')
  );

  return onSnapshot(q, (snapshot) => {
    const totalUnread = snapshot.docs.reduce((sum, doc) => {
      const data = doc.data();
      return sum + (data.unreadCount || 0);
    }, 0);
    callback(totalUnread);
  }, (error) => {
    console.error('Error in unread count subscription:', error);
  });
};

// ==================== MESSAGE OPERATIONS ====================

/**
 * Get messages for a conversation
 */
export const getMessagesByConversation = async (
  conversationId: string,
  messageLimit: number = 50
): Promise<Message[]> => {
  try {
    const q = query(
      collection(db, CONVERSATIONS_COLLECTION, conversationId, MESSAGES_COLLECTION),
      orderBy('sentAt', 'desc'),
      limit(messageLimit)
    );

    const snapshot = await getDocs(q);
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Message[];

    // Return in chronological order
    return messages.reverse();
  } catch (error) {
    console.error('Error getting messages:', error);
    throw error;
  }
};

/**
 * Subscribe to messages (real-time updates)
 */
export const subscribeToMessages = (
  conversationId: string,
  callback: (messages: Message[]) => void,
  messageLimit: number = 100
): Unsubscribe => {
  const q = query(
    collection(db, CONVERSATIONS_COLLECTION, conversationId, MESSAGES_COLLECTION),
    orderBy('sentAt', 'desc'),
    limit(messageLimit)
  );

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Message[];

    // Return in chronological order
    callback(messages.reverse());
  }, (error) => {
    console.error('Error in messages subscription:', error);
  });
};

/**
 * Send a WhatsApp message via Cloud Function
 */
export const sendMessage = async (
  conversationId: string,
  body: string,
  organizationId: string
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    const sendWhatsAppMessage = httpsCallable(functions, 'sendWhatsAppMessage');
    const result = await sendWhatsAppMessage({
      conversationId,
      body,
      organizationId
    });

    return result.data as { success: boolean; messageId?: string };
  } catch (error: any) {
    console.error('Error sending message:', error);
    return {
      success: false,
      error: error.message || 'Failed to send message'
    };
  }
};

/**
 * Mark conversation as read via Cloud Function
 */
export const markAsRead = async (conversationId: string): Promise<void> => {
  try {
    const markConversationRead = httpsCallable(functions, 'markConversationRead');
    await markConversationRead({ conversationId });
  } catch (error) {
    console.error('Error marking as read:', error);
    throw error;
  }
};

// ==================== SETTINGS OPERATIONS ====================

/**
 * Get messaging settings for an organization
 */
export const getMessagingSettings = async (
  organizationId: string
): Promise<MessagingSettings | null> => {
  try {
    const docRef = doc(db, MESSAGING_SETTINGS_COLLECTION, organizationId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return {
      id: docSnap.id,
      ...docSnap.data()
    } as MessagingSettings;
  } catch (error) {
    console.error('Error getting messaging settings:', error);
    throw error;
  }
};

/**
 * Update messaging settings
 */
export const updateMessagingSettings = async (
  organizationId: string,
  settings: Partial<MessagingSettings>
): Promise<void> => {
  try {
    const docRef = doc(db, MESSAGING_SETTINGS_COLLECTION, organizationId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      // Create new settings document with organizationId as document ID
      await setDoc(docRef, {
        ...settings,
        id: organizationId,
        organizationId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
    } else {
      await updateDoc(docRef, {
        ...settings,
        updatedAt: Timestamp.now()
      });
    }
  } catch (error) {
    console.error('Error updating messaging settings:', error);
    throw error;
  }
};

// ==================== USER WHATSAPP OPERATIONS ====================

/**
 * Get users (players and guardians) with phone numbers for an organization
 */
export const getUsersWithWhatsApp = async (
  organizationId: string,
  userType?: 'player' | 'guardian'
): Promise<{ id: string; name: string; phone: string; type: 'player' | 'guardian' }[]> => {
  try {
    // Query users who belong to this organization
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const users: { id: string; name: string; phone: string; type: 'player' | 'guardian' }[] = [];

    usersSnapshot.docs.forEach(doc => {
      const data = doc.data();

      // Check if user belongs to the organization
      const hasOrgRole = data.roles?.some((role: { organizationId: string }) =>
        role.organizationId === organizationId
      );

      if (!hasOrgRole) return;

      // Get phone number (check whatsappPhone first, then regular phone)
      const phone = data.whatsappPhone || data.phone;
      if (!phone) return;

      // Determine user type
      const isPlayer = data.roles?.some((role: { role: string[] }) =>
        role.role?.includes('player')
      );
      const isGuardian = data.roles?.some((role: { role: string[] }) =>
        role.role?.includes('guardian')
      );

      const type = isPlayer ? 'player' : isGuardian ? 'guardian' : null;

      if (!type) return;
      if (userType && type !== userType) return;

      users.push({
        id: doc.id,
        name: data.name || data.email || 'Unknown',
        phone,
        type
      });
    });

    return users;
  } catch (error) {
    console.error('Error getting users with WhatsApp:', error);
    throw error;
  }
};

/**
 * Find or create a conversation with a user
 */
export const findOrCreateConversation = async (
  organizationId: string,
  userId: string,
  userName: string,
  userPhone: string,
  userType: 'player' | 'guardian'
): Promise<Conversation> => {
  try {
    // Check for existing active conversation
    const q = query(
      collection(db, CONVERSATIONS_COLLECTION),
      where('organizationId', '==', organizationId),
      where('participantUserId', '==', userId),
      where('status', '==', 'active'),
      limit(1)
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      return {
        id: snapshot.docs[0].id,
        ...snapshot.docs[0].data()
      } as Conversation;
    }

    // Create new conversation
    const userRef = doc(db, 'users', userId);
    const now = Timestamp.now();

    const newConversation: Omit<Conversation, 'id'> = {
      organizationId,
      participantUserId: userId,
      participantName: userName,
      participantPhone: userPhone,
      participantType: userType,
      participantUserRef: userRef,
      status: 'active',
      lastMessageAt: now,
      lastMessagePreview: '',
      lastMessageDirection: 'outbound',
      unreadCount: 0,
      sessionActive: false,
      createdAt: now,
      updatedAt: now
    };

    const docRef = await addDoc(collection(db, CONVERSATIONS_COLLECTION), newConversation);

    return {
      id: docRef.id,
      ...newConversation
    } as Conversation;
  } catch (error) {
    console.error('Error finding/creating conversation:', error);
    throw error;
  }
};
