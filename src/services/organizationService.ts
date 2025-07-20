import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';
import { Organization } from '../types';
import { addRoleToUser } from './userService';
import { initializeDefaultRolePermissions } from './permissionService';

export const createOrganization = async (
  orgData: Omit<Organization, 'id' | 'createdAt' | 'updatedAt'>, 
  ownerId: string,
  imageFile?: File
): Promise<Organization> => {
  try {
    const orgRef = doc(collection(db, 'organizations'));
    let imageUrl = '';
    
    if (imageFile) {
      const imageRef = ref(storage, `organizations/${orgRef.id}/logo`);
      await uploadBytes(imageRef, imageFile);
      imageUrl = await getDownloadURL(imageRef);
    }
    
    const organizationData = {
      ...orgData,
      id: orgRef.id,
      imageUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    await setDoc(orgRef, organizationData);
    
    // Add owner role to user
    await addRoleToUser(ownerId, {
      organizationId: orgRef.id,
      academyId: [],
      role: ['owner']
    });
    
    // Initialize default role permissions for the organization
    await initializeDefaultRolePermissions(orgRef.id);
    
    return { ...organizationData, id: orgRef.id } as Organization;
  } catch (error) {
    console.error('Error creating organization:', error);
    throw error;
  }
};

// Create organization without assigning user roles (for signup flow)
export const createOrganizationOnly = async (
  orgData: Omit<Organization, 'id' | 'createdAt' | 'updatedAt'>,
  imageFile?: File
): Promise<Organization> => {
  try {
    const orgRef = doc(collection(db, 'organizations'));
    let imageUrl = '';
    
    if (imageFile) {
      const imageRef = ref(storage, `organizations/${orgRef.id}/logo`);
      await uploadBytes(imageRef, imageFile);
      imageUrl = await getDownloadURL(imageRef);
    }
    
    const organizationData = {
      ...orgData,
      id: orgRef.id,
      imageUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    await setDoc(orgRef, organizationData);
    
    return { ...organizationData, id: orgRef.id } as Organization;
  } catch (error) {
    console.error('Error creating organization:', error);
    throw error;
  }
};

export const getOrganization = async (orgId: string): Promise<Organization | null> => {
  try {
    const orgRef = doc(db, 'organizations', orgId);
    const orgSnap = await getDoc(orgRef);
    
    if (orgSnap.exists()) {
      return { id: orgSnap.id, ...orgSnap.data() } as Organization;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error getting organization:', error);
    throw error;
  }
};

export const getOrganizationById = async (orgId: string): Promise<Organization | null> => {
  return getOrganization(orgId);
};

export const updateOrganization = async (
  orgId: string, 
  data: Partial<Organization>,
  imageFile?: File
) => {
  try {
    let updateData = { ...data };
    
    if (imageFile) {
      const imageRef = ref(storage, `organizations/${orgId}/logo`);
      await uploadBytes(imageRef, imageFile);
      updateData.imageUrl = await getDownloadURL(imageRef);
    }
    
    const orgRef = doc(db, 'organizations', orgId);
    await updateDoc(orgRef, {
      ...updateData,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating organization:', error);
    throw error;
  }
};

export const deleteOrganization = async (orgId: string) => {
  try {
    // Delete organization image from storage
    try {
      const imageRef = ref(storage, `organizations/${orgId}/logo`);
      await deleteObject(imageRef);
    } catch (error) {
      // Image might not exist, continue with deletion
      console.log('No organization image to delete');
    }
    
    const orgRef = doc(db, 'organizations', orgId);
    await deleteDoc(orgRef);
  } catch (error) {
    console.error('Error deleting organization:', error);
    throw error;
  }
};