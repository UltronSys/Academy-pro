import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  arrayUnion,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { User, UserRole } from '../types';
import { calculateUserBalanceFromReceipts, calculateUserOutstandingBalance } from './receiptService';
import { syncUserToAlgolia, deleteUserFromAlgolia, isAlgoliaConfigured } from './algoliaService';

export const createUser = async (userData: Omit<User, 'createdAt' | 'updatedAt'>) => {
  try {
    const userRef = doc(db, 'users', userData.id);
    const timestamp = new Date();
    const userWithTimestamps = {
      ...userData,
      name: userData.name?.trim() || '', // Trim whitespace from name
      balance: 0, // Initialize balance to 0
      outstandingBalance: {}, // Initialize outstanding balance per organization
      availableCredits: {}, // Initialize available credits per organization
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    await setDoc(userRef, userWithTimestamps);
    
    // Sync to Algolia if configured
    if (isAlgoliaConfigured()) {
      try {
        const fullUser: User = {
          ...userData,
          createdAt: { toDate: () => timestamp } as any,
          updatedAt: { toDate: () => timestamp } as any
        };
        await syncUserToAlgolia(fullUser);
        console.log('✅ User synced to Algolia');
      } catch (algoliaError) {
        console.error('Warning: Failed to sync user to Algolia:', algoliaError);
        // Don't fail the user creation if Algolia sync fails
      }
    }
    
    return userData;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
};

export const getUserById = async (userId: string): Promise<User | null> => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const userData = { id: userSnap.id, ...userSnap.data() } as User;
      return userData;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error getting user:', error);
    throw error;
  }
};

export const updateUser = async (userId: string, data: Partial<User>) => {
  try {
    // Trim name if it's being updated
    const processedData = {
      ...data,
      ...(data.name !== undefined && { name: data.name.trim() })
    };
    console.log('updateUser: Updating user', userId, 'with data:', processedData);
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      ...processedData,
      updatedAt: serverTimestamp()
    });
    console.log('updateUser: User updated successfully');
    
    // Sync to Algolia if configured
    if (isAlgoliaConfigured()) {
      try {
        // Get the full updated user data
        const updatedUser = await getUserById(userId);
        if (updatedUser) {
          await syncUserToAlgolia(updatedUser);
          console.log('✅ User updates synced to Algolia');
        }
      } catch (algoliaError) {
        console.error('Warning: Failed to sync user updates to Algolia:', algoliaError);
        // Don't fail the update if Algolia sync fails
      }
    }
    
    // Wait a bit for Firestore to propagate the changes
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
};

export const deleteUser = async (userId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    await deleteDoc(userRef);
    
    // Remove from Algolia if configured
    if (isAlgoliaConfigured()) {
      try {
        await deleteUserFromAlgolia(userId);
        console.log('✅ User removed from Algolia');
      } catch (algoliaError) {
        console.error('Warning: Failed to remove user from Algolia:', algoliaError);
        // Don't fail the deletion if Algolia sync fails
      }
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
};

export const addRoleToUser = async (userId: string, roleInfo: UserRole) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      roles: arrayUnion(roleInfo),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error adding role to user:', error);
    throw error;
  }
};

export const removeRoleFromUser = async (userId: string, organizationId: string) => {
  try {
    const user = await getUserById(userId);
    if (!user) throw new Error('User not found');
    
    const updatedRoles = user.roles.filter(role => role.organizationId !== organizationId);
    
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      roles: updatedRoles,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error removing role from user:', error);
    throw error;
  }
};

export const getAllUsers = async (): Promise<User[]> => {
  try {
    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersRef);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as User[];
  } catch (error) {
    console.error('Error getting all users:', error);
    throw error;
  }
};

export const getUsersByOrganization = async (organizationId: string): Promise<User[]> => {
  try {
    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersRef);
    
    const users = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as User[];
    
    
    // Filter users who have roles in this organization
    const filteredUsers = users.filter(user => 
      user.roles && user.roles.some(role => role.organizationId === organizationId)
    );
    
    
    return filteredUsers;
  } catch (error) {
    console.error('Error getting users by organization:', error);
    throw error;
  }
};

export const getUsersByAcademy = async (organizationId: string, academyId: string): Promise<User[]> => {
  try {
    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersRef);
    
    const users = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as User[];
    
    return users.filter(user => 
      user.roles.some(role => 
        role.organizationId === organizationId && 
        (role.academyId.includes(academyId) || role.academyId.length === 0)
      )
    );
  } catch (error) {
    console.error('Error getting users by academy:', error);
    throw error;
  }
};

export const hasRole = (user: User, role: string, organizationId: string, academyId?: string): boolean => {
  return user.roles.some(userRole => 
    userRole.organizationId === organizationId &&
    userRole.role.includes(role) &&
    (!academyId || userRole.academyId.includes(academyId) || userRole.academyId.length === 0)
  );
};

export const hasOrgWideRole = (user: User, role: string, organizationId: string): boolean => {
  return user.roles.some(userRole => 
    userRole.organizationId === organizationId &&
    userRole.role.includes(role) &&
    userRole.academyId.length === 0
  );
};

// Update user balance in the user document
export const updateUserBalance = async (userId: string, balance: number): Promise<void> => {
  try {
    console.log(`💰 updateUserBalance: Updating balance for user ${userId} to ${balance}`);
    
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      balance,
      updatedAt: serverTimestamp()
    });
    
    console.log(`✅ updateUserBalance: Balance updated successfully for user ${userId}`);
  } catch (error) {
    console.error('❌ Error updating user balance:', error);
    throw error;
  }
};

// Calculate and update user balance from receipts
export const recalculateAndUpdateUserBalance = async (userId: string, organizationId?: string): Promise<number> => {
  try {
    console.log(`🔄 recalculateAndUpdateUserBalance: Starting for user ${userId}`);
    
    // Calculate balance from receipts
    const calculatedBalance = await calculateUserBalanceFromReceipts(userId, organizationId);
    
    console.log(`📊 recalculateAndUpdateUserBalance: Calculated balance: ${calculatedBalance}`);
    
    // Update the user document with the calculated balance
    await updateUserBalance(userId, calculatedBalance);
    
    return calculatedBalance;
  } catch (error) {
    console.error('❌ Error recalculating and updating user balance:', error);
    throw error;
  }
};

// Get user balance (from user document, not calculated)
export const getUserStoredBalance = async (userId: string): Promise<number> => {
  try {
    const user = await getUserById(userId);
    return user?.balance || 0;
  } catch (error) {
    console.error('❌ Error getting user stored balance:', error);
    throw error;
  }
};

// Update user outstanding balance and available credits for specific organization
export const updateUserOutstandingAndCredits = async (userId: string, organizationId: string, outstandingDebits: number, availableCredits: number): Promise<void> => {
  try {
    console.log(`💰 updateUserOutstandingAndCredits: Updating for user ${userId}, org ${organizationId}`);
    console.log(`📊 Outstanding: ${outstandingDebits}, Credits: ${availableCredits}`);
    
    const userRef = doc(db, 'users', userId);
    const user = await getUserById(userId);
    
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    
    // Update the organization-specific outstanding balance and available credits
    const updatedOutstandingBalance = {
      ...user.outstandingBalance,
      [organizationId]: outstandingDebits
    };
    
    const updatedAvailableCredits = {
      ...user.availableCredits,
      [organizationId]: availableCredits
    };
    
    await updateDoc(userRef, {
      outstandingBalance: updatedOutstandingBalance,
      availableCredits: updatedAvailableCredits,
      updatedAt: serverTimestamp()
    });
    
    console.log(`✅ updateUserOutstandingAndCredits: Updated successfully for user ${userId}`);
  } catch (error) {
    console.error('❌ Error updating user outstanding balance and credits:', error);
    throw error;
  }
};

// Calculate and update user outstanding balance and available credits from receipts
export const recalculateAndUpdateUserOutstandingAndCredits = async (userId: string, organizationId: string): Promise<{outstandingDebits: number, availableCredits: number}> => {
  try {
    console.log(`🔄 recalculateAndUpdateUserOutstandingAndCredits: Starting for user ${userId}, org ${organizationId}`);
    
    // Calculate outstanding balance and available credits from receipts
    const balanceInfo = await calculateUserOutstandingBalance(userId, organizationId);
    
    console.log(`📊 recalculateAndUpdateUserOutstandingAndCredits: Calculated - Outstanding: ${balanceInfo.outstandingDebits}, Credits: ${balanceInfo.availableCredits}`);
    
    // Update the user document with the calculated values
    await updateUserOutstandingAndCredits(userId, organizationId, balanceInfo.outstandingDebits, balanceInfo.availableCredits);
    
    return {
      outstandingDebits: balanceInfo.outstandingDebits,
      availableCredits: balanceInfo.availableCredits
    };
  } catch (error) {
    console.error('❌ Error recalculating and updating user outstanding balance and credits:', error);
    throw error;
  }
};

// Get user outstanding balance and available credits for organization (from user document)
export const getUserStoredOutstandingAndCredits = async (userId: string, organizationId: string): Promise<{outstandingDebits: number, availableCredits: number}> => {
  try {
    const user = await getUserById(userId);
    return {
      outstandingDebits: user?.outstandingBalance?.[organizationId] || 0,
      availableCredits: user?.availableCredits?.[organizationId] || 0
    };
  } catch (error) {
    console.error('❌ Error getting user stored outstanding balance and credits:', error);
    return { outstandingDebits: 0, availableCredits: 0 };
  }
};

// Bulk update balances for all users in an organization
export const recalculateAllUserBalances = async (organizationId: string): Promise<void> => {
  try {
    console.log(`🔄 recalculateAllUserBalances: Starting for organization ${organizationId}`);
    
    const users = await getUsersByOrganization(organizationId);
    console.log(`👥 recalculateAllUserBalances: Found ${users.length} users to update`);
    
    const updatePromises = users.map(async user => {
      try {
        // Update regular balance
        await recalculateAndUpdateUserBalance(user.id, organizationId);
        // Update outstanding balance and available credits
        await recalculateAndUpdateUserOutstandingAndCredits(user.id, organizationId);
        return true;
      } catch (error) {
        console.error(`❌ Failed to update balances for user ${user.id}:`, error);
        return false;
      }
    });
    
    const results = await Promise.all(updatePromises);
    const successCount = results.filter(success => success).length;
    
    console.log(`✅ recalculateAllUserBalances: Updated ${successCount}/${users.length} user balances`);
  } catch (error) {
    console.error('❌ Error recalculating all user balances:', error);
    throw error;
  }
};