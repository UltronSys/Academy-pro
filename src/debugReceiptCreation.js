// Debug receipt creation
// To use: copy this to browser console and run debugReceiptCreation()

window.debugReceiptCreation = async function() {
  try {
    console.log('🔍 Debug: Starting receipt creation test...');
    
    // Get actual organization and user data from app state
    const organization = window.__FIREBASE_STATE__?.selectedOrganization;
    const userData = window.__FIREBASE_STATE__?.userData;
    
    if (!organization || !userData) {
      console.error('❌ No organization or user data found. Make sure you\'re logged in.');
      return;
    }
    
    console.log('📋 Debug: Using organization:', organization.id);
    console.log('👤 Debug: Using user:', userData.id);
    
    // Try to create a simple debit receipt directly
    const { createDebitReceipt } = await import('./services/receiptService');
    const { doc } = await import('firebase/firestore');
    const { db } = await import('./firebase');
    
    const userRef = doc(db, 'users', userData.id);
    const productRef = doc(db, 'products', 'test-product');
    
    console.log('🎯 Debug: Creating test debit receipt...');
    
    const receipt = await createDebitReceipt(
      userRef,
      productRef,
      {
        name: 'Debug Test Product',
        price: 50.00
      },
      organization.id
    );
    
    console.log('✅ Debug: Receipt created successfully!', receipt);
    console.log('📍 Debug: Receipt location: users/' + userData.id + '/receipts/' + receipt.id);
    
    // Now try to fetch it back
    const { getReceiptById } = await import('./services/receiptService');
    const fetchedReceipt = await getReceiptById(userData.id, receipt.id);
    
    if (fetchedReceipt) {
      console.log('✅ Debug: Receipt verified - can be fetched back!', fetchedReceipt);
    } else {
      console.error('❌ Debug: Receipt was created but cannot be fetched back!');
    }
    
  } catch (error) {
    console.error('❌ Debug: Receipt creation failed:', error);
    console.error('❌ Debug: Error details:', error.message);
    console.error('❌ Debug: Stack trace:', error.stack);
  }
};

console.log('🔧 Debug function loaded. Run debugReceiptCreation() to test.');