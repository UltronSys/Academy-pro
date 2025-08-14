# Algolia Setup Guide

## 🚀 Quick Start

### 1. Create Algolia Account
1. Go to [Algolia](https://www.algolia.com) and sign up for a free account
2. Create a new application (choose the free plan to start)
3. Select your preferred region (choose closest to your users)

### 2. Get Your API Keys
1. In your Algolia dashboard, go to **Settings → API Keys**
2. Copy these keys:
   - **Application ID**: Your app identifier
   - **Search-Only API Key**: Safe for frontend use
   - **Admin API Key**: Keep this secret! (Only for backend/initial sync)

### 3. Configure Environment Variables
Create a `.env.local` file in your project root:

```bash
# Algolia Configuration
REACT_APP_ALGOLIA_APP_ID=your_app_id_here
REACT_APP_ALGOLIA_SEARCH_KEY=your_search_key_here
# Don't add admin key to frontend!
```

### 4. Create Index in Algolia Dashboard
1. Go to **Indices** in your Algolia dashboard
2. Create a new index called `users`
3. Configure these settings:

#### Searchable Attributes
```
- name
- email  
- phone
- _searchableText
```

#### Attributes for Faceting
```
- filterOnly(organizationId)
- searchable(roles)
- filterOnly(academies)
- filterOnly(status)
```

#### Custom Ranking
```
- desc(createdAt)
```

### 5. Initial Data Sync

After configuring Algolia, sync your existing users:

#### Option A: From Browser Console
1. Open your app in the browser
2. Open Developer Console (F12)
3. Run:
```javascript
// Sync all users
syncUsersToAlgolia()

// Or sync specific organization
syncUsersToAlgolia('your-org-id')
```

#### Option B: Create Sync Button (Admin Only)
Add this to your Settings component:

```typescript
{isAdmin && (
  <Button onClick={async () => {
    const { syncAllUsersToAlgolia } = await import('../utils/syncUsersToAlgolia');
    await syncAllUsersToAlgolia(organizationId);
  }}>
    Sync Users to Algolia
  </Button>
)}
```

## 📊 Features Now Available

### 1. **Instant Search**
- Search-as-you-type with sub-50ms results
- Typo tolerance built-in
- Searches across name, email, phone

### 2. **Smart Filtering**
- Filter by role (player, coach, guardian, admin)
- Filter by academy
- Filter by status (active, inactive, etc.)

### 3. **Performance Benefits**
- Only loads 10 users at a time (not all users)
- Reduces Firestore reads by 90%+
- Better mobile performance

### 4. **Automatic Sync**
- New users automatically added to Algolia
- Updates sync in real-time
- Deletions remove from search index

## 🔍 How It Works

### When Algolia IS Configured:
```
User types "john" → Algolia API → 10 results in 30ms
```

### When Algolia IS NOT Configured:
```
Page loads → Firestore → ALL users → Filter client-side
```

## 💰 Cost Analysis

### Firestore Only (Current)
- 1000 users × 10 page loads/day = 10,000 reads/day
- Monthly: ~300,000 reads = ~$0.90/month
- **Problem**: Costs increase with user count

### With Algolia
- Free tier: 10,000 searches/month
- After free tier: $0.50 per 1,000 searches
- **Benefit**: Predictable costs regardless of user count

## 🎯 Best Practices

### 1. **Index Only What You Search**
Don't index sensitive data like passwords or payment info

### 2. **Use Proper Filters**
Always filter by organizationId to ensure data isolation

### 3. **Monitor Usage**
Check Algolia dashboard for search analytics and performance

### 4. **Set Up Replicas** (Advanced)
Create sorted replicas for different sort orders:
- `users_name_asc` - Sort by name A-Z
- `users_date_desc` - Sort by newest first

## 🔧 Troubleshooting

### Search Not Working?
1. Check browser console for errors
2. Verify API keys are set correctly
3. Ensure index exists in Algolia dashboard
4. Check if initial sync was completed

### Data Not Syncing?
1. Check Algolia service logs in console
2. Verify Admin API key (for initial sync only)
3. Check Firestore rules allow read access

### Fallback to Firestore
If Algolia fails, the app automatically falls back to Firestore search

## 📈 Monitoring

### Algolia Dashboard Shows:
- Number of searches
- Popular search terms
- Search performance metrics
- Index size and record count

### In Your App:
- Look for "⚡ Algolia Search" indicator
- Check console logs for sync status
- Monitor search response times

## 🔒 Security Notes

1. **Never expose Admin API Key** in frontend code
2. **Always use Search-Only Key** in React app
3. **Filter by organizationId** to prevent data leaks
4. **Set up security rules** in Algolia dashboard

## 🚦 Status Indicators

When Algolia is working, you'll see:
- ⚡ Algolia Search badge in search results
- Lightning-fast search results
- Search-as-you-type functionality

When using Firestore fallback:
- No Algolia badge
- Slower initial load
- Client-side filtering

## Need Help?

1. Check [Algolia Docs](https://www.algolia.com/doc/)
2. Review error messages in browser console
3. Verify environment variables are loaded
4. Ensure Algolia dashboard shows your index

Your Algolia integration is now complete! 🎉