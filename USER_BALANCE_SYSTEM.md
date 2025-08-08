# User Balance System

## Overview

Added a `balance` field to the User document that tracks how much money each user needs to pay. The balance is automatically calculated from receipts and updated whenever receipts are created, modified, or deleted.

## Balance Logic

### Balance Calculation:
- **Negative balance** = User owes money (needs to pay)
- **Positive balance** = User has credit (overpaid)  
- **Zero balance** = User is up to date

### Receipt Impact:
- **Debit receipts** (invoices) = Decrease balance (user owes more)
- **Credit receipts** (payments) = Increase balance (user paid money)

### Formula:
```
Balance = Total Credits - Total Debits
```

## Implementation

### 1. User Interface Update
```typescript
export interface User {
  // ... existing fields
  balance?: number; // Amount owed by user (negative = owes, positive = credit)
}
```

### 2. Balance Calculation Functions

#### `calculateUserBalanceFromReceipts(userId, organizationId?)`
- Calculates balance from all receipts for a user
- Can filter by organization
- Returns calculated balance (not stored value)

#### `updateUserBalance(userId, balance)`
- Updates the balance field in user document
- Includes updatedAt timestamp

#### `recalculateAndUpdateUserBalance(userId, organizationId?)`
- Calculates balance from receipts AND updates user document
- Main function used throughout the system

### 3. Automatic Balance Updates

Balance is automatically recalculated and updated when:
- ✅ **Receipt created** - After any receipt creation
- ✅ **Receipt updated** - After status changes, amount changes, etc.
- ✅ **Receipt deleted** - After receipt deletion

### 4. Utility Functions

#### `getUserStoredBalance(userId)`
- Returns stored balance from user document (fast)
- Use for displaying balance in UI

#### `recalculateAllUserBalances(organizationId)`
- Bulk update all user balances in an organization
- Useful for data migration or system maintenance

## Usage Examples

### Display User Balance in UI
```typescript
import { getUserStoredBalance } from '../services/userService';

const userBalance = await getUserStoredBalance(userId);

// Display logic
if (userBalance < 0) {
  // User owes money
  return <span className="text-red-600">Owes: ${Math.abs(userBalance)}</span>;
} else if (userBalance > 0) {
  // User has credit
  return <span className="text-green-600">Credit: ${userBalance}</span>;
} else {
  // User is up to date
  return <span className="text-gray-600">Up to date</span>;
}
```

### Manual Balance Recalculation
```typescript
import { recalculateAndUpdateUserBalance } from '../services/userService';

// Recalculate balance for specific user
await recalculateAndUpdateUserBalance(userId, organizationId);

// Bulk recalculate for organization
await recalculateAllUserBalances(organizationId);
```

## Balance Flow Examples

### Example 1: New Player with Product
1. Player linked to $100 product → Debit receipt created
2. User balance automatically updated to **-$100** (owes $100)

### Example 2: Payment Made  
1. Player pays $100 → Credit receipt created
2. User balance automatically updated to **$0** (up to date)

### Example 3: Overpayment
1. Player pays $150 for $100 product → Credit receipt created
2. User balance automatically updated to **+$50** (has $50 credit)

### Example 4: Multiple Products
1. Player has Training ($100) + Equipment ($50) → 2 debit receipts
2. User balance: **-$150** (owes $150)
3. Player pays $75 → Credit receipt created  
4. User balance: **-$75** (still owes $75)

## Data Consistency

### Automatic Updates
- Balance updates happen in try/catch blocks
- Receipt operations don't fail if balance update fails
- Ensures receipt data integrity is maintained

### Error Handling
- Balance calculation errors are logged but don't break receipt operations
- Manual recalculation functions available for data repair

### Performance
- Stored balance in user document for fast UI display
- Calculation from receipts only when needed (create/update operations)
- Bulk operations available for maintenance

## Benefits

1. **Fast Balance Display** - No need to calculate from receipts every time
2. **Automatic Maintenance** - Balance always stays in sync with receipts  
3. **Flexible Queries** - Can query users by balance range
4. **Clear Financial Status** - Immediately see who owes money
5. **Data Integrity** - Balance automatically reflects all financial activity

## Future Enhancements

- Dashboard showing users with outstanding balances
- Automatic payment reminders based on balance
- Balance history tracking
- Organization-wide financial reports
- Balance-based user filtering and sorting