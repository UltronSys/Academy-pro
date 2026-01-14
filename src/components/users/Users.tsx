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
import { useUsers } from '../../contexts/UsersContext';
import { User, UserRole, Academy, ParameterField, FieldCategory } from '../../types';
import { updateUser as updateUserService, deleteUser as deleteUserService, createUser, getUserById } from '../../services/userService';
import { getAcademiesByOrganization } from '../../services/academyService';
import { createPlayer, getPlayerByUserId, updatePlayer, getPlayersByOrganization, getPlayersByGuardianId } from '../../services/playerService';
import { getFieldCategoriesForAcademy } from '../../services/settingsService';
import { searchUsers as searchUsersAlgolia } from '../../services/algoliaService';
import PlayerGuardiansDialog from './PlayerGuardiansDialog';
import GuardianPlayersDialog from './GuardianPlayersDialog';
import { storage } from '../../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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
        <Avatar size="sm" src={guardian.photoURL}>
          {!guardian.photoURL && getInitials(guardian.name)}
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
  const { users, loading: usersLoading, error: usersError, searchUsers, totalPages, totalUsers, currentPage, removeUser: removeUserFromContext, addUser: addUserToContext, updateUser: updateUserInContext } = useUsers();
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [loading, setLoading] = useState(false);
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
  const [guardianSearchPerformed, setGuardianSearchPerformed] = useState(false);
  const [showCreateGuardian, setShowCreateGuardian] = useState(false);
  const [guardianCreationLoading, setGuardianCreationLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<User | null>(null);
  const [selectedGuardianForPlayers, setSelectedGuardianForPlayers] = useState<User | null>(null);
  const [showLinkPlayersModal, setShowLinkPlayersModal] = useState(false);
  const [selectedPlayersToLink, setSelectedPlayersToLink] = useState<string[]>([]);
  const [availablePlayersForLinking, setAvailablePlayersForLinking] = useState<User[]>([]);
  const [success, setSuccess] = useState('');

  // Search debounce timer
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDebounceTimer, setSearchDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  const [newGuardianData, setNewGuardianData] = useState({
    name: '',
    email: '',
    phone: ''
  });
  const [fieldCategories, setFieldCategories] = useState<FieldCategory[]>([]);
  const [tableRenderKey, setTableRenderKey] = useState(Date.now());
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
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
  const [multiselectStates, setMultiselectStates] = useState<Record<string, boolean>>({});
  const dropdownRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [countryCode, setCountryCode] = useState('+966'); // Default to Saudi Arabia

  // Common country codes (sorted alphabetically by country name)
  const countryCodes = [
    { code: '+93', country: 'AF', name: 'Afghanistan' },
    { code: '+355', country: 'AL', name: 'Albania' },
    { code: '+213', country: 'DZ', name: 'Algeria' },
    { code: '+54', country: 'AR', name: 'Argentina' },
    { code: '+61', country: 'AU', name: 'Australia' },
    { code: '+43', country: 'AT', name: 'Austria' },
    { code: '+973', country: 'BH', name: 'Bahrain' },
    { code: '+880', country: 'BD', name: 'Bangladesh' },
    { code: '+32', country: 'BE', name: 'Belgium' },
    { code: '+55', country: 'BR', name: 'Brazil' },
    { code: '+1', country: 'CA', name: 'Canada' },
    { code: '+86', country: 'CN', name: 'China' },
    { code: '+57', country: 'CO', name: 'Colombia' },
    { code: '+20', country: 'EG', name: 'Egypt' },
    { code: '+251', country: 'ET', name: 'Ethiopia' },
    { code: '+358', country: 'FI', name: 'Finland' },
    { code: '+33', country: 'FR', name: 'France' },
    { code: '+49', country: 'DE', name: 'Germany' },
    { code: '+233', country: 'GH', name: 'Ghana' },
    { code: '+30', country: 'GR', name: 'Greece' },
    { code: '+91', country: 'IN', name: 'India' },
    { code: '+62', country: 'ID', name: 'Indonesia' },
    { code: '+98', country: 'IR', name: 'Iran' },
    { code: '+964', country: 'IQ', name: 'Iraq' },
    { code: '+353', country: 'IE', name: 'Ireland' },
    { code: '+972', country: 'IL', name: 'Israel' },
    { code: '+39', country: 'IT', name: 'Italy' },
    { code: '+81', country: 'JP', name: 'Japan' },
    { code: '+962', country: 'JO', name: 'Jordan' },
    { code: '+254', country: 'KE', name: 'Kenya' },
    { code: '+82', country: 'KR', name: 'South Korea' },
    { code: '+965', country: 'KW', name: 'Kuwait' },
    { code: '+961', country: 'LB', name: 'Lebanon' },
    { code: '+218', country: 'LY', name: 'Libya' },
    { code: '+60', country: 'MY', name: 'Malaysia' },
    { code: '+52', country: 'MX', name: 'Mexico' },
    { code: '+212', country: 'MA', name: 'Morocco' },
    { code: '+31', country: 'NL', name: 'Netherlands' },
    { code: '+64', country: 'NZ', name: 'New Zealand' },
    { code: '+234', country: 'NG', name: 'Nigeria' },
    { code: '+47', country: 'NO', name: 'Norway' },
    { code: '+968', country: 'OM', name: 'Oman' },
    { code: '+92', country: 'PK', name: 'Pakistan' },
    { code: '+970', country: 'PS', name: 'Palestine' },
    { code: '+63', country: 'PH', name: 'Philippines' },
    { code: '+48', country: 'PL', name: 'Poland' },
    { code: '+351', country: 'PT', name: 'Portugal' },
    { code: '+974', country: 'QA', name: 'Qatar' },
    { code: '+7', country: 'RU', name: 'Russia' },
    { code: '+966', country: 'SA', name: 'Saudi Arabia' },
    { code: '+65', country: 'SG', name: 'Singapore' },
    { code: '+27', country: 'ZA', name: 'South Africa' },
    { code: '+34', country: 'ES', name: 'Spain' },
    { code: '+94', country: 'LK', name: 'Sri Lanka' },
    { code: '+249', country: 'SD', name: 'Sudan' },
    { code: '+46', country: 'SE', name: 'Sweden' },
    { code: '+41', country: 'CH', name: 'Switzerland' },
    { code: '+963', country: 'SY', name: 'Syria' },
    { code: '+255', country: 'TZ', name: 'Tanzania' },
    { code: '+66', country: 'TH', name: 'Thailand' },
    { code: '+216', country: 'TN', name: 'Tunisia' },
    { code: '+90', country: 'TR', name: 'Turkey' },
    { code: '+256', country: 'UG', name: 'Uganda' },
    { code: '+971', country: 'AE', name: 'UAE' },
    { code: '+44', country: 'GB', name: 'UK' },
    { code: '+1', country: 'US', name: 'USA' },
    { code: '+58', country: 'VE', name: 'Venezuela' },
    { code: '+84', country: 'VN', name: 'Vietnam' },
    { code: '+967', country: 'YE', name: 'Yemen' },
    { code: '+260', country: 'ZM', name: 'Zambia' },
    { code: '+263', country: 'ZW', name: 'Zimbabwe' },
  ];

  const { userData } = useAuth();
  const { selectedAcademy, setSelectedAcademy } = useApp();

  const isRolePreset = formData.roles.length > 0 && dialogMode === 'add' && activeTab !== 0;
  const isAdminTab = activeTab === 4; // Admin tab skips Role Assignment step
  const skipRoleAssignmentStep = isRolePreset || isAdminTab;
  const isPlayerRole = formData.roles.includes('player');
  const steps = dialogMode === 'edit'
    ? (isPlayerRole ? ['User Information', 'Contact Information', 'Player Details'] : ['User Information', 'Contact Information'])
    : skipRoleAssignmentStep
      ? ['Full Name', 'Contact Information', 'Player Details']
      : ['Full Name', 'Role Assignment', 'Contact Information', 'Player Details'];
  const shouldShowPlayerStep = isPlayerRole; // Show player step for both add and edit modes
  const effectiveSteps = shouldShowPlayerStep
    ? steps
    : skipRoleAssignmentStep
      ? steps.slice(0, 2)
      : steps.slice(0, 3);


  const renderParameterField = (field: ParameterField) => {
    const fieldKey = field.name.toLowerCase().replace(/\s+/g, '_');
    // Use !== undefined to properly handle false and 0 values
    const currentValue = formData.dynamicFields[fieldKey] !== undefined
      ? formData.dynamicFields[fieldKey]
      : field.defaultValue;
    
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
            onChange={(e) => {
              const inputValue = Number(e.target.value);
              const maxValue = field.maximum ? Number(field.maximum) : undefined;

              // Enforce maximum: if value exceeds maximum, cap it at maximum
              if (maxValue !== undefined && inputValue > maxValue) {
                handleFieldChange(maxValue);
              } else {
                handleFieldChange(inputValue);
              }
            }}
            required={field.required}
            helperText={
              field.maximum
                ? `${field.description || ''}${field.description ? ' - ' : ''}Maximum: ${field.maximum}`
                : field.description
            }
            max={field.maximum ? Number(field.maximum) : undefined}
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
      case 'select':
      case 'dropdown':
        const selectOptions = field.options || [];

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
            <option value="">Select {field.name.toLowerCase()}</option>
            {selectOptions.map((option) => (
              <option key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </Select>
        );
      case 'multiselect':
        const multiselectOptions = Array.isArray(field.options) ? field.options.filter(opt => opt && opt.trim() !== '') : [];
        const selectedValues = Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue] : []);
        const isOpen = multiselectStates[fieldKey] || false;

        return (
          <div key={fieldKey}>
            <label className="block text-sm font-semibold text-gray-800 mb-1">
              {field.name}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {field.description && (
              <p className="text-xs text-gray-600 mb-1">{field.description}</p>
            )}
            {multiselectOptions.length > 0 ? (
              <div>
                {/* Selected items chips */}
                {selectedValues.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-1.5 bg-gray-50 rounded-md border border-gray-200 mb-1.5">
                    {selectedValues.map((value, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-600 text-white text-xs font-medium rounded shadow-sm">
                        <span>{value}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFieldChange(selectedValues.filter(v => v !== value));
                          }}
                          className="hover:bg-primary-700 rounded-full p-0.5 transition-colors"
                          title="Remove"
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Dropdown */}
                <div ref={(el) => { dropdownRefs.current[fieldKey] = el; }} className="relative">
                  <button
                    type="button"
                    onClick={() => setMultiselectStates(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }))}
                    className="w-full px-4 py-2.5 text-left bg-white border-2 border-gray-300 rounded-lg shadow-sm hover:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">
                        {selectedValues.length === 0
                          ? `Select ${field.name.toLowerCase()}...`
                          : `${selectedValues.length} selected`}
                      </span>
                      <svg className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Dropdown menu */}
                  {isOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-60 overflow-auto">
                      {multiselectOptions.map((option, optionIndex) => {
                        const isSelected = selectedValues.includes(option);
                        return (
                          <button
                            key={`${option}-${optionIndex}`}
                            type="button"
                            onClick={() => {
                              let newValues;
                              if (isSelected) {
                                newValues = selectedValues.filter(v => v !== option);
                              } else {
                                newValues = [...selectedValues, option];
                              }
                              handleFieldChange(newValues);
                            }}
                            className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-primary-50 transition-colors ${
                              isSelected ? 'bg-primary-50' : ''
                            }`}
                          >
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-primary-600 border-primary-600'
                                : 'border-gray-300'
                            }`}>
                              {isSelected && (
                                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                            <span className={isSelected ? 'text-gray-900 font-medium' : 'text-gray-700'}>
                              {option}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 border border-orange-300 rounded-lg bg-orange-50">
                <p className="text-sm text-orange-800 font-medium">No options configured</p>
                <p className="text-xs text-orange-600 mt-1">Please go to Settings and add options for the "{field.name}" field.</p>
              </div>
            )}
          </div>
        );
      case 'boolean':
        return (
          <div key={fieldKey} className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              {field.name}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
              <button
                type="button"
                onClick={() => handleFieldChange(true)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                  currentValue === true
                    ? 'bg-green-500 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {currentValue === true && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  Yes
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleFieldChange(false)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                  currentValue === false
                    ? 'bg-red-500 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {currentValue === false && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  No
                </span>
              </button>
            </div>
            {field.description && (
              <p className="text-sm text-gray-500 mt-1">{field.description}</p>
            )}
          </div>
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

  // Handle click outside for multiselect dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      Object.keys(dropdownRefs.current).forEach(key => {
        const ref = dropdownRefs.current[key];
        if (ref && !ref.contains(event.target as Node)) {
          setMultiselectStates(prev => ({ ...prev, [key]: false }));
        }
      });
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle optimistic UI update when a new user is created
  useEffect(() => {
    const state = location.state as any;
    if (state?.newUser) {
      // Show success message if provided (user already added to context)
      if (state.successMessage) {
        setSuccess(state.successMessage);

        // Clear success message after 5 seconds
        setTimeout(() => {
          setSuccess('');
        }, 5000);
      }

      // Clear the navigation state
      window.history.replaceState({}, document.title);
    }

    // Handle opening edit modal from navigation state (e.g., from UserDetails page)
    if (state?.editUserId) {
      const loadAndEditUser = async () => {
        try {
          const userToEdit = await getUserById(state.editUserId);
          if (userToEdit) {
            setSelectedUser(userToEdit);
            setDialogMode('edit');
            setOpenDialog(true);

            // Load player data if user has player role
            if (userToEdit.roles?.some(role => role.role.includes('player'))) {
              try {
                const playerData = await getPlayerByUserId(userToEdit.id);
                if (playerData) {
                  // Format date for form
                  let dobStr = '';
                  if (playerData.dob) {
                    const dob = playerData.dob instanceof Date
                      ? playerData.dob
                      : (playerData.dob as any).toDate?.() || new Date(playerData.dob as any);
                    dobStr = dob.toISOString().split('T')[0];
                  }

                  setFormData({
                    name: userToEdit.name,
                    email: userToEdit.email,
                    phone: userToEdit.phone || '',
                    password: '',
                    roles: userToEdit.roles?.flatMap(r => r.role) || [],
                    academyId: userToEdit.roles?.flatMap(r => r.academyId) || [],
                    dateOfBirth: dobStr,
                    gender: playerData.gender || '',
                    guardianId: playerData.guardianId || [],
                    status: playerData.status || '',
                    dynamicFields: playerData.playerParameters || {}
                  });
                }
              } catch (err) {
                console.error('Error loading player data:', err);
              }
            } else {
              setFormData({
                name: userToEdit.name,
                email: userToEdit.email,
                phone: userToEdit.phone || '',
                password: '',
                roles: userToEdit.roles?.flatMap(r => r.role) || [],
                academyId: userToEdit.roles?.flatMap(r => r.academyId) || [],
                dateOfBirth: '',
                gender: '',
                guardianId: [],
                status: '',
                dynamicFields: {}
              });
            }

            // Set profile image preview if exists
            if (userToEdit.photoURL) {
              setProfileImagePreview(userToEdit.photoURL);
            }
          }
        } catch (err) {
          console.error('Error loading user for edit:', err);
          setError('Failed to load user for editing');
        }
      };

      loadAndEditUser();
      // Clear the navigation state
      window.history.replaceState({}, document.title);
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (userData) {
      loadAcademies();
    }
  }, [userData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger search when search term, filters, tab, or academy changes
  useEffect(() => {
    if (userData) {
      // Always perform search when tab or academy changes (even with empty search term)
      // This ensures the role filter is applied based on the active tab
      performSearch(searchTerm, 0);
    }
  }, [searchTerm, roleFilter, activeTab, selectedAcademy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search function using UsersContext
  const performSearch = async (query: string = searchTerm, page: number = 0) => {
    setSearchLoading(true);
    try {
      // Determine role filter based on active tab and dropdown selection
      let roleFilterValue = 'all';
      if (activeTab === 1) roleFilterValue = 'player';
      else if (activeTab === 2) roleFilterValue = 'coach';
      else if (activeTab === 3) roleFilterValue = 'guardian';
      else if (activeTab === 4) {
        // Admin tab includes admin, owner, and all custom roles (administrative roles)
        const customRoles = organizationSettings?.customRoles || [];
        roleFilterValue = ['admin', 'owner', ...customRoles].join(',');
      }
      else if (activeTab === 0) {
        // For "All Users" tab, use the dropdown filter value
        roleFilterValue = roleFilter;
      }

      // Call context search function
      await searchUsers(query, roleFilterValue, page);
      
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

  // Handle profile image selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('🖼️ handleImageSelect triggered');
    const file = e.target.files?.[0];
    console.log('📁 Selected file:', file ? { name: file.name, size: file.size, type: file.type } : 'No file');

    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        console.error('❌ Invalid file type:', file.type);
        setError('Please select a valid image file');
        return;
      }

      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        console.error('❌ File too large:', file.size, 'bytes');
        setError('Image size must be less than 5MB');
        return;
      }

      console.log('✅ File validation passed, setting profile image');
      setProfileImage(file);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        console.log('✅ Preview created successfully');
        setProfileImagePreview(reader.result as string);
      };
      reader.onerror = () => {
        console.error('❌ Error reading file');
      };
      reader.readAsDataURL(file);
    } else {
      console.log('⚠️ No file selected');
    }
  };

  // Upload profile image to Firebase Storage
  const uploadProfileImage = async (userId: string): Promise<string | null> => {
    if (!profileImage) return null;

    try {
      setImageUploading(true);

      // Check if user is authenticated
      const { auth } = await import('../../firebase');
      const currentUser = auth.currentUser;
      console.log('🔐 Current authenticated user:', currentUser?.uid, currentUser?.email);

      if (!currentUser) {
        console.error('❌ No authenticated user found!');
        setError('You must be logged in to upload images');
        return null;
      }

      const timestamp = Date.now();
      const fileExtension = profileImage.name.split('.').pop();
      const fileName = `profile_${userId}_${timestamp}.${fileExtension}`;
      const storageRef = ref(storage, `users/${userId}/${fileName}`);

      console.log('📸 Uploading to path:', `users/${userId}/${fileName}`);
      console.log('📦 Storage bucket:', storage.app.options.storageBucket);
      await uploadBytes(storageRef, profileImage);
      const downloadURL = await getDownloadURL(storageRef);
      console.log('✅ Upload successful, URL:', downloadURL);

      return downloadURL;
    } catch (error: any) {
      console.error('Error uploading profile image:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        serverResponse: error.serverResponse
      });
      if (error.code === 'storage/unauthorized') {
        setError('Failed to upload profile image: Please update Firebase Storage rules to allow uploads. Check console for instructions.');
        console.error('🔧 TO FIX: Go to Firebase Console → Storage → Rules and use these rules:');
        console.error(`
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
        `);
      } else {
        setError(`Failed to upload profile image: ${error.message}`);
      }
      return null;
    } finally {
      setImageUploading(false);
    }
  };

  const handleAddUser = async (presetRole?: string) => {
    setSelectedUser(null);
    setDialogMode('add');
    setActiveStep(0);

    // Reset guardian search fields when opening add dialog
    setGuardianPhone('');
    setGuardianSearchResult(null);
    setGuardianSearchPerformed(false);
    setShowCreateGuardian(false);
    setNewGuardianData({ name: '', email: '', phone: '' });

    // Reset profile image fields
    setProfileImage(null);
    setProfileImagePreview(null);

    // Reset validation errors and country code
    setEmailError('');
    setPhoneError('');
    setCountryCode('+966'); // Reset to default

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
    setGuardianSearchPerformed(false);
    setShowCreateGuardian(false);
    setNewGuardianData({ name: '', email: '', phone: '' });

    // Reset validation errors
    setEmailError('');
    setPhoneError('');

    // Extract country code from existing phone number
    const extractPhoneAndCountryCode = (phone: string) => {
      if (!phone) return { code: '+966', number: '' };
      // Try to match known country codes
      for (const cc of countryCodes) {
        if (phone.startsWith(cc.code)) {
          return { code: cc.code, number: phone.slice(cc.code.length) };
        }
      }
      // If no match, assume default country code and use the whole number
      return { code: '+966', number: phone.replace(/^\+/, '') };
    };

    const { code, number } = extractPhoneAndCountryCode(user.phone || '');
    setCountryCode(code);

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
        phone: number,
        password: '', // Don't pre-fill password for security
        roles: user.roles?.flatMap(role => 
          Array.isArray(role.role) ? role.role : [role.role]
        ) || [],
        academyId: user.roles?.[0]?.academyId || [],
        dateOfBirth: (() => {
          if (!playerData?.dob) {
            console.log('❌ No DOB found in player data');
            return '';
          }
          try {
            console.log('📅 Raw DOB from Firestore:', playerData.dob, 'Type:', typeof playerData.dob);

            // Handle Firestore Timestamp object
            let date: Date;
            if (playerData.dob && typeof playerData.dob === 'object' && 'toDate' in playerData.dob) {
              // It's a Firestore Timestamp
              date = (playerData.dob as any).toDate();
              console.log('✅ Converted Firestore Timestamp to Date:', date);
            } else if (playerData.dob instanceof Date) {
              // It's already a Date object
              date = playerData.dob;
              console.log('✅ Already a Date object:', date);
            } else {
              // Try to parse it as a string or number
              date = new Date(playerData.dob);
              console.log('✅ Parsed as Date:', date);
            }

            // Check if date is valid
            if (isNaN(date.getTime())) {
              console.warn('⚠️ Invalid date after conversion:', playerData.dob);
              return '';
            }

            const isoDate = date.toISOString().split('T')[0];
            console.log('✅ Final ISO date for input:', isoDate);
            return isoDate;
          } catch (error) {
            console.error('❌ Error converting date:', error, playerData.dob);
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

    // Set profile picture preview if user has one
    setProfileImage(null); // Reset file selection
    if (user.photoURL) {
      setProfileImagePreview(user.photoURL);
      console.log('✅ Profile picture preview set for edit dialog:', user.photoURL);
    } else {
      setProfileImagePreview(null);
      console.log('ℹ️ No profile picture to display');
    }

    setOpenDialog(true);
  };

  // Check if user has owner role
  const isOwner = (user: User): boolean => {
    return user.roles?.some(role => {
      const roles = Array.isArray(role.role) ? role.role : [role.role];
      return roles.includes('owner');
    }) || false;
  };

  const handleDeleteUser = (user: User) => {
    // Prevent deletion of owners
    if (isOwner(user)) {
      setError('Owners cannot be deleted. Please transfer ownership first.');
      return;
    }
    setUserToDelete(user);
    setOpenDeleteDialog(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      setDeleteLoading(true);
      // Delete from Firestore
      await deleteUserService(userToDelete.id);
      // Remove from context for instant UI update
      removeUserFromContext(userToDelete.id);
      console.log('✅ Deleted user from context');
      setOpenDeleteDialog(false);
      setUserToDelete(null);
    } catch (error) {
      console.error('Error deleting user:', error);
      setError('Failed to delete user');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Email validation helper
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Phone validation helper (now only checks digits since country code is separate)
  const isValidPhone = (phone: string): boolean => {
    // Phone should be digits only and at least 7 characters
    const phoneRegex = /^\d+$/;
    return phone.length >= 7 && phoneRegex.test(phone);
  };

  // Get full phone number with country code
  const getFullPhoneNumber = (): string => {
    if (!formData.phone) return '';
    return `${countryCode}${formData.phone}`;
  };

  const handleNext = () => {
    setError('');

    if (activeStep === 0) {
      if (!formData.name.trim()) {
        setError('Please enter the full name');
        return;
      }
    } else if (activeStep === 1 && !skipRoleAssignmentStep) {
      if (formData.roles.length === 0) {
        setError('Please select at least one role');
        return;
      }
    } else if ((activeStep === 1 && skipRoleAssignmentStep) || (activeStep === 2 && !skipRoleAssignmentStep)) {
      const isPlayerRole = formData.roles.includes('player');
      const isOnlyGuardian = formData.roles.every(role => role === 'guardian');

      if (!isPlayerRole && !isOnlyGuardian) {
        // For roles that require login (coach, admin, owner, etc.)
        if (!formData.email || !formData.phone || !formData.password) {
          setError('Email, phone, and password are required for this role');
          return;
        }
        if (!isValidEmail(formData.email)) {
          setError('Please enter a valid email address');
          return;
        }
        if (!isValidPhone(formData.phone)) {
          setError('Please enter a valid phone number (minimum 7 digits)');
          return;
        }
        if (formData.password.length < 6) {
          setError('Password must be at least 6 characters');
          return;
        }
      } else if (!isPlayerRole && isOnlyGuardian) {
        // For guardian role - email and phone are optional, but validate format if provided
        if (formData.email && !isValidEmail(formData.email)) {
          setError('Please enter a valid email address');
          return;
        }
        if (formData.phone && !isValidPhone(formData.phone)) {
          setError('Please enter a valid phone number (minimum 7 digits)');
          return;
        }
      } else if (isPlayerRole) {
        // For player role - validate format if provided
        if (formData.email && !isValidEmail(formData.email)) {
          setError('Please enter a valid email address');
          return;
        }
        if (formData.phone && !isValidPhone(formData.phone)) {
          setError('Please enter a valid phone number (minimum 7 digits)');
          return;
        }
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
      console.log('🔄 Updating user data...', {
        userId: selectedUser.id,
        hasProfileImage: !!profileImage,
        profileImageName: profileImage?.name,
        currentPhotoURL: selectedUser.photoURL
      });

      // Check if editing an owner - only allow profile picture update
      if (isOwner(selectedUser)) {
        console.log('👑 Owner account - only updating profile picture');

        if (profileImage) {
          const uploadedURL = await uploadProfileImage(selectedUser.id);
          if (uploadedURL) {
            await updateUserService(selectedUser.id, { photoURL: uploadedURL });
            console.log('✅ Owner profile picture updated successfully');

            // Update in context for immediate display
            const updatedOwner = {
              ...selectedUser,
              photoURL: uploadedURL,
              updatedAt: {
                toDate: () => new Date(),
                seconds: Math.floor(Date.now() / 1000),
                nanoseconds: 0,
                toMillis: () => Date.now(),
                isEqual: () => false,
                toJSON: () => ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 })
              } as any
            };
            updateUserInContext(updatedOwner);

            // Sync to Algolia
            try {
              const { syncUserToAlgolia } = await import('../../services/algoliaService');
              await syncUserToAlgolia(updatedOwner);
            } catch (algoliaError) {
              console.warn('⚠️ Failed to sync owner to Algolia:', algoliaError);
            }
          }
        } else {
          console.log('ℹ️ No profile picture change for owner');
        }

        setOpenDialog(false);
        setProfileImage(null);
        setProfileImagePreview(null);
        return;
      }

      // Upload profile image if one was selected
      let photoURL = selectedUser.photoURL; // Keep existing photo by default
      if (profileImage) {
        console.log('📸 New profile image detected, uploading...', {
          fileName: profileImage.name,
          fileSize: profileImage.size,
          fileType: profileImage.type
        });
        const uploadedURL = await uploadProfileImage(selectedUser.id);
        if (uploadedURL) {
          photoURL = uploadedURL;
          console.log('✅ Profile image uploaded successfully:', uploadedURL);
        } else {
          console.error('❌ Profile image upload returned null');
        }
      } else {
        console.log('ℹ️ No new profile image to upload, keeping existing:', selectedUser.photoURL);
      }

      // Update user document
      const updatedUserData = {
        name: formData.name,
        email: formData.email,
        phone: getFullPhoneNumber(),
        roles: formData.roles.map(role => ({
          role: [role],
          organizationId: userData?.roles?.[0]?.organizationId || '',
          academyId: formData.academyId
        })),
        ...(photoURL && { photoURL }) // Include photoURL if it exists
      };

      await updateUserService(selectedUser.id, updatedUserData);
      
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
      
      // Update user in context for immediate UI feedback (no refresh needed)
      const updatedUserForContext: User = {
        ...selectedUser,
        name: formData.name,
        email: formData.email,
        phone: getFullPhoneNumber(),
        roles: formData.roles.map(role => ({
          role: [role],
          organizationId: userData?.roles?.[0]?.organizationId || '',
          academyId: formData.academyId
        })),
        ...(photoURL && { photoURL }),
        updatedAt: {
          toDate: () => new Date(),
          seconds: Math.floor(Date.now() / 1000),
          nanoseconds: 0,
          toMillis: () => Date.now(),
          isEqual: () => false,
          toJSON: () => ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 })
        } as any
      };
      updateUserInContext(updatedUserForContext);
      console.log('✅ User updated in context for immediate display');

      setOpenDialog(false);
      setActiveStep(0);
      setProfileImage(null); // Reset profile image
      setProfileImagePreview(null); // Reset profile image preview
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

      console.log('✅ User updated in Firestore and synced to Algolia');
      
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

      // Trim whitespace from input fields
      const trimmedName = formData.name.trim();
      const trimmedEmail = formData.email.trim();
      const trimmedPhone = formData.phone.trim();

      // Validate name is not empty after trimming
      if (!trimmedName) {
        setError('Please enter a valid name');
        setSubmitLoading(false);
        return;
      }

      console.log(`📝 ${dialogMode === 'edit' ? 'Updating' : 'Creating'} user:`, {
        dialogMode,
        selectedUser: selectedUser?.id,
        formData: {
          name: trimmedName,
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
        email: trimmedEmail,
        name: trimmedName,
        organizationId,
        isCoach: formData.roles.includes('coach')
      });

      if (hasLoginRole) {
        console.log('Creating user with login credentials...');
        // Import createUserAsAdmin function
        const { createUserAsAdmin } = await import('../../services/authService');

        // Create Firebase Auth account for users who can log in
        // The admin will stay logged in thanks to the secondary app instance
        const { uid } = await createUserAsAdmin(trimmedEmail, formData.password, trimmedName);
        console.log('User created with UID:', uid);
        newUserId = uid;

        // Update user document with additional data and roles
        console.log('Updating user with roles and organization data...');
        await updateUserService(newUserId, {
          phone: getFullPhoneNumber(),
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
          name: trimmedName,
          email: trimmedEmail,
          phone: getFullPhoneNumber(),
          roles: formData.roles.map(role => ({
            role: [role],
            organizationId: organizationId,
            academyId: formData.academyId
          }))
        });
      }

      // Upload profile image if provided
      let photoURL: string | null = null;
      if (profileImage) {
        console.log('📸 Uploading profile image...');
        photoURL = await uploadProfileImage(newUserId);
        if (photoURL) {
          console.log('✅ Profile image uploaded:', photoURL);
          // Update user document with photoURL
          await updateUserService(newUserId, { photoURL });

          // Re-sync to Algolia with the photoURL
          try {
            const { getUserById } = await import('../../services/userService');
            const algoliaModule = await import('../../services/algoliaService');
            const updatedUser = await getUserById(newUserId);
            if (updatedUser) {
              console.log('🔄 Re-syncing user to Algolia with photoURL...');
              await algoliaModule.syncUserToAlgolia(updatedUser);
            }
          } catch (syncError) {
            console.error('Failed to re-sync to Algolia:', syncError);
            // Don't fail the entire user creation if Algolia sync fails
          }
        }
      }

      // Build complete user data for cache
      const newUserData: User = {
        id: newUserId,
        name: trimmedName,
        email: trimmedEmail,
        phone: getFullPhoneNumber(),
        roles: formData.roles.map(role => ({
          role: [role],
          organizationId: organizationId,
          academyId: formData.academyId
        })),
        balance: 0,
        outstandingBalance: {},
        availableCredits: {},
        createdAt: {
          toDate: () => new Date(),
          seconds: Math.floor(Date.now() / 1000),
          nanoseconds: 0,
          toMillis: () => Date.now(),
          isEqual: () => false,
          toJSON: () => ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 })
        } as any,
        updatedAt: {
          toDate: () => new Date(),
          seconds: Math.floor(Date.now() / 1000),
          nanoseconds: 0,
          toMillis: () => Date.now(),
          isEqual: () => false,
          toJSON: () => ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 })
        } as any,
        ...(photoURL && { photoURL })
      };

      // Save to localStorage cache for faster retrieval
      const { addUserToCache } = await import('../../utils/userCache');
      addUserToCache(newUserData);
      console.log('✅ User saved to localStorage cache');

      // Add user to context for immediate UI update (no refresh needed)
      addUserToContext(newUserData);
      console.log('✅ User added to context for immediate display');

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

      // Close dialog - no need to reload from Algolia since we already added user to context
      setOpenDialog(false);
      setActiveStep(0);
      setProfileImage(null); // Reset profile image
      setProfileImagePreview(null); // Reset profile image preview
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
      // Reset profile image state
      setProfileImage(null);
      setProfileImagePreview(null);
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
        // Admin tab shows admin, owner, and all custom roles (administrative roles)
        const adminRoles = ['admin', 'owner', ...(organizationSettings?.customRoles || [])];
        filteredByTab = users.filter(user => user.roles?.some(role =>
          Array.isArray(role.role)
            ? role.role.some(r => adminRoles.includes(r))
            : adminRoles.includes(role.role)
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


  // Sort handler for DataTable
  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDirection('asc');
    }
  };

  // Sort users by name
  const sortedUsers = [...users].sort((a, b) => {
    if (sortBy === 'name') {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      if (sortDirection === 'asc') {
        return nameA.localeCompare(nameB);
      } else {
        return nameB.localeCompare(nameA);
      }
    }
    return 0;
  });

  // DataTable columns configuration - conditionally add guardians column for players
  const baseColumns = [
    {
      key: 'name',
      header: 'User',
      sortable: true,
      render: (user: User) => {
        // Debug logging
        if (user.photoURL) {
          console.log('User with photo:', user.name, user.photoURL);
        }
        return (
          <div
            className="flex items-center space-x-3 cursor-pointer"
            onClick={() => navigate(`/users/${user.id}`)}
          >
            <Avatar className="w-10 h-10" src={user.photoURL}>
              {!user.photoURL && getInitials(user.name)}
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
        );
      }
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
          {canDelete('users') && !isOwner(user) && (
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
                  // Don't preset admin role - let user select roles
                  presetRole = undefined;
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
                  performSearch(query, 0);
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
            data={sortedUsers}
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
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={handleSort}
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
                  onClick={() => performSearch(searchTerm, currentPage - 1)}
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
                        onClick={() => performSearch(searchTerm, pageIndex)}
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
                  onClick={() => performSearch(searchTerm, currentPage + 1)}
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
                        <Avatar size="sm" src={player.photoURL}>
                          {!player.photoURL && getInitials(player.name)}
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
                      // Users are already updated in context, no need for fresh search
                      console.log('✅ Players linked to guardian');
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
                        activeTab === 1 ? 'Add New Player' :
                        activeTab === 2 ? 'Add New Coach' :
                        activeTab === 3 ? 'Add New Guardian' :
                        activeTab === 4 ? 'Add New Admin' :
                        'Add New User'
                      )}
                    </h3>
                    <p className="text-secondary-600 text-sm font-normal">
                      {dialogMode === 'edit' ? (
                        'Update user information and settings'
                      ) : (
                        activeTab === 1 ? 'Create a new player account' :
                        activeTab === 2 ? 'Create a new coach account' :
                        activeTab === 3 ? 'Create a new guardian account' :
                        activeTab === 4 ? 'Create a new admin account' :
                        'Create a new member account'
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setOpenDialog(false);
                    setProfileImage(null);
                    setProfileImagePreview(null);
                  }}
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

              {/* Simplified Edit Form - Single Page */}
              {dialogMode === 'edit' ? (
                <div className="space-y-6">
                  {/* Check if editing an owner - only allow profile pic changes */}
                  {selectedUser && isOwner(selectedUser) && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                      <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-amber-800">Owner Account</p>
                        <p className="text-xs text-amber-700 mt-1">Owner details cannot be modified. Only the profile picture can be changed.</p>
                      </div>
                    </div>
                  )}

                  {/* Profile & Basic Info Section */}
                  <div className="bg-secondary-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Personal Information
                    </h3>
                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Profile Picture */}
                      <div className="flex flex-col items-center">
                        <div className="relative">
                          <div className="w-24 h-24 rounded-full overflow-hidden bg-secondary-200 flex items-center justify-center">
                            {profileImagePreview ? (
                              <img src={profileImagePreview} alt="Profile" className="w-full h-full object-cover" />
                            ) : selectedUser?.photoURL ? (
                              <img src={selectedUser.photoURL} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-2xl font-bold text-secondary-400">
                                {formData.name ? formData.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : '?'}
                              </span>
                            )}
                          </div>
                          <label className="absolute bottom-0 right-0 w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-primary-700 transition-colors">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  if (!file.type.startsWith('image/')) {
                                    setError('Please select a valid image file');
                                    return;
                                  }
                                  if (file.size > 5 * 1024 * 1024) {
                                    setError('Image size must be less than 5MB');
                                    return;
                                  }
                                  setProfileImage(file);
                                  setProfileImagePreview(URL.createObjectURL(file));
                                }
                              }}
                            />
                          </label>
                        </div>
                        <span className="text-xs text-secondary-500 mt-2">Click to change</span>
                      </div>
                      {/* Name Field */}
                      <div className="flex-1">
                        <Input
                          label="Full Name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                          disabled={!!(selectedUser && isOwner(selectedUser))}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Contact Information Section */}
                  <div className="bg-secondary-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Contact Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Email Address"
                        type="email"
                        value={formData.email}
                        onChange={(e) => {
                          setFormData({ ...formData, email: e.target.value });
                          if (emailError) setEmailError('');
                        }}
                        onBlur={() => {
                          if (formData.email && !isValidEmail(formData.email)) {
                            setEmailError('Please enter a valid email address');
                          } else {
                            setEmailError('');
                          }
                        }}
                        error={emailError}
                        disabled={!!(selectedUser && isOwner(selectedUser))}
                      />
                      <div className="space-y-1">
                        <label className="block text-sm font-semibold text-secondary-800">Phone Number</label>
                        <div className="flex">
                          <select
                            value={countryCode}
                            onChange={(e) => setCountryCode(e.target.value)}
                            disabled={!!(selectedUser && isOwner(selectedUser))}
                            className={`px-2 py-2.5 text-sm border border-r-0 border-secondary-300 rounded-l-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                              selectedUser && isOwner(selectedUser) ? 'bg-secondary-100 cursor-not-allowed' : ''
                            }`}
                          >
                            {countryCodes.map((cc) => (
                              <option key={`${cc.code}-${cc.country}`} value={cc.code}>{cc.country} {cc.code}</option>
                            ))}
                          </select>
                          <input
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '');
                              setFormData({ ...formData, phone: value });
                              if (phoneError) setPhoneError('');
                            }}
                            onBlur={() => {
                              if (formData.phone && formData.phone.length < 7) {
                                setPhoneError('Minimum 7 digits required');
                              } else {
                                setPhoneError('');
                              }
                            }}
                            placeholder="5XXXXXXXX"
                            disabled={!!(selectedUser && isOwner(selectedUser))}
                            className={`flex-1 px-3 py-2.5 text-sm border rounded-r-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                              phoneError ? 'border-error-300' : 'border-secondary-300'
                            } ${selectedUser && isOwner(selectedUser) ? 'bg-secondary-100 cursor-not-allowed' : ''}`}
                          />
                        </div>
                        {phoneError && <p className="text-sm text-error-600">{phoneError}</p>}
                      </div>
                    </div>
                  </div>

                  {/* Role & Academy Section */}
                  <div className="bg-secondary-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      Role & Access
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-secondary-800 mb-1">Roles</label>
                        <div className="flex flex-wrap gap-2">
                          {formData.roles.map((role) => (
                            <span key={role} className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium capitalize">
                              {role}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-secondary-500 mt-2">Roles cannot be changed after creation</p>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-secondary-800 mb-1">Academy Access</label>
                        {selectedUser && isOwner(selectedUser) ? (
                          <p className="text-sm text-secondary-600 py-2">Organization-wide access (Owner)</p>
                        ) : (
                          <>
                            <Select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  const updatedAcademyIds = [...formData.academyId, e.target.value];
                                  setFormData({ ...formData, academyId: updatedAcademyIds });
                                }
                              }}
                            >
                              <option value="">Add academy access</option>
                              {academies.filter(academy => !formData.academyId.includes(academy.id)).map((academy) => (
                                <option key={academy.id} value={academy.id}>{academy.name}</option>
                              ))}
                            </Select>
                            {formData.academyId.length > 0 ? (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {formData.academyId.map((academyId) => {
                                  const academy = academies.find(a => a.id === academyId);
                                  return (
                                    <span key={academyId} className="px-2 py-1 bg-secondary-200 text-secondary-700 rounded-full text-xs font-medium flex items-center gap-1">
                                      {academy?.name || academyId}
                                      <button
                                        onClick={() => setFormData({
                                          ...formData,
                                          academyId: formData.academyId.filter(id => id !== academyId)
                                        })}
                                        className="text-secondary-500 hover:text-error-600"
                                      >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-xs text-secondary-500 mt-2">Organization-wide access</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Player Details Section - Only for players */}
                  {isPlayerRole && (
                    <div className="bg-secondary-50 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Player Details
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input
                          label="Date of Birth"
                          type="date"
                          value={formData.dateOfBirth}
                          onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                        />
                        <Select
                          label="Gender"
                          value={formData.gender}
                          onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                        >
                          <option value="">Select gender</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </Select>
                        <Select
                          label="Status"
                          value={formData.status}
                          onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        >
                          <option value="">Select status</option>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="injured">Injured</option>
                          <option value="suspended">Suspended</option>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Guardian Management Section - Only for players */}
                  {isPlayerRole && (
                    <div className="bg-secondary-50 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        Guardians
                      </h3>

                      {/* Currently Linked Guardians */}
                      {formData.guardianId.length > 0 && (
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-secondary-700 mb-2">Linked Guardians</label>
                          <div className="space-y-2">
                            {formData.guardianId.map((guardianId) => (
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
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Search for Guardian */}
                      <div className="border-t border-secondary-200 pt-4">
                        <label className="block text-sm font-medium text-secondary-700 mb-2">Add Guardian</label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Search by phone or name"
                            value={guardianPhone}
                            onChange={(e) => {
                              setGuardianPhone(e.target.value);
                              setGuardianSearchPerformed(false);
                              setGuardianSearchResult(null);
                            }}
                            className="flex-1"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (!guardianPhone.trim() || guardianPhone.trim().length < 2) {
                                setError('Please enter at least 2 characters');
                                return;
                              }
                              try {
                                setGuardianSearchPerformed(true);
                                const organizationId = userData?.roles[0]?.organizationId;
                                if (!organizationId) return;

                                const results = await searchUsersAlgolia({
                                  query: guardianPhone.trim(),
                                  organizationId,
                                  filters: { role: 'guardian' },
                                  page: 0,
                                  hitsPerPage: 10
                                });

                                if (results.users.length > 0) {
                                  const foundGuardian = results.users[0];
                                  setGuardianSearchResult({
                                    id: foundGuardian.objectID,
                                    name: foundGuardian.name,
                                    email: foundGuardian.email || '',
                                    phone: foundGuardian.phone,
                                    roles: foundGuardian.roleDetails || [],
                                  } as User);
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
                          <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Avatar size="sm" src={guardianSearchResult.photoURL}>
                                  {!guardianSearchResult.photoURL && getInitials(guardianSearchResult.name)}
                                </Avatar>
                                <div>
                                  <div className="font-medium text-green-900">{guardianSearchResult.name}</div>
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
                                  setGuardianSearchPerformed(false);
                                }}
                                disabled={formData.guardianId.includes(guardianSearchResult.id)}
                              >
                                {formData.guardianId.includes(guardianSearchResult.id) ? 'Linked' : 'Add'}
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* No results message */}
                        {guardianSearchPerformed && !guardianSearchResult && guardianPhone.trim().length >= 2 && (
                          <p className="mt-2 text-sm text-secondary-600">No guardian found with that search term.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Player Parameters Section - Only for players */}
                  {isPlayerRole && fieldCategories.length > 0 && (
                    <div className="bg-secondary-50 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Player Parameters
                      </h3>
                      <div className="space-y-4">
                        {fieldCategories
                          .filter(category => category.type === 'parameter' || category.type === 'mixed')
                          .sort((a, b) => a.order - b.order)
                          .map(category => {
                            const categoryFields = category.fields || [];
                            if (categoryFields.length === 0) return null;

                            return (
                              <div key={category.id} className="border-b border-secondary-200 pb-4 last:border-0 last:pb-0">
                                <h4 className="text-sm font-semibold text-secondary-800 mb-3">{category.name}</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {categoryFields
                                    .sort((a, b) => a.order - b.order)
                                    .map(field => (
                                      <div key={field.name}>
                                        {renderParameterField(field)}
                                      </div>
                                    ))}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-secondary-200">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setOpenDialog(false);
                        setProfileImage(null);
                        setProfileImagePreview(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      loading={submitLoading}
                      disabled={!formData.name.trim() || !!emailError || !!phoneError || !!(formData.email && !isValidEmail(formData.email)) || !!(formData.phone && !isValidPhone(formData.phone))}
                      className="bg-primary-600 hover:bg-primary-700"
                    >
                      {submitLoading ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              ) : (
              /* Add User Flow - Multi-step wizard */
              <>
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
                    <div className="bg-secondary-50 rounded-xl p-6 space-y-6">
                      {/* Profile Picture Upload */}
                      <div className="flex flex-col items-center">
                        <div className="relative mb-4">
                          <div className="w-32 h-32 rounded-full overflow-hidden bg-secondary-200 flex items-center justify-center">
                            {profileImagePreview ? (
                              <img
                                src={profileImagePreview}
                                alt="Profile preview"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <svg className="w-16 h-16 text-secondary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            )}
                          </div>
                          <label
                            htmlFor="profile-image-upload"
                            className="absolute bottom-0 right-0 w-10 h-10 bg-primary-600 hover:bg-primary-700 rounded-full flex items-center justify-center cursor-pointer transition-colors shadow-lg"
                          >
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </label>
                          <input
                            id="profile-image-upload"
                            type="file"
                            accept="image/*"
                            onChange={handleImageSelect}
                            className="hidden"
                          />
                        </div>
                        <p className="text-sm text-secondary-600">
                          {profileImage ? profileImage.name : 'Upload profile picture (optional)'}
                        </p>
                        {profileImage && (
                          <button
                            onClick={() => {
                              setProfileImage(null);
                              setProfileImagePreview(null);
                            }}
                            className="mt-2 text-sm text-red-600 hover:text-red-800"
                          >
                            Remove photo
                          </button>
                        )}
                      </div>

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
                {activeStep === 1 && !skipRoleAssignmentStep && dialogMode === 'add' && (
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
                            'admin', 'coach', 'player', 'guardian',
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
                
                {/* Step 2 or 3: Contact Information (depending on if role is preset) */}
                {((activeStep === 1 && skipRoleAssignmentStep) || (activeStep === 2 && !skipRoleAssignmentStep)) && (
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
                    {skipRoleAssignmentStep && (
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

                    {/* Role Selection - Show for Admin tab (activeTab === 4) */}
                    {activeTab === 4 && (
                      <div className="bg-secondary-50 rounded-xl p-6 mb-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="font-semibold text-secondary-900">User Roles</h3>
                            <p className="text-xs text-secondary-600 font-normal">Assign roles to this user</p>
                          </div>
                        </div>

                        <Select
                          value=""
                          onChange={(e) => {
                            if (e.target.value && !formData.roles.includes(e.target.value)) {
                              setFormData({ ...formData, roles: [...formData.roles, e.target.value] });
                            }
                          }}
                        >
                          <option value="">{formData.roles.length === 0 ? 'Select a role' : 'Add another role'}</option>
                          {[
                            'admin',
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
                                variant={role === 'admin' ? 'warning' : 'primary'}
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
                          {formData.roles.length === 0
                            ? <span className="text-error-500">At least one role is required</span>
                            : `${formData.roles.length} role(s) assigned`
                          }
                        </p>
                        {organizationSettings?.customRoles && organizationSettings.customRoles.length > 0 && (
                          <p className="text-xs text-secondary-500 mt-1">
                            Available custom roles: {organizationSettings.customRoles.join(', ')}
                          </p>
                        )}
                        {(!organizationSettings?.customRoles || organizationSettings.customRoles.length === 0) && (
                          <p className="text-xs text-amber-600 mt-1">
                            No custom roles configured. Add custom roles in Settings → Role Permissions.
                          </p>
                        )}
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2">
                          <Input
                            label={formData.roles.includes('player') || formData.roles.every(role => role === 'guardian') ? "Email Address (Optional)" : "Email Address"}
                            type="email"
                            value={formData.email}
                            onChange={(e) => {
                              setFormData({ ...formData, email: e.target.value });
                              // Clear error when user starts typing
                              if (emailError) setEmailError('');
                            }}
                            onBlur={() => {
                              // Validate email format on blur if value is provided
                              if (formData.email && !isValidEmail(formData.email)) {
                                setEmailError('Please enter a valid email address');
                              } else {
                                setEmailError('');
                              }
                            }}
                            error={emailError}
                            required={!formData.roles.includes('player') && !formData.roles.every(role => role === 'guardian')}
                            helperText={!emailError ? (formData.roles.includes('player') || formData.roles.every(role => role === 'guardian')
                              ? "Optional - Can be added later if needed"
                              : "This will be used for login") : undefined
                            }
                          />
                          <div className="space-y-1">
                            <label className="block text-sm font-semibold text-secondary-800">
                              {formData.roles.includes('player') || formData.roles.every(role => role === 'guardian') ? "Phone Number (Optional)" : "Phone Number"}
                              {!formData.roles.includes('player') && !formData.roles.every(role => role === 'guardian') && <span className="text-error-500 ml-1">*</span>}
                            </label>
                            <div className="flex">
                              <select
                                value={countryCode}
                                onChange={(e) => setCountryCode(e.target.value)}
                                className="px-2 py-2.5 text-sm border border-r-0 border-secondary-300 rounded-l-lg bg-secondary-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                              >
                                {countryCodes.map((cc) => (
                                  <option key={`${cc.code}-${cc.country}`} value={cc.code}>
                                    {cc.country} {cc.code}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="tel"
                                value={formData.phone}
                                onChange={(e) => {
                                  // Only allow digits
                                  const value = e.target.value.replace(/\D/g, '');
                                  setFormData({ ...formData, phone: value });
                                  // Clear error when user starts typing
                                  if (phoneError) setPhoneError('');
                                }}
                                onBlur={() => {
                                  // Validate phone format on blur if value is provided
                                  if (formData.phone && formData.phone.length < 7) {
                                    setPhoneError('Please enter a valid phone number (minimum 7 digits)');
                                  } else {
                                    setPhoneError('');
                                  }
                                }}
                                placeholder="5XXXXXXXX"
                                className={`flex-1 px-3 py-2.5 text-sm border rounded-r-lg shadow-sm placeholder-secondary-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                                  phoneError ? 'border-error-300 focus:ring-error-500' : 'border-secondary-300'
                                }`}
                              />
                            </div>
                            {(phoneError || (!phoneError && (formData.roles.includes('player') || formData.roles.every(role => role === 'guardian')))) && (
                              <p className={`text-sm font-normal ${phoneError ? 'text-error-600' : 'text-secondary-600'}`}>
                                {phoneError || "Optional - Can be added later if needed"}
                              </p>
                            )}
                            {!phoneError && !formData.roles.includes('player') && !formData.roles.every(role => role === 'guardian') && (
                              <p className="text-sm font-normal text-secondary-600">Required for this role</p>
                            )}
                          </div>
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
                
                {/* Step 3 or 4: Player Details (depending on if role is preset) */}
                {((activeStep === 2 && skipRoleAssignmentStep && isPlayerRole) || (activeStep === 3 && !skipRoleAssignmentStep && isPlayerRole)) && (
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
                            onChange={(e) => {
                              setGuardianPhone(e.target.value);
                              // Reset search state when user types to clear any previous search results/messages
                              setGuardianSearchPerformed(false);
                              setGuardianSearchResult(null);
                            }}
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

                                // Mark that a search has been performed
                                setGuardianSearchPerformed(true);

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
                                <Avatar size="md" src={guardianSearchResult.photoURL}>
                                  {!guardianSearchResult.photoURL && getInitials(guardianSearchResult.name)}
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
                                  // Reset all search state to allow adding another guardian
                                  setGuardianSearchResult(null);
                                  setGuardianPhone('');
                                  setGuardianSearchPerformed(false);
                                  setShowCreateGuardian(false);
                                }}
                                disabled={formData.guardianId.includes(guardianSearchResult.id)}
                              >
                                {formData.guardianId.includes(guardianSearchResult.id) ? 'Already Linked' : 'Link Guardian'}
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        {guardianSearchPerformed && !guardianSearchResult && guardianPhone.trim().length >= 2 && (
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
                                onClick={() => {
                                  // Initialize phone with the search term
                                  setNewGuardianData({ name: '', email: '', phone: guardianPhone });
                                  setShowCreateGuardian(true);
                                }}
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
                                    placeholder="Email Address (Optional)"
                                    type="email"
                                    value={newGuardianData.email}
                                    onChange={(e) => setNewGuardianData({...newGuardianData, email: e.target.value})}
                                  />
                                  <Input
                                    placeholder="Phone Number (Optional)"
                                    value={newGuardianData.phone}
                                    onChange={(e) => setNewGuardianData({...newGuardianData, phone: e.target.value})}
                                  />
                                  <div className="flex items-center space-x-2">
                                    <Button
                                      size="sm"
                                      onClick={async () => {
                                        if (!newGuardianData.name) {
                                          setError('Guardian name is required');
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
                                            email: newGuardianData.email || '',
                                            phone: newGuardianData.phone || '',
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

                                          // Reset the creation form and search state to allow adding another guardian
                                          setNewGuardianData({ name: '', email: '', phone: '' });
                                          setShowCreateGuardian(false);
                                          setGuardianPhone('');
                                          setGuardianSearchResult(null);
                                          setGuardianSearchPerformed(false);
                                          setSuccess('Guardian created and linked successfully!');
                                          
                                        } catch (error) {
                                          console.error('Error creating guardian:', error);
                                          setError('Failed to create guardian. Please try again.');
                                        } finally {
                                          setGuardianCreationLoading(false);
                                        }
                                      }}
                                      disabled={guardianCreationLoading || !newGuardianData.name}
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
                                      <Avatar size="sm" src={guardian.photoURL}>
                                        {!guardian.photoURL && getInitials(guardian.name)}
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
                              <Card key={category.id} className="overflow-visible">
                                <CardBody>
                                  <h4 className="text-base font-semibold text-secondary-900 mb-2">{category.name}</h4>
                                  {category.description && (
                                    <p className="text-sm text-secondary-700 mb-4 font-normal">{category.description}</p>
                                  )}
                                  {categoryFields.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2">
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
            </>
            )}
            </div>

            {/* Enhanced Action Buttons - Only for Add mode */}
            {dialogMode === 'add' && (
            <div className="bg-secondary-50 border-t border-secondary-200 p-6">
              <div className="flex justify-between items-center">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setOpenDialog(false);
                    setProfileImage(null);
                    setProfileImagePreview(null);
                  }}
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
                        activeStep === 0 ? !formData.name.trim() :
                        (activeStep === 1 && !skipRoleAssignmentStep) ? formData.roles.length === 0 :
                        ((activeStep === 1 && skipRoleAssignmentStep) || (activeStep === 2 && !skipRoleAssignmentStep)) ? (
                          // Check for validation errors or invalid format
                          // Also check for roles when admin tab (roles selected in contact step)
                          (isAdminTab && formData.roles.length === 0) ||
                          !!emailError || !!phoneError ||
                          (formData.email && !isValidEmail(formData.email)) ||
                          (formData.phone && !isValidPhone(formData.phone)) ||
                          (formData.roles.includes('player') ? false :
                          formData.roles.every(role => role === 'guardian') ? false :
                            (!formData.email || !formData.phone || !formData.password))
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
                        !formData.name.trim() ||
                        formData.roles.length === 0 ||
                        // Check for validation errors or invalid format
                        !!emailError || !!phoneError ||
                        (formData.email && !isValidEmail(formData.email)) ||
                        (formData.phone && !isValidPhone(formData.phone)) ||
                        (!formData.roles.includes('player') && !formData.roles.every(role => role === 'guardian') && (!formData.email || !formData.phone || !formData.password)) ||
                        (isPlayerRole && ((activeStep === 2 && skipRoleAssignmentStep) || (activeStep === 3 && !skipRoleAssignmentStep)) && !isParameterFieldsValid())
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
            )}
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