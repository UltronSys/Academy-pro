import { Timestamp, DocumentReference } from 'firebase/firestore';

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  roles: UserRole[];
  balance?: number; // Amount owed by user (negative = owes money, positive = has credit)
  outstandingBalance?: Record<string, number>; // Outstanding balance per organization
  availableCredits?: Record<string, number>; // Available credits per organization
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

export type ResourceType = 'users' | 'players' | 'academies' | 'settings' | 'finance' | 'events' | 'training' | 'reports';

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