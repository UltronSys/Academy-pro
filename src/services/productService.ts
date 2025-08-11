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
  orderBy,
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Product } from '../types';

const COLLECTION_NAME = 'products';

export const createProduct = async (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> => {
  try {
    console.log('productService: Starting product creation with data:', productData);
    
    const productRef = doc(collection(db, COLLECTION_NAME));
    console.log('productService: Generated product ID:', productRef.id);
    
    const now = Timestamp.now();
    const product: Product = {
      ...productData,
      id: productRef.id,
      createdAt: now,
      updatedAt: now
    };
    
    console.log('productService: Final product object to save:', product);
    
    await setDoc(productRef, product);
    console.log('productService: Product saved successfully to Firestore');
    
    return product;
  } catch (error) {
    console.error('productService: Error creating product:', error);
    throw error;
  }
};

export const getProductById = async (productId: string): Promise<Product | null> => {
  try {
    const productRef = doc(db, COLLECTION_NAME, productId);
    const productSnap = await getDoc(productRef);
    
    if (productSnap.exists()) {
      return { id: productSnap.id, ...productSnap.data() } as Product;
    }
    return null;
  } catch (error) {
    console.error('Error getting product:', error);
    throw error;
  }
};

export const getProductsByOrganization = async (organizationId: string): Promise<Product[]> => {
  try {
    console.log('productService: Getting products for organization:', organizationId);
    
    // First try without orderBy in case that's causing issues
    const q = query(
      collection(db, COLLECTION_NAME), 
      where('organizationId', '==', organizationId)
    );
    const querySnapshot = await getDocs(q);
    
    console.log('productService: Found', querySnapshot.size, 'products');
    
    const products = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Product[];
    
    // Sort client-side to avoid index issues
    return products.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
  } catch (error) {
    console.error('productService: Error getting products by organization:', error);
    throw error;
  }
};

export const getProductsByAcademy = async (organizationId: string, academyId: string): Promise<Product[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME), 
      where('organizationId', '==', organizationId),
      where('academyId', '==', academyId),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Product[];
  } catch (error) {
    console.error('Error getting products by academy:', error);
    throw error;
  }
};

export const getActiveProducts = async (organizationId: string, academyId?: string): Promise<Product[]> => {
  try {
    let q;
    if (academyId) {
      q = query(
        collection(db, COLLECTION_NAME), 
        where('organizationId', '==', organizationId),
        where('academyId', '==', academyId),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc')
      );
    } else {
      q = query(
        collection(db, COLLECTION_NAME), 
        where('organizationId', '==', organizationId),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc')
      );
    }
    
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Product[];
  } catch (error) {
    console.error('Error getting active products:', error);
    throw error;
  }
};

export const updateProduct = async (productId: string, updates: Partial<Product>): Promise<void> => {
  try {
    const productRef = doc(db, COLLECTION_NAME, productId);
    await updateDoc(productRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
};

export const deleteProduct = async (productId: string): Promise<void> => {
  try {
    const productRef = doc(db, COLLECTION_NAME, productId);
    await deleteDoc(productRef);
  } catch (error) {
    console.error('Error deleting product:', error);
    throw error;
  }
};

export const toggleProductStatus = async (productId: string, isActive: boolean): Promise<void> => {
  try {
    await updateProduct(productId, { isActive });
  } catch (error) {
    console.error('Error toggling product status:', error);
    throw error;
  }
};

export const getProductsByType = async (organizationId: string, productType: 'recurring' | 'one-time'): Promise<Product[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME), 
      where('organizationId', '==', organizationId),
      where('productType', '==', productType),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Product[];
  } catch (error) {
    console.error('Error getting products by type:', error);
    throw error;
  }
};

export const linkPlayersToProduct = async (
  productId: string, 
  playerIds: string[], 
  playerNames: string[],
  invoiceDate: Date,
  deadlineDate: Date,
  invoiceGeneration: 'immediate' | 'scheduled'
): Promise<void> => {
  try {
    console.log('🚀 linkPlayersToProduct: Starting with:', { productId, playerIds, playerNames });
    
    // Get the product details first
    const product = await getProductById(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    console.log('📦 linkPlayersToProduct: Product found:', product);
    console.log('📄 linkPlayersToProduct: Currently linked players:', product.linkedPlayerIds || []);

    // Find only newly added players (not already linked)
    const currentlyLinkedIds = product.linkedPlayerIds || [];
    const newPlayerIds: string[] = [];
    const newPlayerNames: string[] = [];
    
    playerIds.forEach((playerId, index) => {
      if (!currentlyLinkedIds.includes(playerId)) {
        newPlayerIds.push(playerId);
        newPlayerNames.push(playerNames[index]);
      }
    });
    
    console.log('🎆 linkPlayersToProduct: New players to process:', { newPlayerIds, newPlayerNames });
    
    // Update product document with all linked players (existing + new)
    await updateProduct(productId, {
      linkedPlayerIds: playerIds,
      linkedPlayerNames: playerNames
    });

    console.log('✅ Product updated with linked players. Now creating receipts for NEW players only...');

    if (newPlayerIds.length === 0) {
      console.log('📝 linkPlayersToProduct: No new players to process, all selected players already linked');
      return;
    }

    // Import the player service function for creating receipts
    const { assignProductToPlayer, getPlayerById } = await import('./playerService');

    // For each NEW player, assign the product and create a debit receipt
    for (let i = 0; i < newPlayerIds.length; i++) {
      const playerId = newPlayerIds[i];
      try {
        console.log(`🔍 Processing NEW player ${i + 1}/${newPlayerIds.length}: ${playerId} (${newPlayerNames[i]})`);
        
        // Get player details
        const player = await getPlayerById(playerId);
        if (!player) {
          console.warn(`⚠️ Player not found: ${playerId}`);
          continue;
        }

        console.log('👤 Player found:', { 
          playerId: player.id, 
          userId: player.userId, 
          organizationId: player.organizationId 
        });

        // Assign product to player (this creates the debit receipt)
        console.log('🎯 About to call assignProductToPlayer with:', {
          playerId,
          productId: product.id,
          organizationId: product.organizationId,
          academyId: product.academyId
        });

        await assignProductToPlayer(
          playerId,
          product,
          product.organizationId,
          product.academyId,
          invoiceDate,
          deadlineDate,
          invoiceGeneration
        );

        console.log(`✅ Receipt created successfully for player: ${newPlayerNames[i]}`);
      } catch (playerError: any) {
        console.error(`❌ Failed to create receipt for player ${newPlayerNames[i]}:`, playerError);
        console.error('❌ Player error message:', playerError?.message || playerError);
        console.error('❌ Player error stack:', playerError?.stack || playerError);
        
        // Check if this is a "already assigned" error
        if (playerError?.message && playerError.message.includes('already assigned')) {
          console.log('⚠️ Player already has this product, skipping...');
        } else {
          // For other errors, we should still throw to let the user know something went wrong
          console.error('❌ Unexpected error during receipt creation, continuing with next player...');
        }
        // Continue with other players even if one fails
      }
    }

    console.log('🎉 linkPlayersToProduct: All NEW player receipts processing completed');
  } catch (error) {
    console.error('❌ linkPlayersToProduct: Error linking players to product:', error);
    console.error('Error stack:', error);
    throw error;
  }
};

export const unlinkPlayersFromProduct = async (productId: string): Promise<void> => {
  try {
    await updateProduct(productId, {
      linkedPlayerIds: [],
      linkedPlayerNames: []
    });
  } catch (error) {
    console.error('Error unlinking players from product:', error);
    throw error;
  }
};

export const getProductsByPlayer = async (organizationId: string, playerId: string): Promise<Product[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME), 
      where('organizationId', '==', organizationId)
    );
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }) as Product)
      .filter(product => product.linkedPlayerIds?.includes(playerId));
  } catch (error) {
    console.error('Error getting products by player:', error);
    throw error;
  }
};