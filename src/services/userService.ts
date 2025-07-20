import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  getDocs,
  arrayUnion,
  arrayRemove,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { User, UserRole } from '../types';

export const createUser = async (userData: Omit<User, 'createdAt' | 'updatedAt'>) => {
  try {
    const userRef = doc(db, 'users', userData.id);
    await setDoc(userRef, {
      ...userData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return userData;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
};

export const getUserById = async (userId: string): Promise<User | null> => {
  try {
    console.log('getUserById: Fetching user with ID:', userId);
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const userData = { id: userSnap.id, ...userSnap.data() } as User;
      console.log('getUserById: Found user data:', userData);
      console.log('getUserById: User roles:', userData.roles);
      return userData;
    } else {
      console.log('getUserById: User document does not exist');
      return null;
    }
  } catch (error) {
    console.error('Error getting user:', error);
    throw error;
  }
};

export const updateUser = async (userId: string, data: Partial<User>) => {
  try {
    console.log('updateUser: Updating user', userId, 'with data:', data);
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      ...data,
      updatedAt: serverTimestamp()
    });
    console.log('updateUser: User updated successfully');
    
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
    console.log('getUsersByOrganization: Fetching users for organizationId:', organizationId);
    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersRef);
    
    const users = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as User[];
    
    console.log('getUsersByOrganization: All users found:', users.length);
    console.log('getUsersByOrganization: User data sample:', users.map(u => ({ id: u.id, name: u.name, roles: u.roles })));
    
    // Filter users who have roles in this organization
    const filteredUsers = users.filter(user => 
      user.roles && user.roles.some(role => role.organizationId === organizationId)
    );
    
    console.log('getUsersByOrganization: Filtered users for org:', filteredUsers.length);
    console.log('getUsersByOrganization: Filtered users:', filteredUsers.map(u => ({ id: u.id, name: u.name, roles: u.roles })));
    
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