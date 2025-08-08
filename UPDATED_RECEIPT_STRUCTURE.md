# Updated Receipt Structure

## Key Changes Made

### ✅ Credit Receipts No Longer Require Product Information

**Before:**
- Credit receipts had mandatory product information
- Product data was duplicated between debit and credit receipts
- Conceptually incorrect - payments don't belong to products

**After:**
- Credit receipts are product-agnostic
- They represent payments received, not product purchases
- Product context comes from the linked debit receipt

## New Receipt Structure

### Debit Receipts (Invoices)
```typescript
{
  type: 'debit',
  amount: 100.00,
  product: {                    // ✅ Required - what was sold
    productRef: DocumentReference,
    name: 'Monthly Training Fee',
    price: 100.00
  },
  status: 'pending',
  // ... other fields
}
```

### Credit Receipts (Payments)
```typescript
{
  type: 'credit',
  amount: 100.00,
  description: 'Monthly training payment',  // ✅ Optional - payment description
  product: undefined,                       // ✅ No product info needed
  status: 'paid',
  siblingReceiptRefs: [debitReceiptRef],    // ✅ Links to what was paid
  // ... other fields
}
```

## Updated Flow

### 1. Product Assignment → Debit Receipt
```
Player linked to "Monthly Training" product
↓
Debit receipt created with product details
```

### 2. Payment → Credit Receipt
```
Income transaction for $100 with description "Training payment"
↓
Credit receipt created with description but NO product
↓
If pending debit found, link as siblings
```

### 3. Relationship
```
Debit Receipt (Invoice)     ←sibling→     Credit Receipt (Payment)
- Product: Training Fee                   - Description: Payment received
- Amount: $100                           - Amount: $100  
- Status: paid (when linked)             - Status: paid (always)
```

## Benefits

### 1. **Conceptual Clarity**
- Debit = "What you owe" (tied to products/services)
- Credit = "What you paid" (payment transactions)

### 2. **Flexible Payments**
- Can pay multiple invoices with one payment
- Can make partial payments
- Can overpay (excess credit)

### 3. **Simpler Data Structure**
- No duplicate product information
- Cleaner credit receipt data
- Product context from debit receipts only

### 4. **Better Reporting**
- Clear separation between sales (debits) and payments (credits)
- Product sales reports come from debit receipts
- Payment reports come from credit receipts

## UI Changes

### Finance > Receipts Tab
- **Debit receipts** show product name and details
- **Credit receipts** show payment description
- Sibling relationships clearly displayed

### Transaction Creation
- No longer asks for product information when creating income
- Focuses on payment description and amount
- Automatically links to pending debit receipts

## Database Impact

### Firestore Structure
```
users/{userId}/receipts/{receiptId}
├── type: 'debit' | 'credit'
├── amount: number
├── product?: { ... }              // Only for debit receipts
├── description?: string           // Only for credit receipts
├── siblingReceiptRefs: [...]      // Links between debit/credit
└── ... other fields
```

### Backward Compatibility
- Existing credit receipts with product info will still work
- New credit receipts won't have product info
- UI handles both cases gracefully

This structure now properly reflects the real-world concept that payments are separate from the products/services they pay for, while maintaining the ability to track relationships through sibling receipt linking.