import React, { useState, useEffect } from 'react';
import { Card, CardBody } from '../ui';
import { Button } from '../ui';
import { Input } from '../ui';
import { Select } from '../ui';
import { Alert } from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { 
  upsertRolePermissions, 
  deleteRolePermissions,
  initializeDefaultRolePermissions 
} from '../../services/permissionService';
import { RolePermission, ResourceType, PermissionAction, Permission } from '../../types';
import { updateSettings, getSettingsByOrganization } from '../../services/settingsService';

// Icons
const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const SaveIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
  </svg>
);

const AlertIcon = () => (
  <svg className="w-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const resources: { value: ResourceType; label: string }[] = [
  { value: 'users', label: 'Users' },
  { value: 'settings', label: 'Settings' },
  // Future pages (commented out for now)
  // { value: 'players', label: 'Players' },
  // { value: 'academies', label: 'Academies' },
  // { value: 'finance', label: 'Finance' },
  // { value: 'events', label: 'Events' },
  // { value: 'training', label: 'Training' },
  // { value: 'reports', label: 'Reports' },
];

const actions: { value: PermissionAction; label: string }[] = [
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'delete', label: 'Delete' },
];

export function RolePermissions() {
  const { userData } = useAuth();
  const organizationId = userData?.roles[0]?.organizationId;
  const { rolePermissions, refreshPermissions, canWrite } = usePermissions();
  const [customRoles, setCustomRoles] = useState<string[]>([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [editingPermissions, setEditingPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const hasSettingsWritePermission = canWrite('settings');

  useEffect(() => {
    const loadCustomRoles = async () => {
      if (!organizationId) return;
      
      const settings = await getSettingsByOrganization(organizationId);
      if (settings) {
        setCustomRoles(settings.customRoles || []);
      }

      // Initialize default role permissions if not already done
      if (!initialized && rolePermissions.length === 0) {
        try {
          await initializeDefaultRolePermissions(organizationId);
          await refreshPermissions();
          setInitialized(true);
        } catch (error) {
          console.error('Error initializing default permissions:', error);
        }
      }
    };

    loadCustomRoles();
  }, [organizationId, rolePermissions.length, initialized, refreshPermissions]);

  useEffect(() => {
    if (selectedRole && rolePermissions.length > 0) {
      const rolePermission = rolePermissions.find((rp: RolePermission) => rp.roleName === selectedRole);
      if (rolePermission) {
        setEditingPermissions([...rolePermission.permissions]);
      } else {
        // Initialize empty permissions for new role
        setEditingPermissions(
          resources.map(resource => ({
            resource: resource.value,
            actions: [],
          }))
        );
      }
    }
  }, [selectedRole, rolePermissions]);

  const handleAddCustomRole = async () => {
    if (!newRoleName.trim() || !organizationId) {
      setError('Please enter a role name');
      setTimeout(() => setError(''), 3000);
      return;
    }

    const roleName = newRoleName.trim().toLowerCase();
    
    // Check if role already exists
    const defaultRoles = ['owner', 'admin', 'coach', 'player', 'guardian'];
    if (customRoles.includes(roleName)) {
      setError('A custom role with this name already exists');
      setTimeout(() => setError(''), 4000);
      return;
    }
    if (defaultRoles.includes(roleName)) {
      setError(`Cannot create custom role with reserved name '${roleName}'. Reserved names are: ${defaultRoles.join(', ')}`);
      setTimeout(() => setError(''), 5000);
      return;
    }

    try {
      setLoading(true);
      
      // Get current settings or create default ones
      let currentSettings = await getSettingsByOrganization(organizationId);
      if (!currentSettings) {
        // Create default settings first
        const defaultSettings = {
          id: organizationId,
          generalSettings: {
            defaultLanguage: 'en',
            timezone: 'UTC',
            currency: 'USD'
          },
          notificationSettings: {
            emailNotifications: false,
            smsNotifications: false
          },
          customRoles: [],
          fieldCategories: [],
          academySpecificSettings: {},
          createdAt: new Date() as any,
          updatedAt: new Date() as any
        };
        await updateSettings(organizationId, defaultSettings);
        currentSettings = defaultSettings;
      }

      // Add to custom roles
      const updatedRoles = [...(currentSettings.customRoles || []), roleName];
      await updateSettings(organizationId, { customRoles: updatedRoles });
      
      // Create initial permissions for the role
      await upsertRolePermissions(
        organizationId,
        roleName,
        resources.map(resource => ({
          resource: resource.value,
          actions: [],
        })),
        false
      );

      setCustomRoles(updatedRoles);
      setNewRoleName('');
      await refreshPermissions();
      setSuccess('Custom role added successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      console.error('Error adding custom role:', error);
      setError(`Failed to add custom role: ${error?.message || 'Unknown error'}`);
      setTimeout(() => setError(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCustomRole = async (roleName: string) => {
    if (!organizationId) return;

    try {
      setLoading(true);
      
      // Remove from custom roles
      const updatedRoles = customRoles.filter(r => r !== roleName);
      await updateSettings(organizationId, { customRoles: updatedRoles });
      
      // Delete role permissions
      const rolePermission = rolePermissions.find((rp: RolePermission) => rp.roleName === roleName);
      if (rolePermission) {
        await deleteRolePermissions(rolePermission.id);
      }

      setCustomRoles(updatedRoles);
      if (selectedRole === roleName) {
        setSelectedRole('');
      }
      await refreshPermissions();
      setSuccess('Custom role deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error deleting custom role:', error);
      setError('Failed to delete custom role');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionChange = (resource: ResourceType, action: PermissionAction, checked: boolean) => {
    setEditingPermissions(prev => {
      const updated = [...prev];
      const resourceIndex = updated.findIndex(p => p.resource === resource);
      
      if (resourceIndex >= 0) {
        if (checked) {
          // Add action if not present
          if (!updated[resourceIndex].actions.includes(action)) {
            updated[resourceIndex].actions.push(action);
          }
        } else {
          // Remove action
          updated[resourceIndex].actions = updated[resourceIndex].actions.filter((a: PermissionAction) => a !== action);
        }
      }
      
      return updated;
    });
  };

  const handleSavePermissions = async () => {
    if (!selectedRole || !organizationId) return;

    try {
      setLoading(true);
      
      const rolePermission = rolePermissions.find((rp: RolePermission) => rp.roleName === selectedRole);
      const isBuiltIn = rolePermission?.isBuiltIn || false;
      
      await upsertRolePermissions(
        organizationId,
        selectedRole,
        editingPermissions,
        isBuiltIn
      );

      await refreshPermissions();
      setSuccess('Permissions saved successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error saving permissions:', error);
      setError('Failed to save permissions');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const allRoles = [
    'owner', 'admin', 'coach', 'player', 'guardian',
    ...customRoles
  ];

  const tabs = [
    { id: 0, name: 'Manage Permissions' },
    { id: 1, name: 'Custom Roles' }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-secondary-900 mb-2">Role Permissions</h3>
        <p className="text-secondary-600 font-normal">
          Manage permissions for different roles in your organization
        </p>
      </div>

      {/* Success and Error Alerts */}
      {success && (
        <Alert variant="success">
          {success}
        </Alert>
      )}

      {error && (
        <Alert variant="error">
          {error}
        </Alert>
      )}

      {!hasSettingsWritePermission && (
        <Alert variant="warning">
          <div className="flex items-center gap-2">
            <AlertIcon />
            <span>You have read-only access to role permissions.</span>
          </div>
        </Alert>
      )}

      {/* Tabs */}
      <div className="border-b border-secondary-200">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              disabled={false}
              className={`py-4 px-1 border-b-2 font-semibold text-sm whitespace-nowrap transition-colors duration-200 ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 0 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-secondary-700">Select Role</label>
            <Select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
              <option value="">Choose a role to manage</option>
              {allRoles.map(role => (
                <option key={role} value={role}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </option>
              ))}
            </Select>
          </div>

          {selectedRole && (
            <Card>
              <CardBody>
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-2 text-sm font-medium text-secondary-700">
                    <div>Resource</div>
                    <div className="text-center">Read</div>
                    <div className="text-center">Write</div>
                    <div className="text-center">Delete</div>
                  </div>
                  
                  {resources.map(resource => {
                    const permission = editingPermissions.find(p => p.resource === resource.value);
                    const hasRead = permission?.actions.includes('read') || false;
                    const hasWrite = permission?.actions.includes('write') || false;
                    const hasDelete = permission?.actions.includes('delete') || false;
                    
                    return (
                      <div key={resource.value} className="grid grid-cols-4 gap-2 items-center py-2 border-t border-secondary-100">
                        <div className="text-sm font-medium">{resource.label}</div>
                        <div className="text-center">
                          <input
                            type="checkbox"
                            checked={hasRead}
                            onChange={(e) => handlePermissionChange(resource.value, 'read', e.target.checked)}
                            disabled={!hasSettingsWritePermission}
                            className="h-4 w-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500 disabled:opacity-50"
                          />
                        </div>
                        <div className="text-center">
                          <input
                            type="checkbox"
                            checked={hasWrite}
                            onChange={(e) => handlePermissionChange(resource.value, 'write', e.target.checked)}
                            disabled={!hasSettingsWritePermission}
                            className="h-4 w-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500 disabled:opacity-50"
                          />
                        </div>
                        <div className="text-center">
                          <input
                            type="checkbox"
                            checked={hasDelete}
                            onChange={(e) => handlePermissionChange(resource.value, 'delete', e.target.checked)}
                            disabled={!hasSettingsWritePermission}
                            className="h-4 w-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500 disabled:opacity-50"
                          />
                        </div>
                      </div>
                    );
                  })}

                  {hasSettingsWritePermission && (
                    <Button 
                      onClick={handleSavePermissions} 
                      loading={loading}
                      icon={<SaveIcon />}
                      className="w-full mt-6"
                    >
                      Save Permissions
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {activeTab === 1 && (
        <div className="space-y-4">
          {hasSettingsWritePermission ? (
            <div className="flex gap-2">
              <Input
                placeholder="Enter new role name (e.g., accountant)"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddCustomRole()}
                helperText="Cannot use reserved names: owner, admin, coach, player, guardian"
              />
              <Button onClick={handleAddCustomRole} loading={loading} icon={<PlusIcon />}>
                Add Role
              </Button>
            </div>
          ) : (
            <Alert variant="warning">
              <div className="flex items-center gap-2">
                <AlertIcon />
                <span>You need write permissions to create custom roles.</span>
              </div>
            </Alert>
          )}

          <Card>
            <CardBody>
              <h4 className="text-sm font-medium text-secondary-900 mb-4">Custom Roles</h4>
              {customRoles.length === 0 ? (
                <p className="text-sm text-secondary-600 font-normal">No custom roles created yet.</p>
              ) : (
                <div className="space-y-2">
                  {customRoles.map(role => (
                    <div key={role} className="flex items-center justify-between p-3 bg-secondary-50 rounded-lg">
                      <span className="text-sm font-medium">
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </span>
                      <button
                        onClick={() => handleDeleteCustomRole(role)}
                        disabled={loading}
                        className="p-1 text-secondary-400 hover:text-error-600 transition-colors disabled:opacity-50"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}