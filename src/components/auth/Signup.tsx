import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Input, Alert, Select } from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { signUp } from '../../services/authService';
import { createOrganizationOnly } from '../../services/organizationService';
import { createAcademy } from '../../services/academyService';
import { updateUser, getUserById } from '../../services/userService';
import { initializeDefaultRolePermissions } from '../../services/permissionService';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { countryOptions, cityOptions } from '../../constants/locations';

// Icons
const AcademyLogo = () => (
  <div className="relative">
    <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-2xl">
      <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    </div>
    <div className="absolute -top-1 -right-1 w-6 h-6 bg-primary-400 rounded-full flex items-center justify-center">
      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
      </svg>
    </div>
  </div>
);

const SoccerIcon = () => (
  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
  </svg>
);

const PersonIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const EmailIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
  </svg>
);

const PhoneIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const LockIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const BusinessIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);


const EyeIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const EyeOffIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

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

const LoadingIcon = () => (
  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

const UploadIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);


interface AcademyData {
  name: string;
  country: string;
  city: string;
  location: string;
}

const Signup: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Creating...');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { refreshUserData } = useAuth();

  // Owner data
  const [ownerData, setOwnerData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Organization data
  const [orgData, setOrgData] = useState({
    name: '',
    imageFile: null as File | null
  });

  // Academies data
  const [academies, setAcademies] = useState<AcademyData[]>([
    { name: '', country: '', city: '', location: '' }
  ]);

  const steps = ['Account Details', 'Organization', 'Academies'];

  const passwordRequirements = [
    { label: 'At least 6 characters', met: ownerData.password.length >= 6 },
    { label: 'Passwords match', met: ownerData.password === ownerData.confirmPassword && ownerData.password.length > 0 }
  ];

  const handleNext = () => {
    setError('');
    
    if (activeStep === 0) {
      // Validate owner data
      if (!ownerData.name || !ownerData.email || !ownerData.password || !ownerData.confirmPassword) {
        setError('Please fill in all required fields');
        return;
      }
      if (ownerData.password !== ownerData.confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (ownerData.password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
    } else if (activeStep === 1) {
      // Validate organization data
      if (!orgData.name) {
        setError('Please enter organization name');
        return;
      }
    } else if (activeStep === 2) {
      // Validate academies data
      const validAcademies = academies.filter(a => a.name && a.city);
      if (validAcademies.length === 0) {
        setError('Please add at least one academy with name and city');
        return;
      }
    }

    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const addAcademy = () => {
    setAcademies([...academies, { name: '', country: '', city: '', location: '' }]);
  };

  const removeAcademy = (index: number) => {
    setAcademies(academies.filter((_, i) => i !== index));
  };

  const updateAcademy = (index: number, field: 'name' | 'country' | 'city' | 'location', value: string) => {
    const newAcademies = [...academies];
    newAcademies[index][field] = value;
    setAcademies(newAcademies);
  };

  const handleSubmit = async () => {
    try {
      setError('');
      setLoading(true);
      setLoadingMessage('Creating organization...');

      console.log('Starting signup process...');

      // Step 1: Create organization (without user dependency)
      const org = await createOrganizationOnly(
        {
          name: orgData.name,
          imageUrl: '/default-org-logo.png',
          ownerId: 'temp' // We'll update this after user creation
        },
        orgData.imageFile || undefined
      );
      const orgId: string = org.id;
      console.log('Organization created:', orgId);

      // Step 2: Create academies
      setLoadingMessage('Setting up academies...');
      const academyIds = [];
      const validAcademies = academies.filter(a => a.name && a.city);
      
      for (const academy of validAcademies) {
        const academyData = await createAcademy(
          orgId,
          {
            name: academy.name,
            country: academy.country,
            city: academy.city,
            location: academy.location || '',
            imageUrl: '/default-academy-logo.png'
          }
        );
        academyIds.push(academyData.id);
      }
      console.log('Academies created:', academyIds);

      // Step 3: Initialize default role permissions for the organization
      setLoadingMessage('Setting up permissions...');
      await initializeDefaultRolePermissions(orgId);
      console.log('Default permissions initialized');

      // Step 4: Create user account with complete role information
      setLoadingMessage('Creating your account...');
      const userCredential = await signUp(ownerData.email, ownerData.password, ownerData.name);
      const userId = userCredential.user.uid;
      console.log('User account created:', userId);

      // Step 5: Update user with complete data including roles
      await updateUser(userId, {
        phone: ownerData.phone,
        roles: [{
          role: ['owner'],
          organizationId: orgId,
          academyId: []
        }]
      });
      console.log('User roles assigned');

      // Step 6: Update organization with actual owner ID
      await updateDoc(doc(db, 'organizations', orgId), {
        ownerId: userId,
        updatedAt: serverTimestamp()
      });
      console.log('Organization owner updated');

      // Step 7: Refresh AuthContext and collect all data to pass to dashboard
      setLoadingMessage('Preparing dashboard data...');
      
      // Refresh user data
      await refreshUserData();
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get fresh user data
      const currentUserData = await getUserById(userId);
      
      // Load organization and academy data
      setLoadingMessage('Loading organization data...');
      const { getOrganization } = await import('../../services/organizationService');
      const { getAcademiesByOrganization } = await import('../../services/academyService');
      
      const [organizationData, academyData] = await Promise.all([
        getOrganization(orgId),
        getAcademiesByOrganization(orgId)
      ]);
      
      // Prepare navigation state with all the data
      const navigationState = {
        justSignedUp: true,
        userData: currentUserData,
        organization: organizationData,
        academies: academyData,
        organizationId: orgId,
        userId: userId
      };
      
      console.log('✅ Passing complete data to dashboard:', {
        userId,
        organizationId: orgId,
        organizationName: organizationData?.name,
        academiesCount: academyData?.length,
        userRole: currentUserData?.roles[0]?.role
      });

      // Final AuthContext refresh
      setLoadingMessage('Finalizing...');
      await refreshUserData();
      await new Promise(resolve => setTimeout(resolve, 500));

      // Navigate with state containing all the data
      console.log('🚀 Navigating to dashboard with complete data!');
      navigate('/dashboard', { 
        replace: true, 
        state: navigationState 
      });
    } catch (error: any) {
      setError(error.message || 'Failed to complete registration. Please try again.');
      console.error('Registration error:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <div className="text-secondary-500">
                  <PersonIcon />
                </div>
              </div>
              <Input
                placeholder="Full Name"
                required
                value={ownerData.name}
                onChange={(e) => setOwnerData({ ...ownerData, name: e.target.value })}
                className="pl-10"
              />
            </div>
            
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <div className="text-secondary-500">
                  <EmailIcon />
                </div>
              </div>
              <Input
                type="email"
                placeholder="Email Address"
                required
                value={ownerData.email}
                onChange={(e) => setOwnerData({ ...ownerData, email: e.target.value })}
                className="pl-10"
              />
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <div className="text-secondary-500">
                  <PhoneIcon />
                </div>
              </div>
              <Input
                placeholder="Phone Number (Optional)"
                value={ownerData.phone}
                onChange={(e) => setOwnerData({ ...ownerData, phone: e.target.value })}
                className="pl-10"
              />
            </div>
            
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <div className="text-secondary-500">
                  <LockIcon />
                </div>
              </div>
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                required
                value={ownerData.password}
                onChange={(e) => setOwnerData({ ...ownerData, password: e.target.value })}
                className="pl-10 pr-10"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowPassword(!showPassword)}
              >
                <div className="text-secondary-500 hover:text-secondary-700">
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </div>
              </button>
            </div>
            
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <div className="text-secondary-500">
                  <LockIcon />
                </div>
              </div>
              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm Password"
                required
                value={ownerData.confirmPassword}
                onChange={(e) => setOwnerData({ ...ownerData, confirmPassword: e.target.value })}
                className="pl-10 pr-10"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <div className="text-secondary-500 hover:text-secondary-700">
                  {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                </div>
              </button>
            </div>

            {(ownerData.password || ownerData.confirmPassword) && (
              <div className="mt-4 space-y-2">
                {passwordRequirements.map((req, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center ${req.met ? 'bg-green-500 text-white' : 'bg-secondary-200'}`}>
                      {req.met && <CheckIcon />}
                    </div>
                    <span className={`text-sm ${req.met ? 'text-green-600' : 'text-secondary-600'}`}>
                      {req.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <p className="text-secondary-600 text-sm">
              Set up your football organization details
            </p>
            
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <div className="text-secondary-500">
                  <BusinessIcon />
                </div>
              </div>
              <Input
                placeholder="Organization Name (e.g., Elite Football Academy)"
                required
                value={orgData.name}
                onChange={(e) => setOrgData({ ...orgData, name: e.target.value })}
                className="pl-10"
              />
            </div>
            

            {/* Logo Upload Section */}
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-2">
                Organization Logo (Optional)
              </label>
              <div
                className="border-2 border-dashed border-secondary-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary-400 transition-colors"
                onClick={() => document.getElementById('logo-upload')?.click()}
              >
                <input
                  id="logo-upload"
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setOrgData({ ...orgData, imageFile: file });
                    }
                  }}
                />
                
                {orgData.imageFile ? (
                  <div className="space-y-2">
                    <div className="text-primary-600">
                      <UploadIcon />
                    </div>
                    <p className="text-sm font-medium text-primary-600">
                      {orgData.imageFile.name}
                    </p>
                    <p className="text-xs text-secondary-500">
                      Click to change logo
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-secondary-400 mx-auto">
                      <UploadIcon />
                    </div>
                    <p className="text-sm font-medium text-secondary-600">
                      Upload Organization Logo
                    </p>
                    <p className="text-xs text-secondary-500">
                      PNG, JPG, or SVG up to 10MB
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-secondary-600 text-sm">
                Add your football training academies
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addAcademy}
              >
                <PlusIcon />
                <span className="ml-1">Add Academy</span>
              </Button>
            </div>

            <div className="space-y-4">
              {academies.map((academy, index) => (
                <div key={index} className="p-4 border border-secondary-200 rounded-lg bg-secondary-50">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-primary-600 bg-primary-100 px-2 py-1 rounded">
                      Academy {index + 1}
                    </span>
                    {academies.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeAcademy(index)}
                        className="text-error-500 hover:text-error-700"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <Input
                      placeholder="Academy Name (e.g., Manchester Training Center)"
                      required
                      value={academy.name}
                      onChange={(e) => updateAcademy(index, 'name', e.target.value)}
                    />

                    <Select
                      label="Country"
                      value={academy.country}
                      onChange={(e) => {
                        updateAcademy(index, 'country', e.target.value);
                        // Reset city when country changes
                        updateAcademy(index, 'city', '');
                      }}
                      required
                    >
                      <option value="">Select Country</option>
                      {countryOptions.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </Select>

                    <Select
                      label="City"
                      value={academy.city}
                      disabled={!academy.country}
                      onChange={(e) => updateAcademy(index, 'city', e.target.value)}
                      required
                    >
                      <option value="">Select City</option>
                      {academy.country && cityOptions[academy.country] ? 
                        cityOptions[academy.country].map((city) => (
                          <option key={city} value={city}>
                            {city}
                          </option>
                        )) : null
                      }
                    </Select>
                    
                    <Input
                      placeholder="Location (Address - Optional)"
                      value={academy.location}
                      onChange={(e) => updateAcademy(index, 'location', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex overflow-hidden bg-secondary-50">
      {/* Left Panel - Branding */}
      <div className="w-1/2 h-screen bg-gradient-to-br from-primary-800 to-primary-500 flex flex-col justify-center items-center relative overflow-hidden">
        {/* Background pattern */}
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23FFFFFF" fill-opacity="0.1"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'
          }}
        />
        
        <div className="z-10 flex flex-col items-center space-y-8 px-12 text-center max-w-lg">
          {/* Beautiful Logo */}
          <div className="mb-6">
            <AcademyLogo />
          </div>
          
          <div className="space-y-4">
            <h1 className="text-5xl font-bold text-white leading-tight">
              Academy Pro
            </h1>
            <p className="text-xl text-white/90 leading-relaxed">
              Start Your Football Academy Journey Today
            </p>
          </div>
          
          <div className="space-y-6 text-left">
            <div className="flex items-start space-x-4">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Quick Setup Process</h3>
                <p className="text-white/80 text-sm leading-relaxed">
                  Get your academy up and running in minutes with our streamlined 3-step registration process.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-4">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V6h10v3z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Multi-Academy Support</h3>
                <p className="text-white/80 text-sm leading-relaxed">
                  Manage multiple training locations and academies under one organization with centralized control.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-4">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 1z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Professional Tools</h3>
                <p className="text-white/80 text-sm leading-relaxed">
                  Access professional-grade tools for player management, training programs, and performance analytics.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-4">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Trusted Platform</h3>
                <p className="text-white/80 text-sm leading-relaxed">
                  Join thousands of academies worldwide who trust our platform for their daily operations.
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3 mt-8">
            {['30-Day Free Trial', 'No Setup Fees', '24/7 Support', 'Easy Migration'].map((feature) => (
              <span
                key={feature}
                className="px-3 py-1.5 rounded-full bg-white/20 text-white text-xs font-medium backdrop-blur-sm"
              >
                {feature}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Multi-step Form */}
      <div className="w-1/2 h-screen overflow-y-auto flex items-start justify-center px-8 py-8">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl shadow-xl border border-secondary-200 p-8">
            {/* Mobile Logo - hidden on desktop since we have 50/50 split */}
            <div className="flex justify-center mb-8 lg:hidden">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center">
                <div className="text-white">
                  <SoccerIcon />
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-8">
              <h1 className="text-3xl font-bold text-secondary-900">
                Create Your Academy
              </h1>
              <p className="text-secondary-600">
                Complete all steps to set up your organization
              </p>
            </div>

            {/* Progress Steps */}
            <div className="mb-8">
              <div className="flex items-center">
                {steps.map((step, index) => (
                  <React.Fragment key={index}>
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        index <= activeStep 
                          ? 'bg-primary-600 text-white' 
                          : 'bg-secondary-200 text-secondary-500'
                      }`}>
                        {index + 1}
                      </div>
                      <div className={`text-xs mt-2 text-center whitespace-nowrap ${
                        index <= activeStep ? 'text-primary-600' : 'text-secondary-500'
                      }`}>
                        {step}
                      </div>
                    </div>
                    {index < steps.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-4 ${
                        index < activeStep ? 'bg-primary-600' : 'bg-secondary-200'
                      }`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
            
            {error && (
              <Alert variant="error" className="mb-6">
                {error}
              </Alert>
            )}
            
            {/* Step Content */}
            <div className="min-h-80 mb-8">
              {renderStepContent(activeStep)}
            </div>

            {/* Navigation Buttons */}
            {activeStep === 0 ? (
              <div>
                <Button
                  onClick={handleNext}
                  className="w-full"
                  size="lg"
                >
                  Next
                </Button>
              </div>
            ) : (
              <div className="flex justify-between space-x-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                >
                  Back
                </Button>
                
                {activeStep === steps.length - 1 ? (
                  <Button
                    onClick={handleSubmit}
                    disabled={loading}
                    size="lg"
                    className="flex-1"
                  >
                    {loading ? (
                      <div className="flex items-center space-x-2">
                        <LoadingIcon />
                        <span>{loadingMessage}</span>
                      </div>
                    ) : (
                      'Complete Registration'
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={handleNext}
                    className="flex-1"
                  >
                    Next
                  </Button>
                )}
              </div>
            )}

            <div className="mt-8">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-secondary-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-secondary-500">OR</span>
                </div>
              </div>
            </div>
            
            <div className="mt-6 text-center">
              <p className="text-sm text-secondary-600 mb-4">
                Already have an account?
              </p>
              <Link to="/login">
                <Button variant="outline" className="w-full">
                  Sign In Instead
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;