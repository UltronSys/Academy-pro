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
  arrayUnion
} from 'firebase/firestore';
import { db } from '../firebase';
import { Player, Product } from '../types';
import { createDebitReceipt } from './receiptService';
import { getUserById } from './userService';
import { syncPlayerToAlgolia, deletePlayerFromAlgolia, isAlgoliaConfigured } from './algoliaService';

const COLLECTION_NAME = 'players';

// Helper function to calculate the earliest nextReceiptDate from assigned products
const calculateEarliestReceiptDate = (assignedProducts: Player['assignedProducts']): Timestamp | null => {
  if (!assignedProducts || assignedProducts.length === 0) {
    return null;
  }

  // Filter for active, scheduled products with a nextReceiptDate
  const scheduledProducts = assignedProducts.filter(
    ap => ap.status === 'active' &&
          ap.receiptStatus === 'scheduled' &&
          ap.nextReceiptDate
  );

  if (scheduledProducts.length === 0) {
    return null;
  }

  // Find the earliest date
  let earliest: Timestamp | null = null;
  for (const product of scheduledProducts) {
    if (product.nextReceiptDate) {
      if (!earliest || product.nextReceiptDate.toMillis() < earliest.toMillis()) {
        earliest = product.nextReceiptDate;
      }
    }
  }

  return earliest;
};

export const createPlayer = async (playerData: Omit<Player, 'createdAt' | 'updatedAt'>): Promise<Player> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, playerData.id);
    const player: Player = {
      ...playerData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    await setDoc(docRef, player);

    // Sync to Algolia
    if (isAlgoliaConfigured()) {
      try {
        const user = await getUserById(player.userId);
        if (user) {
          await syncPlayerToAlgolia(player, {
            name: user.name,
            email: user.email,
            phone: user.phone,
            photoURL: user.photoURL
          });
          console.log('✅ Player synced to Algolia');
        }
      } catch (algoliaError) {
        console.error('Warning: Failed to sync player to Algolia:', algoliaError);
        // Don't fail player creation if Algolia sync fails
      }
    }

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

// Batch load players by multiple user IDs (more efficient than individual calls)
export const getPlayersByUserIds = async (userIds: string[]): Promise<Player[]> => {
  try {
    if (userIds.length === 0) return [];

    // Firestore 'in' query supports up to 30 items, so we batch if needed
    const batchSize = 30;
    const allPlayers: Player[] = [];

    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const q = query(collection(db, COLLECTION_NAME), where('userId', 'in', batch));
      const querySnapshot = await getDocs(q);

      const players = querySnapshot.docs.map(doc => doc.data() as Player);
      allPlayers.push(...players);
    }

    return allPlayers;
  } catch (error) {
    console.error('Error getting players by user IDs:', error);
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

    // Sync to Algolia
    if (isAlgoliaConfigured()) {
      try {
        const updatedPlayer = await getPlayerById(playerId);
        if (updatedPlayer) {
          const user = await getUserById(updatedPlayer.userId);
          if (user) {
            await syncPlayerToAlgolia(updatedPlayer, {
              name: user.name,
              email: user.email,
              phone: user.phone,
              photoURL: user.photoURL
            });
            console.log('✅ Player updates synced to Algolia');
          }
        }
      } catch (algoliaError) {
        console.error('Warning: Failed to sync player updates to Algolia:', algoliaError);
      }
    }
  } catch (error) {
    console.error('Error updating player:', error);
    throw error;
  }
};

export const deletePlayer = async (playerId: string): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, playerId);
    await deleteDoc(docRef);

    // Delete from Algolia
    if (isAlgoliaConfigured()) {
      try {
        await deletePlayerFromAlgolia(playerId);
        console.log('✅ Player deleted from Algolia');
      } catch (algoliaError) {
        console.error('Warning: Failed to delete player from Algolia:', algoliaError);
      }
    }
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
      academyId,
      productType: product.productType,
      invoiceGeneration
    });

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

    // Use provided dates or set defaults
    const now = new Date();
    const finalInvoiceDate = invoiceDate || now;
    const finalDeadlineDate = deadlineDate || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Default 30 days
    const finalInvoiceGeneration = invoiceGeneration || 'immediate';

    // Get user reference for the receipt
    const userRef = doc(db, 'users', player.userId);
    const productRef = doc(db, 'products', product.id);

    // Determine if we should track this product in assignedProducts
    // Only track: recurring products OR one-time scheduled products
    // Don't track: one-time immediate products (just create receipt and done)
    const isOneTimeImmediate = product.productType === 'one-time' && finalInvoiceGeneration === 'immediate';
    const shouldTrackInAssignedProducts = !isOneTimeImmediate;

    console.log('📋 assignProductToPlayer: Product tracking decision:', {
      productType: product.productType,
      invoiceGeneration: finalInvoiceGeneration,
      isOneTimeImmediate,
      shouldTrackInAssignedProducts
    });

    if (shouldTrackInAssignedProducts) {
      // Check if product is already assigned (only for tracked products)
      const existingAssignment = player.assignedProducts?.find(p => p.productId === product.id);
      if (existingAssignment && existingAssignment.status === 'active') {
        console.log('⚠️ assignProductToPlayer: Product already assigned to this player, skipping');
        throw new Error(`Product "${product.name}" is already assigned to this player`);
      }

      // Add product to player's assigned products
      const assignedProduct: any = {
        productId: product.id,
        productName: product.name,
        price: product.price,
        assignedDate: Timestamp.now(),
        status: 'active' as const,
        invoiceDate: Timestamp.fromDate(finalInvoiceDate),
        deadlineDate: Timestamp.fromDate(finalDeadlineDate),
        receiptStatus: finalInvoiceGeneration === 'immediate' ? 'immediate' as const : 'scheduled' as const,
        productType: product.productType || 'one-time',
      };

      // Add recurring duration if it's a recurring product
      if (product.productType === 'recurring' && product.recurringDuration) {
        assignedProduct.recurringDuration = product.recurringDuration;
      }

      const updatedAssignedProducts = player.assignedProducts ?
        [...player.assignedProducts.filter(p => p.productId !== product.id), assignedProduct] :
        [assignedProduct];

      console.log('📋 assignProductToPlayer: Updated assigned products:', updatedAssignedProducts);

      // Update player document with assigned product
      await updateDoc(playerRef, {
        assignedProducts: updatedAssignedProducts,
        updatedAt: Timestamp.now()
      });
      console.log('✅ assignProductToPlayer: Player assigned products updated');

      // Update product's linkedPlayerIds and linkedPlayerNames (only for tracked products)
      try {
        const user = await getUserById(player.userId);
        const playerName = user?.name || `Player ${player.userId}`;

        const productDoc = await getDoc(productRef);
        if (productDoc.exists()) {
          const productData = productDoc.data();
          const currentLinkedIds = productData.linkedPlayerIds || [];

          if (!currentLinkedIds.includes(player.userId)) {
            await updateDoc(productRef, {
              linkedPlayerIds: arrayUnion(player.userId),
              linkedPlayerNames: arrayUnion(playerName),
              updatedAt: Timestamp.now()
            });
            console.log('✅ assignProductToPlayer: Product updated with linked player:', playerName);
          }
        }
      } catch (productUpdateError) {
        console.error('⚠️ assignProductToPlayer: Failed to update product linkedPlayerIds:', productUpdateError);
      }

      // Handle scheduled receipts for recurring products
      if (finalInvoiceGeneration === 'scheduled' && product.productType === 'recurring') {
        console.log('📅 assignProductToPlayer: Scheduling receipt for recurring product...');

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
              receiptDueDate = new Date(now);
              receiptDueDate.setMonth(now.getMonth() + 1);
          }
        } else {
          receiptDueDate = new Date(now);
          receiptDueDate.setMonth(now.getMonth() + 1);
        }

        console.log(`📅 Next receipt date: ${receiptDueDate.toLocaleDateString()}`);

        // Update the assigned product with next receipt date
        const currentAssignedProducts = (await getDoc(playerRef)).data()?.assignedProducts || [];
        const updatedWithSchedule = currentAssignedProducts.map((ap: any) =>
          ap.productId === product.id ? {
            ...ap,
            nextReceiptDate: Timestamp.fromDate(receiptDueDate),
            receiptStatus: 'scheduled' as const
          } : ap
        );

        // Calculate the earliest nextReceiptDate for player-level field
        const earliestReceiptDate = calculateEarliestReceiptDate(updatedWithSchedule);

        await updateDoc(playerRef, {
          assignedProducts: updatedWithSchedule,
          nextReceiptDate: earliestReceiptDate,
          updatedAt: Timestamp.now()
        });

        console.log('✅ assignProductToPlayer: Recurring product scheduled for:', receiptDueDate.toLocaleDateString());
        console.log('✅ assignProductToPlayer: Player nextReceiptDate set to:', earliestReceiptDate?.toDate().toLocaleDateString());
      }

      // Create immediate receipt for recurring products with immediate generation
      if (finalInvoiceGeneration === 'immediate' && product.productType === 'recurring') {
        console.log('🧾 assignProductToPlayer: Creating immediate receipt for recurring product...');

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

          console.log('🎉 assignProductToPlayer: Receipt created:', receipt.id);

          // Calculate and set nextReceiptDate for the cloud function to pick up
          const duration = product.recurringDuration || { value: 1, unit: 'months' as const };
          let nextReceiptDate: Date;

          switch (duration.unit) {
            case 'days':
              nextReceiptDate = new Date(now.getTime() + (duration.value * 24 * 60 * 60 * 1000));
              break;
            case 'weeks':
              nextReceiptDate = new Date(now.getTime() + (duration.value * 7 * 24 * 60 * 60 * 1000));
              break;
            case 'months':
              nextReceiptDate = new Date(now);
              nextReceiptDate.setMonth(now.getMonth() + duration.value);
              break;
            case 'years':
              nextReceiptDate = new Date(now);
              nextReceiptDate.setFullYear(now.getFullYear() + duration.value);
              break;
            default:
              nextReceiptDate = new Date(now);
              nextReceiptDate.setMonth(now.getMonth() + 1);
          }

          // Update assignedProduct with nextReceiptDate so cloud function knows when to generate next receipt
          const currentAssignedProducts = (await getDoc(playerRef)).data()?.assignedProducts || [];
          const updatedWithNextDate = currentAssignedProducts.map((ap: any) =>
            ap.productId === product.id ? {
              ...ap,
              nextReceiptDate: Timestamp.fromDate(nextReceiptDate),
              receiptStatus: 'scheduled' // Change to scheduled so cloud function picks it up
            } : ap
          );

          // Calculate the earliest nextReceiptDate for player-level field
          const earliestReceiptDate = calculateEarliestReceiptDate(updatedWithNextDate);

          await updateDoc(playerRef, {
            assignedProducts: updatedWithNextDate,
            nextReceiptDate: earliestReceiptDate,
            updatedAt: Timestamp.now()
          });

          console.log('✅ assignProductToPlayer: Next receipt scheduled for:', nextReceiptDate.toLocaleDateString());
          console.log('✅ assignProductToPlayer: Player nextReceiptDate set to:', earliestReceiptDate?.toDate().toLocaleDateString());
        } catch (receiptError: any) {
          console.error('❌ assignProductToPlayer: Failed to create debit receipt:', receiptError);
          throw new Error(`Failed to create receipt: ${receiptError?.message || receiptError}`);
        }
      }
    } else {
      // One-time immediate product: Just create the receipt, don't track
      console.log('🧾 assignProductToPlayer: One-time immediate product - creating receipt only (not tracking in assignedProducts)');

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

        console.log('🎉 assignProductToPlayer: One-time receipt created:', receipt.id);
        console.log('📍 Receipt location: users/' + player.userId + '/receipts/' + receipt.id);
      } catch (receiptError: any) {
        console.error('❌ assignProductToPlayer: Failed to create debit receipt:', receiptError);
        throw new Error(`Failed to create receipt: ${receiptError?.message || receiptError}`);
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
    // Note: Active receipts are preserved - they remain as outstanding invoices
    const updatedAssignedProducts = player.assignedProducts.map(p =>
      p.productId === productId
        ? { ...p, status: 'cancelled' as const }
        : p
    );

    // Recalculate player-level nextReceiptDate
    const earliestReceiptDate = calculateEarliestReceiptDate(updatedAssignedProducts);

    await updateDoc(playerRef, {
      assignedProducts: updatedAssignedProducts,
      nextReceiptDate: earliestReceiptDate,
      updatedAt: Timestamp.now()
    });

    console.log('Product assignment cancelled for player:', playerId, 'product:', productId);
    console.log('Player nextReceiptDate updated to:', earliestReceiptDate?.toDate().toLocaleDateString() || 'null');

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

// Sync all player-product links to update product linkedPlayerIds
// This is a one-time utility to fix products that were linked before the fix
export const syncProductLinkedPlayers = async (organizationId: string): Promise<{ synced: number; errors: number }> => {
  try {
    console.log('🔄 syncProductLinkedPlayers: Starting sync for organization:', organizationId);

    // Get all players in the organization
    const playersQuery = query(
      collection(db, COLLECTION_NAME),
      where('organizationId', '==', organizationId)
    );
    const playersSnapshot = await getDocs(playersQuery);
    const players = playersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Player);

    console.log(`📋 Found ${players.length} players in organization`);

    // Build a map of productId -> { userIds: [], names: [] }
    const productPlayerMap: Record<string, { userIds: string[]; names: string[] }> = {};

    for (const player of players) {
      if (!player.assignedProducts || player.assignedProducts.length === 0) continue;

      // Get user name
      const user = await getUserById(player.userId);
      const playerName = user?.name || `Player ${player.userId}`;

      for (const assignedProduct of player.assignedProducts) {
        if (assignedProduct.status !== 'active') continue;

        const productId = assignedProduct.productId;
        if (!productPlayerMap[productId]) {
          productPlayerMap[productId] = { userIds: [], names: [] };
        }

        // Add if not already in the list
        if (!productPlayerMap[productId].userIds.includes(player.userId)) {
          productPlayerMap[productId].userIds.push(player.userId);
          productPlayerMap[productId].names.push(playerName);
        }
      }
    }

    console.log(`📦 Found ${Object.keys(productPlayerMap).length} products with linked players`);

    // Update each product
    let synced = 0;
    let errors = 0;

    for (const [productId, playerData] of Object.entries(productPlayerMap)) {
      try {
        const productRef = doc(db, 'products', productId);
        await updateDoc(productRef, {
          linkedPlayerIds: playerData.userIds,
          linkedPlayerNames: playerData.names,
          updatedAt: Timestamp.now()
        });
        synced++;
        console.log(`✅ Updated product ${productId} with ${playerData.userIds.length} players`);
      } catch (error) {
        console.error(`❌ Failed to update product ${productId}:`, error);
        errors++;
      }
    }

    console.log(`🎉 Sync complete. Synced: ${synced}, Errors: ${errors}`);
    return { synced, errors };
  } catch (error) {
    console.error('Error syncing product linked players:', error);
    throw error;
  }
};