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
- `createdAt` (Timestamp) - Creation timestamp
- `updatedAt` (Timestamp) - Last update timestamp

### 9. **users/{userId}/receipts**
Subcollection under users for storing receipt records linked to transactions.

**Path:** `users/{userId}/receipts/{receiptId}`

**Fields:**
- `id` (string) - Receipt's unique identifier
- `type` (string) - Receipt type: 'debit' | 'credit' | 'excess'
- `amount` (number) - Receipt amount
- `product` (object) - Product information
  - `productRef` (DocumentReference) - Reference to product document
  - `name` (string) - Product name (cached for display)
  - `price` (number) - Product price at time of receipt
- `invoiceDate` (Timestamp) - Date of invoice generation
- `deadline` (Timestamp) - Payment deadline
- `parentTransactionRef` (DocumentReference, optional) - Reference to parent transaction
- `userRef` (DocumentReference) - Reference to user (player/guardian) document
- `siblingReceiptRefs` (array of DocumentReferences) - Related receipt references
- `status` (string) - Receipt status: 'pending' | 'paid' | 'overdue' | 'cancelled'
- `organizationId` (string) - Organization ID
- `academyId` (string, optional) - Academy ID (if academy-specific)
- `createdAt` (Timestamp) - Creation timestamp
- `updatedAt` (Timestamp) - Last update timestamp

**Note:** Receipts are stored as a subcollection under each user document to enable better organization and querying. Use `collectionGroup('receipts')` for organization-wide queries across all users.


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
type ResourceType = 'users' | 'players' | 'academies' | 'settings' | 'finance' | 'events' | 'training' | 'reports';
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
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
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

### 13. **Basic Types**
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