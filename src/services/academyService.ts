import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';
import { Academy } from '../types';

export const createAcademy = async (
  organizationId: string,
  academyData: Omit<Academy, 'id' | 'createdAt' | 'updatedAt'>,
  imageFile?: File
): Promise<Academy> => {
  try {
    console.log('createAcademy: Creating academy for org', organizationId, 'with data:', academyData);
    const academyRef = doc(collection(db, 'organizations', organizationId, 'academies'));
    let imageUrl = '';
    
    if (imageFile) {
      const imageRef = ref(storage, `organizations/${organizationId}/academies/${academyRef.id}/logo`);
      await uploadBytes(imageRef, imageFile);
      imageUrl = await getDownloadURL(imageRef);
    }
    
    const academyDataWithId = {
      ...academyData,
      id: academyRef.id,
      imageUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    console.log('createAcademy: Setting academy document at path:', `organizations/${organizationId}/academies/${academyRef.id}`);
    await setDoc(academyRef, academyDataWithId);
    console.log('createAcademy: Academy created successfully with ID:', academyRef.id);
    
    // Wait a bit for Firestore to propagate
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return { ...academyDataWithId, id: academyRef.id } as Academy;
  } catch (error) {
    console.error('Error creating academy:', error);
    throw error;
  }
};

export const getAcademy = async (organizationId: string, academyId: string): Promise<Academy | null> => {
  try {
    const academyRef = doc(db, 'organizations', organizationId, 'academies', academyId);
    const academySnap = await getDoc(academyRef);
    
    if (academySnap.exists()) {
      return { id: academySnap.id, ...academySnap.data() } as Academy;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error getting academy:', error);
    throw error;
  }
};

export const getAcademiesByOrganization = async (organizationId: string): Promise<Academy[]> => {
  try {
    const academiesRef = collection(db, 'organizations', organizationId, 'academies');
    
    const querySnapshot = await getDocs(academiesRef);
    
    const academies = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Academy[];
    
    return academies;
  } catch (error) {
    console.error('Error getting academies by organization:', error);
    throw error;
  }
};

export const updateAcademy = async (
  organizationId: string,
  academyId: string,
  data: Partial<Academy>,
  imageFile?: File
) => {
  try {
    let updateData = { ...data };
    
    if (imageFile) {
      const imageRef = ref(storage, `organizations/${organizationId}/academies/${academyId}/logo`);
      await uploadBytes(imageRef, imageFile);
      updateData.imageUrl = await getDownloadURL(imageRef);
    }
    
    const academyRef = doc(db, 'organizations', organizationId, 'academies', academyId);
    await updateDoc(academyRef, {
      ...updateData,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating academy:', error);
    throw error;
  }
};

export const deleteAcademy = async (organizationId: string, academyId: string) => {
  try {
    // Delete academy image from storage
    try {
      const imageRef = ref(storage, `organizations/${organizationId}/academies/${academyId}/logo`);
      await deleteObject(imageRef);
    } catch (error) {
      // Image might not exist, continue with deletion
      console.log('No academy image to delete');
    }
    
    const academyRef = doc(db, 'organizations', organizationId, 'academies', academyId);
    await deleteDoc(academyRef);
  } catch (error) {
    console.error('Error deleting academy:', error);
    throw error;
  }
};

export const getAcademyStats = async (_organizationId: string, _academyId: string) => {
  try {
    // This would need to be implemented based on your analytics requirements
    // For now, returning placeholder data
    return {
      totalPlayers: 0,
      totalCoaches: 0,
      totalGuardians: 0,
      recentActivities: []
    };
    // eslint-disable-next-line no-unreachable
  } catch (error) {
    console.error('Error getting academy stats:', error);
    throw error;
  }
};