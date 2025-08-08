import { 
  collection, 
  doc, 
  getDocs, 
  query, 
  where,
  updateDoc,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Player, Product } from '../types';
import { createDebitReceipt } from './receiptService';
import { getProductById } from './productService';

/**
 * Service for handling scheduled receipt generation for recurring products
 */

// Process all scheduled receipts that are due
export const processScheduledReceipts = async (organizationId?: string): Promise<{
  processed: number;
  failed: number;
  details: { playerId: string; productId: string; status: 'success' | 'failed'; error?: string }[];
}> => {
  try {
    console.log('📅 processScheduledReceipts: Starting scheduled receipt processing...');
    
    // Get all players with scheduled receipts that are due
    const playersQuery = organizationId 
      ? query(collection(db, 'players'), where('organizationId', '==', organizationId))
      : collection(db, 'players');
      
    const playersSnapshot = await getDocs(playersQuery);
    const now = Timestamp.now();
    
    const results = {
      processed: 0,
      failed: 0,
      details: [] as { playerId: string; productId: string; status: 'success' | 'failed'; error?: string }[]
    };
    
    console.log(`📋 Found ${playersSnapshot.docs.length} players to check for scheduled receipts`);
    
    for (const playerDoc of playersSnapshot.docs) {
      const player = { id: playerDoc.id, ...playerDoc.data() } as Player;
      
      if (!player.assignedProducts || player.assignedProducts.length === 0) {
        continue;
      }
      
      // Find products with scheduled receipts that are due
      const dueReceiptProducts = player.assignedProducts.filter(ap => 
        ap.receiptStatus === 'scheduled' && 
        ap.nextReceiptDate && 
        ap.nextReceiptDate.toMillis() <= now.toMillis()
      );
      
      if (dueReceiptProducts.length === 0) {
        continue;
      }
      
      console.log(`⏰ Player ${player.id} has ${dueReceiptProducts.length} scheduled receipts due`);
      
      for (const assignedProduct of dueReceiptProducts) {
        try {
          // Get full product details
          const product = await getProductById(assignedProduct.productId);
          if (!product) {
            console.warn(`⚠️ Product not found: ${assignedProduct.productId}`);
            results.details.push({
              playerId: player.id,
              productId: assignedProduct.productId,
              status: 'failed',
              error: 'Product not found'
            });
            results.failed++;
            continue;
          }
          
          // Create the debit receipt
          const userRef = doc(db, 'users', player.userId);
          const productRef = doc(db, 'products', product.id);
          
          console.log(`🧾 Creating scheduled debit receipt for player ${player.id}, product ${product.name}`);
          
          await createDebitReceipt(
            userRef,
            productRef,
            {
              name: product.name,
              price: product.price
            },
            player.organizationId,
            product.academyId
          );
          
          // Calculate next receipt date for recurring products
          const currentDate = new Date();
          let nextReceiptDate: Date;
          
          if (product.recurringDuration) {
            switch (product.recurringDuration.unit) {
              case 'days':
                nextReceiptDate = new Date(currentDate.getTime() + (product.recurringDuration.value * 24 * 60 * 60 * 1000));
                break;
              case 'weeks':
                nextReceiptDate = new Date(currentDate.getTime() + (product.recurringDuration.value * 7 * 24 * 60 * 60 * 1000));
                break;
              case 'months':
                nextReceiptDate = new Date(currentDate);
                nextReceiptDate.setMonth(currentDate.getMonth() + product.recurringDuration.value);
                break;
              case 'years':
                nextReceiptDate = new Date(currentDate);
                nextReceiptDate.setFullYear(currentDate.getFullYear() + product.recurringDuration.value);
                break;
              default:
                nextReceiptDate = new Date(currentDate);
                nextReceiptDate.setMonth(currentDate.getMonth() + 1);
            }
          } else {
            nextReceiptDate = new Date(currentDate);
            nextReceiptDate.setMonth(currentDate.getMonth() + 1);
          }
          
          // Update the assigned product with new receipt schedule
          const updatedAssignedProducts = player.assignedProducts!.map(ap => 
            ap.productId === assignedProduct.productId ? {
              ...ap,
              nextReceiptDate: Timestamp.fromDate(nextReceiptDate),
              receiptStatus: 'scheduled' as const
            } : ap
          );
          
          // Update player document
          const playerRef = doc(db, 'players', player.id);
          await updateDoc(playerRef, {
            assignedProducts: updatedAssignedProducts,
            updatedAt: Timestamp.now()
          });
          
          console.log(`✅ Scheduled receipt processed for player ${player.id}, product ${product.name}. Next due: ${nextReceiptDate.toLocaleDateString()}`);
          
          results.details.push({
            playerId: player.id,
            productId: assignedProduct.productId,
            status: 'success'
          });
          results.processed++;
          
        } catch (error: any) {
          console.error(`❌ Failed to process scheduled receipt for player ${player.id}, product ${assignedProduct.productId}:`, error);
          
          results.details.push({
            playerId: player.id,
            productId: assignedProduct.productId,
            status: 'failed',
            error: error?.message || 'Unknown error'
          });
          results.failed++;
        }
      }
    }
    
    console.log(`🎉 processScheduledReceipts completed. Processed: ${results.processed}, Failed: ${results.failed}`);
    return results;
    
  } catch (error) {
    console.error('❌ Error processing scheduled receipts:', error);
    throw error;
  }
};

// Get all players with scheduled receipts (for admin dashboard)
export const getPlayersWithScheduledReceipts = async (organizationId: string): Promise<{
  playerId: string;
  playerName: string;
  userId: string;
  scheduledReceipts: {
    productId: string;
    productName: string;
    price: number;
    nextReceiptDate: Date;
    daysUntilDue: number;
  }[];
}[]> => {
  try {
    const playersQuery = query(collection(db, 'players'), where('organizationId', '==', organizationId));
    const playersSnapshot = await getDocs(playersQuery);
    const now = new Date();
    
    const playersWithScheduled: {
      playerId: string;
      playerName: string;
      userId: string;
      scheduledReceipts: {
        productId: string;
        productName: string;
        price: number;
        nextReceiptDate: Date;
        daysUntilDue: number;
      }[];
    }[] = [];
    
    for (const playerDoc of playersSnapshot.docs) {
      const player = { id: playerDoc.id, ...playerDoc.data() } as Player;
      
      if (!player.assignedProducts || player.assignedProducts.length === 0) {
        continue;
      }
      
      const scheduledProducts = player.assignedProducts.filter(ap => 
        ap.receiptStatus === 'scheduled' && ap.nextReceiptDate
      );
      
      if (scheduledProducts.length === 0) {
        continue;
      }
      
      const scheduledReceipts = scheduledProducts.map(ap => {
        const nextReceiptDate = ap.nextReceiptDate!.toDate();
        const daysUntilDue = Math.ceil((nextReceiptDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        return {
          productId: ap.productId,
          productName: ap.productName,
          price: ap.price,
          nextReceiptDate,
          daysUntilDue
        };
      });
      
      // Get player name from users collection would require additional query
      // For now, use a placeholder or player ID
      playersWithScheduled.push({
        playerId: player.id,
        playerName: `Player ${player.id}`, // TODO: Get actual name from users collection
        userId: player.userId,
        scheduledReceipts
      });
    }
    
    return playersWithScheduled.sort((a, b) => {
      const earliestA = Math.min(...a.scheduledReceipts.map(sr => sr.daysUntilDue));
      const earliestB = Math.min(...b.scheduledReceipts.map(sr => sr.daysUntilDue));
      return earliestA - earliestB;
    });
    
  } catch (error) {
    console.error('Error getting players with scheduled receipts:', error);
    throw error;
  }
};

// Manual trigger for processing specific player's scheduled receipts
export const processPlayerScheduledReceipts = async (playerId: string): Promise<{
  processed: number;
  failed: number;
  details: { productId: string; status: 'success' | 'failed'; error?: string }[];
}> => {
  try {
    const playerRef = doc(db, 'players', playerId);
    const playerSnapshot = await getDocs(query(collection(db, 'players'), where('__name__', '==', playerId)));
    
    if (playerSnapshot.empty) {
      throw new Error('Player not found');
    }
    
    const player = { id: playerSnapshot.docs[0].id, ...playerSnapshot.docs[0].data() } as Player;
    
    // Use the main processing function but filter for this player
    const results = await processScheduledReceipts(player.organizationId);
    
    // Filter results for this specific player
    const playerResults = results.details.filter(detail => detail.playerId === playerId);
    
    return {
      processed: playerResults.filter(pr => pr.status === 'success').length,
      failed: playerResults.filter(pr => pr.status === 'failed').length,
      details: playerResults.map(pr => ({
        productId: pr.productId,
        status: pr.status,
        error: pr.error
      }))
    };
    
  } catch (error) {
    console.error('Error processing player scheduled receipts:', error);
    throw error;
  }
};