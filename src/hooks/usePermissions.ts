import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissionsContext } from '../contexts/PermissionsContext';
import { checkPermission } from '../services/permissionService';
import { Permission, ResourceType, PermissionAction } from '../types';

export const usePermissions = () => {
  const { currentUser, userData } = useAuth();
  const { rolePermissions, loading: permissionsLoading } = usePermissionsContext();
  const organizationId = userData?.roles[0]?.organizationId;
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const calculatePermissions = () => {
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

      // Get user's roles for the current organization
      const userRole = userData.roles.find(r => r.organizationId === organizationId);

      if (!userRole) {
        setPermissions([]);
        setLoading(false);
        return;
      }

      // Calculate user's aggregated permissions from cached rolePermissions
      // No Firebase query needed - uses data from PermissionsContext!
      const allPermissions: Map<ResourceType, Set<PermissionAction>> = new Map();

      for (const roleName of userRole.role) {
        // Find the role permission from cached data
        const rolePermission = rolePermissions.find(
          rp => rp.roleName === roleName && rp.organizationId === organizationId
        );

        if (rolePermission) {
          // Aggregate permissions from this role
          for (const permission of rolePermission.permissions) {
            const existing = allPermissions.get(permission.resource) || new Set();
            permission.actions.forEach(action => existing.add(action));
            allPermissions.set(permission.resource, existing);
          }
        }
      }

      // Convert map to array of permissions
      const calculatedPermissions: Permission[] = [];
      allPermissions.forEach((actions, resource) => {
        calculatedPermissions.push({
          resource,
          actions: Array.from(actions)
        });
      });

      setPermissions(calculatedPermissions);
      setLoading(false);
    };

    calculatePermissions();
  }, [currentUser, userData, organizationId, rolePermissions]);

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

  const refreshPermissions = useCallback(() => {
    if (!currentUser || !userData || !organizationId) {
      return;
    }

    const userRole = userData.roles.find(r => r.organizationId === organizationId);
    if (!userRole) {
      return;
    }

    // Recalculate permissions from cached rolePermissions (no Firebase query)
    const allPermissions: Map<ResourceType, Set<PermissionAction>> = new Map();

    for (const roleName of userRole.role) {
      const rolePermission = rolePermissions.find(
        rp => rp.roleName === roleName && rp.organizationId === organizationId
      );

      if (rolePermission) {
        for (const permission of rolePermission.permissions) {
          const existing = allPermissions.get(permission.resource) || new Set();
          permission.actions.forEach(action => existing.add(action));
          allPermissions.set(permission.resource, existing);
        }
      }
    }

    const calculatedPermissions: Permission[] = [];
    allPermissions.forEach((actions, resource) => {
      calculatedPermissions.push({
        resource,
        actions: Array.from(actions)
      });
    });

    setPermissions(calculatedPermissions);

    // rolePermissions are automatically refreshed by PermissionsContext listener
  }, [currentUser, userData, organizationId, rolePermissions]);

  return {
    permissions,
    rolePermissions,
    loading: loading || permissionsLoading,
    hasPermission,
    canRead,
    canWrite,
    canDelete,
    hasAnyPermission,
    refreshPermissions,
  };
};