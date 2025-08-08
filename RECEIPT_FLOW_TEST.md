# Receipt Flow Test Guide

## Complete Finance System Flow

### 1. Product & Player Linking Flow
When you link a player to a product in the **Products** tab:
- A **debit receipt** is automatically created in `users/{playerId}/receipts`
- Status: `pending`
- The receipt contains product details and amount due

### 2. Transaction & Payment Flow
When creating an **income transaction** in the **Transactions** tab:

#### Step 1: Select Player
- When you select a player, the system automatically fetches their pending debit receipts
- Pending receipts are displayed with product name, amount, and due date

#### Step 2: Select Receipt (Optional)
- You can select a pending receipt to link the payment to
- This creates the sibling relationship between debit and credit receipts

#### Step 3: Create Transaction
- The system creates an income transaction
- A **credit receipt** is created in `users/{playerId}/receipts`
- If a pending receipt was selected:
  - The credit receipt is linked as a sibling to the debit receipt
  - The debit receipt status changes from `pending` to `paid`
  - Both receipts reference each other via `siblingReceiptRefs`

## Testing Steps

### Test 1: Create Product and Link Player
1. Go to **Finance > Products**
2. Create a new product (e.g., "Monthly Training Fee" - $100)
3. Click "Link Players" and select a player
4. System creates a debit receipt for that player

### Test 2: Process Payment with Receipt Linking
1. Go to **Finance > Transactions**
2. Click "Add Transaction"
3. Select Type: "Income"
4. Select the same player from Test 1
5. **You should see the pending receipt appear**
6. Select the pending receipt
7. Enter the payment amount ($100)
8. Submit the transaction

### Expected Results:
- Transaction is created successfully
- Credit receipt is created and linked to the debit receipt
- Debit receipt status changes to "paid"
- Both receipts have sibling references to each other

## Key Features Implemented:

1. **Automatic Debit Receipt Creation**: When linking players to products
2. **Pending Receipt Display**: Shows pending receipts when selecting a player in transactions
3. **Smart Receipt Linking**: Automatically links credit receipts to pending debit receipts
4. **Status Management**: Updates debit receipt status when payment is received
5. **Sibling Receipt Tracking**: Maintains references between related receipts

## Database Structure:
```
users/
  {userId}/
    receipts/
      {receiptId}/
        - type: 'debit' | 'credit'
        - amount: number
        - status: 'pending' | 'paid' | 'overdue'
        - siblingReceiptRefs: DocumentReference[]
        - parentTransactionRef: DocumentReference
        - product: { name, price, productRef }
```

## Receipt Relationships:
- **Debit Receipt**: Created when product is assigned to player (invoice)
- **Credit Receipt**: Created when payment is received
- **Sibling Link**: Connects payment (credit) to invoice (debit)
- **Transaction Link**: Credit receipt references the parent transaction