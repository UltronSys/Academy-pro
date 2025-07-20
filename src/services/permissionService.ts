import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  Timestamp,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { RolePermission, Permission, RoleType, ResourceType, PermissionAction } from '../types';

// Default permissions for built-in roles
const defaultPermissions: Record<RoleType | 'accountant', Permission[]> = {
  owner: [
    { resource: 'users', actions: ['read', 'write', 'delete'] },
    { resource: 'settings', actions: ['read', 'write', 'delete'] },
    { resource: 'academies', actions: ['read', 'write', 'delete'] },
    { resource: 'players', actions: ['read', 'write', 'delete'] },
    { resource: 'finance', actions: ['read', 'write', 'delete'] },
    { resource: 'events', actions: ['read', 'write', 'delete'] },
    { resource: 'training', actions: ['read', 'write', 'delete'] },
    { resource: 'reports', actions: ['read', 'write', 'delete'] },
  ],
  admin: [
    { resource: 'users', actions: ['read', 'write'] },
    { resource: 'settings', actions: ['read', 'write'] },
    { resource: 'academies', actions: ['read', 'write'] },
    { resource: 'players', actions: ['read', 'write'] },
    { resource: 'finance', actions: ['read', 'write'] },
    { resource: 'events', actions: ['read', 'write'] },
    { resource: 'training', actions: ['read', 'write'] },
    { resource: 'reports', actions: ['read', 'write'] },
  ],
  coach: [
    { resource: 'users', actions: ['read'] },
    { resource: 'settings', actions: ['read'] },
    { resource: 'academies', actions: ['read'] },
    { resource: 'players', actions: ['read'] },
    { resource: 'training', actions: ['read'] },
    { resource: 'reports', actions: ['read'] },
  ],
  player: [
    { resource: 'users', actions: ['read'] },
    { resource: 'settings', actions: ['read'] },
    { resource: 'academies', actions: ['read'] },
    { resource: 'players', actions: ['read'] },
    { resource: 'training', actions: ['read'] },
  ],
  guardian: [
    { resource: 'users', actions: ['read'] },
    { resource: 'settings', actions: ['read'] },
    { resource: 'academies', actions: ['read'] },
    { resource: 'players', actions: ['read'] },
  ],
  accountant: [
    { resource: 'users', actions: ['read'] },
    { resource: 'settings', actions: ['read'] },
    { resource: 'finance', actions: ['read', 'write'] },
    { resource: 'reports', actions: ['read'] },
  ],
};

// Initialize default role permissions for an organization
export const initializeDefaultRolePermissions = async (organizationId: string): Promise<void> => {
  const rolePermissionsRef = collection(db, 'rolePermissions');
  
  for (const [roleName, permissions] of Object.entries(defaultPermissions)) {
    const rolePermission: Omit<RolePermission, 'id'> = {
      organizationId,
      roleName,
      permissions,
      isBuiltIn: ['owner', 'admin', 'coach', 'player', 'guardian'].includes(roleName),
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
    };
    
    const docRef = doc(rolePermissionsRef);
    await setDoc(docRef, { ...rolePermission, id: docRef.id });
  }
};

// Get role permissions for an organization
export const getRolePermissions = async (organizationId: string): Promise<RolePermission[]> => {
  const rolePermissionsRef = collection(db, 'rolePermissions');
  const q = query(rolePermissionsRef, where('organizationId', '==', organizationId));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as RolePermission));
};

// Get permissions for a specific role
export const getRolePermissionsByName = async (
  organizationId: string, 
  roleName: string
): Promise<RolePermission | null> => {
  const rolePermissionsRef = collection(db, 'rolePermissions');
  const q = query(
    rolePermissionsRef, 
    where('organizationId', '==', organizationId),
    where('roleName', '==', roleName)
  );
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }
  
  return {
    id: snapshot.docs[0].id,
    ...snapshot.docs[0].data()
  } as RolePermission;
};

// Create or update role permissions
export const upsertRolePermissions = async (
  organizationId: string,
  roleName: string,
  permissions: Permission[],
  isBuiltIn: boolean = false
): Promise<string> => {
  const existing = await getRolePermissionsByName(organizationId, roleName);
  
  if (existing) {
    // Update existing
    const rolePermissionsRef = doc(db, 'rolePermissions', existing.id);
    await updateDoc(rolePermissionsRef, {
      permissions,
      updatedAt: serverTimestamp(),
    });
    return existing.id;
  } else {
    // Create new
    const rolePermissionsRef = collection(db, 'rolePermissions');
    const rolePermission: Omit<RolePermission, 'id'> = {
      organizationId,
      roleName,
      permissions,
      isBuiltIn,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
    };
    
    const docRef = doc(rolePermissionsRef);
    await setDoc(docRef, { ...rolePermission, id: docRef.id });
    return docRef.id;
  }
};

// Delete role permissions
export const deleteRolePermissions = async (rolePermissionId: string): Promise<void> => {
  const rolePermissionsRef = doc(db, 'rolePermissions', rolePermissionId);
  await deleteDoc(rolePermissionsRef);
};

// Check if a user has permission for a specific action on a resource
export const checkPermission = async (
  organizationId: string,
  userRoles: string[],
  resource: ResourceType,
  action: PermissionAction
): Promise<boolean> => {
  // Owner always has all permissions
  if (userRoles.includes('owner')) {
    return true;
  }
  
  for (const role of userRoles) {
    const rolePermission = await getRolePermissionsByName(organizationId, role);
    if (rolePermission) {
      const resourcePermission = rolePermission.permissions.find(p => p.resource === resource);
      if (resourcePermission && resourcePermission.actions.includes(action)) {
        return true;
      }
    }
  }
  
  return false;
};

// Get all permissions for a user based on their roles
export const getUserPermissions = async (
  organizationId: string,
  userRoles: string[]
): Promise<Permission[]> => {
  const allPermissions: Map<ResourceType, Set<PermissionAction>> = new Map();
  
  for (const role of userRoles) {
    const rolePermission = await getRolePermissionsByName(organizationId, role);
    if (rolePermission) {
      // Use database permissions if available
      for (const permission of rolePermission.permissions) {
        const existing = allPermissions.get(permission.resource) || new Set();
        permission.actions.forEach(action => existing.add(action));
        allPermissions.set(permission.resource, existing);
      }
    } else {
      // Fall back to default permissions if not found in database
      const defaultPerms = defaultPermissions[role as RoleType];
      if (defaultPerms) {
        console.log(`Using default permissions for role ${role}:`, defaultPerms);
        for (const permission of defaultPerms) {
          const existing = allPermissions.get(permission.resource) || new Set();
          permission.actions.forEach(action => existing.add(action));
          allPermissions.set(permission.resource, existing);
        }
      }
    }
  }
  
  // Convert map to array of permissions
  const permissions: Permission[] = [];
  allPermissions.forEach((actions, resource) => {
    permissions.push({
      resource,
      actions: Array.from(actions),
    });
  });
  
  console.log(`Final permissions for roles ${userRoles}:`, permissions);
  return permissions;
};