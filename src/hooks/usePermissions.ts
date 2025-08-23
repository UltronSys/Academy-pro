import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  checkPermission, 
  getUserPermissions,
  getRolePermissions 
} from '../services/permissionService';
import { Permission, ResourceType, PermissionAction, RolePermission } from '../types';

export const usePermissions = () => {
  const { currentUser, userData } = useAuth();
  const organizationId = userData?.roles[0]?.organizationId;
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPermissions = async () => {
      
      if (!currentUser || !userData) {
        setPermissions([]);
        setLoading(false);
        return;
      }

      // If no organizationId, grant full permissions
      if (!organizationId) {
        const fullPermissions: Permission[] = [
          { resource: 'users', actions: ['read', 'write', 'delete'] },
          { resource: 'settings', actions: ['read', 'write', 'delete'] },
          { resource: 'players', actions: ['read', 'write', 'delete'] },
          { resource: 'academies', actions: ['read', 'write', 'delete'] },
          { resource: 'finance', actions: ['read', 'write', 'delete'] },
          { resource: 'events', actions: ['read', 'write', 'delete'] },
          { resource: 'training', actions: ['read', 'write', 'delete'] },
          { resource: 'reports', actions: ['read', 'write', 'delete'] }
        ];
        setPermissions(fullPermissions);
        setLoading(false);
        return;
      }

      try {
        // Get user's roles for the current organization
        const userRole = userData.roles.find(r => r.organizationId === organizationId);
        
        if (!userRole) {
          setPermissions([]);
          setLoading(false);
          return;
        }

        // Fetch user's aggregated permissions
        const userPermissions = await getUserPermissions(organizationId, userRole.role);
        setPermissions(userPermissions);

        // Fetch all role permissions for the organization
        const orgRolePermissions = await getRolePermissions(organizationId);
        setRolePermissions(orgRolePermissions);
      } catch (error) {
        console.error('Error fetching permissions:', error);
        setPermissions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [currentUser, userData, organizationId]);

  const hasPermission = useCallback(
    async (resource: ResourceType, action: PermissionAction): Promise<boolean> => {
      if (!currentUser || !userData) {
        return false;
      }

      // If no organizationId, grant full access (no organization restrictions)
      if (!organizationId) {
        return true;
      }

      const userRole = userData.roles.find(r => r.organizationId === organizationId);
      if (!userRole) {
        return false;
      }

      return checkPermission(organizationId, userRole.role, resource, action);
    },
    [currentUser, userData, organizationId]
  );

  const canRead = useCallback(
    (resource: ResourceType): boolean => {
      // Owner always has read permission for everything
      const userRole = userData?.roles?.find(r => r.organizationId === organizationId);
      if (userRole?.role.includes('owner')) {
        return true;
      }
      
      const permission = permissions.find(p => p.resource === resource);
      const hasAccess = permission ? permission.actions.includes('read') : false;
      return hasAccess;
    },
    [permissions, userData, organizationId]
  );

  const canWrite = useCallback(
    (resource: ResourceType): boolean => {
      // Owner always has write permission for everything
      const userRole = userData?.roles?.find(r => r.organizationId === organizationId);
      if (userRole?.role.includes('owner')) {
        return true;
      }
      
      const permission = permissions.find(p => p.resource === resource);
      return permission ? permission.actions.includes('write') : false;
    },
    [permissions, userData, organizationId]
  );

  const canDelete = useCallback(
    (resource: ResourceType): boolean => {
      // Owner always has delete permission for everything
      const userRole = userData?.roles?.find(r => r.organizationId === organizationId);
      if (userRole?.role.includes('owner')) {
        return true;
      }
      
      const permission = permissions.find(p => p.resource === resource);
      return permission ? permission.actions.includes('delete') : false;
    },
    [permissions, userData, organizationId]
  );

  const hasAnyPermission = useCallback(
    (resource: ResourceType): boolean => {
      const permission = permissions.find(p => p.resource === resource);
      return permission ? permission.actions.length > 0 : false;
    },
    [permissions]
  );

  const refreshPermissions = useCallback(async () => {
    if (!currentUser || !userData || !organizationId) {
      return;
    }

    const userRole = userData.roles.find(r => r.organizationId === organizationId);
    if (!userRole) {
      return;
    }

    try {
      const userPermissions = await getUserPermissions(organizationId, userRole.role);
      setPermissions(userPermissions);
      
      const orgRolePermissions = await getRolePermissions(organizationId);
      setRolePermissions(orgRolePermissions);
    } catch (error) {
      console.error('Error refreshing permissions:', error);
    }
  }, [currentUser, userData, organizationId]);

  return {
    permissions,
    rolePermissions,
    loading,
    hasPermission,
    canRead,
    canWrite,
    canDelete,
    hasAnyPermission,
    refreshPermissions,
  };
};