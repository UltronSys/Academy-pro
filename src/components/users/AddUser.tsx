import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Input,
  Card,
  CardBody,
  Select,
  Alert,
  Badge
} from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../contexts/AppContext';
import { User, UserRole, Academy, Settings, ParameterField, FieldCategory } from '../../types';
import { createUser, getUsersByOrganization, updateUser } from '../../services/userService';
import { signUp } from '../../services/authService';
import { getAcademiesByOrganization } from '../../services/academyService';
import { createPlayer } from '../../services/playerService';
import { getSettingsByOrganization, getFieldCategoriesForAcademy } from '../../services/settingsService';

// Icons (reusing from EditUser)
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

const DeleteIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const AddUser: React.FC = () => {
  const navigate = useNavigate();
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeStep, setActiveStep] = useState(0);
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
  const [guardians, setGuardians] = useState<User[]>([]);
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianSearchResult, setGuardianSearchResult] = useState<User | null>(null);
  const [showCreateGuardian, setShowCreateGuardian] = useState(false);
  const [newGuardianData, setNewGuardianData] = useState({
    name: '',
    email: '',
    phone: ''
  });
  const [guardianCreateLoading, setGuardianCreateLoading] = useState(false);

  const { userData } = useAuth();
  const { selectedOrganization } = useApp();

  const steps = ['Full Name', 'Role Assignment', 'Contact Information', 'Player Details'];
  const isPlayerRole = formData.roles.includes('player');
  const shouldShowPlayerStep = isPlayerRole;
  const effectiveSteps = shouldShowPlayerStep ? steps : steps.slice(0, 3);
  
  // Debug: Log current state
  console.log('AddUser render - current roles:', formData.roles);
  console.log('AddUser render - activeStep:', activeStep);

  useEffect(() => {
    if (userData) {
      loadInitialData();
    }
  }, [userData]);

  useEffect(() => {
    console.log('===== AddUser useEffect START =====');
    console.log('AddUser: organizationSettings:', organizationSettings);
    console.log('AddUser: organizationSettings?.fieldCategories:', organizationSettings?.fieldCategories);
    console.log('AddUser: formData.academyId:', formData.academyId);
    
    if (organizationSettings) {
      let categories: FieldCategory[] = [];
      
      if (formData.academyId.length > 0) {
        const academyId = formData.academyId[0];
        console.log('AddUser: Getting academy-specific categories for academy:', academyId);
        categories = getFieldCategoriesForAcademy(organizationSettings, academyId) || [];
        console.log('AddUser: Academy-specific categories result:', categories);
      } else {
        // Use organization-wide categories when no academy is selected
        console.log('AddUser: No academy selected, using organization-wide categories');
        categories = organizationSettings.fieldCategories || [];
        console.log('AddUser: Organization fieldCategories result:', categories);
      }
      
      console.log('AddUser: Final categories before sort:', categories);
      const sortedCategories = categories.sort((a, b) => a.order - b.order);
      console.log('AddUser: Setting fieldCategories to:', sortedCategories);
      setFieldCategories(sortedCategories);
    } else {
      console.log('AddUser: No organization settings found, setting empty array');
      setFieldCategories([]);
    }
    console.log('===== AddUser useEffect END =====');
  }, [organizationSettings, formData.academyId]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const organizationId = userData?.roles?.[0]?.organizationId;
      
      console.log('AddUser: loadInitialData - organizationId:', organizationId);
      
      if (organizationId) {
        const [academyData, userData_list, settings] = await Promise.all([
          getAcademiesByOrganization(organizationId),
          getUsersByOrganization(organizationId),
          getSettingsByOrganization(organizationId)
        ]);
        
        console.log('AddUser: loadInitialData - settings loaded:', settings);
        console.log('AddUser: loadInitialData - settings.fieldCategories:', settings?.fieldCategories);
        
        setAcademies(academyData);
        setUsers(userData_list);
        setOrganizationSettings(settings);
        
        // Filter guardians
        const guardianUsers = userData_list.filter(user => 
          user.roles.some(role => role.role.includes('guardian'))
        );
        setGuardians(guardianUsers);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load required data');
    } finally {
      setLoading(false);
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
      const hasLoginRole = formData.roles.some(role => 
        !['player', 'guardian'].includes(role)
      );
      
      if (hasLoginRole && (!formData.email || !formData.phone || !formData.password)) {
        setError('Email, phone, and password are required for users who can log in');
        return;
      }
      if (hasLoginRole && formData.password && formData.password.length < 6) {
        setError('Password must be at least 6 characters long');
        return;
      }
      if (!hasLoginRole && !formData.email && !formData.phone) {
        setError('At least email or phone is required for players/guardians');
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
      
      // Check if user has any roles that allow login (not just player/guardian)
      const hasLoginRole = formData.roles.some(role => 
        !['player', 'guardian'].includes(role)
      );
      
      // Create Firebase Auth account for users who can log in
      if (hasLoginRole) {
        console.log('Creating Firebase Auth account for user:', formData.email);
        
        // Import and use createUserAsAdmin
        const { createUserAsAdmin } = await import('../../services/authService');
        const { uid } = await createUserAsAdmin(formData.email, formData.password, formData.name);
        newUserId = uid;
        console.log('Firebase Auth user created with ID:', newUserId);
        
        // Update user document with additional data and roles
        await updateUser(newUserId, {
          phone: formData.phone,
          roles: formData.roles.map(role => ({ 
            role: [role],
            organizationId: organizationId,
            academyId: formData.academyId
          }))
        });
        console.log('User roles assigned');
      } else {
        // For users with only player/guardian roles, create Firestore document only (no login needed)
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
        console.log('Player user document created with ID:', newUserId);
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
      
      navigate('/users');
    } catch (error) {
      console.error('Error creating user:', error);
      setError('Failed to create user');
    } finally {
      setSubmitLoading(false);
    }
  };

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
        // For multiselect, we'll use a simple text input for now or implement proper multiselect
        return (
          <Input
            key={fieldKey}
            label={`${field.name} (comma-separated)`}
            value={Array.isArray(currentValue) ? currentValue.join(', ') : currentValue}
            onChange={(e) => {
              const values = e.target.value.split(',').map(v => v.trim()).filter(v => v);
              handleFieldChange(values);
            }}
            required={field.required}
            helperText={field.description ? `${field.description} (Enter multiple values separated by commas)` : 'Enter multiple values separated by commas'}
          />
        );
      case 'boolean':
        return (
          <div key={fieldKey} className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              {field.name}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <Select
              value={currentValue}
              onChange={(e) => handleFieldChange(e.target.value === 'true')}
              required={field.required}
            >
              <option value="">Select yes/no</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </Select>
            {field.description && (
              <p className="text-sm text-gray-500">{field.description}</p>
            )}
          </div>
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

  const removeRole = (roleToRemove: string) => {
    setFormData({
      ...formData,
      roles: formData.roles.filter(role => role !== roleToRemove)
    });
  };

  const addRole = (roleToAdd: string) => {
    if (!formData.roles.includes(roleToAdd)) {
      const newRoles = [...formData.roles, roleToAdd];
      console.log('Adding role:', roleToAdd);
      console.log('New roles array:', newRoles);
      setFormData({
        ...formData,
        roles: newRoles
      });
    }
  };

  const removeAcademy = (academyToRemove: string) => {
    setFormData({
      ...formData,
      academyId: formData.academyId.filter(id => id !== academyToRemove)
    });
  };

  const addAcademy = (academyToAdd: string) => {
    if (!formData.academyId.includes(academyToAdd)) {
      setFormData({
        ...formData,
        academyId: [...formData.academyId, academyToAdd]
      });
    }
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Add New User</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">Create a new user account</p>
        </div>
        <Button
          variant="outline"
          icon={<ArrowLeftIcon />}
          onClick={() => navigate('/users')}
          className="self-start sm:self-auto"
        >
          <span className="hidden sm:inline">Back to Users</span>
          <span className="sm:hidden">Back</span>
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="error">
          {error}
        </Alert>
      )}

      {/* Stepper */}
      {effectiveSteps.length > 1 && (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between overflow-x-auto pb-2">
              {effectiveSteps.map((step, index) => (
                <div key={step} className="flex items-center flex-shrink-0">
                  <div className={`flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 ${
                    index <= activeStep 
                      ? 'bg-primary-600 border-primary-600 text-white' 
                      : 'border-gray-300 text-gray-400'
                  }`}>
                    {index < activeStep ? (
                      <CheckCircleIcon />
                    ) : (
                      <span className="text-xs sm:text-sm">{index + 1}</span>
                    )}
                  </div>
                  {index < effectiveSteps.length - 1 && (
                    <div className={`w-8 sm:w-12 h-0.5 ${
                      index < activeStep ? 'bg-primary-600' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 overflow-x-auto">
              {effectiveSteps.map((step, index) => (
                <span key={step} className={`text-xs sm:text-sm flex-shrink-0 ${
                  index <= activeStep ? 'text-primary-600 font-medium' : 'text-gray-400'
                }`}>
                  {step}
                </span>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Form Steps */}
      <Card>
        <CardBody className="space-y-6">
          {/* Step 1: Full Name */}
          {activeStep === 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Full Name</h2>
              <Input
                label="Full Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                helperText="Enter the user's full name"
                autoFocus
              />
            </div>
          )}
          
          {/* Step 2: Role Assignment */}
          {activeStep === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Role Assignment</h2>
              
              {/* Academies */}
              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-700">Academies</label>
                <Select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      addAcademy(e.target.value);
                    }
                  }}
                >
                  <option value="">Select an academy to add</option>
                  {academies.filter(academy => !formData.academyId.includes(academy.id)).map((academy) => (
                    <option key={academy.id} value={academy.id}>
                      {academy.name}
                    </option>
                  ))}
                </Select>
                
                {formData.academyId.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.academyId.map((academyId) => {
                      const academy = academies.find(a => a.id === academyId);
                      return (
                        <Badge key={academyId} variant="primary" className="flex items-center gap-2">
                          {academy?.name || academyId}
                          <button
                            onClick={() => removeAcademy(academyId)}
                            className="text-primary-600 hover:text-primary-800"
                          >
                            <DeleteIcon />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
                
                <p className="text-sm text-gray-500">
                  {formData.academyId.length === 0 ? 'User will have organization-wide access' : `Selected ${formData.academyId.length} academy(ies)`}
                </p>
              </div>

              {/* Roles */}
              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-700">Roles</label>
                <Select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      addRole(e.target.value);
                    }
                  }}
                >
                  <option value="">Select a role to add</option>
                  {['owner', 'admin', 'coach', 'player', 'guardian'].filter(role => !formData.roles.includes(role)).map((role) => (
                    <option key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </option>
                  ))}
                </Select>
                
                {formData.roles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.roles.map((role) => (
                      <Badge 
                        key={role} 
                        variant={role === 'owner' ? 'error' : role === 'admin' ? 'warning' : 'default'}
                        className="flex items-center gap-2"
                      >
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                        <button
                          onClick={() => removeRole(role)}
                          className="hover:text-current"
                        >
                          <DeleteIcon />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                
                <p className="text-sm text-gray-500">
                  {formData.roles.length === 0 ? 'At least one role is required' : `Selected ${formData.roles.length} role(s)`}
                </p>
              </div>
            </div>
          )}
          
          {/* Step 3: Contact Information */}
          {activeStep === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Contact Information</h2>
              
              {/* DEBUG INFO - Remove this later */}
              <div className="p-3 bg-yellow-100 border border-yellow-300 rounded">
                <p><strong>Debug Info:</strong></p>
                <p>Current roles: {JSON.stringify(formData.roles)}</p>
                <p>Has login role: {formData.roles.some(role => !['player', 'guardian'].includes(role)) ? 'YES' : 'NO'}</p>
                <p>Only player/guardian: {formData.roles.every(role => ['player', 'guardian'].includes(role)) ? 'YES' : 'NO'}</p>
              </div>
              
              {(() => {
                const hasLoginRole = formData.roles.some(role => 
                  !['player', 'guardian'].includes(role)
                );
                const onlyPlayerGuardian = formData.roles.every(role => 
                  ['player', 'guardian'].includes(role)
                );
                
                // Debug logging
                console.log('AddUser Contact Step Debug:');
                console.log('formData.roles:', formData.roles);
                console.log('hasLoginRole:', hasLoginRole);
                console.log('onlyPlayerGuardian:', onlyPlayerGuardian);
                
                if (onlyPlayerGuardian) {
                  return (
                    <div className="space-y-4">
                      <p className="text-gray-600">Contact information is optional for players and guardians.</p>
                      <Input
                        label="Email Address (Optional)"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        helperText="Optional - Can be added later if needed"
                      />
                      <Input
                        label="Phone Number (Optional)"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        helperText="Optional - Can be added later if needed"
                      />
                    </div>
                  );
                } else {
                  return (
                    <div className="space-y-4">
                      <p className="text-gray-600">
                        {hasLoginRole ? 'This user will be able to log in to the system.' : 'Contact information is required.'}
                      </p>
                      <Input
                        label="Email Address"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                        helperText={hasLoginRole ? "This will be used for login" : "Required for contact"}
                      />
                      <Input
                        label="Phone Number"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        required
                        helperText="Required for this role"
                      />
                      {(() => {
                        console.log('Password field check - hasLoginRole:', hasLoginRole);
                        if (hasLoginRole) {
                          console.log('Rendering password field');
                          return (
                            <Input
                              label="Password"
                              type="password"
                              value={formData.password}
                              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                              required
                              helperText="User will use this password to login"
                            />
                          );
                        } else {
                          console.log('Not rendering password field');
                          return null;
                        }
                      })()}
                    </div>
                  );
                }
              })()}
            </div>
          )}
          
          {/* Step 4: Player Details */}
          {activeStep === 3 && isPlayerRole && (() => {
            // Debug logging moved outside JSX
            console.log('AddUser: Rendering player details, fieldCategories.length:', fieldCategories.length);
            console.log('AddUser: fieldCategories:', fieldCategories);
            console.log('AddUser: organizationSettings:', organizationSettings);
            console.log('AddUser: formData.academyId:', formData.academyId);
            
            return (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-900">Player Details</h2>
                
                {/* Required Fields */}
                <div className="p-4 border-2 border-primary-600 rounded-lg bg-primary-50">
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircleIcon />
                    <h3 className="text-lg font-medium text-primary-900">Required Information</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Date of Birth"
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                      required
                      helperText="Required for all players"
                    />
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
                
                {/* Custom Category Fields */}
                {fieldCategories.length > 0 ? (
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium text-gray-900">Additional Information</h3>
                    {fieldCategories
                      .filter(category => {
                        console.log('AddUser: Filtering category:', category.name, 'type:', category.type);
                        return category.type === 'parameter' || category.type === 'mixed';
                      })
                      .sort((a, b) => a.order - b.order)
                      .map(category => {
                        const categoryFields = category.fields || [];
                        console.log('AddUser: Category:', category.name, 'Fields:', categoryFields);
                        
                        return categoryFields.length > 0 ? (
                          <Card key={category.id}>
                            <CardBody>
                              <h4 className="text-base font-medium text-gray-900 mb-2">{category.name}</h4>
                              {category.description && (
                                <p className="text-sm text-gray-600 mb-4">{category.description}</p>
                              )}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {categoryFields
                                  .sort((a, b) => a.order - b.order)
                                  .map(field => (
                                    <div key={field.name}>
                                      {renderParameterField(field)}
                                    </div>
                                  ))}
                              </div>
                            </CardBody>
                          </Card>
                        ) : null;
                      })}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-900">Additional Information</h3>
                    <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                      <p className="text-gray-600">
                        DEBUG: No field categories found. 
                        Organization settings loaded: {organizationSettings ? 'YES' : 'NO'}
                        {organizationSettings && (
                          <span> | Categories: {organizationSettings.fieldCategories?.length || 0}</span>
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:justify-between pt-6 border-t border-gray-200 gap-3">
            <Button 
              variant="secondary"
              onClick={() => navigate('/users')}
              className="order-2 sm:order-1"
            >
              Cancel
            </Button>
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 order-1 sm:order-2">
              {activeStep > 0 && (
                <Button 
                  variant="outline"
                  onClick={handleBack}
                  icon={<ArrowLeftIcon />}
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
                    activeStep === 2 ? (() => {
                      const hasLoginRole = formData.roles.some(role => 
                        !['player', 'guardian'].includes(role)
                      );
                      const onlyPlayerGuardian = formData.roles.every(role => 
                        ['player', 'guardian'].includes(role)
                      );
                      
                      if (onlyPlayerGuardian) {
                        return false; // Optional fields for players/guardians
                      } else if (hasLoginRole) {
                        return (!formData.email || !formData.phone || !formData.password);
                      } else {
                        return (!formData.email || !formData.phone);
                      }
                    })() :
                    false
                  }
                  icon={<ArrowRightIcon />}
                  className="flex-row-reverse"
                >
                  Next
                </Button>
              ) : (
                <Button 
                  onClick={handleSubmit}
                  loading={submitLoading}
                  disabled={
                    !formData.name || 
                    formData.roles.length === 0 || 
                    (() => {
                      const hasLoginRole = formData.roles.some(role => 
                        !['player', 'guardian'].includes(role)
                      );
                      const onlyPlayerGuardian = formData.roles.every(role => 
                        ['player', 'guardian'].includes(role)
                      );
                      
                      if (onlyPlayerGuardian) {
                        return false; // Optional fields
                      } else if (hasLoginRole) {
                        return (!formData.email || !formData.phone || !formData.password);
                      } else {
                        return (!formData.email || !formData.phone);
                      }
                    })() ||
                    (isPlayerRole && activeStep === 3 && !isParameterFieldsValid())
                  }
                  icon={<SaveIcon />}
                  className="bg-gradient-to-r from-secondary-600 to-secondary-700 hover:from-secondary-700 hover:to-secondary-800"
                >
                  {submitLoading ? 'Creating...' : 'Create User'}
                </Button>
              )}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default AddUser;