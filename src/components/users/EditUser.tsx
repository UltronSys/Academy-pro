import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { User, Academy, Settings, ParameterField, FieldCategory } from '../../types';
import { getUserById, updateUser } from '../../services/userService';
import { getAcademiesByOrganization } from '../../services/academyService';
import { getPlayerByUserId, updatePlayer } from '../../services/playerService';
import { getSettingsByOrganization, getFieldCategoriesForAcademy } from '../../services/settingsService';

// Icons
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


const DeleteIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const EditUser: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  const [organizationSettings, setOrganizationSettings] = useState<Settings | null>(null);
  const [fieldCategories, setFieldCategories] = useState<FieldCategory[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    roles: [] as string[],
    academyId: [] as string[],
    dateOfBirth: '',
    gender: '',
    guardianId: [] as string[],
    dynamicFields: {} as Record<string, any>
  });
  const [submitLoading, setSubmitLoading] = useState(false);

  const { userData } = useAuth();

  const steps = ['Full Name', 'Role Assignment', 'Contact Information', 'Player Details'];
  const isPlayerRole = formData.roles.includes('player');
  const shouldShowPlayerStep = isPlayerRole;
  const effectiveSteps = shouldShowPlayerStep ? steps : steps.slice(0, 3);

  useEffect(() => {
    if (userData && userId) {
      loadUser();
      loadAcademies();
      loadSettings();
    }
  }, [userData, userId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const loadUser = async () => {
    try {
      setLoading(true);
      const userDataResult = await getUserById(userId!);
      setUser(userDataResult);

      let playerData = null;
      if (userDataResult?.roles?.some(role => role.role.includes('player'))) {
        try {
          playerData = await getPlayerByUserId(userDataResult.id);
        } catch (error) {
          console.error('Error loading player data:', error);
        }
      }

      const dynamicFields = playerData?.playerParameters || {};

      const formatDate = (dateValue: any) => {
        if (!dateValue) return '';
        
        try {
          let date: Date;
          if (dateValue instanceof Date) {
            date = dateValue;
          } else if (dateValue.toDate && typeof dateValue.toDate === 'function') {
            date = dateValue.toDate();
          } else if (typeof dateValue === 'string' && dateValue.trim() !== '') {
            date = new Date(dateValue);
          } else if (typeof dateValue === 'number' && dateValue > 0) {
            date = new Date(dateValue);
          } else {
            return '';
          }
          
          if (isNaN(date.getTime())) {
            return '';
          }
          
          return date.toISOString().split('T')[0];
        } catch (error) {
          console.error('Error formatting date:', error);
          return '';
        }
      };

      if (userDataResult) {
        setFormData({
          name: userDataResult.name,
          email: userDataResult.email,
          phone: userDataResult.phone || '',
          roles: userDataResult.roles?.flatMap(r => r.role) || [],
          academyId: userDataResult.roles?.flatMap(r => r.academyId) || [],
          dateOfBirth: formatDate(playerData?.dob),
          gender: playerData?.gender || '',
          guardianId: playerData?.guardianId || [],
          dynamicFields: dynamicFields
        });
      }
    } catch (error) {
      console.error('Error loading user:', error);
      setError('Failed to load user');
    } finally {
      setLoading(false);
    }
  };

  const loadAcademies = async () => {
    try {
      const organizationId = userData?.roles?.[0]?.organizationId;
      if (organizationId) {
        const orgAcademies = await getAcademiesByOrganization(organizationId);
        setAcademies(orgAcademies);
      }
    } catch (error) {
      console.error('Error loading academies:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const organizationId = userData?.roles?.[0]?.organizationId;
      if (organizationId) {
        const settings = await getSettingsByOrganization(organizationId);
        setOrganizationSettings(settings);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
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
      if (!isPlayerRole && (!formData.email || !formData.phone)) {
        setError('Email and phone are required for non-player roles');
        return;
      }
    }
    
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleSubmit = async () => {
    if (!user) return;

    try {
      setSubmitLoading(true);
      const organizationId = userData?.roles?.[0]?.organizationId || '';
      
      await updateUser(user.id, {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        roles: formData.roles.map(role => ({ 
          role: [role],
          organizationId: organizationId,
          academyId: formData.academyId
        }))
      });
      
      if (formData.roles.includes('player')) {
        const existingPlayer = await getPlayerByUserId(user.id);
        if (existingPlayer) {
          const dobValue = formData.dateOfBirth;
          const genderValue = formData.gender;
          
          await updatePlayer(existingPlayer.id, {
            guardianId: formData.guardianId,
            playerParameters: formData.dynamicFields,
            dob: dobValue ? new Date(dobValue) : existingPlayer.dob,
            gender: genderValue || existingPlayer.gender
          });
        }
      }
      
      navigate('/users');
    } catch (error) {
      console.error('Error saving user:', error);
      setError('Failed to save user');
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

  const removeRole = (roleToRemove: string) => {
    setFormData({
      ...formData,
      roles: formData.roles.filter(role => role !== roleToRemove)
    });
  };

  const addRole = (roleToAdd: string) => {
    if (!formData.roles.includes(roleToAdd)) {
      setFormData({
        ...formData,
        roles: [...formData.roles, roleToAdd]
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

  if (!user) {
    return (
      <div className="space-y-6">
        <Alert variant="error">User not found</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-secondary-900">Edit User</h1>
          <p className="text-secondary-600 mt-1 font-normal text-sm sm:text-base">Editing: {user.name}</p>
        </div>
        <Button
          variant="outline"
          icon={<ArrowLeftIcon />}
          className="self-start sm:self-auto"
          onClick={() => navigate('/users')}
        >
          Back to Users
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="error">
          {error}
        </Alert>
      )}

      {/* Enhanced Stepper */}
      {effectiveSteps.length > 1 && (
        <Card>
          <CardBody>
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
          </CardBody>
        </Card>
      )}

      {/* Form Steps */}
      <Card>
        <CardBody className="space-y-6">
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
                <p className="text-secondary-600 font-normal">Update the user's basic information</p>
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
                <p className="text-secondary-600 font-normal">Update roles and academy access</p>
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
                        addAcademy(e.target.value);
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
                        addRole(e.target.value);
                      }
                    }}
                  >
                    <option value="">Select a role</option>
                    {['owner', 'admin', 'coach', 'player', 'guardian'].filter(role => !formData.roles.includes(role)).map((role) => (
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
                            onClick={() => removeRole(role)}
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
                        : 'Required for account access and communication'
                      }
                    </p>
                  </div>
                </div>
                
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
                <p className="text-secondary-600 font-normal">Essential information for player management</p>
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
              
              {/* Custom Category Fields */}
              {fieldCategories.length > 0 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-secondary-900">Additional Information</h3>
                  {fieldCategories
                    .filter(category => category.type === 'parameter' || category.type === 'mixed')
                    .sort((a, b) => a.order - b.order)
                    .map(category => {
                      const categoryFields = category.fields || [];
                      
                      return categoryFields.length > 0 && (
                        <Card key={category.id}>
                          <CardBody>
                            <h4 className="text-base font-semibold text-secondary-900 mb-2">{category.name}</h4>
                            {category.description && (
                              <p className="text-sm text-secondary-700 mb-4 font-normal">{category.description}</p>
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
                      );
                    })}
                </div>
              )}
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="flex justify-between pt-6 border-t border-secondary-200">
            <Button 
              variant="secondary"
              onClick={() => navigate('/users')}
            >
              Cancel
            </Button>
            <div className="flex space-x-3">
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
                    activeStep === 2 ? (
                      formData.roles.includes('player') ? false :
                      (!formData.email || !formData.phone)
                    ) :
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
                    (!formData.roles.includes('player') && (!formData.email || !formData.phone)) ||
                    (isPlayerRole && activeStep === 3 && !isParameterFieldsValid())
                  }
                  icon={<SaveIcon />}
                  className="bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800"
                >
                  {submitLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              )}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default EditUser;