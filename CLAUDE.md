# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm start` - Start development server (React app on localhost:3000)
- `npm test` - Run tests in interactive watch mode
- `npm run build` - Build for production
- `npx tsc --noEmit --skipLibCheck` - Type check without compilation

### Firebase Setup Required
Before development, ensure Firebase is configured in `src/firebase.ts` with valid credentials for:
- Authentication (Email/Password provider enabled)
- Firestore Database
- Storage

## Architecture Overview

### Multi-Tenant Hierarchy
The application follows a three-tier organizational structure:
1. **Organization** - Top-level entity (sports organization/club)
2. **Academy** - Sub-entity under organization (multiple academies per organization)  
3. **Users** - Assigned roles at organization and/or academy level

### Role-Based Access Control (RBAC)
Users have roles that grant permissions at different scopes:
- **Organization-wide roles**: owner, admin (access to all academies)
- **Academy-specific roles**: coach, player, guardian (scoped to specific academies)
- Permissions are enforced through `usePermissions` hook and `ProtectedRoute` component

### Context Architecture
Two main React contexts provide global state:
- **AuthContext** (`src/contexts/AuthContext.tsx`) - Firebase auth + user data with roles
- **AppContext** (`src/contexts/AppContext.tsx`) - Selected organization/academy state

### Data Layer
- **Services** (`src/services/`) - Firebase operations organized by domain
- **Types** (`src/types/index.ts`) - TypeScript interfaces for all data models
- **Firestore Structure** - Multi-tenant with organization isolation (see `firestore_structure.md`)

### Finance System
Complex financial receipt system with debit/credit relationships:
- **Debit receipts** - Invoices with product info and due dates
- **Credit receipts** - Payment records that link to debit receipts as siblings
- **Products** - Can be linked to players to generate debit receipts automatically
- **Transactions** - Income/expense records that create credit receipts

Key receipt structure:
- Debit receipts store invoice dates and deadlines within the `product` object
- Credit receipts use `paymentDate` and `description` fields instead of product info
- Sibling relationships maintained via `siblingReceiptRefs` arrays

### UI Components
- **Material-UI (MUI)** + custom components in `src/components/ui/`
- **DashboardLayout** wraps all authenticated pages with navigation
- **Responsive design** with mobile-friendly interfaces
- **TailwindCSS** for styling alongside MUI

## Key Development Patterns

### Service Layer Pattern
All Firebase operations are abstracted into service functions:
```typescript
// Example pattern
export const getItemsByOrganization = async (organizationId: string): Promise<Item[]> => {
  const q = query(collection(db, 'items'), where('organizationId', '==', organizationId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Item);
};
```

### Permission Checking
Use `usePermissions` hook for access control:
```typescript
const { canRead, canWrite, canDelete } = usePermissions();
if (canWrite('finance')) {
  // Show finance management UI
}
```

### Organization Scoping
All data operations must include organizationId for multi-tenancy:
```typescript
const items = await getItemsByOrganization(selectedOrganization.id);
```

### Error Handling for Undefined Fields
When working with Firestore, remove undefined fields to prevent save errors:
```typescript
// Remove undefined academyId before saving
if (data.academyId === undefined) {
  delete data.academyId;
}
```

## Critical Files

### Firebase Configuration
- `src/firebase.ts` - Firebase initialization and configuration
- `firestore_structure.md` - Complete database schema documentation

### Authentication Flow  
- `src/contexts/AuthContext.tsx` - Auth state management
- `src/components/auth/ProtectedRoute.tsx` - Route protection with role checking

### Data Models
- `src/types/index.ts` - All TypeScript interfaces
- Key models: User, Organization, Academy, Player, Product, Transaction, Receipt

### Receipt System
- `src/services/receiptService.ts` - Receipt CRUD operations  
- `src/services/transactionService.ts` - Transaction processing with receipt creation
- `src/services/productService.ts` - Product management with automatic receipt generation

### Multi-Tenancy
- All Firestore queries must filter by `organizationId`
- Academy-specific data additionally filters by `academyId`
- Role permissions are scoped to organization/academy combinations

## Firebase Collections Structure

### Core Collections
- `users` - User profiles with embedded roles array
- `organizations` - Organization documents  
- `organizations/{orgId}/academies` - Academies subcollection
- `players` - Player documents with organization/academy references
- `products` - Products/services for sale
- `transactions` - Financial transaction records

### Receipt System
- `users/{userId}/receipts` - User-specific receipt subcollections
- Use `collectionGroup('receipts')` for organization-wide receipt queries
- Debit receipts contain product information with dates
- Credit receipts contain payment information and link to debit receipts

### Role and Permission Management
- `settings` - Organization settings including custom roles
- `rolePermissions` - Role definitions with resource-action permissions
- Users can have multiple roles across different organizations/academies

## Development Notes

### Running Lints and Type Checks
Always run type checking before commits since the project uses strict TypeScript. The build process will fail on type errors.

### Firebase Local Development
For local development, consider using Firebase emulators for Firestore and Auth to avoid affecting production data.

### Receipt System Debugging
Enhanced logging is enabled throughout the receipt creation chain. Check browser console for detailed logs when testing product linking and transaction creation.