import { Timestamp, DocumentReference } from 'firebase/firestore';

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  photoURL?: string; // Profile picture URL
  roles: UserRole[];
  balance?: number; // Amount owed by user (negative = owes money, positive = has credit)
  outstandingBalance?: Record<string, number>; // Outstanding balance per organization
  availableCredits?: Record<string, number>; // Available credits per organization
  // WhatsApp messaging fields
  whatsappPhone?: string; // E.164 format phone number for WhatsApp
  whatsappOptIn?: boolean; // User consent for WhatsApp messaging
  whatsappOptInDate?: Timestamp; // When user opted in
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserRole {
  organizationId: string;
  academyId: string[]; // Empty array for org-wide roles
  role: string[]; // ["owner", "admin", "coach", "player", "guardian"]
}

export interface Organization {
  id: string;
  name: string;
  imageUrl: string;
  ownerId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Academy {
  id: string;
  name: string;
  country: string;
  city: string;
  location: string;
  imageUrl: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Player {
  id: string;
  userId: string;
  academyId: string[];
  organizationId: string;
  dob: Date;
  gender: string;
  guardianId: string[];
  status?: string; // Player status (active, inactive, suspended, etc.) - configurable in settings
  playerParameters: Record<string, any>;
  assignedProducts?: {
    productId: string;
    productName: string;
    price: number;
    assignedDate: Timestamp;
    status: 'active' | 'inactive' | 'cancelled';
    invoiceDate: Timestamp; // When the invoice/debit receipt will be created
    deadlineDate: Timestamp; // Payment deadline for the invoice
    nextReceiptDate?: Timestamp; // For recurring products - when next receipt should be generated
    receiptStatus?: 'immediate' | 'scheduled' | 'generated'; // Status of receipt generation
    productType: 'recurring' | 'one-time'; // Type of product
    recurringDuration?: {
      value: number;
      unit: 'days' | 'weeks' | 'months' | 'years';
    }; // Duration for recurring products
    discount?: {
      type: 'percentage' | 'fixed'; // Type of discount
      value: number; // Discount value (percentage 0-100 or fixed amount)
      reason?: string; // Optional reason for the discount
    };
  }[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ParameterField {
  name: string;
  type: 'text' | 'number' | 'date' | 'dropdown' | 'select' | 'multiselect' | 'boolean';
  unit?: string;
  maximum?: string;
  defaultValue: any;
  required: boolean;
  order: number;
  description?: string;
  options?: string[]; // For dropdown and select fields
}

export interface SkillField {
  name: string;
  maximum: number;
  defaultValue: number;
  description: string;
  order: number;
}

export interface FieldCategory {
  id: string;
  name: string;
  description?: string;
  order: number;
  type: 'parameter' | 'skill' | 'mixed'; // Type of fields this category contains
  fields: ParameterField[]; // Fields belonging to this category
}

export interface Settings {
  id: string;
  generalSettings: {
    defaultLanguage: string;
    timezone: string;
    currency: string;
  };
  financeSettings?: {
    defaultDeadlineDays: number; // Default number of days for payment deadline (e.g., 30 days)
  };
  notificationSettings: {
    emailNotifications: boolean;
    smsNotifications: boolean;
  };
  paymentMethods: string[];
  customRoles: string[];
  playerStatusOptions?: string[]; // Available status options for players
  fieldCategories: FieldCategory[];
  academySpecificSettings: Record<string, {
    fieldCategories: FieldCategory[];
  }>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type RoleType = 'owner' | 'admin' | 'coach' | 'player' | 'guardian';

export type PermissionAction = 'read' | 'write' | 'delete';

export type ResourceType = 'users' | 'players' | 'academies' | 'settings' | 'finance' | 'events' | 'training' | 'reports' | 'messaging';

export interface Permission {
  resource: ResourceType;
  actions: PermissionAction[];
}

export interface RolePermission {
  id: string;
  organizationId: string;
  roleName: string;
  permissions: Permission[];
  isBuiltIn: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  organizationId: string;
  academyId?: string;
  isActive: boolean;
  productType: 'recurring' | 'one-time';
  recurringDuration?: {
    value: number;
    unit: 'days' | 'weeks' | 'months' | 'years';
  };
  linkedPlayerIds?: string[];
  linkedPlayerNames?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Transaction {
  id: string;
  amount: number;
  paymentMethod: string;
  transactionOwner: {
    name: string;
    userRef: DocumentReference;
  };
  paymentMaker?: {
    name: string;
    userRef: DocumentReference;
    type: 'player' | 'guardian';
  };
  playerPayments?: {
    playerId: string;
    playerName: string;
    amount: number;
    userRef: DocumentReference;
  }[];
  description: string;
  date: Timestamp;
  receiptRefs: DocumentReference[];
  type: 'income' | 'expense' | 'internal';
  handler: {
    name: string;
    userRef: DocumentReference;
  };
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  organizationId: string;
  academyId?: string;
  // Soft deletion fields
  isDeleted?: boolean;
  deletedAt?: Timestamp;
  deletedBy?: {
    name: string;
    userRef: DocumentReference;
  };
  // State backup for restoration (stored as JSON string)
  deletionStateBackup?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Receipt {
  id: string;
  type: 'debit' | 'credit' | 'excess';
  amount: number;
  status: 'active' | 'paid' | 'completed' | 'deleted'; // Receipt status - active=unpaid, paid/completed=fully paid, deleted=ignored in calculations
  product?: {
    productRef: DocumentReference;
    name: string;
    price: number;
    invoiceDate: Timestamp;  // Invoice date for this product
    deadline: Timestamp;     // Payment deadline for this product
    originalPrice?: number;  // Original price before any discount
    discountApplied?: string; // Description of discount applied (e.g., "10% discount (Early payment)")
  };
  description?: string; // For credit receipts to store payment description
  paymentDate?: Timestamp; // For credit receipts - when payment was received
  parentTransactionRef?: DocumentReference;
  userRef: DocumentReference;
  siblingReceiptRefs: DocumentReference[];
  organizationId: string;
  academyId?: string;
  // Deletion metadata (optional - for audit trail)
  deletedAt?: Timestamp;
  deletedBy?: {
    name: string;
    userRef: DocumentReference;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ==================== MESSAGING TYPES ====================

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