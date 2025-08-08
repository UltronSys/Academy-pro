// Test script to debug receipt creation
// Run this in the browser console after the app loads

const testReceiptCreation = async () => {
  console.log('🧪 Starting receipt creation test...');
  
  try {
    // Import the functions we need
    const { linkPlayersToProduct } = await import('./src/services/productService.ts');
    
    console.log('✅ Functions imported successfully');
    console.log('Now manually test by:');
    console.log('1. Go to Finance → Products');
    console.log('2. Click "Link Players" on any product');
    console.log('3. Select players and click "Link Players"');
    console.log('4. Check browser console for detailed logs');
    console.log('5. Check Firebase Console at users/{userId}/receipts/');
    
  } catch (error) {
    console.error('❌ Test setup failed:', error);
  }
};

// Make it available globally
window.testReceiptCreation = testReceiptCreation;

console.log('🔧 Test function loaded. Run window.testReceiptCreation() when app is ready');