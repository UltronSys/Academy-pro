import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  getAuth
} from 'firebase/auth';
import { auth, adminAuth } from '../firebase';
import { createUser } from './userService';
import { getFunctions, httpsCallable } from 'firebase/functions';

export const signUp = async (email: string, password: string, name: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Update the user's profile with their name
    await updateProfile(user, { displayName: name });
    
    // Create user document in Firestore
    await createUser({
      id: user.uid,
      email: user.email!,
      name,
      roles: []
    });
    
    return userCredential;
  } catch (error) {
    console.error('Error signing up:', error);
    throw error;
  }
};

export const signIn = async (email: string, password: string) => {
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error('Error signing in:', error);
    throw error;
  }
};

export const signOutUser = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

export const resetPassword = async (email: string) => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

export const updateUserProfile = async (data: { displayName?: string; photoURL?: string }) => {
  try {
    if (auth.currentUser) {
      await updateProfile(auth.currentUser, data);
    }
  } catch (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
};

// Admin function to create a user without logging out the current admin
// Uses a secondary Firebase app instance to avoid affecting the main auth state
export const createUserAsAdmin = async (email: string, password: string, name: string) => {
  try {
    // Create the new user using the secondary auth instance
    // This won't affect the main auth state, so the admin stays logged in
    const userCredential = await createUserWithEmailAndPassword(adminAuth, email, password);
    const newUser = userCredential.user;
    
    // Update the new user's profile
    await updateProfile(newUser, { displayName: name });
    
    // Create user document in Firestore
    await createUser({
      id: newUser.uid,
      email: newUser.email!,
      name,
      roles: []
    });
    
    // Sign out the user from the admin auth instance (doesn't affect main auth)
    await signOut(adminAuth);
    
    // Return the new user's information
    return { uid: newUser.uid, email: newUser.email };
  } catch (error) {
    console.error('Error creating user as admin:', error);
    throw error;
  }
};