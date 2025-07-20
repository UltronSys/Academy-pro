import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Button,
  Input,
  Card,
  CardBody,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  Select,
  Avatar,
  Alert
} from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../contexts/AppContext';
import { usePermissions } from '../../hooks/usePermissions';
import { User, UserRole, Academy, Player, Settings, ParameterField, SkillField, FieldCategory } from '../../types';
import { getUsersByOrganization, getUsersByAcademy, updateUser, deleteUser, createUser } from '../../services/userService';
import { getAcademiesByOrganization } from '../../services/academyService';
import { createPlayer, getPlayerByUserId, updatePlayer, getPlayersByGuardianId } from '../../services/playerService';
import { getSettingsByOrganization, getFieldCategoriesForAcademy } from '../../services/settingsService';

// Icons - using simple SVG icons instead of Material UI icons
const SearchIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
  </svg>
);

const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const DeleteIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const MoreIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
  </svg>
);

const UserIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const SaveIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const Users: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { canWrite, canDelete } = usePermissions();
  const [users, setUsers] = useState<User[]>([]);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);
  const [guardians, setGuardians] = useState<User[]>([]);
  const [selectedGuardian, setSelectedGuardian] = useState<User | null>(null);
  const [linkedPlayers, setLinkedPlayers] = useState<User[]>([]);
  const [openGuardianDialog, setOpenGuardianDialog] = useState(false);
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianSearchResult, setGuardianSearchResult] = useState<User | null>(null);
  const [showCreateGuardian, setShowCreateGuardian] = useState(false);
  const [newGuardianData, setNewGuardianData] = useState({
    name: '',
    email: '',
    phone: ''
  });
  const [organizationSettings, setOrganizationSettings] = useState<Settings | null>(null);
  const [fieldCategories, setFieldCategories] = useState<FieldCategory[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    roles: [] as string[],
    academyId: [] as string[],
    dateOfBirth: '',
    gender: '',
    guardianId: [] as string[],
    dynamicFields: {} as Record<string, any>
  });
  
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [guardianCreateLoading, setGuardianCreateLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const { userData } = useAuth();
  const { selectedOrganization, selectedAcademy } = useApp();

  const steps = ['Full Name', 'Role Assignment', 'Contact Information', 'Player Details'];
  const isPlayerRole = formData.roles.includes('player');
  const shouldShowPlayerStep = isPlayerRole && dialogMode === 'add';
  const effectiveSteps = shouldShowPlayerStep ? steps : steps.slice(0, 3);

  const renderParameterField = (field: ParameterField) => {
    const fieldKey = field.name.toLowerCase().replace(/\s+/g, '_');
    const currentValue = formData.dynamicFields[fieldKey] || field.defaultValue;
    
    const handleFieldChange = (value: any) => {
      setFormData({
        ...formData,
        dynamicFields: {
          ...formData.dynamicFields,
          [fieldKey]: value
        }
      });
    };
    
    switch (field.type) {
      case 'text':
        return (
          <Input
            key={fieldKey}
            label={field.name}
            value={currentValue}
            onChange={(e) => handleFieldChange(e.target.value)}
            required={field.required}
            helperText={field.description}
          />
        );
      case 'number':
        return (
          <Input
            key={fieldKey}
            label={`${field.name}${field.unit ? ` (${field.unit})` : ''}`}
            type="number"
            value={currentValue}
            onChange={(e) => handleFieldChange(Number(e.target.value))}
            required={field.required}
            helperText={field.description}
          />
        );
      case 'date':
        return (
          <Input
            key={fieldKey}
            label={field.name}
            type="date"
            value={currentValue}
            onChange={(e) => handleFieldChange(e.target.value)}
            required={field.required}
            helperText={field.description}
          />
        );
      case 'dropdown':
        const dropdownOptions = field.options || ['No options configured'];
        
        return (
          <Select
            key={fieldKey}
            label={field.name}
            value={currentValue}
            onChange={(e) => handleFieldChange(e.target.value)}
            required={field.required}
            disabled={!field.options || field.options.length === 0}
            helperText={field.description || (!field.options || field.options.length === 0 ? 'No options configured for this field. Please update in settings.' : '')}
          >
            {dropdownOptions.map((option) => (
              <option key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </Select>
        );
      default:
        return null;
    }
  };

  const isParameterFieldsValid = () => {
    if (!isPlayerRole) return true;
    
    if (!formData.dateOfBirth || !formData.gender) {
      return false;
    }
    
    const allRequiredFields: ParameterField[] = [];
    
    fieldCategories.forEach(category => {
      if (category.type === 'parameter' || category.type === 'mixed') {
        const requiredFields = (category.fields || []).filter(field => field.required);
        allRequiredFields.push(...requiredFields);
      }
    });
    
    for (const field of allRequiredFields) {
      const fieldKey = field.name.toLowerCase().replace(/\s+/g, '_');
      const value = formData.dynamicFields[fieldKey];
      
      if (value === undefined || value === null || value === '') {
        return false;
      }
    }
    
    return true;
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const tabParam = urlParams.get('tab');
    const newTab = tabParam ? parseInt(tabParam, 10) : 0;
    setActiveTab(newTab);
    
    // Reset role filter when not on "All users" tab
    if (newTab !== 0) {
      setRoleFilter('all');
    }
  }, [location.search]);

  useEffect(() => {
    if (userData) {
      loadUsers();
      loadAcademies();
      loadSettings();
    }
  }, [userData, selectedAcademy]);

  useEffect(() => {
    if (userData) {
      loadSettings();
    }
  }, []);
  
  const loadSettings = async () => {
    try {
      const organizationId = userData?.roles[0]?.organizationId;
      if (organizationId) {
        const settings = await getSettingsByOrganization(organizationId);
        setOrganizationSettings(settings);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };
  
  useEffect(() => {
    if (organizationSettings && formData.academyId.length > 0) {
      const academyId = formData.academyId[0];
      const categories = getFieldCategoriesForAcademy(organizationSettings, academyId);
      setFieldCategories((categories || []).sort((a, b) => a.order - b.order));
    } else if (organizationSettings && organizationSettings.fieldCategories) {
      setFieldCategories(organizationSettings.fieldCategories.sort((a, b) => a.order - b.order));
    } else {
      setFieldCategories([]);
    }
  }, [organizationSettings, formData.academyId]);

  // Load settings when dialog opens
  useEffect(() => {
    if (openDialog && dialogMode === 'add') {
      loadSettings();
    }
  }, [openDialog, dialogMode]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const organizationId = userData?.roles[0]?.organizationId;
      
      if (organizationId) {
        let fetchedUsers: User[];
        
        if (selectedAcademy) {
          // Filter users by selected academy
          fetchedUsers = await getUsersByAcademy(organizationId, selectedAcademy.id);
        } else {
          // Show all organization users when no academy is selected
          fetchedUsers = await getUsersByOrganization(organizationId);
        }
        
        setUsers(fetchedUsers);
        
        const guardianUsers = fetchedUsers.filter(user => 
          user.roles.some(role => role.role.includes('guardian'))
        );
        setGuardians(guardianUsers);
      } else {
        // If no organizationId, show empty state
        setUsers([]);
        setGuardians([]);
      }
    } catch (error) {
      console.error('Error loading users:', error);
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const loadAcademies = async () => {
    try {
      const organizationId = userData?.roles[0]?.organizationId;
      
      if (organizationId) {
        try {
          const orgAcademies = await getAcademiesByOrganization(organizationId);
          setAcademies(orgAcademies);
        } catch (academyError) {
          console.error('Specific error loading academies:', academyError);
          setError('Failed to load academies');
        }
      } else {
        // If no organizationId, show empty academies
        setAcademies([]);
      }
    } catch (error) {
      console.error('Error loading academies:', error);
    }
  };

  const handleAddUser = async () => {
    setSelectedUser(null);
    setDialogMode('add');
    setActiveStep(0);
    setFormData({
      name: '',
      email: '',
      phone: '',
      password: '',
      roles: [],
      academyId: [],
      dateOfBirth: '',
      gender: '',
      guardianId: [],
      dynamicFields: {}
    });
    
    await loadSettings();
    setOpenDialog(true);
  };

  const handleEditUser = (user: User) => {
    navigate(`/users/edit/${user.id}`);
  };

  const handleDeleteUser = (user: User) => {
    setUserToDelete(user);
    setOpenDeleteDialog(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    
    try {
      setDeleteLoading(true);
      await deleteUser(userToDelete.id);
      await loadUsers();
      setOpenDeleteDialog(false);
      setUserToDelete(null);
    } catch (error) {
      console.error('Error deleting user:', error);
      setError('Failed to delete user');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleNext = () => {
    setError('');
    
    if (activeStep === 0) {
      if (!formData.name) {
        setError('Please enter the full name');
        return;
      }
    } else if (activeStep === 1) {
      if (formData.roles.length === 0) {
        setError('Please select at least one role');
        return;
      }
    } else if (activeStep === 2) {
      const isPlayerRole = formData.roles.includes('player');
      const isOnlyGuardian = formData.roles.every(role => role === 'guardian');
      
      if (!isPlayerRole && !isOnlyGuardian) {
        if (!formData.email || !formData.phone || !formData.password) {
          setError('Email, phone, and password are required for this role');
          return;
        }
        if (formData.password.length < 6) {
          setError('Password must be at least 6 characters');
          return;
        }
      } else if (!isPlayerRole && isOnlyGuardian && (!formData.email || !formData.phone)) {
        setError('Email and phone are required for guardian role');
        return;
      }
    }
    
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleSubmit = async () => {
    try {
      setSubmitLoading(true);
      const organizationId = userData?.roles?.[0]?.organizationId || '';
      
      let newUserId: string;
      
      // Check if user has roles that require login (not just player/guardian)
      const hasLoginRole = formData.roles.some(role => 
        !['player', 'guardian'].includes(role)
      );
      
      console.log('User creation debug:', {
        roles: formData.roles,
        hasLoginRole,
        email: formData.email,
        name: formData.name,
        organizationId
      });
      
      if (hasLoginRole) {
        console.log('Creating user with login credentials...');
        // Import createUserAsAdmin function
        const { createUserAsAdmin } = await import('../../services/authService');
        
        // Create Firebase Auth account for users who can log in
        // The admin will stay logged in thanks to the secondary app instance
        const { uid } = await createUserAsAdmin(formData.email, formData.password, formData.name);
        console.log('User created with UID:', uid);
        newUserId = uid;
        
        // Update user document with additional data and roles
        console.log('Updating user with roles and organization data...');
        await updateUser(newUserId, {
          phone: formData.phone,
          roles: formData.roles.map(role => ({ 
            role: [role],
            organizationId: organizationId,
            academyId: formData.academyId
          }))
        });
        console.log('User data updated successfully');
      } else {
        // For users with only player/guardian roles, create Firestore document only
        newUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await createUser({
          id: newUserId,
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          roles: formData.roles.map(role => ({ 
            role: [role],
            organizationId: organizationId,
            academyId: formData.academyId
          }))
        });
      }
      
      // If creating a player, also create player record
      if (formData.roles.includes('player')) {
        const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const dobValue = formData.dateOfBirth;
        const genderValue = formData.gender;
        
        await createPlayer({
          id: playerId,
          userId: newUserId,
          academyId: formData.academyId,
          organizationId: organizationId,
          dob: new Date(dobValue),
          gender: genderValue,
          guardianId: formData.guardianId,
          playerParameters: formData.dynamicFields
        });
      }
      
      // Reload users and close dialog
      await loadUsers();
      setOpenDialog(false);
      setActiveStep(0);
    } catch (error: any) {
      console.error('Error creating user:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      setError(`Failed to create user: ${error.message || 'Unknown error'}`);
    } finally {
      setSubmitLoading(false);
    }
  };

  const getFilteredUsers = () => {
    let filteredByTab = users;
    
    switch (activeTab) {
      case 1:
        filteredByTab = users.filter(user => user.roles?.some(role => role.role.includes('player')));
        break;
      case 2:
        filteredByTab = users.filter(user => user.roles?.some(role => role.role.includes('coach')));
        break;
      case 3:
        filteredByTab = users.filter(user => user.roles?.some(role => role.role.includes('guardian')));
        break;
      case 4:
        filteredByTab = users.filter(user => user.roles?.some(role => role.role.includes('admin') || role.role.includes('owner')));
        break;
      default:
        filteredByTab = users;
    }
    
    return filteredByTab.filter(user => {
      const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           user.email.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesRole = roleFilter === 'all' || (user.roles && user.roles.some(role => role.role.includes(roleFilter)));
      
      return matchesSearch && matchesRole;
    });
  };

  const filteredUsers = getFilteredUsers();

  const getRoleChips = (roles: UserRole[]) => {
    if (!roles || roles.length === 0) {
      return <Badge variant="default">No roles</Badge>;
    }
    
    const allRoles = roles.flatMap(role => role.role);
    const uniqueRoles = Array.from(new Set(allRoles));
    
    return (
      <div className="flex flex-wrap gap-1">
        {uniqueRoles.map((role, index) => (
          <Badge
            key={index}
            variant={role === 'owner' ? 'error' : role === 'admin' ? 'warning' : 'default'}
            size="sm"
          >
            {role}
          </Badge>
        ))}
      </div>
    );
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getUserAcademies = (userRoles: UserRole[]) => {
    if (!userRoles || userRoles.length === 0) return 'No academies';
    
    const academyIds = userRoles.flatMap(role => role.academyId);
    
    if (academyIds.length === 0) {
      return 'Organization-wide';
    }
    
    const academyNames = academyIds.map(id => {
      const academy = academies.find(a => a.id === id);
      return academy?.name || 'Unknown Academy';
    });
    
    return academyNames.join(', ');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-secondary-900">Users Management</h1>
          <p className="text-secondary-600 mt-1 font-normal text-sm sm:text-base">
            Your Academy: {getUserAcademies(userData?.roles || [])}
          </p>
        </div>
        {canWrite('users') && (
          <Button
            onClick={handleAddUser}
            loading={loading}
            icon={<PlusIcon />}
            className="bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 w-full sm:w-auto"
          >
            {loading ? 'Loading...' : 'Add User'}
          </Button>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="error">
          {error}
        </Alert>
      )}

      {/* Search and Filter Card */}
      <Card>
        <CardBody>
          <div className={`grid grid-cols-1 gap-4 ${activeTab === 0 ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<SearchIcon />}
              label="Search Users"
            />
            {activeTab === 0 && (
              <Select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                label="Filter by Role"
              >
                <option value="all">All Roles</option>
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="coach">Coach</option>
                <option value="player">Player</option>
                <option value="guardian">Guardian</option>
              </Select>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Users Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Academy</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow 
                key={user.id}
                className="cursor-pointer hover:bg-secondary-50 transition-colors duration-200"
                onClick={() => navigate(`/users/${user.id}`)}
              >
                <TableCell>
                  <div className="flex items-center space-x-3">
                    <Avatar size="md">
                      {getInitials(user.name)}
                    </Avatar>
                    <div>
                      <div className="font-semibold text-secondary-900">{user.name}</div>
                      <div className="text-secondary-600 text-sm font-normal">{user.phone || 'No phone'}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-secondary-900 font-normal">{user.email}</div>
                </TableCell>
                <TableCell>
                  <div className="text-secondary-700 font-normal">{getUserAcademies(user.roles)}</div>
                </TableCell>
                <TableCell>
                  {getRoleChips(user.roles)}
                </TableCell>
                <TableCell>
                  <div className="text-secondary-700 font-normal">
                    {user.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end space-x-2">
                    {canWrite('users') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditUser(user);
                        }}
                        className="p-2 text-secondary-400 hover:text-primary-600 transition-colors duration-200"
                        title="Edit User"
                      >
                        <EditIcon />
                      </button>
                    )}
                    {canDelete('users') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteUser(user);
                        }}
                        className="p-2 text-secondary-400 hover:text-error-600 transition-colors duration-200"
                        title="Delete User"
                    >
                      <DeleteIcon />
                    </button>
                    )}
                    {user.roles.some(role => role.role.includes('guardian')) && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          setSelectedGuardian(user);
                          try {
                            const players = await getPlayersByGuardianId(user.id);
                            const playerUsers = await Promise.all(
                              players.map(async (player) => {
                                const userDoc = users.find(u => u.id === player.userId);
                                return userDoc;
                              })
                            );
                            setLinkedPlayers(playerUsers.filter(u => u !== undefined) as User[]);
                            setOpenGuardianDialog(true);
                          } catch (error) {
                            console.error('Error loading linked players:', error);
                            setError('Failed to load linked players');
                          }
                        }}
                        className="p-2 text-secondary-400 hover:text-primary-600 transition-colors duration-200"
                        title="View Linked Players"
                      >
                        <UserIcon />
                      </button>
                    )}
                    <button
                      className="p-2 text-secondary-400 hover:text-secondary-600 transition-colors duration-200"
                      title="More Options"
                    >
                      <MoreIcon />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredUsers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="text-secondary-600 font-normal">
                    {searchTerm || roleFilter !== 'all'
                      ? 'No users found matching your criteria'
                      : 'No users found'
                    }
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </Card>

      {/* Delete Confirmation Modal */}
      {openDeleteDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-secondary-900 mb-4">Confirm Delete</h3>
            <p className="text-secondary-700 mb-2 font-normal">
              Are you sure you want to delete {userToDelete?.name}?
            </p>
            <p className="text-sm text-secondary-600 mb-6 font-normal">
              This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="secondary"
                onClick={() => setOpenDeleteDialog(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={deleteLoading}
                onClick={confirmDeleteUser}
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Guardian's Linked Players Modal */}
      {openGuardianDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-secondary-200">
              <h3 className="text-lg font-semibold text-secondary-900">
                Players Linked to {selectedGuardian?.name}
              </h3>
              <button
                onClick={() => setOpenGuardianDialog(false)}
                className="text-secondary-400 hover:text-secondary-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              {linkedPlayers.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-secondary-600 font-normal">
                    No players are currently linked to this guardian.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Academy</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkedPlayers.map((player) => (
                      <TableRow key={player.id}>
                        <TableCell>
                          <div className="flex items-center space-x-3">
                            <Avatar size="sm">
                              {getInitials(player.name)}
                            </Avatar>
                            <div className="text-sm font-normal">{player.name}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-normal">{player.email}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-secondary-700 font-normal">
                            {getUserAcademies(player.roles)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleEditUser(player)}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <div className="flex justify-end p-6 border-t border-secondary-200">
              <Button
                variant="secondary"
                onClick={() => setOpenGuardianDialog(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {openDialog && dialogMode === 'add' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-secondary-200">
            {/* Modal Header */}
            <div className="bg-white border-b border-secondary-200 p-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-secondary-900">Add New User</h3>
                    <p className="text-secondary-600 text-sm font-normal">Create a new member account</p>
                  </div>
                </div>
                <button
                  onClick={() => setOpenDialog(false)}
                  className="text-secondary-400 hover:text-secondary-600 transition-colors duration-200 p-2 hover:bg-secondary-100 rounded-lg"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-8 overflow-y-auto max-h-[calc(90vh-220px)]">
              {/* Error Alert */}
              {error && (
                <Alert variant="error" className="mb-6">
                  {error}
                </Alert>
              )}
              
              {/* Enhanced Stepper */}
              {effectiveSteps.length > 1 && (
                <div className="mb-8">
                  <div className="relative">
                    {/* Progress bar background */}
                    <div className="absolute top-4 left-4 right-4 h-0.5 bg-secondary-200"></div>
                    {/* Progress bar fill */}
                    <div 
                      className="absolute top-4 left-4 h-0.5 bg-primary-600 transition-all duration-300 ease-in-out"
                      style={{ width: `${(activeStep / (effectiveSteps.length - 1)) * 100}%` }}
                    ></div>
                    
                    <div className="relative flex justify-between">
                      {effectiveSteps.map((step, index) => (
                        <div key={step} className="flex flex-col items-center">
                          <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-300 ${
                            index <= activeStep 
                              ? 'bg-primary-600 border-primary-600 text-white shadow-lg' 
                              : 'border-secondary-300 text-secondary-400 bg-white'
                          }`}>
                            {index < activeStep ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <span className="text-sm font-semibold">{index + 1}</span>
                            )}
                          </div>
                          <span className={`text-xs mt-2 font-medium transition-colors duration-300 ${
                            index <= activeStep ? 'text-primary-600' : 'text-secondary-500'
                          }`}>
                            {step}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Form Steps */}
              <div className="min-h-[300px]">
                {/* Step 1: Full Name */}
                {activeStep === 0 && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="text-center mb-8">
                      <div className="w-16 h-16 bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <h2 className="text-2xl font-bold text-secondary-900 mb-2">Personal Information</h2>
                      <p className="text-secondary-600 font-normal">Let's start with the basic information</p>
                    </div>
                    <div className="bg-secondary-50 rounded-xl p-6">
                      <Input
                        label="Full Name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        helperText="Enter the user's complete full name"
                        autoFocus
                        className="text-lg"
                      />
                    </div>
                  </div>
                )}
                
                {/* Step 2: Role Assignment */}
                {activeStep === 1 && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="text-center mb-8">
                      <div className="w-16 h-16 bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <h2 className="text-2xl font-bold text-secondary-900 mb-2">Roles & Permissions</h2>
                      <p className="text-secondary-600 font-normal">Assign roles and academy access</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Academies Card */}
                      <div className="bg-secondary-50 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                            </svg>
                          </div>
                          <h3 className="font-semibold text-secondary-900">Academy Access</h3>
                        </div>
                        
                        <Select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              const updatedAcademyIds = [...formData.academyId, e.target.value];
                              setFormData({ ...formData, academyId: updatedAcademyIds });
                            }
                          }}
                        >
                          <option value="">Select an academy</option>
                          {academies.filter(academy => !formData.academyId.includes(academy.id)).map((academy) => (
                            <option key={academy.id} value={academy.id}>
                              {academy.name}
                            </option>
                          ))}
                        </Select>
                        
                        {formData.academyId.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {formData.academyId.map((academyId) => {
                              const academy = academies.find(a => a.id === academyId);
                              return (
                                <Badge key={academyId} variant="primary" className="flex items-center gap-2">
                                  {academy?.name || academyId}
                                  <button
                                    onClick={() => setFormData({
                                      ...formData,
                                      academyId: formData.academyId.filter(id => id !== academyId)
                                    })}
                                    className="text-primary-600 hover:text-primary-800"
                                  >
                                    <DeleteIcon />
                                  </button>
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                        
                        <p className="text-xs text-secondary-600 font-normal mt-3">
                          {formData.academyId.length === 0 ? 'Organization-wide access' : `${formData.academyId.length} selected`}
                        </p>
                      </div>

                      {/* Roles Card */}
                      <div className="bg-secondary-50 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                            </svg>
                          </div>
                          <h3 className="font-semibold text-secondary-900">User Roles</h3>
                        </div>
                        
                        <Select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              const updatedRoles = [...formData.roles, e.target.value];
                              setFormData({ ...formData, roles: updatedRoles });
                            }
                          }}
                        >
                          <option value="">Select a role</option>
                          {[
                            'owner', 'admin', 'coach', 'player', 'guardian',
                            ...(organizationSettings?.customRoles || [])
                          ].filter(role => !formData.roles.includes(role)).map((role) => (
                            <option key={role} value={role}>
                              {role.charAt(0).toUpperCase() + role.slice(1)}
                            </option>
                          ))}
                        </Select>
                        
                        {formData.roles.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {formData.roles.map((role) => (
                              <Badge 
                                key={role} 
                                variant={role === 'owner' ? 'error' : role === 'admin' ? 'warning' : 'default'}
                                className="flex items-center gap-2"
                              >
                                {role.charAt(0).toUpperCase() + role.slice(1)}
                                <button
                                  onClick={() => setFormData({
                                    ...formData,
                                    roles: formData.roles.filter(r => r !== role)
                                  })}
                                  className="hover:text-current"
                                >
                                  <DeleteIcon />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                        
                        <p className="text-xs text-secondary-600 font-normal mt-3">
                          {formData.roles.length === 0 ? 'At least one role required' : `${formData.roles.length} selected`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Step 3: Contact Information */}
                {activeStep === 2 && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="text-center mb-8">
                      <div className="w-16 h-16 bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <h2 className="text-2xl font-bold text-secondary-900 mb-2">Contact Information</h2>
                      <p className="text-secondary-600 font-normal">
                        {formData.roles.includes('player') 
                          ? 'Contact details are optional for players' 
                          : 'Required contact information for this role'
                        }
                      </p>
                    </div>
                    
                    <div className="bg-secondary-50 rounded-xl p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="font-semibold text-secondary-900">Contact Details</h3>
                          <p className="text-xs text-secondary-600 font-normal">
                            {formData.roles.includes('player') 
                              ? 'Optional - can be added later if needed' 
                              : 'Required for account creation and communication'
                            }
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input
                            label={formData.roles.includes('player') ? "Email Address (Optional)" : "Email Address"}
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            required={!formData.roles.includes('player')}
                            helperText={formData.roles.includes('player') 
                              ? "Optional - Can be added later if needed"
                              : "This will be used for login"
                            }
                          />
                          <Input
                            label={formData.roles.includes('player') ? "Phone Number (Optional)" : "Phone Number"}
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            required={!formData.roles.includes('player')}
                            helperText={formData.roles.includes('player') 
                              ? "Optional - Can be added later if needed"
                              : "Required for this role"
                            }
                          />
                        </div>
                        
                        {/* Password field for non-player roles */}
                        {!formData.roles.includes('player') && !formData.roles.every(role => role === 'guardian') && (
                          <Input
                            label="Password"
                            type="password"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            required
                            helperText="Minimum 6 characters. User will use this password to login"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Step 4: Player Details */}
                {activeStep === 3 && isPlayerRole && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="text-center mb-8">
                      <div className="w-16 h-16 bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 7.172V5L8 4z" />
                        </svg>
                      </div>
                      <h2 className="text-2xl font-bold text-secondary-900 mb-2">Player Details</h2>
                      <p className="text-secondary-600 font-normal">Essential information for player registration</p>
                    </div>
                    
                    {/* Required Fields Card */}
                    <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-6 border border-primary-200">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-primary-900">Required Information</h3>
                          <p className="text-sm text-primary-700 font-normal">These details are mandatory for all players</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Input
                            label="Date of Birth"
                            type="date"
                            value={formData.dateOfBirth}
                            onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                            required
                            helperText="Required for age verification and categorization"
                          />
                        </div>
                        <div className="space-y-2">
                          <Select
                            label="Gender"
                            value={formData.gender}
                            onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                            required
                          >
                            <option value="">Select gender</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Other</option>
                          </Select>
                        </div>
                      </div>
                    </div>
                    
                    {/* Guardian Selection */}
                    <div className="bg-gradient-to-br from-secondary-50 to-secondary-100 rounded-xl p-6 border border-secondary-200">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 bg-secondary-600 rounded-xl flex items-center justify-center">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-secondary-900">Guardian Assignment</h3>
                          <p className="text-sm text-secondary-700 font-normal">Link this player to their guardian(s)</p>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-secondary-700">
                            Select Guardian(s) <span className="text-secondary-500">(Optional)</span>
                          </label>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {guardians.length > 0 ? (
                              guardians.map((guardian) => (
                                <div key={guardian.id} className="flex items-center space-x-3 p-3 bg-white rounded-lg border border-secondary-200 hover:border-primary-300 transition-colors">
                                  <input
                                    type="checkbox"
                                    id={`guardian-${guardian.id}`}
                                    checked={formData.guardianId.includes(guardian.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setFormData({
                                          ...formData,
                                          guardianId: [...formData.guardianId, guardian.id]
                                        });
                                      } else {
                                        setFormData({
                                          ...formData,
                                          guardianId: formData.guardianId.filter(id => id !== guardian.id)
                                        });
                                      }
                                    }}
                                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-secondary-300 rounded"
                                  />
                                  <Avatar size="sm">
                                    {getInitials(guardian.name)}
                                  </Avatar>
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-secondary-900">{guardian.name}</div>
                                    <div className="text-xs text-secondary-600">{guardian.email}</div>
                                    {guardian.phone && (
                                      <div className="text-xs text-secondary-600">{guardian.phone}</div>
                                    )}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-center py-6 text-secondary-600">
                                <p className="text-sm font-normal">No guardians available.</p>
                                <p className="text-xs text-secondary-500 mt-1">Create guardian users first to link them to players.</p>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Guardian Search and Creation */}
                        <div className="border-t border-secondary-200 pt-4">
                          <div className="flex items-center gap-2 mb-3">
                            <svg className="w-5 h-5 text-secondary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <span className="text-sm font-medium text-secondary-700">Search or Create Guardian</span>
                          </div>
                          
                          <div className="space-y-3">
                            <div className="flex gap-2">
                              <Input
                                placeholder="Enter guardian's phone number"
                                value={guardianPhone}
                                onChange={(e) => setGuardianPhone(e.target.value)}
                                className="flex-1"
                              />
                              <Button
                                variant="outline"
                                onClick={async () => {
                                  if (!guardianPhone.trim()) {
                                    setError('Please enter a phone number');
                                    return;
                                  }
                                  
                                  try {
                                    // Search for existing guardian by phone
                                    const existingGuardian = users.find(user => 
                                      user.phone === guardianPhone.trim() && 
                                      user.roles.some(role => role.role.includes('guardian'))
                                    );
                                    
                                    if (existingGuardian) {
                                      setGuardianSearchResult(existingGuardian);
                                      setShowCreateGuardian(false);
                                    } else {
                                      setGuardianSearchResult(null);
                                      setShowCreateGuardian(true);
                                      setNewGuardianData({
                                        name: '',
                                        email: '',
                                        phone: guardianPhone.trim()
                                      });
                                    }
                                  } catch (error) {
                                    console.error('Error searching guardian:', error);
                                    setError('Failed to search for guardian');
                                  }
                                }}
                                disabled={!guardianPhone.trim()}
                              >
                                Search
                              </Button>
                            </div>
                            
                            {/* Search Result - Existing Guardian */}
                            {guardianSearchResult && (
                              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-3">
                                    <Avatar size="sm">
                                      {getInitials(guardianSearchResult.name)}
                                    </Avatar>
                                    <div>
                                      <div className="text-sm font-medium text-green-900">{guardianSearchResult.name}</div>
                                      <div className="text-xs text-green-700">{guardianSearchResult.email}</div>
                                      <div className="text-xs text-green-700">{guardianSearchResult.phone}</div>
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      if (!formData.guardianId.includes(guardianSearchResult.id)) {
                                        setFormData({
                                          ...formData,
                                          guardianId: [...formData.guardianId, guardianSearchResult.id]
                                        });
                                      }
                                      setGuardianSearchResult(null);
                                      setGuardianPhone('');
                                    }}
                                    disabled={formData.guardianId.includes(guardianSearchResult.id)}
                                  >
                                    {formData.guardianId.includes(guardianSearchResult.id) ? 'Already Linked' : 'Link Guardian'}
                                  </Button>
                                </div>
                              </div>
                            )}
                            
                            {/* Create New Guardian */}
                            {showCreateGuardian && (
                              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                                <div className="flex items-center gap-2 mb-3">
                                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                  </svg>
                                  <span className="text-sm font-medium text-blue-900">Create New Guardian</span>
                                </div>
                                
                                <div className="space-y-3">
                                  <Input
                                    label="Guardian Name"
                                    value={newGuardianData.name}
                                    onChange={(e) => setNewGuardianData({
                                      ...newGuardianData,
                                      name: e.target.value
                                    })}
                                    required
                                    placeholder="Enter guardian's full name"
                                  />
                                  
                                  <Input
                                    label="Guardian Email (Optional)"
                                    type="email"
                                    value={newGuardianData.email}
                                    onChange={(e) => setNewGuardianData({
                                      ...newGuardianData,
                                      email: e.target.value
                                    })}
                                    placeholder="Enter guardian's email (optional)"
                                  />
                                  
                                  <Input
                                    label="Guardian Phone"
                                    value={newGuardianData.phone}
                                    onChange={(e) => setNewGuardianData({
                                      ...newGuardianData,
                                      phone: e.target.value
                                    })}
                                    required
                                    placeholder="Guardian's phone number"
                                  />
                                  
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      onClick={() => {
                                        setShowCreateGuardian(false);
                                        setNewGuardianData({ name: '', email: '', phone: '' });
                                        setGuardianPhone('');
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      onClick={async () => {
                                        if (!newGuardianData.name || !newGuardianData.phone) {
                                          setError('Guardian name and phone number are required');
                                          return;
                                        }
                                        
                                        try {
                                          setGuardianCreateLoading(true);
                                          
                                          // Create guardian user
                                          const organizationId = userData?.roles[0]?.organizationId;
                                          if (!organizationId) {
                                            setError('Organization not found');
                                            return;
                                          }
                                          
                                          // Generate unique ID for the new guardian
                                          const guardianId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                                          
                                          const newGuardian = await createUser({
                                            id: guardianId,
                                            email: newGuardianData.email,
                                            name: newGuardianData.name,
                                            phone: newGuardianData.phone,
                                            roles: [{
                                              role: ['guardian'],
                                              organizationId: organizationId,
                                              academyId: []
                                            }]
                                          });
                                          
                                          // Add to guardians list with proper typing
                                          const guardianWithTimestamps: User = {
                                            ...newGuardian,
                                            createdAt: new Date() as any,
                                            updatedAt: new Date() as any
                                          };
                                          setGuardians(prev => [...prev, guardianWithTimestamps]);
                                          
                                          // Link to current player
                                          setFormData({
                                            ...formData,
                                            guardianId: [...formData.guardianId, newGuardian.id]
                                          });
                                          
                                          // Reset form
                                          setShowCreateGuardian(false);
                                          setNewGuardianData({ name: '', email: '', phone: '' });
                                          setGuardianPhone('');
                                          
                                        } catch (error) {
                                          console.error('Error creating guardian:', error);
                                          setError('Failed to create guardian');
                                        } finally {
                                          setGuardianCreateLoading(false);
                                        }
                                      }}
                                      loading={guardianCreateLoading}
                                      disabled={!newGuardianData.name || !newGuardianData.phone}
                                    >
                                      {guardianCreateLoading ? 'Creating...' : 'Create & Link Guardian'}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {formData.guardianId.length > 0 && (
                          <div className="mt-4 p-3 bg-primary-50 rounded-lg border border-primary-200">
                            <div className="flex items-center gap-2 text-sm text-primary-700">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="font-medium">
                                {formData.guardianId.length} guardian(s) selected
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Custom Category Fields */}
                    {fieldCategories.length > 0 ? (
                      <div className="space-y-6">
                        <h3 className="text-lg font-semibold text-secondary-900">Additional Information</h3>
                        {fieldCategories
                          .filter(category => category.type === 'parameter' || category.type === 'mixed')
                          .sort((a, b) => a.order - b.order)
                          .map(category => {
                            const categoryFields = category.fields || [];
                            
                            return (
                              <Card key={category.id}>
                                <CardBody>
                                  <h4 className="text-base font-semibold text-secondary-900 mb-2">{category.name}</h4>
                                  {category.description && (
                                    <p className="text-sm text-secondary-700 mb-4 font-normal">{category.description}</p>
                                  )}
                                  {categoryFields.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {categoryFields
                                        .sort((a, b) => a.order - b.order)
                                        .map(field => (
                                          <div key={field.name}>
                                            {renderParameterField(field)}
                                          </div>
                                        ))}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-secondary-500 italic">No fields added to this category yet.</p>
                                  )}
                                </CardBody>
                              </Card>
                            );
                          })}
                      </div>
                    ) : (
                      <div className="bg-secondary-50 rounded-xl p-6 border border-secondary-200 text-center">
                        <div className="w-12 h-12 bg-secondary-200 rounded-xl flex items-center justify-center mx-auto mb-4">
                          <svg className="w-6 h-6 text-secondary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h3 className="text-base font-semibold text-secondary-900 mb-2">No Additional Fields</h3>
                        <p className="text-sm text-secondary-600">
                          {formData.academyId.length === 0 
                            ? "Please select an academy in step 2 to see academy-specific fields, or add field categories in Settings."
                            : "No custom field categories have been created for this academy yet. You can add them in Settings."
                          }
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Enhanced Action Buttons */}
            <div className="bg-secondary-50 border-t border-secondary-200 p-6">
              <div className="flex justify-between items-center">
                <Button 
                  variant="secondary"
                  onClick={() => setOpenDialog(false)}
                  className="px-6 py-3"
                >
                  Cancel
                </Button>
                <div className="flex items-center space-x-3">
                  {activeStep > 0 && (
                    <Button 
                      variant="outline"
                      onClick={handleBack}
                      icon={<ArrowLeftIcon />}
                      className="px-6 py-3"
                    >
                      Back
                    </Button>
                  )}
                  {activeStep < effectiveSteps.length - 1 ? (
                    <Button 
                      onClick={handleNext}
                      disabled={
                        activeStep === 0 ? !formData.name : 
                        activeStep === 1 ? formData.roles.length === 0 :
                        activeStep === 2 ? (
                          formData.roles.includes('player') ? false :
                          formData.roles.every(role => role === 'guardian') ? 
                            (!formData.email || !formData.phone) :
                            (!formData.email || !formData.phone || !formData.password)
                        ) :
                        false
                      }
                      icon={<ArrowRightIcon />}
                      className="flex-row-reverse bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 px-8 py-3 shadow-lg"
                    >
                      Continue
                    </Button>
                  ) : (
                    <Button 
                      onClick={handleSubmit}
                      loading={submitLoading}
                      disabled={
                        !formData.name || 
                        formData.roles.length === 0 || 
                        (!formData.roles.includes('player') && !formData.roles.every(role => role === 'guardian') && (!formData.email || !formData.phone || !formData.password)) ||
                        (!formData.roles.includes('player') && formData.roles.every(role => role === 'guardian') && (!formData.email || !formData.phone)) ||
                        (isPlayerRole && activeStep === 3 && !isParameterFieldsValid())
                      }
                      icon={<SaveIcon />}
                      className="bg-gradient-to-r from-success-600 to-success-700 hover:from-success-700 hover:to-success-800 px-8 py-3 shadow-lg"
                    >
                      {submitLoading ? 'Creating User...' : 'Create User'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;