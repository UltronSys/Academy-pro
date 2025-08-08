# Firestore Security Rules Setup

## Add Products Collection Rules

You need to add the following rules to your Firestore Security Rules in the Firebase Console:

### 1. Go to Firebase Console
1. Open your Firebase project
2. Go to Firestore Database
3. Click on "Rules" tab

### 2. Add these rules to your existing rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Add this rule for products collection
    match /products/{productId} {
      // Allow read for authenticated users in the same organization
      allow read: if request.auth != null;
      
      // Allow write for authenticated users (temporary - for testing)
      allow write: if request.auth != null;
    }
    
    // Add this rule for test collection (for debugging)
    match /test/{testId} {
      allow read, write: if request.auth != null;
    }
    
    // Your existing rules should remain here...
    // (users, organizations, academies, etc.)
  }
}
```

### 3. For Production (Later)

Once testing works, replace the products rule with more secure rules:

```javascript
match /products/{productId} {
  // Allow read for authenticated users in the same organization
  allow read: if request.auth != null && 
    request.auth.uid != null;
  
  // Allow create/update/delete for users with finance permissions
  allow create, update, delete: if request.auth != null && 
    hasFinancePermissions(request.auth.uid, resource.data.organizationId);
}

// Helper function to check finance permissions
function hasFinancePermissions(userId, organizationId) {
  let userData = get(/databases/$(database)/documents/users/$(userId)).data;
  return userData.roles != null && 
    hasAnyRole(userData.roles, organizationId, ['owner', 'admin', 'accountant']);
}

function hasAnyRole(roles, orgId, allowedRoles) {
  return roles.hasAny([
    {'organizationId': orgId, 'role': allowedRoles}
  ]);
}
```

### 4. Publish Rules

Click "Publish" to deploy your new rules.

## Alternative: Quick Test Mode

If you want to test quickly, you can temporarily use test mode rules (NOT for production):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

⚠️ **WARNING**: Test mode allows all authenticated users to read/write everything. Only use for testing!

## After Setting Up Rules

1. Save and publish the rules
2. Try creating a product again
3. Check the browser console for detailed error logs
4. The product creation should now work!