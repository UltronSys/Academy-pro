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
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { Player, Product } from '../types';
import { createDebitReceipt } from './receiptService';

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

// Create a player and optionally assign a product with automatic receipt generation
export const createPlayerWithProduct = async (
  playerData: Omit<Player, 'createdAt' | 'updatedAt'>,
  product?: Product
): Promise<Player> => {
  try {
    // First create the player
    const player = await createPlayer(playerData);
    
    // If a product is provided, assign it and create a debit receipt
    if (product) {
      console.log('Creating player with product assignment:', { playerId: player.id, productId: product.id });
      
      // Assign the product and create debit receipt
      await assignProductToPlayer(
        player.id,
        product,
        player.organizationId,
        player.academyId[0] // Use first academy if multiple
      );
      
      console.log('Player created with product assignment and receipt generated');
    }
    
    return player;
  } catch (error) {
    console.error('Error creating player with product:', error);
    // If product assignment fails, we still want to keep the player
    // The admin can manually assign products later
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
    console.log('🔎 getPlayersByGuardianId: Searching for players with guardianId containing:', guardianId);
    const q = query(collection(db, COLLECTION_NAME), where('guardianId', 'array-contains', guardianId));
    const querySnapshot = await getDocs(q);
    
    const players = querySnapshot.docs.map(doc => {
      const playerData = doc.data() as Player;
      console.log('🎯 Found player:', playerData.userId, 'with guardianIds:', playerData.guardianId);
      return playerData;
    });
    
    console.log('📊 getPlayersByGuardianId result:', players.length, 'players found');
    return players;
  } catch (error) {
    console.error('❌ Error getting players by guardian ID:', error);
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

// Assign a product to a player and create a debit receipt
export const assignProductToPlayer = async (
  playerId: string,
  product: Product,
  organizationId: string,
  academyId?: string,
  invoiceDate?: Date,
  deadlineDate?: Date,
  invoiceGeneration?: 'immediate' | 'scheduled'
): Promise<void> => {
  try {
    console.log('🎯 assignProductToPlayer: Starting with:', { 
      playerId, 
      productId: product.id, 
      organizationId, 
      academyId 
    });
    
    const batch = writeBatch(db);
    
    // Get current player data
    const playerRef = doc(db, COLLECTION_NAME, playerId);
    console.log('🔍 assignProductToPlayer: Getting player document:', playerRef.path);
    
    const playerSnap = await getDoc(playerRef);
    
    if (!playerSnap.exists()) {
      console.error('❌ assignProductToPlayer: Player document not found:', playerId);
      throw new Error('Player not found');
    }
    
    const player = playerSnap.data() as Player;
    console.log('✅ assignProductToPlayer: Player document found:', { 
      playerId: player.id, 
      userId: player.userId,
      organizationId: player.organizationId
    });
    
    // Check if product is already assigned
    const existingAssignment = player.assignedProducts?.find(p => p.productId === product.id);
    if (existingAssignment && existingAssignment.status === 'active') {
      console.log('⚠️ assignProductToPlayer: Product already assigned to this player, skipping');
      throw new Error(`Product "${product.name}" is already assigned to this player`);
    }
    
    // Use provided dates or set defaults
    const now = new Date();
    const finalInvoiceDate = invoiceDate || now;
    const finalDeadlineDate = deadlineDate || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Default 30 days
    const finalInvoiceGeneration = invoiceGeneration || 'immediate';
    
    // Add product to player's assigned products
    const assignedProduct = {
      productId: product.id,
      productName: product.name,
      price: product.price,
      assignedDate: Timestamp.now(),
      status: 'active' as const,
      invoiceDate: Timestamp.fromDate(finalInvoiceDate),
      deadlineDate: Timestamp.fromDate(finalDeadlineDate),
      receiptStatus: finalInvoiceGeneration === 'immediate' ? 'immediate' as const : 'scheduled' as const
    };
    
    const updatedAssignedProducts = player.assignedProducts ? 
      [...player.assignedProducts.filter(p => p.productId !== product.id), assignedProduct] :
      [assignedProduct];
    
    console.log('📋 assignProductToPlayer: Updated assigned products:', updatedAssignedProducts);
    
    // Update player document
    batch.update(playerRef, {
      assignedProducts: updatedAssignedProducts,
      updatedAt: Timestamp.now()
    });
    
    // Get user reference for the receipt
    const userRef = doc(db, 'users', player.userId);
    const productRef = doc(db, 'products', product.id);
    
    console.log('📋 assignProductToPlayer: References created:', {
      userRefPath: userRef.path,
      productRefPath: productRef.path
    });
    
    // Create debit receipt outside of batch (it has its own batch operations)
    console.log('💾 assignProductToPlayer: Committing player update batch...');
    await batch.commit();
    console.log('✅ assignProductToPlayer: Player update batch committed');
    
    // Create debit receipt based on invoice generation preference
    if (finalInvoiceGeneration === 'immediate') {
      // Create receipt immediately
      console.log('🧾 assignProductToPlayer: Creating immediate debit receipt...');
      
      try {
        const receipt = await createDebitReceipt(
          userRef,
          productRef,
          {
            name: product.name,
            price: product.price,
            invoiceDate: finalInvoiceDate,
            deadline: finalDeadlineDate
          },
          organizationId,
          academyId
        );
        
        console.log('🎉 assignProductToPlayer: Receipt created immediately:', receipt.id);
        console.log('📍 assignProductToPlayer: Receipt location: users/' + player.userId + '/receipts/' + receipt.id);
      } catch (receiptError: any) {
        console.error('❌ assignProductToPlayer: Failed to create debit receipt:', receiptError);
        throw new Error(`Failed to create receipt: ${receiptError?.message || receiptError}`);
      }
    } else if (finalInvoiceGeneration === 'scheduled') {
      // Schedule receipt creation based on product type
      if (product.productType === 'one-time') {
        // For one-time products, schedule on invoice date
        console.log('📅 assignProductToPlayer: One-time product - receipt will be created on invoice date:', finalInvoiceDate.toLocaleDateString());
      } else if (product.productType === 'recurring') {
        // For recurring products, schedule receipt generation for end of period
        console.log('📅 assignProductToPlayer: Scheduling debit receipt for recurring product at end of period...');
        console.log('📅 Product recurring duration:', product.recurringDuration);
        
        // Calculate the end of the current subscription period
        const now = new Date();
        let receiptDueDate: Date;
        
        if (product.recurringDuration) {
          switch (product.recurringDuration.unit) {
            case 'days':
              receiptDueDate = new Date(now.getTime() + (product.recurringDuration.value * 24 * 60 * 60 * 1000));
              break;
            case 'weeks':
              receiptDueDate = new Date(now.getTime() + (product.recurringDuration.value * 7 * 24 * 60 * 60 * 1000));
              break;
            case 'months':
              receiptDueDate = new Date(now);
              receiptDueDate.setMonth(now.getMonth() + product.recurringDuration.value);
              break;
            case 'years':
              receiptDueDate = new Date(now);
              receiptDueDate.setFullYear(now.getFullYear() + product.recurringDuration.value);
              break;
            default:
              // Default to 1 month if unit is not recognized
              receiptDueDate = new Date(now);
              receiptDueDate.setMonth(now.getMonth() + 1);
          }
        } else {
          // Default to 1 month if no duration specified
          receiptDueDate = new Date(now);
          receiptDueDate.setMonth(now.getMonth() + 1);
        }
        
        console.log(`📅 Recurring product receipt will be generated on: ${receiptDueDate.toLocaleDateString()}`);
        
        // Update the assigned product with receipt schedule info
        const updatedAssignedProductsWithSchedule = updatedAssignedProducts.map(ap => 
          ap.productId === product.id ? {
            ...ap,
            nextReceiptDate: Timestamp.fromDate(receiptDueDate),
            receiptStatus: 'scheduled' as const
          } : ap
        );
        
        // Update player with scheduled receipt info
        await updateDoc(playerRef, {
          assignedProducts: updatedAssignedProductsWithSchedule,
          updatedAt: Timestamp.now()
        });
        
        console.log('✅ assignProductToPlayer: Recurring product assigned. Receipt scheduled for:', receiptDueDate.toLocaleDateString());
      }
    }
    
  } catch (error) {
    console.error('Error assigning product to player:', error);
    throw error;
  }
};

// Remove a product assignment from a player
export const removeProductFromPlayer = async (
  playerId: string,
  productId: string
): Promise<void> => {
  try {
    const playerRef = doc(db, COLLECTION_NAME, playerId);
    const playerSnap = await getDoc(playerRef);
    
    if (!playerSnap.exists()) {
      throw new Error('Player not found');
    }
    
    const player = playerSnap.data() as Player;
    
    if (!player.assignedProducts) {
      throw new Error('No products assigned to this player');
    }
    
    // Mark product as cancelled instead of removing it
    const updatedAssignedProducts = player.assignedProducts.map(p => 
      p.productId === productId 
        ? { ...p, status: 'cancelled' as const }
        : p
    );
    
    await updateDoc(playerRef, {
      assignedProducts: updatedAssignedProducts,
      updatedAt: Timestamp.now()
    });
    
    console.log('Product assignment cancelled for player:', playerId, 'product:', productId);
    
  } catch (error) {
    console.error('Error removing product from player:', error);
    throw error;
  }
};

// Get active products assigned to a player
export const getPlayerActiveProducts = async (playerId: string): Promise<Player['assignedProducts']> => {
  try {
    const player = await getPlayerById(playerId);
    if (!player) {
      throw new Error('Player not found');
    }
    
    return player.assignedProducts?.filter(p => p.status === 'active') || [];
  } catch (error) {
    console.error('Error getting player active products:', error);
    throw error;
  }
};