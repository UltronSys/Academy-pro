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

// Helper to get the last day of a given month
const getLastDayOfMonth = (year: number, month: number): number => {
  // month is 0-indexed (0 = January, 11 = December)
  return new Date(year, month + 1, 0).getDate();
};

// Helper to calculate next invoice date based on invoiceDay (number: 1-31 or -1 for last day)
const calculateNextInvoiceDateFromInvoiceDay = (
  invoiceDay: number, // 1-31 for specific day, -1 for last day of month
  recurringDuration?: { value: number; unit: 'days' | 'weeks' | 'months' | 'years' },
  lastGeneratedDate?: Date
): Date => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // For non-monthly recurring products, calculate from last generated date
  if (recurringDuration && recurringDuration.unit !== 'months') {
    const baseDate = lastGeneratedDate || now;
    const nextDate = new Date(baseDate);

    switch (recurringDuration.unit) {
      case 'days':
        nextDate.setDate(nextDate.getDate() + recurringDuration.value);
        break;
      case 'weeks':
        nextDate.setDate(nextDate.getDate() + (recurringDuration.value * 7));
        break;
      case 'years':
        nextDate.setFullYear(nextDate.getFullYear() + recurringDuration.value);
        break;
    }
    return nextDate;
  }

  // For monthly recurring (or default), use invoiceDay to determine next date
  const getAdjustedDay = (date: Date, requestedDay: number): number => {
    const lastDay = getLastDayOfMonth(date.getFullYear(), date.getMonth());
    if (requestedDay === -1) return lastDay; // End of month
    return Math.min(requestedDay, lastDay);
  };

  const currentDay = now.getDate();
  let nextDate = new Date(now);
  const adjustedDay = getAdjustedDay(nextDate, invoiceDay);

  if (currentDay < adjustedDay) {
    // Target day is still ahead this month
    nextDate.setDate(adjustedDay);
  } else {
    // Target day has passed, use next month
    nextDate.setMonth(nextDate.getMonth() + 1);
    const nextMonthAdjustedDay = getAdjustedDay(nextDate, invoiceDay);
    nextDate.setDate(nextMonthAdjustedDay);
  }

  return nextDate;
};

// Helper function to calculate the earliest nextReceiptDate from assigned products
const calculateEarliestReceiptDate = (assignedProducts: Player['assignedProducts']): Timestamp | null => {
  if (!assignedProducts || assignedProducts.length === 0) {
    return null;
  }

  let earliest: Date | null = null;

  // Check recurring products - calculate from invoiceDay
  const activeRecurringProducts = assignedProducts.filter(
    ap => ap.status === 'active' && ap.productType === 'recurring' && ap.invoiceDay
  );

  for (const product of activeRecurringProducts) {
    const nextDate = calculateNextInvoiceDateFromInvoiceDay(
      product.invoiceDay,
      product.recurringDuration,
      product.lastGeneratedDate?.toDate()
    );

    if (!earliest || nextDate < earliest) {
      earliest = nextDate;
    }
  }

  // Check one-time scheduled products - use invoiceDate directly
  const activeOneTimeScheduled = assignedProducts.filter(
    ap => ap.status === 'active' && ap.productType === 'one-time' && ap.receiptStatus === 'scheduled' && ap.invoiceDate
  );

  for (const product of activeOneTimeScheduled) {
    const invoiceDate = product.invoiceDate.toDate();
    if (!earliest || invoiceDate < earliest) {
      earliest = invoiceDate;
    }
  }

  return earliest ? Timestamp.fromDate(earliest) : null;
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
  invoiceGeneration?: 'immediate' | 'scheduled',
  invoiceDay?: number, // Day of month: 1-31, or -1 for last day of month
  deadlineDay?: number
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
        invoiceDay: invoiceDay || 1, // Default to 1st of month
        deadlineDay: deadlineDay || 30, // Default to 30 days after invoice
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

      // Handle scheduled receipts for recurring products (no immediate receipt creation)
      if (finalInvoiceGeneration === 'scheduled' && product.productType === 'recurring') {
        console.log('📅 assignProductToPlayer: Scheduling receipt for recurring product...');

        // Calculate player-level nextReceiptDate using invoiceDay
        const earliestReceiptDate = calculateEarliestReceiptDate(updatedAssignedProducts);

        await updateDoc(playerRef, {
          nextReceiptDate: earliestReceiptDate,
          updatedAt: Timestamp.now()
        });

        console.log('✅ assignProductToPlayer: Player nextReceiptDate set to:', earliestReceiptDate?.toDate().toLocaleDateString());
      }

      // Handle scheduled receipts for one-time products (no immediate receipt creation)
      if (finalInvoiceGeneration === 'scheduled' && product.productType === 'one-time') {
        console.log('📅 assignProductToPlayer: Scheduling receipt for one-time product...');

        // For one-time scheduled products, use the invoiceDate directly
        // Compare with current player nextReceiptDate and use the earliest
        const playerDoc = await getDoc(playerRef);
        const currentNextReceiptDate = playerDoc.data()?.nextReceiptDate;

        let newNextReceiptDate: Timestamp;
        if (currentNextReceiptDate) {
          // Use the earlier of current nextReceiptDate or this product's invoiceDate
          newNextReceiptDate = finalInvoiceDate < currentNextReceiptDate.toDate()
            ? Timestamp.fromDate(finalInvoiceDate)
            : currentNextReceiptDate;
        } else {
          newNextReceiptDate = Timestamp.fromDate(finalInvoiceDate);
        }

        await updateDoc(playerRef, {
          nextReceiptDate: newNextReceiptDate,
          updatedAt: Timestamp.now()
        });

        console.log('✅ assignProductToPlayer: Player nextReceiptDate set to:', newNextReceiptDate.toDate().toLocaleDateString());
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

          // Calculate next invoice date from invoiceDay
          const nextInvoiceDate = calculateNextInvoiceDateFromInvoiceDay(
            invoiceDay || 1, // Default to 1st of month
            product.recurringDuration,
            now
          );
          const nextDeadlineDate = new Date(nextInvoiceDate.getTime() + (deadlineDay || 30) * 24 * 60 * 60 * 1000);

          // Update assignedProduct with next invoiceDate, deadlineDate, and lastGeneratedDate
          const currentAssignedProducts = (await getDoc(playerRef)).data()?.assignedProducts || [];
          const updatedWithNextDates = currentAssignedProducts.map((ap: any) =>
            ap.productId === product.id ? {
              ...ap,
              invoiceDate: Timestamp.fromDate(nextInvoiceDate), // Update to next invoice date
              deadlineDate: Timestamp.fromDate(nextDeadlineDate), // Update deadline accordingly
              lastGeneratedDate: Timestamp.now() // Track when we generated the receipt
            } : ap
          );

          // Calculate the earliest nextReceiptDate for player-level field using invoiceDay
          const earliestReceiptDate = calculateEarliestReceiptDate(updatedWithNextDates);

          await updateDoc(playerRef, {
            assignedProducts: updatedWithNextDates,
            nextReceiptDate: earliestReceiptDate,
            updatedAt: Timestamp.now()
          });

          console.log('✅ assignProductToPlayer: invoiceDate updated to next receipt date:', nextInvoiceDate.toLocaleDateString());
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