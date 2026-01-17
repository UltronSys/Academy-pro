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
import { Academy, Settings, ParameterField, FieldCategory } from '../../types';
import { createUser, getUsersByOrganization, updateUser } from '../../services/userService';
import { getAcademiesByOrganization } from '../../services/academyService';
import { createPlayer } from '../../services/playerService';
import { getSettingsByOrganization, getFieldCategoriesForAcademy } from '../../services/settingsService';
import { useUsers } from '../../contexts/UsersContext';

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
  const [multiselectStates, setMultiselectStates] = useState<Record<string, boolean>>({});
  const dropdownRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const { userData } = useAuth();
  const { addUser } = useUsers();

  const steps = ['Full Name', 'Role Assignment', 'Contact Information', 'Player Details'];
  const isPlayerRole = formData.roles.includes('player');
  const shouldShowPlayerStep = isPlayerRole;
  const effectiveSteps = shouldShowPlayerStep ? steps : steps.slice(0, 3);

  useEffect(() => {
    if (userData) {
      loadInitialData();
    }
  }, [userData]); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    if (organizationSettings) {
      let categories: FieldCategory[] = [];

      if (formData.academyId.length > 0) {
        const academyId = formData.academyId[0];
        categories = getFieldCategoriesForAcademy(organizationSettings, academyId) || [];
      } else {
        categories = organizationSettings.fieldCategories || [];
      }

      const sortedCategories = categories.sort((a, b) => a.order - b.order);
      setFieldCategories(sortedCategories);
    } else {
      setFieldCategories([]);
    }
  }, [organizationSettings, formData.academyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize default values when fieldCategories change
  useEffect(() => {
    if (fieldCategories.length === 0) return;

    const newDynamicFields: Record<string, any> = { ...formData.dynamicFields };
    let hasChanges = false;

    fieldCategories.forEach(category => {
      if (category.type === 'parameter' || category.type === 'mixed') {
        category.fields?.forEach(field => {
          const fieldKey = field.name.toLowerCase().replace(/\s+/g, '_');

          const hasDefaultValue = field.defaultValue !== undefined &&
                                  field.defaultValue !== null &&
                                  field.defaultValue !== '' &&
                                  !(Array.isArray(field.defaultValue) && field.defaultValue.length === 0);
          const fieldNotSet = newDynamicFields[fieldKey] === undefined;

          if (fieldNotSet && hasDefaultValue) {
            let defaultVal: any = field.defaultValue;

            switch (field.type) {
              case 'number':
                defaultVal = Number(field.defaultValue) || 0;
                break;
              case 'boolean':
                if (typeof field.defaultValue === 'boolean') {
                  defaultVal = field.defaultValue;
                } else if (typeof field.defaultValue === 'string') {
                  const lowerVal = field.defaultValue.toLowerCase();
                  if (lowerVal === 'true' || lowerVal === 'yes') {
                    defaultVal = true;
                  } else if (lowerVal === 'false' || lowerVal === 'no') {
                    defaultVal = false;
                  }
                }
                break;
              case 'date':
                if (field.defaultValue === '__CURRENT_DATE__') {
                  const today = new Date();
                  defaultVal = today.toISOString().split('T')[0];
                } else {
                  defaultVal = String(field.defaultValue);
                }
                break;
              case 'multiselect':
                if (Array.isArray(field.defaultValue)) {
                  defaultVal = field.defaultValue;
                } else if (typeof field.defaultValue === 'string' && field.defaultValue) {
                  defaultVal = [field.defaultValue];
                } else {
                  defaultVal = [];
                }
                break;
              default:
                defaultVal = String(field.defaultValue);
            }

            newDynamicFields[fieldKey] = defaultVal;
            hasChanges = true;
          }
        });
      }
    });

    if (hasChanges) {
      setFormData(prev => ({
        ...prev,
        dynamicFields: newDynamicFields
      }));
    }
  }, [fieldCategories]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const organizationId = userData?.roles?.[0]?.organizationId;

      if (organizationId) {
        const [academyData, userData_list, settings] = await Promise.all([
          getAcademiesByOrganization(organizationId),
          getUsersByOrganization(organizationId),
          getSettingsByOrganization(organizationId)
        ]);

        setAcademies(academyData);
        setOrganizationSettings(settings);
        
        // Filter guardians
        userData_list.filter(user => 
          user.roles.some(role => role.role.includes('guardian'))
        );
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
      if (!formData.name.trim()) {
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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Image size must be less than 5MB');
        return;
      }

      setProfileImage(file);
      // Create preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setError('');
    }
  };

  const uploadProfileImage = async (userId: string): Promise<string | null> => {
    if (!profileImage) return null;

    try {
      setImageUploading(true);
      const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
      const { storage } = await import('../../firebase');

      // Create a unique filename
      const fileExtension = profileImage.name.split('.').pop();
      const fileName = `profile_${userId}_${Date.now()}.${fileExtension}`;
      const storageRef = ref(storage, `users/${userId}/${fileName}`);

      // Upload the file
      await uploadBytes(storageRef, profileImage);

      // Get the download URL
      const downloadURL = await getDownloadURL(storageRef);

      return downloadURL;
    } catch (error) {
      console.error('Error uploading profile image:', error);
      setError('Failed to upload profile image');
      return null;
    } finally {
      setImageUploading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setSubmitLoading(true);
      const organizationId = userData?.roles?.[0]?.organizationId || '';
      const trimmedName = formData.name.trim();
      const trimmedEmail = formData.email.trim();
      const trimmedPhone = formData.phone.trim();

      // Validate required fields are not empty after trimming
      if (!trimmedName) {
        setError('Please enter a valid name');
        setSubmitLoading(false);
        return;
      }

      // Check if user has any roles that allow login (not just player/guardian)
      const hasLoginRole = formData.roles.some(role =>
        !['player', 'guardian'].includes(role)
      );

      const onlyPlayerGuardian = formData.roles.every(role =>
        ['player', 'guardian'].includes(role)
      );

      // Validate email/phone based on role requirements
      if (hasLoginRole && (!trimmedEmail || !trimmedPhone)) {
        setError('Email and phone are required for users who can log in');
        setSubmitLoading(false);
        return;
      }

      if (onlyPlayerGuardian && !trimmedEmail && !trimmedPhone) {
        setError('At least email or phone is required');
        setSubmitLoading(false);
        return;
      }

      let newUserId: string;
      let createdUserData: any;

      // Build the user roles array
      const userRoles = formData.roles.map(role => ({
        role: [role],
        organizationId: organizationId,
        academyId: formData.academyId
      }));

      // Create Firebase Auth account for users who can log in
      if (hasLoginRole) {

        // Import and use createUserAsAdmin
        const { createUserAsAdmin } = await import('../../services/authService');
        const { uid } = await createUserAsAdmin(trimmedEmail, formData.password, trimmedName);
        newUserId = uid;

        // Upload profile image if selected
        let profilePictureURL = null;
        if (profileImage) {
          profilePictureURL = await uploadProfileImage(newUserId);
        }

        // Update user document with additional data and roles
        await updateUser(newUserId, {
          phone: trimmedPhone,
          roles: userRoles,
          ...(profilePictureURL && { photoURL: profilePictureURL })
        });

        // Build complete user data for optimistic update
        createdUserData = {
          id: newUserId,
          name: trimmedName,
          email: trimmedEmail,
          phone: trimmedPhone,
          roles: userRoles,
          balance: 0,
          outstandingBalance: {},
          availableCredits: {},
          ...(profilePictureURL && { photoURL: profilePictureURL }),
          createdAt: new Date(),
          updatedAt: new Date()
        };
      } else {
        // For users with only player/guardian roles, create Firestore document only (no login needed)
        newUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        // Upload profile image if selected
        let profilePictureURL = null;
        if (profileImage) {
          profilePictureURL = await uploadProfileImage(newUserId);
        }

        createdUserData = {
          id: newUserId,
          name: trimmedName,
          email: trimmedEmail,
          phone: trimmedPhone,
          roles: userRoles,
          balance: 0,
          outstandingBalance: {},
          availableCredits: {},
          ...(profilePictureURL && { photoURL: profilePictureURL }),
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await createUser(createdUserData);
      }

      // If creating a player, also create player record
      if (formData.roles.includes('player')) {
        const playerId = `player_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        const dobValue = formData.dateOfBirth;
        const genderValue = formData.gender;

        // Merge default values with form data for playerParameters
        const playerParameters: Record<string, any> = { ...formData.dynamicFields };
        fieldCategories.forEach(category => {
          if (category.type === 'parameter' || category.type === 'mixed') {
            category.fields?.forEach(field => {
              const fieldKey = field.name.toLowerCase().replace(/\s+/g, '_');
              // If field not in formData but has a default value, use the default
              if (playerParameters[fieldKey] === undefined && field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== '') {
                playerParameters[fieldKey] = field.defaultValue;
              }
            });
          }
        });

        await createPlayer({
          id: playerId,
          userId: newUserId,
          academyId: formData.academyId,
          organizationId: organizationId,
          dob: new Date(dobValue),
          gender: genderValue,
          guardianId: formData.guardianId,
          playerParameters: playerParameters
        });
      }

      // Add to context for instant UI update
      addUser(createdUserData);

      // Navigate back
      navigate('/users', {
        state: {
          successMessage: 'User created successfully!'
        }
      });
    } catch (error) {
      console.error('Error creating user:', error);
      setError('Failed to create user');
    } finally {
      setSubmitLoading(false);
    }
  };

  const renderParameterField = (field: ParameterField) => {
    const fieldKey = field.name.toLowerCase().replace(/\s+/g, '_');
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
      // Check both formData value and field's defaultValue
      const value = formData.dynamicFields[fieldKey] !== undefined
        ? formData.dynamicFields[fieldKey]
        : field.defaultValue;

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
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Basic Information</h2>

              {/* Profile Picture Upload */}
              <div className="flex flex-col items-center space-y-4">
                <div className="relative">
                  {profileImagePreview ? (
                    <img
                      src={profileImagePreview}
                      alt="Profile preview"
                      className="w-32 h-32 rounded-full object-cover border-4 border-primary-200 shadow-lg"
                    />
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 border-4 border-gray-300 flex items-center justify-center shadow-lg">
                      <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  )}
                  <label
                    htmlFor="profile-picture"
                    className="absolute bottom-0 right-0 bg-primary-600 text-white p-2 rounded-full cursor-pointer hover:bg-primary-700 transition-colors shadow-lg"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <input
                      id="profile-picture"
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                  </label>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">Profile Picture</p>
                  <p className="text-xs text-gray-500 mt-1">Click the camera icon to upload (optional)</p>
                  <p className="text-xs text-gray-400 mt-0.5">Max size: 5MB</p>
                </div>
              </div>

              {/* Full Name Input */}
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

                <select
                  className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      addRole(e.target.value);
                    }
                  }}
                >
                  <option value="">Select a role to add</option>
                  <option value="admin">Admin</option>
                  {(organizationSettings?.customRoles || []).map((role) => (
                    <option key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </option>
                  ))}
                </select>

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

                {/* Show available custom roles info */}
                {organizationSettings?.customRoles && organizationSettings.customRoles.length > 0 ? (
                  <p className="text-xs text-gray-400">
                    Custom roles available: {organizationSettings.customRoles.join(', ')}
                  </p>
                ) : (
                  <p className="text-xs text-amber-600">
                    No custom roles configured. Add custom roles in Settings &gt; Role Permissions.
                  </p>
                )}
              </div>
            </div>
          )}
          
          {/* Step 3: Contact Information */}
          {activeStep === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Contact Information</h2>

              {(() => {
                const hasLoginRole = formData.roles.some(role => 
                  !['player', 'guardian'].includes(role)
                );
                const onlyPlayerGuardian = formData.roles.every(role =>
                  ['player', 'guardian'].includes(role)
                );

                if (onlyPlayerGuardian) {
                  const hasEmail = formData.email.trim().length > 0;
                  const hasPhone = formData.phone.trim().length > 0;
                  const hasEither = hasEmail || hasPhone;

                  return (
                    <div className="space-y-4">
                      <div className={`p-3 rounded-lg ${hasEither ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                        <p className={`text-sm ${hasEither ? 'text-green-700' : 'text-amber-700'}`}>
                          {hasEither
                            ? '✓ Contact information provided'
                            : 'Please provide at least an email address OR a phone number'}
                        </p>
                      </div>
                      <Input
                        label={`Email Address ${hasPhone ? '(Optional)' : hasEmail ? '' : '(Required if no phone)'}`}
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required={!hasPhone}
                        helperText={hasPhone ? "Optional since phone number is provided" : "Required if phone number is not provided"}
                      />
                      <Input
                        label={`Phone Number ${hasEmail ? '(Optional)' : hasPhone ? '' : '(Required if no email)'}`}
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        required={!hasEmail}
                        helperText={hasEmail ? "Optional since email is provided" : "Required if email is not provided"}
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
                      {hasLoginRole && (
                        <Input
                          label="Password"
                          type="password"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          required
                          helperText="User will use this password to login"
                        />
                      )}
                    </div>
                  );
                }
              })()}
            </div>
          )}
          
          {/* Step 4: Player Details */}
          {activeStep === 3 && isPlayerRole && (
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
                      .filter(category => category.type === 'parameter' || category.type === 'mixed')
                      .sort((a, b) => a.order - b.order)
                      .map(category => {
                        const categoryFields = category.fields || [];
                        return categoryFields.length > 0 ? (
                          <Card key={category.id} className="overflow-visible">
                            <CardBody>
                              <h4 className="text-base font-medium text-gray-900 mb-2">{category.name}</h4>
                              {category.description && (
                                <p className="text-sm text-gray-600 mb-4">{category.description}</p>
                              )}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2">
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
                  <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                    <p className="text-gray-600">
                      No additional fields configured for this academy. You can add custom fields in Settings.
                    </p>
                  </div>
                )}
              </div>
          )}
          
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
                    activeStep === 0 ? !formData.name.trim() :
                    activeStep === 1 ? formData.roles.length === 0 :
                    activeStep === 2 ? (() => {
                      const hasLoginRole = formData.roles.some(role => 
                        !['player', 'guardian'].includes(role)
                      );
                      const onlyPlayerGuardian = formData.roles.every(role =>
                        ['player', 'guardian'].includes(role)
                      );

                      if (onlyPlayerGuardian) {
                        // At least email or phone is required
                        return !formData.email.trim() && !formData.phone.trim();
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
                    !formData.name.trim() ||
                    formData.roles.length === 0 || 
                    (() => {
                      const hasLoginRole = formData.roles.some(role =>
                        !['player', 'guardian'].includes(role)
                      );
                      const onlyPlayerGuardian = formData.roles.every(role =>
                        ['player', 'guardian'].includes(role)
                      );

                      if (onlyPlayerGuardian) {
                        // At least email or phone is required
                        return !formData.email.trim() && !formData.phone.trim();
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