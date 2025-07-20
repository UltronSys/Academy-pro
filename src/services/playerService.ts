import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Player } from '../types';

const COLLECTION_NAME = 'players';

export const createPlayer = async (playerData: Omit<Player, 'createdAt' | 'updatedAt'>): Promise<Player> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, playerData.id);
    const player: Player = {
      ...playerData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    await setDoc(docRef, player);
    return player;
  } catch (error) {
    console.error('Error creating player:', error);
    throw error;
  }
};

export const getPlayerById = async (playerId: string): Promise<Player | null> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, playerId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as Player;
    }
    return null;
  } catch (error) {
    console.error('Error getting player:', error);
    throw error;
  }
};

export const getPlayerByUserId = async (userId: string): Promise<Player | null> => {
  try {
    const q = query(collection(db, COLLECTION_NAME), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].data() as Player;
    }
    return null;
  } catch (error) {
    console.error('Error getting player by user ID:', error);
    throw error;
  }
};

export const getPlayersByGuardianId = async (guardianId: string): Promise<Player[]> => {
  try {
    const q = query(collection(db, COLLECTION_NAME), where('guardianId', 'array-contains', guardianId));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => doc.data() as Player);
  } catch (error) {
    console.error('Error getting players by guardian ID:', error);
    throw error;
  }
};

export const getPlayersByOrganization = async (organizationId: string): Promise<Player[]> => {
  try {
    const q = query(collection(db, COLLECTION_NAME), where('organizationId', '==', organizationId));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => doc.data() as Player);
  } catch (error) {
    console.error('Error getting players by organization:', error);
    throw error;
  }
};

export const getPlayersByAcademy = async (academyId: string): Promise<Player[]> => {
  try {
    const q = query(collection(db, COLLECTION_NAME), where('academyId', 'array-contains', academyId));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => doc.data() as Player);
  } catch (error) {
    console.error('Error getting players by academy:', error);
    throw error;
  }
};

export const updatePlayer = async (playerId: string, updates: Partial<Player>): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, playerId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error updating player:', error);
    throw error;
  }
};

export const deletePlayer = async (playerId: string): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, playerId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting player:', error);
    throw error;
  }
};