import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyA5E5MMTHVl5i4C-CaYL42lhwtzk-D7BHw",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "academypro-dev.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "academypro-dev",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "academypro-dev.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "778451716357",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:778451716357:web:16c78dc0cde05f09f20f6c",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-X93KR7ELBF"
};

const app = initializeApp(firebaseConfig);

// Secondary app for admin operations (creating users without affecting main auth)
const adminApp = initializeApp(firebaseConfig, 'admin');

export const auth = getAuth(app);
export const adminAuth = getAuth(adminApp);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;