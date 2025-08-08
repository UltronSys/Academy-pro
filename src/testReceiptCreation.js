// Simple test script to verify receipt creation
// Run this in browser console: node testReceiptCreation.js

import { initializeApp } from 'firebase/app';
import { getFirestore, doc } from 'firebase/firestore';
import { createDebitReceipt } from './services/receiptService';

// Test function to create a debit receipt
const testReceiptCreation = async () => {
  try {
    console.log('🧪 Testing debit receipt creation...');
    
    // Mock data for testing
    const userId = 'test-user-id';
    const productId = 'test-product-id';
    const organizationId = 'test-org-id';
    
    // Create references (these would be real in production)
    const userRef = doc(getFirestore(), 'users', userId);
    const productRef = doc(getFirestore(), 'products', productId);
    
    // Attempt to create a debit receipt
    const receipt = await createDebitReceipt(
      userRef,
      productRef,
      {
        name: 'Test Product',
        price: 100.00
      },
      organizationId
    );
    
    console.log('✅ Receipt created successfully:', receipt);
    
  } catch (error) {
    console.error('❌ Receipt creation failed:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
  }
};

// Export for testing
export { testReceiptCreation };

console.log('Test file loaded. You can run testReceiptCreation() to test receipt creation.');