import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { User } from '../types';
import { getUserById } from '../services/userService';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userData: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<any>;
  signup: (email: string, password: string, name: string) => Promise<any>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const login = async (email: string, password: string) => {
    const { signIn } = await import('../services/authService');
    return signIn(email, password);
  };

  const signup = async (email: string, password: string, name: string) => {
    const { signUp } = await import('../services/authService');
    return signUp(email, password, name);
  };

  const logout = async () => {
    const { signOutUser } = await import('../services/authService');
    return signOutUser();
  };

  const resetPassword = async (email: string) => {
    const { resetPassword: resetPass } = await import('../services/authService');
    return resetPass(email);
  };

  const refreshUserData = async () => {
    if (currentUser) {
      try {
        console.log('AuthContext: Refreshing user data for user:', currentUser.uid);
        const userDoc = await getUserById(currentUser.uid);
        console.log('AuthContext: Fetched user data:', userDoc);
        console.log('AuthContext: User roles:', userDoc?.roles);
        setUserData(userDoc);
        console.log('AuthContext: User data set in context');
      } catch (error) {
        console.error('Error refreshing user data:', error);
        setUserData(null);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDoc = await getUserById(user.uid);
          setUserData(userDoc);
        } catch (error) {
          console.error('Error fetching user data:', error);
          setUserData(null);
        }
      } else {
        setUserData(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userData,
    loading,
    login,
    signup,
    logout,
    resetPassword,
    refreshUserData,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};