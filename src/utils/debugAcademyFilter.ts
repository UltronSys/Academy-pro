/**
 * Debug utility to check and fix academy filtering issues
 */

import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { User, Player } from '../types';
import { syncUserToAlgolia, algoliaService } from '../services/algoliaService';

export const debugAcademyFilter = async (organizationId: string, academyId?: string) => {

  try {
    // Step 1: Check players in the academy
    const playersRef = collection(db, 'players');
    const playersSnapshot = await getDocs(playersRef);
    
    const playersInAcademy: Player[] = [];
    playersSnapshot.forEach((doc) => {
      const player = { id: doc.id, ...doc.data() } as Player;
      if (player.organizationId === organizationId) {
        if (!academyId || player.academyId.includes(academyId)) {
          playersInAcademy.push(player);
        }
      }
    });
    

    // Step 2: Check users and their roles
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    
    const usersToFix: User[] = [];
    const usersCorrect: User[] = [];
    
    for (const player of playersInAcademy) {
      const userDoc = usersSnapshot.docs.find(doc => doc.id === player.userId);
      if (userDoc) {
        const user = { id: userDoc.id, ...userDoc.data() } as User;
        
        // Check if user has player role with correct academyId
        const hasCorrectAcademy = user.roles.some(role => {
          const roleArray = Array.isArray(role.role) ? role.role : [role.role];
          const academyArray = Array.isArray(role.academyId) ? role.academyId : [role.academyId];
          
          const isPlayerRole = roleArray.includes('player');
          const hasAcademy = player.academyId.some(pAcademy => academyArray.includes(pAcademy));
          
          
          return isPlayerRole && hasAcademy;
        });
        
        if (!hasCorrectAcademy) {
          usersToFix.push(user);
        } else {
          usersCorrect.push(user);
        }
      }
    }
    
    
    // Step 3: Fix users if needed
    if (usersToFix.length > 0) {
      
      for (const user of usersToFix) {
        // Find the corresponding player
        const player = playersInAcademy.find(p => p.userId === user.id);
        if (player) {
          
          // Update the user's roles to include the academy
          const updatedRoles = user.roles.map(role => {
            const roleArray = Array.isArray(role.role) ? role.role : [role.role];
            if (roleArray.includes('player')) {
              return {
                ...role,
                academyId: player.academyId
              };
            }
            return role;
          });
          
          // Update in Firestore
          const userRef = doc(db, 'users', user.id);
          await updateDoc(userRef, { roles: updatedRoles });
          
          // Update in Algolia
          const updatedUser = { ...user, roles: updatedRoles };
          await syncUserToAlgolia(updatedUser);
          
        }
      }
    }
    
    // Step 4: Check Algolia data
    
    const algoliaResults = await algoliaService.searchUsers({
      query: '',
      organizationId,
      filters: academyId ? { academyId } : {},
      hitsPerPage: 100
    });
    
    algoliaResults.users.forEach(user => {
    });
    
    
    return {
      playersInAcademy: playersInAcademy.length,
      usersFixed: usersToFix.length,
      algoliaResults: algoliaResults.totalUsers
    };
    
  } catch (error) {
    console.error('❌ Error during debug:', error);
    throw error;
  }
};

// Make it available in browser console
(window as any).debugAcademyFilter = debugAcademyFilter;

// Export for use in components
export default debugAcademyFilter;