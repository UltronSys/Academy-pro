import { doc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { assignProductToPlayer } from './services/playerService';
import { createIncomeTransaction } from './services/transactionService';
import { getUserById } from './services/userService';

// Test function to demonstrate the new receipt subcollection structure
export const testReceiptSubcollections = async () => {
  try {
    console.log('🧪 Testing receipt subcollections...');
    
    // You'll need to replace these with actual IDs from your system
    const TEST_USER_ID = 'your-user-id'; // Replace with actual user ID
    const TEST_ORGANIZATION_ID = 'your-org-id'; // Replace with actual org ID
    
    // Create a test product
    const testProduct = {
      id: 'test-product-123',
      name: 'Monthly Training Fee',
      description: 'Test product for receipt subcollection demonstration',
      price: 150,
      currency: 'USD',
      organizationId: TEST_ORGANIZATION_ID,
      isActive: true,
      productType: 'recurring' as const,
      recurringDuration: {
        value: 1,
        unit: 'months' as const
      }
    };
    
    console.log('📦 Test product created:', testProduct);
    
    // This would create a debit receipt at: users/{userId}/receipts/{receiptId}
    /*
    await assignProductToPlayer(
      'test-player-123',
      testProduct,
      TEST_ORGANIZATION_ID
    );
    */
    
    console.log('✅ Test completed. Check Firebase Console at:');
    console.log('Path: users/{userId}/receipts/{receiptId}');
    console.log('');
    console.log('To run the actual test:');
    console.log('1. Replace TEST_USER_ID and TEST_ORGANIZATION_ID with real values');
    console.log('2. Create a real player using your UI');
    console.log('3. Assign a product to the player');
    console.log('4. Check Firebase Console for the new subcollection');
    
    return {
      message: 'Test setup ready. Follow the steps above to see subcollections in Firebase.',
      expectedPath: 'users/{userId}/receipts/{receiptId}',
      testProduct
    };
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
};

// Add this to window for easy access in browser console
declare global {
  interface Window {
    testReceiptSubcollections: typeof testReceiptSubcollections;
  }
}

// Make it available globally
if (typeof window !== 'undefined') {
  window.testReceiptSubcollections = testReceiptSubcollections;
}