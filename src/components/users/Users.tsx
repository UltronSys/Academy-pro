import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Button,
  Input,
  Card,
  CardBody,
  Badge,
  Select,
  Avatar,
  Alert,
  DataTable
} from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../contexts/AppContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useSettingsContext } from '../../contexts/SettingsContext';
import { User, UserRole, Academy, ParameterField, FieldCategory } from '../../types';
import { updateUser, deleteUser, createUser } from '../../services/userService';
import { getAcademiesByOrganization } from '../../services/academyService';
import { createPlayer, getPlayerByUserId, updatePlayer, getPlayersByOrganization, getPlayersByGuardianId } from '../../services/playerService';
import { getFieldCategoriesForAcademy } from '../../services/settingsService';
import { searchUsers as searchUsersAlgolia } from '../../services/algoliaService';
import PlayerGuardiansDialog from './PlayerGuardiansDialog';
import GuardianPlayersDialog from './GuardianPlayersDialog';

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


// Helper function to get user initials
const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
};

// Component to load and display guardian details when not available in local state
const LinkedGuardianLoader: React.FC<{
  guardianId: string;
  onUnlink: () => void;
}> = ({ guardianId, onUnlink }) => {
  const [guardian, setGuardian] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { userData } = useAuth();

  useEffect(() => {
    const loadGuardianDetails = async () => {
      try {
        setLoading(true);
        const organizationId = userData?.roles[0]?.organizationId;
        if (!organizationId) return;

        // Search for the guardian by ID using Algolia
        const results = await searchUsersAlgolia({
          query: '',
          organizationId,
          filters: {
            role: 'guardian'
          },
          page: 0,
          hitsPerPage: 100
        });

        const foundGuardian = results.users.find(record => record.objectID === guardianId);
        if (foundGuardian) {
          const guardianUser: User = {
            id: foundGuardian.objectID,
            name: foundGuardian.name,
            email: foundGuardian.email || '',
            phone: foundGuardian.phone,
            roles: foundGuardian.roleDetails || [],
            createdAt: foundGuardian.createdAt ? 
              { 
                toDate: () => new Date(foundGuardian.createdAt!), 
                seconds: Math.floor((foundGuardian.createdAt || 0) / 1000),
                nanoseconds: 0,
                toMillis: () => foundGuardian.createdAt || 0,
                isEqual: () => false,
                toJSON: () => ({ seconds: Math.floor((foundGuardian.createdAt || 0) / 1000), nanoseconds: 0 })
              } as any : undefined,
            updatedAt: foundGuardian.updatedAt ? 
              { 
                toDate: () => new Date(foundGuardian.updatedAt!), 
                seconds: Math.floor((foundGuardian.updatedAt || 0) / 1000),
                nanoseconds: 0,
                toMillis: () => foundGuardian.updatedAt || 0,
                isEqual: () => false,
                toJSON: () => ({ seconds: Math.floor((foundGuardian.updatedAt || 0) / 1000), nanoseconds: 0 })
              } as any : undefined
          };
          setGuardian(guardianUser);
        }
      } catch (error) {
        console.error('Error loading guardian details:', error);
      } finally {
        setLoading(false);
      }
    };

    loadGuardianDetails();
  }, [guardianId, userData]);

  if (loading) {
    return (
      <div className="flex items-center justify-between bg-gray-50 p-3 rounded border">
        <div className="text-sm text-gray-600">Loading guardian details...</div>
        <Button size="sm" variant="outline" onClick={onUnlink}>
          Unlink
        </Button>
      </div>
    );
  }

  if (!guardian) {
    return (
      <div className="flex items-center justify-between bg-gray-50 p-3 rounded border">
        <div className="text-sm text-gray-600">Guardian ID: {guardianId}</div>
        <Button size="sm" variant="outline" onClick={onUnlink}>
          Unlink
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between bg-white p-3 rounded border">
      <div className="flex items-center space-x-3">
        <Avatar size="sm">
          {getInitials(guardian.name)}
        </Avatar>
        <div>
          <div className="text-sm font-medium text-gray-900">{guardian.name}</div>
          <div className="text-xs text-gray-600">{guardian.email}</div>
          {guardian.phone && (
            <div className="text-xs text-gray-600">{guardian.phone}</div>
          )}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onUnlink}>
        Unlink
      </Button>
    </div>
  );
};

const Users: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { canWrite, canDelete } = usePermissions();
  const { organizationSettings } = useSettingsContext();
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
  const [guardians, setGuardians] = useState<User[]>([]);
  const [selectedGuardian, setSelectedGuardian] = useState<User | null>(null);
  const [linkedPlayers, setLinkedPlayers] = useState<User[]>([]);
  const [openGuardianDialog, setOpenGuardianDialog] = useState(false);
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianSearchResult, setGuardianSearchResult] = useState<User | null>(null);
  const [showCreateGuardian, setShowCreateGuardian] = useState(false);
  const [guardianCreationLoading, setGuardianCreationLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<User | null>(null);
  const [selectedGuardianForPlayers, setSelectedGuardianForPlayers] = useState<User | null>(null);
  const [showLinkPlayersModal, setShowLinkPlayersModal] = useState(false);
  const [selectedPlayersToLink, setSelectedPlayersToLink] = useState<string[]>([]);
  const [availablePlayersForLinking, setAvailablePlayersForLinking] = useState<User[]>([]);
  const [success, setSuccess] = useState('');

  // Algolia search states
  // Always use Algolia for search
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDebounceTimer, setSearchDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  const [newGuardianData, setNewGuardianData] = useState({
    name: '',
    email: '',
    phone: ''
  });
  const [fieldCategories, setFieldCategories] = useState<FieldCategory[]>([]);
  const [tableRenderKey, setTableRenderKey] = useState(Date.now());
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
    status: '',
    dynamicFields: {} as Record<string, any>
  });
  
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const { userData } = useAuth();
  const { selectedAcademy, setSelectedAcademy } = useApp();

  const isRolePreset = formData.roles.length > 0 && dialogMode === 'add' && activeTab !== 0;
  const isPlayerRole = formData.roles.includes('player');
  const steps = dialogMode === 'edit' 
    ? (isPlayerRole ? ['User Information', 'Contact Information', 'Player Details'] : ['User Information', 'Contact Information'])
    : isRolePreset 
      ? ['Full Name', 'Contact Information', 'Player Details']
      : ['Full Name', 'Role Assignment', 'Contact Information', 'Player Details'];
  const shouldShowPlayerStep = isPlayerRole; // Show player step for both add and edit modes
  const effectiveSteps = shouldShowPlayerStep 
    ? steps 
    : isRolePreset 
      ? steps.slice(0, 2) 
      : steps.slice(0, 3);


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
    
    if (!formData.dateOfBirth || !formData.gender || !formData.status) {
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
    
    // Clear search term when switching to guardians tab
    if (newTab === 3) {
      setSearchTerm('');
    }
  }, [location.search]);

  useEffect(() => {
    if (userData) {
      // Search normally for all tabs including guardians
      performAlgoliaSearch(searchTerm, 0);

      loadAcademies();
    }
  }, [userData, selectedAcademy, activeTab, searchTerm, roleFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Algolia search function
  const performAlgoliaSearch = async (query: string = searchTerm, page: number = 0) => {
    const organizationId = userData?.roles[0]?.organizationId;
    if (!organizationId) return;
    
    setSearchLoading(true);
    try {
      // Determine role filter based on active tab and dropdown selection
      let roleFilterValue = 'all';
      if (activeTab === 1) roleFilterValue = 'player';
      else if (activeTab === 2) roleFilterValue = 'coach';
      else if (activeTab === 3) roleFilterValue = 'guardian';
      else if (activeTab === 0) {
        // For "All Users" tab, use the dropdown filter value
        roleFilterValue = roleFilter;
      }
      
      
      let results;
      
      if (activeTab === 4) {
        // For admin tab, we need to search for both admin and owner roles
        // Since Algolia can only filter by one role at a time, we'll do two searches and combine results
        
        const [adminResults, ownerResults] = await Promise.all([
          searchUsersAlgolia({
            query,
            organizationId,
            filters: {
              role: 'admin',
              academyId: selectedAcademy?.id
            },
            page,
            hitsPerPage: 10
          }),
          searchUsersAlgolia({
            query,
            organizationId,
            filters: {
              role: 'owner',
              academyId: selectedAcademy?.id
            },
            page,
            hitsPerPage: 10
          })
        ]);
        
        
        // Combine results and remove duplicates
        const combinedUsers = [...adminResults.users, ...ownerResults.users];
        const uniqueUsers = combinedUsers.filter((user, index, self) => 
          index === self.findIndex(u => u.objectID === user.objectID)
        );
        
        results = {
          users: uniqueUsers,
          totalUsers: adminResults.totalUsers + ownerResults.totalUsers,
          currentPage: page,
          totalPages: Math.ceil((adminResults.totalUsers + ownerResults.totalUsers) / 10),
          processingTimeMS: Math.max(adminResults.processingTimeMS, ownerResults.processingTimeMS)
        };
      } else {
        const searchFilters = {
          role: roleFilterValue !== 'all' ? roleFilterValue : undefined,
          academyId: selectedAcademy?.id
        };
        
        results = await searchUsersAlgolia({
          query,
          organizationId,
          filters: searchFilters,
          page,
          hitsPerPage: 10
        });
        
      }
      
      // Convert Algolia records back to User format
      const algoliaUsers: User[] = results.users.map(record => ({
        id: record.objectID,
        name: record.name,
        email: record.email || '',
        phone: record.phone,
        roles: record.roleDetails || [],
        createdAt: record.createdAt ? 
          { 
            toDate: () => new Date(record.createdAt!), 
            seconds: Math.floor((record.createdAt || 0) / 1000),
            nanoseconds: 0,
            toMillis: () => record.createdAt || 0,
            isEqual: () => false,
            toJSON: () => ({ seconds: Math.floor((record.createdAt || 0) / 1000), nanoseconds: 0 })
          } as any : undefined,
        updatedAt: record.updatedAt ? 
          { 
            toDate: () => new Date(record.updatedAt!), 
            seconds: Math.floor((record.updatedAt || 0) / 1000),
            nanoseconds: 0,
            toMillis: () => record.updatedAt || 0,
            isEqual: () => false,
            toJSON: () => ({ seconds: Math.floor((record.updatedAt || 0) / 1000), nanoseconds: 0 })
          } as any : undefined,
        // Add other required User properties with defaults
        balance: 0,
        outstandingBalance: {},
        availableCredits: {}
      }));
      
      setUsers(algoliaUsers);
      setCurrentPage(results.currentPage);
      setTotalPages(results.totalPages);
      setTotalUsers(results.totalUsers);
      
      // Load guardian mapping after setting users
      // if (algoliaUsers.length > 0) {
      //   await loadGuardianMapping(algoliaUsers);
      // }
      
    } catch (error) {
      console.error('Algolia search error:', error);
      setError('Search failed. Please check Algolia configuration.');
    } finally {
      setSearchLoading(false);
      setLoading(false); // Make sure to turn off the main loading spinner
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

  // Load guardian mapping from Algolia results
  // const loadGuardianMapping = async (algoliaUsers: User[]) => {
  //   try {
  //     const organizationId = userData?.roles[0]?.organizationId;
  //     if (organizationId) {
  //       const players = await getPlayersByOrganization(organizationId);
        
        
  //       // Build a map of player userId to guardian Users
  //       const guardianMap: Record<string, User[]> = {};
        
  //       // Collect all unique guardian IDs that we need to find
  //       const allGuardianIds = new Set<string>();
  //       for (const player of players) {
  //         if (player.guardianId && player.guardianId.length > 0) {
  //           player.guardianId.forEach(gId => allGuardianIds.add(gId));
  //         }
  //       }
        
  //       // First, try to find all guardians in Algolia results
  //       const foundGuardians = new Map<string, User>();
  //       for (const guardian of algoliaUsers.filter(u => 
  //         u.roles.some(role => 
  //           Array.isArray(role.role) ? role.role.includes('guardian') : role.role === 'guardian'
  //         )
  //       )) {
  //         if (allGuardianIds.has(guardian.id)) {
  //           foundGuardians.set(guardian.id, guardian);
  //         }
  //       }
        
  //       // For missing guardians, search them individually using Algolia
  //       const missingGuardianIds = Array.from(allGuardianIds).filter(id => !foundGuardians.has(id));
        
  //       if (missingGuardianIds.length > 0) {
  //         try {
  //           // Search for missing guardians using Algolia
  //           const missingGuardiansResults = await searchUsersAlgolia({
  //             query: '',
  //             organizationId,
  //             filters: {
  //               role: 'guardian'
  //             },
  //             page: 0,
  //             hitsPerPage: 100
  //           });
            
  //           // Add found guardians to our collection
  //           for (const record of missingGuardiansResults.users) {
  //             if (missingGuardianIds.includes(record.objectID)) {
  //               const guardianUser: User = {
  //                 id: record.objectID,
  //                 name: record.name,
  //                 email: record.email || '',
  //                 phone: record.phone,
  //                 roles: record.roleDetails || [],
  //                 createdAt: record.createdAt ? 
  //                   { 
  //                     toDate: () => new Date(record.createdAt!), 
  //                     seconds: Math.floor((record.createdAt || 0) / 1000),
  //                     nanoseconds: 0,
  //                     toMillis: () => record.createdAt || 0,
  //                     isEqual: () => false,
  //                     toJSON: () => ({ seconds: Math.floor((record.createdAt || 0) / 1000), nanoseconds: 0 })
  //                   } as any : undefined,
  //                 updatedAt: record.updatedAt ? 
  //                   { 
  //                     toDate: () => new Date(record.updatedAt!), 
  //                     seconds: Math.floor((record.updatedAt || 0) / 1000),
  //                     nanoseconds: 0,
  //                     toMillis: () => record.updatedAt || 0,
  //                     isEqual: () => false,
  //                     toJSON: () => ({ seconds: Math.floor((record.updatedAt || 0) / 1000), nanoseconds: 0 })
  //                   } as any : undefined
  //               };
  //               foundGuardians.set(record.objectID, guardianUser);
  //               console.log(`✅ Found missing guardian ${record.objectID} (${record.name}) via additional search`);
  //             }
  //           }
  //         } catch (error) {
  //           console.error('Error searching for missing guardians:', error);
  //         }
  //       }
        
  //       // Now build the guardian map
  //       for (const player of players) {
  //         if (player.guardianId && player.guardianId.length > 0) {
  //           console.log(`👥 Player ${player.userId} has guardians:`, player.guardianId);
  //           const playerGuardians = player.guardianId
  //             .map(gId => {
  //               const guardian = foundGuardians.get(gId);
  //               if (!guardian) {
  //                 console.warn(`⚠️ Guardian ${gId} still not found after additional search`);
  //               }
  //               return guardian;
  //             })
  //             .filter(g => g !== undefined) as User[];
  //           guardianMap[player.userId] = playerGuardians;
  //           console.log(`✅ Mapped ${playerGuardians.length} guardians to player ${player.userId}`);
  //         }
  //       }
  //       setPlayerGuardianMap(guardianMap);
        
  //       const guardianUsers = algoliaUsers.filter(user => 
  //         user.roles.some(role => 
  //           Array.isArray(role.role) ? role.role.includes('guardian') : role.role === 'guardian'
  //         )
  //       );
  //       setGuardians(guardianUsers);
  //     }
  //   } catch (error) {
  //     console.error('Error loading guardian mapping:', error);
  //   }
  // };

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

  const handleAddUser = async (presetRole?: string) => {
    setSelectedUser(null);
    setDialogMode('add');
    setActiveStep(0);
    
    // Reset guardian search fields when opening add dialog
    setGuardianPhone('');
    setGuardianSearchResult(null);
    setShowCreateGuardian(false);
    setNewGuardianData({ name: '', email: '', phone: '' });
    
    setFormData({
      name: '',
      email: '',
      phone: '',
      password: '',
      roles: presetRole ? [presetRole] : [],
      academyId: [],
      dateOfBirth: '',
      gender: '',
      guardianId: [],
      status: '',
      dynamicFields: {}
    });

    setOpenDialog(true);
  };

  const handleEditUser = async (user: User) => {
    setSelectedUser(user);
    setDialogMode('edit');
    setActiveStep(0);
    
    // Reset guardian search fields when opening edit dialog
    setGuardianPhone('');
    setGuardianSearchResult(null);
    setShowCreateGuardian(false);
    setNewGuardianData({ name: '', email: '', phone: '' });
    
    // Load user data into form
    const isPlayer = user.roles.some(role => 
      Array.isArray(role.role) ? role.role.includes('player') : role.role === 'player'
    );
    
    // Get player data if user is a player
    let playerData = null;
    if (isPlayer) {
      try {
        playerData = await getPlayerByUserId(user.id);
        console.log('📋 Loaded player data:', playerData);
      } catch (error) {
        console.error('Error loading player data:', error);
      }
    }
    
    // Set form data with existing user information
    try {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        password: '', // Don't pre-fill password for security
        roles: user.roles?.flatMap(role => 
          Array.isArray(role.role) ? role.role : [role.role]
        ) || [],
        academyId: user.roles?.[0]?.academyId || [],
        dateOfBirth: (() => {
          if (!playerData?.dob) return '';
          try {
            const date = new Date(playerData.dob);
            // Check if date is valid
            if (isNaN(date.getTime())) {
              console.warn('Invalid date in player data:', playerData.dob);
              return '';
            }
            return date.toISOString().split('T')[0];
          } catch (error) {
            console.error('Error converting date:', error, playerData.dob);
            return '';
          }
        })(),
        gender: playerData?.gender || '',
        guardianId: playerData?.guardianId || [],
        status: playerData?.status || '',
        dynamicFields: playerData?.playerParameters || {}
      });
      
      console.log('✅ Form data loaded successfully');
    } catch (error) {
      console.error('Error setting form data:', error);
      setError('Failed to load user data for editing');
      return;
    }

    setOpenDialog(true);
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
      await performAlgoliaSearch(searchTerm, 0);
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
    } else if (activeStep === 1 && !isRolePreset) {
      if (formData.roles.length === 0) {
        setError('Please select at least one role');
        return;
      }
    } else if ((activeStep === 1 && isRolePreset) || (activeStep === 2 && !isRolePreset)) {
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
      } else if (!isPlayerRole && isOnlyGuardian && (!formData.email && !formData.phone)) {
        setError('Either email or phone is required for guardian role');
        return;
      }
    }
    
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleUserUpdate = async () => {
    if (!selectedUser) return;
    
    try {
      console.log('🔄 Updating user data...');
      
      // Update user document
      const updatedUserData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        roles: formData.roles.map(role => ({ 
          role: [role],
          organizationId: userData?.roles?.[0]?.organizationId || '',
          academyId: formData.academyId
        }))
      };
      
      await updateUser(selectedUser.id, updatedUserData);
      
      // Sync updated user to Algolia
      try {
        console.log('🔄 Syncing updated user to Algolia...', {
          userId: selectedUser.id,
          oldName: selectedUser.name,
          newName: formData.name,
          updatedUserData
        });
        const { syncUserToAlgolia } = await import('../../services/algoliaService');
        const updatedUser = {
          ...selectedUser,
          ...updatedUserData,
          updatedAt: { toDate: () => new Date() } as any
        };
        await syncUserToAlgolia(updatedUser);
        console.log('✅ User synced to Algolia successfully');
        
        // Wait a moment for Algolia to process the update
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (algoliaError) {
        console.warn('⚠️ Failed to sync user to Algolia:', algoliaError);
        // Don't fail the entire update if Algolia sync fails
      }
      
      // If user is a player, update player record
      const isPlayer = formData.roles.includes('player');
      if (isPlayer) {
        console.log('🔄 Updating player data...');
        try {
          const existingPlayer = await getPlayerByUserId(selectedUser.id);
          if (existingPlayer) {
            // Validate date before updating
            let dobDate;
            try {
              if (formData.dateOfBirth) {
                dobDate = new Date(formData.dateOfBirth);
                if (isNaN(dobDate.getTime())) {
                  throw new Error('Invalid date format');
                }
              } else {
                dobDate = existingPlayer.dob; // Keep existing date if no new date provided
              }
            } catch (error) {
              console.error('Invalid date format:', formData.dateOfBirth);
              dobDate = existingPlayer.dob; // Fallback to existing date
            }
            
            await updatePlayer(existingPlayer.id, {
              dob: dobDate,
              gender: formData.gender,
              guardianId: formData.guardianId,
              status: formData.status || 'active',
              playerParameters: formData.dynamicFields
            });
            console.log('✅ Player data updated successfully');
          }
        } catch (error) {
          console.error('Error updating player data:', error);
        }
      }
      
      // Reload users and close dialog
      await performAlgoliaSearch(searchTerm, 0);
      setOpenDialog(false);
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
        status: '',
        dynamicFields: {}
      });
      
      // Update local state immediately for instant UI feedback
      console.log('🔄 BEFORE UPDATE - Current users state:', {
        selectedUserId: selectedUser.id,
        selectedUserName: selectedUser.name,
        newName: formData.name,
        usersArrayLength: users.length,
        userInArray: users.find(u => u.id === selectedUser.id)?.name,
        allUserNames: users.map(u => ({ id: u.id, name: u.name }))
      });
      
      setUsers(prevUsers => {
        
        const updatedUsers = prevUsers.map(user => {
          if (user.id === selectedUser.id) {
            const updatedUser = { 
              ...user, 
              name: formData.name, 
              email: formData.email, 
              phone: formData.phone 
            };
            console.log('✅ INSIDE MAP - Updating user:', {
              userId: user.id,
              oldName: user.name,
              newName: updatedUser.name,
              formDataName: formData.name
            });
            return updatedUser;
          }
          return user;
        });
        
        return updatedUsers;
      });
      
      // Force table re-render
      setTableRenderKey(Date.now());
      
      // Check state immediately after setting (this might not show the updated state due to async nature)
      setTimeout(() => {
      }, 100);
      
      // Refresh the search results to show updated data in the table
      // TEMPORARILY COMMENTED OUT TO TEST IF THIS IS OVERRIDING LOCAL STATE
      console.log('🔄 SKIPPING search refresh to test local state update...', {
        searchTerm,
        currentPage,
        activeTab,
        userId: selectedUser.id
      });
      // await performAlgoliaSearch(searchTerm, currentPage);
      // console.log('✅ Search results refreshed');
      
      console.log('✅ User update completed successfully');
    } catch (error: any) {
      console.error('Error updating user:', error);
      setError(`Failed to update user: ${error.message || 'Unknown error'}`);
    }
  };

  const handleSubmit = async () => {
    try {
      setSubmitLoading(true);
      const organizationId = userData?.roles?.[0]?.organizationId || '';
      
      console.log(`📝 ${dialogMode === 'edit' ? 'Updating' : 'Creating'} user:`, {
        dialogMode,
        selectedUser: selectedUser?.id,
        formData: {
          name: formData.name,
          roles: formData.roles,
          guardianId: formData.guardianId
        }
      });
      
      if (dialogMode === 'edit' && selectedUser) {
        // Handle user update
        await handleUserUpdate();
        return;
      }
      
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
        organizationId,
        isCoach: formData.roles.includes('coach')
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
        newUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
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
        const playerId = `player_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        
        const dobValue = formData.dateOfBirth;
        const genderValue = formData.gender;
        
        console.log('📝 Creating player with guardian data:', {
          playerId,
          userId: newUserId,
          guardianId: formData.guardianId,
          guardianCount: formData.guardianId.length
        });
        
        await createPlayer({
          id: playerId,
          userId: newUserId,
          academyId: formData.academyId,
          organizationId: organizationId,
          dob: new Date(dobValue),
          gender: genderValue,
          guardianId: formData.guardianId,
          status: formData.status || 'active',
          playerParameters: formData.dynamicFields
        });
        
        console.log('✅ Player created successfully with guardians');
      }
      
      // Reload users and close dialog
      await performAlgoliaSearch(searchTerm, 0);
      setOpenDialog(false);
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
        status: '',
        dynamicFields: {}
      });
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getFilteredUsers = () => {
    let filteredByTab = users;
    
    switch (activeTab) {
      case 1:
        filteredByTab = users.filter(user => user.roles?.some(role => 
          Array.isArray(role.role) ? role.role.includes('player') : role.role === 'player'
        ));
        break;
      case 2:
        filteredByTab = users.filter(user => user.roles?.some(role => 
          Array.isArray(role.role) ? role.role.includes('coach') : role.role === 'coach'
        ));
        break;
      case 3:
        filteredByTab = users.filter(user => user.roles?.some(role => 
          Array.isArray(role.role) ? role.role.includes('guardian') : role.role === 'guardian'
        ));
        break;
      case 4:
        filteredByTab = users.filter(user => user.roles?.some(role => 
          Array.isArray(role.role) 
            ? role.role.includes('admin') || role.role.includes('owner')
            : role.role === 'admin' || role.role === 'owner'
        ));
        break;
      default:
        filteredByTab = users;
    }
    
    return filteredByTab.filter(user => {
      const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           user.email.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesRole = roleFilter === 'all' || (user.roles && user.roles.some(role => 
        Array.isArray(role.role) ? role.role.includes(roleFilter) : role.role === roleFilter
      ));
      
      return matchesSearch && matchesRole;
    });
  };


  // DataTable columns configuration - conditionally add guardians column for players
  const baseColumns = [
    {
      key: 'name',
      header: 'User',
      render: (user: User) => (
        <div 
          className="flex items-center space-x-3 cursor-pointer"
          onClick={() => navigate(`/users/${user.id}`)}
        >
          <Avatar className="w-10 h-10">
            {getInitials(user.name)}
          </Avatar>
          <div>
            <div className="font-semibold text-secondary-900">
              {(() => {
                return user.name;
              })()}
            </div>
            <div className="text-secondary-600 text-sm font-normal">{user.phone || 'No phone'}</div>
          </div>
        </div>
      )
    },
    {
      key: 'email',
      header: 'Email',
      render: (user: User) => (
        <div className="text-secondary-900 font-normal">{user.email}</div>
      )
    },
    {
      key: 'academy',
      header: 'Academy',
      render: (user: User) => (
        <div className="text-secondary-700 font-normal">{getUserAcademies(user.roles)}</div>
      )
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (user: User) => getRoleChips(user.roles)
    },
    {
      key: 'createdAt',
      header: 'Date Added',
      render: (user: User) => (
        <div className="text-secondary-700 font-normal">
          {user.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
        </div>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (user: User) => (
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
              onClick={(e) => {
                e.stopPropagation();
                setSelectedGuardianForPlayers(user);
              }}
              className="p-2 text-secondary-400 hover:text-primary-600 transition-colors duration-200"
              title="View Linked Players"
            >
              <UserIcon />
            </button>
          )}
          {user.roles.some(role => role.role.includes('player')) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPlayer(user);
              }}
              className="p-2 text-secondary-400 hover:text-primary-600 transition-colors duration-200"
              title="View Guardians"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </button>
          )}
          <button
            className="p-2 text-secondary-400 hover:text-secondary-600 transition-colors duration-200"
            title="More Options"
          >
            <MoreIcon />
          </button>
        </div>
      )
    }
  ];
  
  const columns = baseColumns;

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
            onClick={() => {
              // Determine preset role based on active tab
              let presetRole: string | undefined;
              switch (activeTab) {
                case 1:
                  presetRole = 'player';
                  break;
                case 2:
                  presetRole = 'coach';
                  break;
                case 3:
                  presetRole = 'guardian';
                  break;
                case 4:
                  presetRole = 'admin';
                  break;
                default:
                  presetRole = undefined;
              }
              handleAddUser(presetRole);
            }}
            loading={loading}
            icon={<PlusIcon />}
            className="bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 w-full sm:w-auto"
          >
            {loading ? 'Loading...' : (
              activeTab === 1 ? 'Add Player' :
              activeTab === 2 ? 'Add Coach' :
              activeTab === 3 ? 'Add Guardian' :
              activeTab === 4 ? 'Add Admin' :
              'Add User'
            )}
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
              onChange={(e) => {
                const query = e.target.value;
                setSearchTerm(query);
                
                // Debounce the Algolia search
                if (searchDebounceTimer) {
                  clearTimeout(searchDebounceTimer);
                }
                
                const timer = setTimeout(() => {
                  // Search normally for all tabs including guardians
                  performAlgoliaSearch(query, 0);
                }, 300); // 300ms debounce
                
                setSearchDebounceTimer(timer);
              }}
              icon={searchLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
              ) : (
                <SearchIcon />
              )}
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
                {organizationSettings?.customRoles?.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </Select>
            )}
          </div>
          
          {/* Results Summary */}
          {!loading && (
            <div className="flex items-center justify-between text-sm text-secondary-600 bg-secondary-50 px-4 py-2 rounded-lg mt-4">
              <span>
                {totalUsers} users found
                {searchTerm && ` matching "${searchTerm}"`}
                {roleFilter !== 'all' && ` with role "${roleFilter}"`}
                {selectedAcademy && ` in "${selectedAcademy.name}"`}
              </span>
              <span className="text-xs flex items-center gap-2">
                <span className="text-success-600 font-semibold">⚡ Algolia Search</span>
                📄 Showing 10 per page
              </span>
            </div>
          )}
          
          {/* Academy Filter Indicator */}
          {selectedAcademy && (
            <div className="flex items-center justify-between text-sm bg-primary-50 border border-primary-200 px-4 py-3 rounded-lg mt-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <span className="text-primary-700 font-medium">
                  Filtering by academy: <strong>{selectedAcademy.name}</strong>
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedAcademy(null)}
                className="text-primary-600 hover:text-primary-700 hover:bg-primary-100"
              >
                Show All Academies
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Users Table */}
      <Card>
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <span className="ml-3 text-secondary-600">Loading users...</span>
          </div>
        ) : (
          <DataTable
            key={`users-table-${tableRenderKey}`}
            data={users}
            columns={columns}
            emptyMessage={
              searchTerm || roleFilter !== 'all' 
                ? `No users found matching your criteria.`
                : users.length === 0 
                  ? 'No users found. Start by adding your first user.'
                  : 'No users found'
            }
            showPagination={false}
            itemsPerPage={10}
          />
        )}
      </Card>

      {/* Algolia Pagination */}
      {!loading && totalPages > 1 && (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <div className="text-sm text-secondary-600">
                Page {currentPage + 1} of {totalPages} • {totalUsers} total users
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  onClick={() => performAlgoliaSearch(searchTerm, currentPage - 1)}
                  disabled={currentPage === 0 || searchLoading}
                  className="px-3 py-1 text-sm"
                >
                  Previous
                </Button>
                
                {/* Page numbers */}
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageIndex = Math.max(0, Math.min(totalPages - 5, currentPage - 2)) + i;
                    return (
                      <Button
                        key={pageIndex}
                        variant={pageIndex === currentPage ? "primary" : "outline"}
                        onClick={() => performAlgoliaSearch(searchTerm, pageIndex)}
                        disabled={searchLoading}
                        className="px-3 py-1 text-sm w-10"
                      >
                        {pageIndex + 1}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  onClick={() => performAlgoliaSearch(searchTerm, currentPage + 1)}
                  disabled={currentPage >= totalPages - 1 || searchLoading}
                  className="px-3 py-1 text-sm"
                >
                  Next
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

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
              <DataTable
                data={linkedPlayers}
                columns={[
                  {
                    key: 'name',
                    header: 'Player Name',
                    render: (player: User) => (
                      <div className="flex items-center space-x-3">
                        <Avatar size="sm">
                          {getInitials(player.name)}
                        </Avatar>
                        <div className="text-sm font-normal">{player.name}</div>
                      </div>
                    )
                  },
                  {
                    key: 'email',
                    header: 'Email',
                    render: (player: User) => (
                      <div className="text-sm font-normal">{player.email}</div>
                    )
                  },
                  {
                    key: 'academy',
                    header: 'Academy',
                    render: (player: User) => (
                      <div className="text-sm text-secondary-700 font-normal">
                        {getUserAcademies(player.roles)}
                      </div>
                    )
                  },
                  {
                    key: 'actions',
                    header: 'Actions',
                    render: (player: User) => (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleEditUser(player)}
                      >
                        View Details
                      </Button>
                    )
                  }
                ]}
                emptyMessage="No players are currently linked to this guardian."
                showPagination={false}
              />
            </div>
            <div className="flex justify-between p-6 border-t border-secondary-200">
              {canWrite('users') && (
                <Button
                  variant="primary"
                  onClick={() => {
                    // Simply open the modal without loading all players
                    setAvailablePlayersForLinking([]);
                    setSelectedPlayersToLink([]);
                    setShowLinkPlayersModal(true);
                  }}
                >
                  Link More Players
                </Button>
              )}
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

      {/* Link Players to Guardian Modal */}
      {showLinkPlayersModal && selectedGuardian && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-secondary-200">
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">
                  Link Players to Guardian
                </h3>
                <p className="text-sm text-secondary-600 mt-1">
                  Guardian: {selectedGuardian.name}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowLinkPlayersModal(false);
                  setSelectedPlayersToLink([]);
                }}
                className="text-secondary-400 hover:text-secondary-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6">
              {/* Search for players */}
              <div className="mb-4">
                <Input
                  type="text"
                  placeholder="Search players by name or email..."
                  className="w-full"
                  onChange={async (e) => {
                    const searchValue = e.target.value.trim();
                    
                    if (searchValue.length < 2) {
                      // Clear results if search is too short
                      setAvailablePlayersForLinking([]);
                      return;
                    }
                    
                    try {
                      const organizationId = userData?.roles[0]?.organizationId;
                      if (!organizationId || !selectedGuardian) return;
                      
                      console.log('Searching for players with query:', searchValue);
                      
                      // Search for players using Algolia
                      const searchResults = await searchUsersAlgolia({
                        query: searchValue,
                        organizationId,
                        filters: {
                          role: 'player'
                        },
                        page: 0,
                        hitsPerPage: 50
                      });
                      
                      console.log('Found players:', searchResults.users.length);
                      
                      // Get all players in org to check guardian relationships
                      const allPlayersInOrg = await getPlayersByOrganization(organizationId);
                      
                      // Filter out players that already have this guardian
                      const availablePlayers: User[] = [];
                      
                      for (const userRecord of searchResults.users) {
                        const playerRecord = allPlayersInOrg.find(p => p.userId === userRecord.objectID);
                        
                        // Only include if player doesn't have this guardian yet
                        if (playerRecord && (!playerRecord.guardianId || !playerRecord.guardianId.includes(selectedGuardian.id))) {
                          const userDoc: User = {
                            id: userRecord.objectID,
                            name: userRecord.name,
                            email: userRecord.email || '',
                            phone: userRecord.phone,
                            roles: userRecord.roleDetails || [],
                            createdAt: userRecord.createdAt ? 
                              { 
                                toDate: () => new Date(userRecord.createdAt!), 
                                seconds: Math.floor((userRecord.createdAt || 0) / 1000),
                                nanoseconds: 0,
                                toMillis: () => userRecord.createdAt || 0,
                                isEqual: () => false,
                                toJSON: () => ({ seconds: Math.floor((userRecord.createdAt || 0) / 1000), nanoseconds: 0 })
                              } as any : undefined,
                            updatedAt: userRecord.updatedAt ? 
                              { 
                                toDate: () => new Date(userRecord.updatedAt!), 
                                seconds: Math.floor((userRecord.updatedAt || 0) / 1000),
                                nanoseconds: 0,
                                toMillis: () => userRecord.updatedAt || 0,
                                isEqual: () => false,
                                toJSON: () => ({ seconds: Math.floor((userRecord.updatedAt || 0) / 1000), nanoseconds: 0 })
                              } as any : undefined
                          };
                          availablePlayers.push(userDoc);
                        }
                      }
                      
                      console.log('Available players (not linked to this guardian):', availablePlayers.length);
                      setAvailablePlayersForLinking(availablePlayers);
                      
                    } catch (error) {
                      console.error('Error searching players:', error);
                      setError('Failed to search for players');
                    }
                  }}
                />
              </div>

              {/* Players list */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-secondary-700 mb-2">
                  Select players to link ({selectedPlayersToLink.length} selected)
                </h4>
                <div className="max-h-96 overflow-y-auto border rounded-lg">
                  {availablePlayersForLinking.length > 0 ? (
                    <div className="divide-y">
                      {availablePlayersForLinking.map((player) => (
                        <div
                          key={player.id}
                          className="flex items-center justify-between p-3 hover:bg-secondary-50"
                        >
                          <div className="flex items-center space-x-3">
                            <input
                              type="checkbox"
                              checked={selectedPlayersToLink.includes(player.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedPlayersToLink([...selectedPlayersToLink, player.id]);
                                } else {
                                  setSelectedPlayersToLink(selectedPlayersToLink.filter(id => id !== player.id));
                                }
                              }}
                              className="h-4 w-4 text-primary-600 rounded border-secondary-300 focus:ring-primary-500"
                            />
                            <div>
                              <div className="font-medium text-secondary-900">{player.name}</div>
                              <div className="text-sm text-secondary-600">{player.email}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-secondary-500">
                      {availablePlayersForLinking.length === 0 ? 
                        'Type at least 2 characters to search for players' : 
                        'No available players found'
                      }
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end space-x-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowLinkPlayersModal(false);
                    setSelectedPlayersToLink([]);
                    setAvailablePlayersForLinking([]);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (!selectedGuardian || selectedPlayersToLink.length === 0) return;
                    
                    try {
                      const guardianId = selectedGuardian.id;
                      const organizationId = userData?.roles[0]?.organizationId;
                      
                      console.log('Linking players to guardian:', guardianId);
                      console.log('Players to link:', selectedPlayersToLink);
                      
                      // Update each selected player to add this guardian
                      const updatePromises = selectedPlayersToLink.map(async (playerId) => {
                        console.log('Looking for player with userId:', playerId);
                        const playerData = await getPlayerByUserId(playerId);
                        console.log('Found player data:', playerData);
                        
                        if (playerData) {
                          const currentGuardianIds = playerData.guardianId || [];
                          console.log('Current guardian IDs:', currentGuardianIds);
                          
                          if (!currentGuardianIds.includes(guardianId)) {
                            const updatedGuardianIds = [...currentGuardianIds, guardianId];
                            console.log('Updating player with new guardian IDs:', updatedGuardianIds);
                            
                            await updatePlayer(playerData.id, {
                              guardianId: updatedGuardianIds
                            });
                            console.log('Player updated successfully');
                          } else {
                            console.log('Guardian already linked to this player');
                          }
                        } else {
                          console.warn('No player data found for userId:', playerId);
                        }
                      });
                      
                      await Promise.all(updatePromises);
                      console.log('All players updated');
                      
                      setSuccess(`Successfully linked ${selectedPlayersToLink.length} player(s) to ${selectedGuardian.name}`);
                      setShowLinkPlayersModal(false);
                      setSelectedPlayersToLink([]);
                      setAvailablePlayersForLinking([]);
                      
                      // Force a delay to ensure database updates are complete
                      await new Promise(resolve => setTimeout(resolve, 1000));
                      
                      // Reload linked players - with better error handling
                      console.log('Reloading players for guardian:', selectedGuardian.id);
                      try {
                        const players = await getPlayersByGuardianId(selectedGuardian.id);
                        console.log('Found linked players:', players.length);
                        
                        // Get user details for linked players
                        const playerUsers: User[] = [];
                        
                        // First try from current users list
                        for (const player of players) {
                          const userDoc = users.find(u => u.id === player.userId);
                          if (userDoc) {
                            playerUsers.push(userDoc);
                          }
                        }
                        
                        // If we didn't find all users, search with Algolia
                        if (playerUsers.length < players.length && organizationId) {
                          console.log('Some users not found locally, searching with Algolia...');
                          const searchResults = await searchUsersAlgolia({
                            query: '',
                            organizationId,
                            filters: {
                              role: 'player'
                            },
                            page: 0,
                            hitsPerPage: 1000
                          });
                          
                          for (const player of players) {
                            if (!playerUsers.find(u => u.id === player.userId)) {
                              const userRecord = searchResults.users.find(u => u.objectID === player.userId);
                              if (userRecord) {
                                const userDoc: User = {
                                  id: userRecord.objectID,
                                  name: userRecord.name,
                                  email: userRecord.email || '',
                                  phone: userRecord.phone,
                                  roles: userRecord.roleDetails || [],
                                  createdAt: userRecord.createdAt ? 
                                    { 
                                      toDate: () => new Date(userRecord.createdAt!), 
                                      seconds: Math.floor((userRecord.createdAt || 0) / 1000),
                                      nanoseconds: 0,
                                      toMillis: () => userRecord.createdAt || 0,
                                      isEqual: () => false,
                                      toJSON: () => ({ seconds: Math.floor((userRecord.createdAt || 0) / 1000), nanoseconds: 0 })
                                    } as any : undefined,
                                  updatedAt: userRecord.updatedAt ? 
                                    { 
                                      toDate: () => new Date(userRecord.updatedAt!), 
                                      seconds: Math.floor((userRecord.updatedAt || 0) / 1000),
                                      nanoseconds: 0,
                                      toMillis: () => userRecord.updatedAt || 0,
                                      isEqual: () => false,
                                      toJSON: () => ({ seconds: Math.floor((userRecord.updatedAt || 0) / 1000), nanoseconds: 0 })
                                    } as any : undefined
                                };
                                playerUsers.push(userDoc);
                              }
                            }
                          }
                        }
                        
                        console.log('Setting linked players:', playerUsers.length);
                        setLinkedPlayers(playerUsers);
                        
                      } catch (reloadError) {
                        console.error('Error reloading linked players:', reloadError);
                      }
                      
                      // Reload the entire user list and guardian mapping to refresh UI
                      if (organizationId) {
                        await performAlgoliaSearch(searchTerm, currentPage);
                        // Force reload guardian mapping with fresh user data
                        const freshSearchResults = await searchUsersAlgolia({
                          query: searchTerm,
                          organizationId,
                          filters: activeTab === 1 ? { role: 'player' } : 
                                  activeTab === 2 ? { role: 'coach' } :
                                  activeTab === 3 ? { role: 'guardian' } : {},
                          page: currentPage,
                          hitsPerPage: 20
                        });
                        
                        const freshUsers: User[] = freshSearchResults.users.map(record => ({
                          id: record.objectID,
                          name: record.name,
                          email: record.email || '',
                          phone: record.phone,
                          roles: record.roleDetails || [],
                          createdAt: record.createdAt ? 
                            { 
                              toDate: () => new Date(record.createdAt!), 
                              seconds: Math.floor((record.createdAt || 0) / 1000),
                              nanoseconds: 0,
                              toMillis: () => record.createdAt || 0,
                              isEqual: () => false,
                              toJSON: () => ({ seconds: Math.floor((record.createdAt || 0) / 1000), nanoseconds: 0 })
                            } as any : undefined,
                          updatedAt: record.updatedAt ? 
                            { 
                              toDate: () => new Date(record.updatedAt!), 
                              seconds: Math.floor((record.updatedAt || 0) / 1000),
                              nanoseconds: 0,
                              toMillis: () => record.updatedAt || 0,
                              isEqual: () => false,
                              toJSON: () => ({ seconds: Math.floor((record.updatedAt || 0) / 1000), nanoseconds: 0 })
                            } as any : undefined
                        }));
                        
                        setUsers(freshUsers);
                        // await loadGuardianMapping(freshUsers);
                      }
                    } catch (error) {
                      console.error('Error linking players:', error);
                      setError('Failed to link players to guardian');
                    }
                  }}
                  disabled={selectedPlayersToLink.length === 0}
                >
                  Link {selectedPlayersToLink.length} Player{selectedPlayersToLink.length !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Alert */}
      {success && (
        <div className="fixed top-4 right-4 z-50">
          <Alert variant="success">
            <div className="flex justify-between items-center">
              <span>{success}</span>
              <button
                onClick={() => setSuccess('')}
                className="ml-4 text-success-700 hover:text-success-900"
              >
                ×
              </button>
            </div>
          </Alert>
        </div>
      )}

      {/* Add/Edit User Modal */}
      {openDialog && (
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
                    <h3 className="text-xl font-bold text-secondary-900">
                      {dialogMode === 'edit' ? (
                        formData.roles.includes('player') ? 'Edit Player' :
                        formData.roles.includes('coach') ? 'Edit Coach' :
                        formData.roles.includes('guardian') ? 'Edit Guardian' :
                        formData.roles.includes('admin') ? 'Edit Admin' :
                        'Edit User'
                      ) : (
                        isRolePreset && formData.roles[0] === 'player' ? 'Add New Player' :
                        isRolePreset && formData.roles[0] === 'coach' ? 'Add New Coach' :
                        isRolePreset && formData.roles[0] === 'guardian' ? 'Add New Guardian' :
                        isRolePreset && formData.roles[0] === 'admin' ? 'Add New Admin' :
                        'Add New User'
                      )}
                    </h3>
                    <p className="text-secondary-600 text-sm font-normal">
                      {dialogMode === 'edit' ? (
                        'Update user information and settings'
                      ) : (
                        isRolePreset && formData.roles[0] === 'player' ? 'Create a new player account' :
                        isRolePreset && formData.roles[0] === 'coach' ? 'Create a new coach account' :
                        isRolePreset && formData.roles[0] === 'guardian' ? 'Create a new guardian account' :
                        isRolePreset && formData.roles[0] === 'admin' ? 'Create a new admin account' :
                        'Create a new member account'
                      )}
                    </p>
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
                
                {/* Step 2: Role Assignment - Skip if role is preset or edit mode */}
                {activeStep === 1 && !isRolePreset && dialogMode === 'add' && (
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
                
                {/* Step 2 or 3: Contact Information (depending on if role is preset or edit mode) */}
                {((activeStep === 1 && (isRolePreset || dialogMode === 'edit')) || (activeStep === 2 && !isRolePreset && dialogMode === 'add')) && (
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
                    
                    {/* Academy Selection - Show when role is preset */}
                    {isRolePreset && (
                      <div className="bg-secondary-50 rounded-xl p-6 mb-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="font-semibold text-secondary-900">Academy Access</h3>
                            <p className="text-xs text-secondary-600 font-normal">Select which academies this user can access</p>
                          </div>
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
                          {formData.academyId.length === 0 ? 'Organization-wide access' : `${formData.academyId.length} academy(ies) selected`}
                        </p>
                      </div>
                    )}

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
                        
                        {/* Password field for non-player roles - only show in add mode */}
                        {dialogMode === 'add' && !formData.roles.includes('player') && !formData.roles.every(role => role === 'guardian') && (
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
                
                {/* Step 3 or 4: Player Details (depending on if role is preset or edit mode) */}
                {(() => {
                  const shouldShowStep = (activeStep === 2 && (isRolePreset || dialogMode === 'edit') && isPlayerRole) || (activeStep === 3 && !isRolePreset && dialogMode === 'add' && isPlayerRole);
                  if (shouldShowStep && dialogMode === 'edit') {
                    console.log('✅ Player Details step is showing in edit mode with guardian search');
                  }
                  return shouldShowStep;
                })() && (
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
                      
                      <div className="mt-6">
                        <Select
                          label="Player Status"
                          value={formData.status}
                          onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                          required
                          helperText={organizationSettings?.playerStatusOptions && organizationSettings.playerStatusOptions.length > 0 
                            ? "Select the current status of the player" 
                            : "No status options configured. Please add them in Settings > Player Parameters."}
                        >
                          <option value="">Select status</option>
                          {(() => {
                            // Use custom options if they exist, otherwise use defaults
                            const statusOptions = organizationSettings?.playerStatusOptions && organizationSettings.playerStatusOptions.length > 0 
                              ? organizationSettings.playerStatusOptions 
                              : ['Active', 'Inactive', 'Suspended'];
                            
                            console.log('🎯 Rendering status dropdown with options:', statusOptions);
                            console.log('🎯 Organization settings:', organizationSettings);
                            
                            return statusOptions.map((status) => (
                              <option key={status} value={status.toLowerCase()}>
                                {status}
                              </option>
                            ));
                          })()}
                        </Select>
                      </div>
                    </div>
                    
                    {/* Guardian Search */}
                    <div className="bg-gradient-to-br from-secondary-50 to-secondary-100 rounded-xl p-6 border border-secondary-200">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 bg-secondary-600 rounded-xl flex items-center justify-center">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-secondary-900">Search Guardian</h3>
                          <p className="text-sm text-secondary-700 font-normal">Search for guardians in the system</p>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex gap-2">
                          <Input
                            placeholder="Enter guardian's phone number or name"
                            value={guardianPhone}
                            onChange={(e) => setGuardianPhone(e.target.value)}
                            className="flex-1"
                          />
                          <Button
                            variant="outline"
                            onClick={async () => {
                              if (!guardianPhone.trim() || guardianPhone.trim().length < 2) {
                                setError('Please enter at least 2 characters to search');
                                return;
                              }
                              
                              try {
                                console.log('🔍 Searching for guardian with query:', guardianPhone.trim());
                                console.log('🔍 Dialog mode:', dialogMode);
                                
                                // Search for existing guardian using Algolia
                                const organizationId = userData?.roles[0]?.organizationId;
                                if (!organizationId) {
                                  console.error('No organization ID found');
                                  return;
                                }
                                
                                const results = await searchUsersAlgolia({
                                  query: guardianPhone.trim(),
                                  organizationId,
                                  filters: {
                                    role: 'guardian'
                                  },
                                  page: 0,
                                  hitsPerPage: 10
                                });
                                
                                console.log('🔍 Search results:', results.users.length, 'guardians found');
                                
                                if (results.users.length > 0) {
                                  // Convert first result to User format for display
                                  const foundGuardian = results.users[0];
                                  const guardianUser: User = {
                                    id: foundGuardian.objectID,
                                    name: foundGuardian.name,
                                    email: foundGuardian.email || '',
                                    phone: foundGuardian.phone,
                                    roles: foundGuardian.roleDetails || [],
                                    createdAt: foundGuardian.createdAt ? 
                                      { 
                                        toDate: () => new Date(foundGuardian.createdAt!), 
                                        seconds: Math.floor((foundGuardian.createdAt || 0) / 1000),
                                        nanoseconds: 0,
                                        toMillis: () => foundGuardian.createdAt || 0,
                                        isEqual: () => false,
                                        toJSON: () => ({ seconds: Math.floor((foundGuardian.createdAt || 0) / 1000), nanoseconds: 0 })
                                      } as any : undefined,
                                    updatedAt: foundGuardian.updatedAt ? 
                                      { 
                                        toDate: () => new Date(foundGuardian.updatedAt!), 
                                        seconds: Math.floor((foundGuardian.updatedAt || 0) / 1000),
                                        nanoseconds: 0,
                                        toMillis: () => foundGuardian.updatedAt || 0,
                                        isEqual: () => false,
                                        toJSON: () => ({ seconds: Math.floor((foundGuardian.updatedAt || 0) / 1000), nanoseconds: 0 })
                                      } as any : undefined
                                  };
                                  setGuardianSearchResult(guardianUser);
                                } else {
                                  setGuardianSearchResult(null);
                                }
                              } catch (error) {
                                console.error('Error searching guardian:', error);
                                setError('Failed to search for guardian');
                              }
                            }}
                            disabled={!guardianPhone.trim() || guardianPhone.trim().length < 2}
                          >
                            Search
                          </Button>
                        </div>
                        
                        {/* Search Result */}
                        {guardianSearchResult && (
                          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <Avatar size="md">
                                  {getInitials(guardianSearchResult.name)}
                                </Avatar>
                                <div className="flex-1">
                                  <div className="text-lg font-medium text-green-900">{guardianSearchResult.name}</div>
                                  <div className="text-sm text-green-700">{guardianSearchResult.email}</div>
                                  {guardianSearchResult.phone && (
                                    <div className="text-sm text-green-700">{guardianSearchResult.phone}</div>
                                  )}
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
                        
                        {guardianPhone.trim().length >= 2 && !guardianSearchResult && (
                          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <div className="text-sm text-blue-800 font-medium">
                                  No guardian found matching "{guardianPhone}"
                                </div>
                                <div className="text-xs text-blue-700 mt-1">
                                  Would you like to create a new guardian?
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowCreateGuardian(true)}
                              >
                                Create Guardian
                              </Button>
                            </div>
                            
                            {showCreateGuardian && (
                              <div className="border-t border-blue-200 pt-4 space-y-3">
                                <div className="text-sm font-medium text-blue-800 mb-2">
                                  Create New Guardian
                                </div>
                                <div className="space-y-3">
                                  <Input
                                    placeholder="Guardian Name"
                                    value={newGuardianData.name}
                                    onChange={(e) => setNewGuardianData({...newGuardianData, name: e.target.value})}
                                    required
                                  />
                                  <Input
                                    placeholder="Email Address"
                                    type="email"
                                    value={newGuardianData.email}
                                    onChange={(e) => setNewGuardianData({...newGuardianData, email: e.target.value})}
                                    required
                                  />
                                  <Input
                                    placeholder="Phone Number"
                                    value={newGuardianData.phone || guardianPhone}
                                    onChange={(e) => setNewGuardianData({...newGuardianData, phone: e.target.value})}
                                    required
                                  />
                                  <div className="flex items-center space-x-2">
                                    <Button
                                      size="sm"
                                      onClick={async () => {
                                        if (!newGuardianData.name || !newGuardianData.email) {
                                          setError('Guardian name and email are required');
                                          return;
                                        }
                                        
                                        try {
                                          setGuardianCreationLoading(true);
                                          const organizationId = userData?.roles[0]?.organizationId;
                                          if (!organizationId) {
                                            throw new Error('Organization ID not found');
                                          }
                                          
                                          // Create the guardian user (Firestore only, no auth needed)
                                          const guardianUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
                                          await createUser({
                                            id: guardianUserId,
                                            name: newGuardianData.name,
                                            email: newGuardianData.email,
                                            phone: newGuardianData.phone || guardianPhone,
                                            roles: [{
                                              role: ['guardian'],
                                              organizationId: organizationId,
                                              academyId: []
                                            }]
                                          });
                                          
                                          console.log('✅ Guardian created with ID:', guardianUserId);
                                          
                                          // Link the guardian to the player immediately
                                          setFormData({
                                            ...formData,
                                            guardianId: [...formData.guardianId, guardianUserId]
                                          });
                                          
                                          // Reset the creation form
                                          setNewGuardianData({ name: '', email: '', phone: '' });
                                          setShowCreateGuardian(false);
                                          setGuardianPhone('');
                                          setSuccess('Guardian created and linked successfully!');
                                          
                                        } catch (error) {
                                          console.error('Error creating guardian:', error);
                                          setError('Failed to create guardian. Please try again.');
                                        } finally {
                                          setGuardianCreationLoading(false);
                                        }
                                      }}
                                      disabled={guardianCreationLoading || !newGuardianData.name || !newGuardianData.email}
                                    >
                                      {guardianCreationLoading ? 'Creating...' : 'Create & Link Guardian'}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setShowCreateGuardian(false);
                                        setNewGuardianData({ name: '', email: '', phone: '' });
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Linked Guardians Display */}
                        {formData.guardianId.length > 0 && (
                          <div className="mt-4 p-4 bg-primary-50 rounded-lg border border-primary-200">
                            <div className="flex items-center gap-2 text-sm text-primary-700 mb-3">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="font-medium">
                                {formData.guardianId.length} guardian(s) linked to this player
                              </span>
                            </div>
                            <div className="space-y-2">
                              {formData.guardianId.map((guardianId) => {
                                // First check if guardian is in local guardians state
                                let guardian = guardians.find(g => g.id === guardianId);
                                
                                // If not found, check if it's the recently searched guardian
                                if (!guardian && guardianSearchResult && guardianSearchResult.id === guardianId) {
                                  guardian = guardianSearchResult;
                                }
                                
                                return guardian ? (
                                  <div key={guardianId} className="flex items-center justify-between bg-white p-3 rounded border">
                                    <div className="flex items-center space-x-3">
                                      <Avatar size="sm">
                                        {getInitials(guardian.name)}
                                      </Avatar>
                                      <div>
                                        <div className="text-sm font-medium text-gray-900">{guardian.name}</div>
                                        <div className="text-xs text-gray-600">{guardian.email}</div>
                                        {guardian.phone && (
                                          <div className="text-xs text-gray-600">{guardian.phone}</div>
                                        )}
                                      </div>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setFormData({
                                          ...formData,
                                          guardianId: formData.guardianId.filter(id => id !== guardianId)
                                        });
                                      }}
                                    >
                                      Unlink
                                    </Button>
                                  </div>
                                ) : (
                                  <LinkedGuardianLoader
                                    key={guardianId}
                                    guardianId={guardianId}
                                    onUnlink={() => {
                                      setFormData({
                                        ...formData,
                                        guardianId: formData.guardianId.filter(id => id !== guardianId)
                                      });
                                    }}
                                  />
                                );
                              })}
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
                        (activeStep === 1 && !isRolePreset) ? formData.roles.length === 0 :
                        ((activeStep === 1 && isRolePreset) || (activeStep === 2 && !isRolePreset)) ? (
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
                        (isPlayerRole && ((activeStep === 2 && isRolePreset) || (activeStep === 3 && !isRolePreset)) && !isParameterFieldsValid())
                      }
                      icon={<SaveIcon />}
                      className="bg-gradient-to-r from-success-600 to-success-700 hover:from-success-700 hover:to-success-800 px-8 py-3 shadow-lg"
                    >
                      {submitLoading ? 
                        (dialogMode === 'edit' ? 'Updating User...' : 'Creating User...') : 
                        (dialogMode === 'edit' ? 'Update User' : 'Create User')
                      }
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Dialog Components */}
      {selectedPlayer && (
        <PlayerGuardiansDialog
          player={selectedPlayer}
          users={users}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
      {selectedGuardianForPlayers && (
        <GuardianPlayersDialog
          guardian={selectedGuardianForPlayers}
          users={users}
          onClose={() => setSelectedGuardianForPlayers(null)}
        />
      )}
    </div>
  );
};

export default Users;