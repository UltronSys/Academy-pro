# Deploying to Vercel

## Prerequisites
1. A Vercel account (sign up at https://vercel.com)
2. Vercel CLI installed (optional): `npm i -g vercel`

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Push your code to GitHub**
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push origin main
   ```

2. **Import to Vercel**
   - Go to https://vercel.com/new
   - Import your GitHub repository
   - Vercel will auto-detect Create React App

3. **Configure Environment Variables**
   In the Vercel dashboard, add these environment variables:
   ```
   REACT_APP_FIREBASE_API_KEY=AIzaSyA5E5MMTHVl5i4C-CaYL42lhwtzk-D7BHw
   REACT_APP_FIREBASE_AUTH_DOMAIN=academypro-dev.firebaseapp.com
   REACT_APP_FIREBASE_PROJECT_ID=academypro-dev
   REACT_APP_FIREBASE_STORAGE_BUCKET=academypro-dev.firebasestorage.app
   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=778451716357
   REACT_APP_FIREBASE_APP_ID=1:778451716357:web:16c78dc0cde05f09f20f6c
   REACT_APP_FIREBASE_MEASUREMENT_ID=G-X93KR7ELBF
   ```

4. **Deploy**
   - Click "Deploy"
   - Vercel will build and deploy your app

### Option 2: Deploy via CLI

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```
   Follow the prompts to:
   - Link to existing project or create new
   - Confirm project settings
   - Deploy

4. **Set Environment Variables**
   ```bash
   vercel env add REACT_APP_FIREBASE_API_KEY
   vercel env add REACT_APP_FIREBASE_AUTH_DOMAIN
   # Add all other environment variables
   ```

## Production Considerations

### 1. Environment Variables
For production, consider creating a separate Firebase project:
- Create a new Firebase project for production
- Update environment variables in Vercel with production values
- Keep development and production data separate

### 2. Firebase Security Rules
Ensure your Firebase security rules are properly configured:
- Firestore rules
- Storage rules
- Authentication settings

### 3. Custom Domain
To add a custom domain:
1. Go to your project settings in Vercel
2. Navigate to "Domains"
3. Add your custom domain
4. Follow DNS configuration instructions

## Build Optimization

The project is already optimized for Vercel with:
- Proper routing configuration in `vercel.json`
- Static asset caching
- SPA fallback routing

## Troubleshooting

### Build Fails
- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Verify environment variables are set

### 404 Errors on Routes
- The `vercel.json` file handles SPA routing
- Ensure the rewrites configuration is present

### Environment Variables Not Working
- Variables must start with `REACT_APP_`
- Redeploy after adding/changing variables
- Check variable names match exactly

## Monitoring

After deployment:
1. Monitor build times and performance
2. Set up alerts for failed builds
3. Use Vercel Analytics (if enabled)