# Firestore Structure

## Collections

### 1. **users**
Collection for storing user information and authentication details.

**Fields:**
- `id` (string) - User's unique identifier
- `email` (string) - User's email address
- `name` (string) - User's full name
- `phone` (string, optional) - User's phone number
- `roles` (array of UserRole objects) - User's roles in different organizations
  - `organizationId` (string) - Organization identifier
  - `academyId` (array of strings) - Academy identifiers (empty for org-wide roles)
  - `role` (array of strings) - Role names (e.g., ["owner", "admin", "coach", "player", "guardian"])
- `createdAt` (Timestamp) - Account creation timestamp
- `updatedAt` (Timestamp) - Last update timestamp

### 2. **organizations**
Collection for storing organization/academy network information.

**Fields:**
- `id` (string) - Organization's unique identifier
- `name` (string) - Organization name
- `imageUrl` (string) - Organization logo URL
- `ownerId` (string) - Owner's user ID
- `createdAt` (Timestamp) - Creation timestamp
- `updatedAt` (Timestamp) - Last update timestamp

### 3. **organizations/{organizationId}/academies**
Subcollection for storing academies within an organization.

**Fields:**
- `id` (string) - Academy's unique identifier
- `name` (string) - Academy name
- `country` (string) - Academy's country
- `city` (string) - Academy's city
- `location` (string) - Detailed location/address
- `imageUrl` (string) - Academy logo URL
- `createdAt` (Timestamp) - Creation timestamp
- `updatedAt` (Timestamp) - Last update timestamp

### 4. **players**
Collection for storing player information across all organizations.

**Fields:**
- `id` (string) - Player's unique identifier
- `userId` (string) - Associated user ID
- `academyId` (array of strings) - Academy IDs the player belongs to
- `organizationId` (string) - Organization ID
- `dob` (Date) - Date of birth
- `gender` (string) - Player's gender
- `guardianId` (array of strings) - Guardian user IDs
- `status` (string, optional) - Player status (e.g., 'active', 'inactive', 'suspended') - configurable in settings
- `playerParameters` (Record<string, any>) - Dynamic player attributes/parameters (key-value pairs)
- `assignedProducts` (array of objects, optional) - Products assigned to the player
  - `productId` (string) - Product's unique identifier
  - `productName` (string) - Product name (cached for display)
  - `price` (number) - Product price at time of assignment
  - `assignedDate` (Timestamp) - Date when product was assigned
  - `status` (string) - Assignment status: 'active' | 'inactive' | 'cancelled'
  - `invoiceDate` (Timestamp) - Date when the invoice/debit receipt will be created
  - `deadlineDate` (Timestamp) - Payment deadline for the invoice
  - `nextReceiptDate` (Timestamp, optional) - For recurring products - when next receipt should be generated
  - `receiptStatus` (string, optional) - Status of receipt generation: 'immediate' | 'scheduled' | 'generated'
  - `discount` (object, optional) - Discount applied to this product assignment
    - `type` (string) - Discount type: 'percentage' | 'fixed'
    - `value` (number) - Discount value (percentage 0-100 or fixed amount)
    - `reason` (string, optional) - Reason for the discount
- `createdAt` (Timestamp) - Creation timestamp
- `updatedAt` (Timestamp) - Last update timestamp

### 5. **settings**
Collection for storing organization-wide and academy-specific settings.

**Fields:**
- `id` (string) - Settings document ID (same as organizationId)
- `generalSettings` (object)
  - `defaultLanguage` (string) - Default language code
  - `timezone` (string) - Default timezone
  - `currency` (string) - Default currency code (used in transactions)
- `notificationSettings` (object)
  - `emailNotifications` (boolean) - Email notifications enabled
  - `smsNotifications` (boolean) - SMS notifications enabled
- `paymentMethods` (array of strings) - Available payment methods for transactions
- `customRoles` (array of strings) - Custom role names
- `playerStatusOptions` (array of strings, optional) - Available status options for players (e.g., 'Active', 'Inactive', 'Suspended')
- `fieldCategories` (array of FieldCategory objects) - Organization-wide field categories
  - `id` (string) - Category identifier
  - `name` (string) - Category name
  - `description` (string, optional) - Category description
  - `order` (number) - Display order
  - `type` (string) - Category type: 'parameter' | 'skill' | 'mixed'
  - `fields` (array of ParameterField objects) - Fields in the category
- `academySpecificSettings` (object) - Academy-specific overrides
  - `[academyId]` (object)
    - `fieldCategories` (array of FieldCategory objects) - Academy-specific field categories
- `createdAt` (Timestamp) - Creation timestamp
- `updatedAt` (Timestamp) - Last update timestamp

### 6. **rolePermissions**
Collection for storing role-based permissions for each organization.

**Fields:**
- `id` (string) - Document identifier
- `organizationId` (string) - Organization ID
- `roleName` (string) - Role name (e.g., "owner", "admin", "coach", "player", "guardian", "accountant")
- `permissions` (array of Permission objects)
  - `resource` (string) - Resource type: 'users' | 'players' | 'academies' | 'settings' | 'finance' | 'events' | 'training' | 'reports'
  - `actions` (array of strings) - Allowed actions: ['read', 'write', 'delete']
- `isBuiltIn` (boolean) - Whether this is a built-in role
- `createdAt` (Timestamp) - Creation timestamp
- `updatedAt` (Timestamp) - Last update timestamp

### 7. **products**
Collection for storing academy products and services (can be added in future).

**Fields:**
- `id` (string) - Product's unique identifier
- `name` (string) - Product name
- `description` (string) - Product description
- `price` (number) - Product price
- `currency` (string) - Currency code (USD, EUR, etc.)
- `organizationId` (string) - Organization ID
- `academyId` (string, optional) - Academy ID (if academy-specific)
- `isActive` (boolean) - Whether product is available for purchase
- `productType` (string) - Product type: 'recurring' | 'one-time'
- `recurringDuration` (object, optional) - For recurring products only
  - `value` (number) - Duration value (e.g., 1, 3, 12)
  - `unit` (string) - Duration unit: 'days' | 'weeks' | 'months' | 'years'
- `createdAt` (Timestamp) - Creation timestamp
- `updatedAt` (Timestamp) - Last update timestamp

### 8. **transactions**  
Collection for storing financial transactions.

**Fields:**
- `id` (string) - Transaction's unique identifier
- `amount` (number) - Transaction amount
- `paymentMethod` (string) - Payment method used
- `transactionOwner` (object) - Owner of the transaction
  - `name` (string) - Owner's name (player/guardian name)
  - `userRef` (DocumentReference) - Reference to user document
- `description` (string) - Transaction description
- `date` (Timestamp) - Transaction date
- `receiptRefs` (array of DocumentReferences) - References to receipt documents
- `type` (string) - Transaction type: 'income' | 'expense' | 'internal'
- `handler` (object) - Person who created the transaction
  - `name` (string) - Handler's name
  - `userRef` (DocumentReference) - Reference to handler's user document
- `status` (string) - Transaction status: 'pending' | 'completed' | 'failed' | 'cancelled'
- `organizationId` (string) - Organization ID
- `academyId` (string, optional) - Academy ID (if academy-specific)
- `isDeleted` (boolean, optional) - Soft delete flag (default: false)
- `deletedAt` (Timestamp, optional) - When transaction was deleted (for audit trail)
- `deletedBy` (object, optional) - Who deleted the transaction (for audit trail)
  - `name` (string) - Name of person who deleted
  - `userRef` (DocumentReference) - Reference to user who deleted
- `deletionStateBackup` (string, optional) - JSON backup of transaction state before deletion
- `createdAt` (Timestamp) - Creation timestamp
- `updatedAt` (Timestamp) - Last update timestamp

### 9. **users/{userId}/receipts**
Subcollection under users for storing receipt records linked to transactions.

**Path:** `users/{userId}/receipts/{receiptId}`

**Fields:**
- `id` (string) - Receipt's unique identifier
- `type` (string) - Receipt type: 'debit' | 'credit' | 'excess'
- `amount` (number) - Receipt amount
- `product` (object) - Product information (for debit receipts)
  - `productRef` (DocumentReference) - Reference to product document
  - `name` (string) - Product name (cached for display)
  - `price` (number) - Product price at time of receipt
  - `invoiceDate` (Timestamp) - Date of invoice generation
  - `deadline` (Timestamp) - Payment deadline
  - `originalPrice` (number, optional) - Original price before discount applied
  - `discountApplied` (string, optional) - Description of discount applied (e.g., "10% discount (Early payment)")
- `description` (string, optional) - For credit receipts to store payment description
- `paymentDate` (Timestamp, optional) - For credit receipts - when payment was received
- `parentTransactionRef` (DocumentReference, optional) - Reference to parent transaction
- `userRef` (DocumentReference) - Reference to user (player/guardian) document
- `siblingReceiptRefs` (array of DocumentReferences) - Related receipt references
- `status` (string) - Receipt status: 'active' | 'paid' | 'completed' | 'deleted'
- `deletedAt` (Timestamp, optional) - When receipt was deleted (for audit trail)
- `deletedBy` (object, optional) - Who deleted the receipt (for audit trail)
  - `name` (string) - Name of person who deleted
  - `userRef` (DocumentReference) - Reference to user who deleted
- `organizationId` (string) - Organization ID
- `academyId` (string, optional) - Academy ID (if academy-specific)
- `createdAt` (Timestamp) - Creation timestamp
- `updatedAt` (Timestamp) - Last update timestamp

**Note:** Receipts are stored as a subcollection under each user document to enable better organization and querying. Use `collectionGroup('receipts')` for organization-wide queries across all users.

### 10. **conversations**
Collection for storing WhatsApp messaging conversations.

**Fields:**
- `id` (string) - Conversation's unique identifier
- `organizationId` (string) - Organization ID
- `participantUserId` (string) - User ID of the conversation participant (player/guardian)
- `participantName` (string) - Participant's name (cached for display)
- `participantPhone` (string) - Participant's phone number in E.164 format (e.g., +1234567890)
- `participantType` (string) - Participant type: 'player' | 'guardian'
- `status` (string) - Conversation status: 'active' | 'archived'
- `lastMessageAt` (Timestamp) - Timestamp of the last message
- `lastMessagePreview` (string) - Preview text of the last message
- `unreadCount` (number) - Count of unread messages
- `sessionActive` (boolean) - Whether WhatsApp 24-hour messaging window is active
- `sessionExpiresAt` (Timestamp, optional) - When the 24-hour session expires
- `createdAt` (Timestamp) - Creation timestamp
- `updatedAt` (Timestamp) - Last update timestamp

### 11. **conversations/{conversationId}/messages**
Subcollection for storing messages within a conversation.

**Path:** `conversations/{conversationId}/messages/{messageId}`

**Fields:**
- `id` (string) - Message's unique identifier
- `direction` (string) - Message direction: 'inbound' | 'outbound'
- `body` (string) - Message text content
- `senderUserId` (string, optional) - User ID of the sender (for outbound messages)
- `senderName` (string, optional) - Sender's name (cached for display)
- `twilioMessageSid` (string, optional) - Twilio message SID for tracking
- `twilioStatus` (string) - Message status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received'
- `twilioErrorCode` (string, optional) - Twilio error code if failed
- `twilioErrorMessage` (string, optional) - Twilio error message if failed
- `mediaUrl` (string, optional) - URL of attached media
- `mediaType` (string, optional) - MIME type of attached media
- `sentAt` (Timestamp) - When the message was sent
- `createdAt` (Timestamp) - Creation timestamp

### 12. **messagingSettings/{organizationId}**
Collection for storing messaging configuration per organization.

**Fields:**
- `id` (string) - Document ID (same as organizationId)
- `organizationId` (string) - Organization ID
- `twilioAccountSid` (string) - Twilio Account SID
- `twilioAuthToken` (string) - Twilio Auth Token (should be stored in Secret Manager in production)
- `twilioWhatsAppNumber` (string) - Twilio WhatsApp-enabled number (format: whatsapp:+14155238886)
- `enabled` (boolean) - Whether messaging is enabled for the organization
- `autoReplyEnabled` (boolean, optional) - Whether auto-reply is enabled
- `autoReplyMessage` (string, optional) - Auto-reply message text
- `createdAt` (Timestamp) - Creation timestamp
- `updatedAt` (Timestamp) - Last update timestamp

## Data Types Used in the Project

### 1. **Timestamp** (from Firebase)
Used for tracking creation and update times across all collections.

### 2. **UserRole** (interface)
```typescript
{
  organizationId: string;
  academyId: string[];
  role: string[];
}
```

### 3. **ParameterField** (interface)
```typescript
{
  name: string;
  type: 'text' | 'number' | 'date' | 'dropdown' | 'select' | 'multiselect' | 'boolean';
  unit?: string;
  maximum?: string;
  defaultValue: any;
  required: boolean;
  order: number;
  description?: string;
  options?: string[];
}
```

### 4. **SkillField** (interface)
```typescript
{
  name: string;
  maximum: number;
  defaultValue: number;
  description: string;
  order: number;
}
```

### 5. **FieldCategory** (interface)
```typescript
{
  id: string;
  name: string;
  description?: string;
  order: number;
  type: 'parameter' | 'skill' | 'mixed';
  fields: ParameterField[];
}
```

### 6. **Permission** (interface)
```typescript
{
  resource: ResourceType;
  actions: PermissionAction[];
}
```

### 7. **RoleType** (type)
```typescript
type RoleType = 'owner' | 'admin' | 'coach' | 'player' | 'guardian';
```

### 8. **PermissionAction** (type)
```typescript
type PermissionAction = 'read' | 'write' | 'delete';
```

### 9. **ResourceType** (type)
```typescript
type ResourceType = 'users' | 'players' | 'academies' | 'settings' | 'finance' | 'events' | 'training' | 'reports' | 'messaging';
```

### 10. **Transaction** (interface)
```typescript
{
  id: string;
  amount: number;
  paymentMethod: string;
  transactionOwner: {
    name: string;
    userRef: DocumentReference;
  };
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
  isDeleted?: boolean;
  deletedAt?: Timestamp;
  deletedBy?: {
    name: string;
    userRef: DocumentReference;
  };
  deletionStateBackup?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 11. **Receipt** (interface)
```typescript
{
  id: string;
  type: 'debit' | 'credit' | 'excess';
  amount: number;
  product: {
    productRef: DocumentReference;
    name: string;
    price: number;
  };
  invoiceDate: Timestamp;
  deadline: Timestamp;
  parentTransactionRef?: DocumentReference;
  userRef: DocumentReference;
  siblingReceiptRefs: DocumentReference[];
  status: 'active' | 'paid' | 'completed' | 'deleted';
  deletedAt?: Timestamp;
  deletedBy?: {
    name: string;
    userRef: DocumentReference;
  };
  organizationId: string;
  academyId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 12. **Product** (interface)
```typescript
{
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  academyId?: string;
  organizationId: string;
  isActive: boolean;
  productType: 'recurring' | 'one-time';
  recurringDuration?: {
    value: number;
    unit: 'days' | 'weeks' | 'months' | 'years';
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 13. **Conversation** (interface)
```typescript
{
  id: string;
  organizationId: string;
  participantUserId: string;
  participantName: string;
  participantPhone: string;
  participantType: 'player' | 'guardian';
  status: 'active' | 'archived';
  lastMessageAt: Timestamp;
  lastMessagePreview: string;
  unreadCount: number;
  sessionActive: boolean;
  sessionExpiresAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 14. **Message** (interface)
```typescript
{
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  senderUserId?: string;
  senderName?: string;
  twilioMessageSid?: string;
  twilioStatus: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  twilioErrorCode?: string;
  twilioErrorMessage?: string;
  mediaUrl?: string;
  mediaType?: string;
  sentAt: Timestamp;
  createdAt: Timestamp;
}
```

### 15. **MessagingSettings** (interface)
```typescript
{
  id: string;
  organizationId: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioWhatsAppNumber: string;
  enabled: boolean;
  autoReplyEnabled?: boolean;
  autoReplyMessage?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 16. **Basic Types**
- `string` - Text data
- `number` - Numeric values
- `boolean` - True/false values
- `Date` - Date objects
- `array` - Lists of values
- `object` - Key-value pairs / nested data structures
- `any` - Dynamic/untyped values (used for playerParameters)

## Firestore Security Rules

For the **products** and **transactions** collections, you should add the following security rules to your Firestore rules:

```javascript
// Products collection rules
match /products/{productId} {
  // Allow read access to products for authenticated users in the same organization
  allow read: if request.auth != null && 
    request.auth.uid in resource.data.organizationId;
  
  // Allow create/update/delete for users with finance permissions
  allow create, update, delete: if request.auth != null && 
    hasFinancePermissions(request.auth.uid, resource.data.organizationId);
}

// Transactions collection rules
match /transactions/{transactionId} {
  // Allow read access to transactions for authenticated users in the same organization
  allow read: if request.auth != null && 
    request.auth.uid in resource.data.organizationId;
  
  // Allow create/update/delete for users with finance permissions
  allow create, update, delete: if request.auth != null && 
    hasFinancePermissions(request.auth.uid, resource.data.organizationId);
}

// Helper function to check finance permissions
function hasFinancePermissions(userId, organizationId) {
  return exists(/databases/$(database)/documents/users/$(userId)) &&
    get(/databases/$(database)/documents/users/$(userId)).data.roles.hasAny([
      {'organizationId': organizationId, 'role': ['owner']},
      {'organizationId': organizationId, 'role': ['admin']},
      {'organizationId': organizationId, 'role': ['accountant']}
    ]);
}
```