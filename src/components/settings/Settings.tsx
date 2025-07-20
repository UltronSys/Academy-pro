import React, { useState, useEffect } from 'react';
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
import { Settings as SettingsType, ParameterField, FieldCategory, Academy, Organization } from '../../types';
import { getSettingsByOrganization, updateSettings } from '../../services/settingsService';
import { getAcademiesByOrganization, createAcademy, updateAcademy, deleteAcademy } from '../../services/academyService';
import { RolePermissions } from './RolePermissions';
import { usePermissions } from '../../hooks/usePermissions';
import { countryOptions, cityOptions } from '../../constants/locations';
import { getOrganizationById } from '../../services/organizationService';

// Icons
const SaveIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
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

const AddIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const NotificationsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const SecurityIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const BusinessIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

const SportsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 7.172V5L8 4z" />
  </svg>
);

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [settings, setSettings] = useState<Partial<SettingsType>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [academies, setAcademies] = useState<Academy[]>([]);
  
  // Field dialog states
  const [openFieldDialog, setOpenFieldDialog] = useState(false);
  const [fieldDialogMode, setFieldDialogMode] = useState<'add' | 'edit'>('add');
  const [selectedField, setSelectedField] = useState<ParameterField | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [fieldForm, setFieldForm] = useState<Partial<ParameterField>>({});
  
  // Academy dialog states
  const [openAcademyDialog, setOpenAcademyDialog] = useState(false);
  const [academyDialogMode, setAcademyDialogMode] = useState<'add' | 'edit'>('add');
  const [selectedAcademyForEdit, setSelectedAcademyForEdit] = useState<Academy | null>(null);
  const [academyForm, setAcademyForm] = useState<Partial<Academy>>({});
  const [organization, setOrganization] = useState<Organization | null>(null);
  
  // Category dialog states
  const [openCategoryDialog, setOpenCategoryDialog] = useState(false);
  const [categoryDialogMode, setCategoryDialogMode] = useState<'add' | 'edit'>('add');
  const [selectedCategory, setSelectedCategory] = useState<FieldCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState<Partial<FieldCategory>>({});

  const { userData } = useAuth();
  const { selectedOrganization, selectedAcademy } = useApp();
  const { canWrite, canDelete } = usePermissions();

  useEffect(() => {
    loadSettings();
    loadAcademies();
    loadOrganization();
  }, [selectedOrganization, selectedAcademy]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const organizationId = userData?.roles[0]?.organizationId;
      if (organizationId) {
        const loadedSettings = await getSettingsByOrganization(organizationId);
        if (loadedSettings) {
          // Ensure all categories have fields arrays
          const settingsWithFields = {
            ...loadedSettings,
            fieldCategories: (loadedSettings.fieldCategories || []).map(cat => ({
              ...cat,
              fields: Array.isArray(cat.fields) ? cat.fields : []
            }))
          };
          setSettings(settingsWithFields);
        } else {
          // Create default settings structure if none exist
          const defaultSettings: SettingsType = {
            id: organizationId,
            generalSettings: {
              defaultLanguage: 'en',
              timezone: 'UTC',
              currency: 'USD'
            },
            notificationSettings: {
              emailNotifications: true,
              smsNotifications: false
            },
            customRoles: [],
            fieldCategories: [],
            academySpecificSettings: {},
            createdAt: new Date() as any,
            updatedAt: new Date() as any
          };
          setSettings(defaultSettings);
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };
  
  const loadAcademies = async () => {
    try {
      const organizationId = userData?.roles[0]?.organizationId;
      if (organizationId) {
        const loadedAcademies = await getAcademiesByOrganization(organizationId);
        setAcademies(loadedAcademies);
      }
    } catch (error) {
      console.error('Error loading academies:', error);
      setError('Failed to load academies');
    }
  };
  
  const loadOrganization = async () => {
    try {
      const organizationId = userData?.roles[0]?.organizationId;
      if (organizationId) {
        const org = await getOrganizationById(organizationId);
        setOrganization(org);
      }
    } catch (error) {
      console.error('Error loading organization:', error);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setLoading(true);
      setError('');
      
      const organizationId = userData?.roles[0]?.organizationId;
      if (organizationId && settings) {
        const settingsToSave = {
          ...settings,
          fieldCategories: settings.fieldCategories || []
        };
        
        await updateSettings(organizationId, settingsToSave);
        setSuccess('Settings saved successfully!');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (error: any) {
      console.error('Error saving settings:', error);
      setError(`Failed to save settings: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAcademy = async () => {
    try {
      setLoading(true);
      setError('');
      
      const organizationId = userData?.roles[0]?.organizationId;
      if (!organizationId) {
        setError('Organization not found');
        setLoading(false);
        return;
      }

      // Validate required fields
      if (!academyForm.name?.trim()) {
        setError('Academy name is required');
        setLoading(false);
        return;
      }
      if (!academyForm.country?.trim()) {
        setError('Country is required');
        setLoading(false);
        return;
      }
      if (!academyForm.city?.trim()) {
        setError('City is required');
        setLoading(false);
        return;
      }

      console.log('Saving academy:', academyForm);

      if (academyDialogMode === 'add') {
        const academyData = {
          name: academyForm.name!.trim(),
          country: academyForm.country!.trim(),
          city: academyForm.city!.trim(),
          location: academyForm.location?.trim() || '',
          imageUrl: academyForm.imageUrl?.trim() || ''
        };
        
        console.log('Creating new academy with data:', academyData);
        await createAcademy(organizationId, academyData);
        setSuccess('Academy created successfully!');
      } else if (selectedAcademyForEdit) {
        const updateData = {
          name: academyForm.name!.trim(),
          country: academyForm.country!.trim(),
          city: academyForm.city!.trim(),
          location: academyForm.location?.trim() || '',
          imageUrl: academyForm.imageUrl?.trim() || ''
        };
        
        console.log('Updating academy with data:', updateData);
        await updateAcademy(organizationId, selectedAcademyForEdit.id, updateData);
        setSuccess('Academy updated successfully!');
      }
      
      setOpenAcademyDialog(false);
      setAcademyForm({ name: '', country: '', city: '', location: '', imageUrl: '' });
      await loadAcademies();
      setTimeout(() => setSuccess(''), 2000);
    } catch (error: any) {
      console.error('Error saving academy:', error);
      setError(`Failed to save academy: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCategory = async () => {
    try {
      setLoading(true);
      setError('');
      
      const newCategory: FieldCategory = {
        id: categoryDialogMode === 'add' ? Date.now().toString() : selectedCategory?.id || '',
        name: categoryForm.name || '',
        description: categoryForm.description || '',
        order: categoryForm.order || (settings.fieldCategories?.length || 0) + 1,
        type: 'parameter',
        fields: categoryDialogMode === 'edit' ? (selectedCategory?.fields || []) : []
      };

      const updatedCategories = categoryDialogMode === 'add' 
        ? [...(settings.fieldCategories || []), newCategory]
        : (settings.fieldCategories || []).map(cat => 
            cat.id === selectedCategory?.id ? { ...newCategory, fields: cat.fields || [] } : cat
          );

      const updatedSettings = {
        ...settings,
        fieldCategories: updatedCategories
      };
      
      console.log('Settings: Saving category, updatedSettings:', updatedSettings);
      console.log('Settings: Updated field categories:', updatedCategories);
      
      setSettings(updatedSettings);
      
      // Save to Firebase
      const organizationId = userData?.roles[0]?.organizationId;
      if (organizationId) {
        console.log('Settings: Updating settings in Firebase for org:', organizationId);
        await updateSettings(organizationId, updatedSettings);
        console.log('Settings: Settings updated in Firebase, reloading...');
        // Reload settings from Firebase to ensure consistency
        await loadSettings();
        console.log('Settings: Settings reloaded from Firebase');
      }
      
      setOpenCategoryDialog(false);
      setSuccess(`Category ${categoryDialogMode === 'add' ? 'created' : 'updated'} successfully!`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      console.error('Error saving category:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      setError(`Failed to save category: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveField = async () => {
    try {
      setLoading(true);
      setError('');
      
      if (!fieldForm.name || !fieldForm.type) {
        setError('Field name and type are required');
        setLoading(false);
        return;
      }

      if (!settings) {
        setError('Settings not loaded');
        setLoading(false);
        return;
      }
      
      const newField: ParameterField = {
        name: fieldForm.name || '',
        type: fieldForm.type || 'text',
        required: fieldForm.required === true,
        order: fieldForm.order || 1,
        description: fieldForm.description || '',
        unit: fieldForm.unit || '',
        maximum: fieldForm.maximum || '',
        defaultValue: fieldForm.defaultValue || '',
        options: fieldForm.options || []
      };

      const updatedCategories = (settings.fieldCategories || []).map(category => {
        if (category.id === selectedCategoryId) {
          // Ensure fields array exists
          const currentFields = Array.isArray(category.fields) ? category.fields : [];
          
          const updatedFields = fieldDialogMode === 'add'
            ? [...currentFields, newField]
            : currentFields.map(field =>
                field.name === selectedField?.name ? newField : field
              );
          
          return {
            ...category,
            fields: updatedFields
          };
        }
        return category;
      });

      const updatedSettings = {
        ...settings,
        fieldCategories: updatedCategories
      };
      
      // Force a complete new object to ensure React detects the change
      setSettings({
        ...updatedSettings,
        // Add a timestamp to force re-render
        lastUpdated: Date.now()
      } as any);
      
      // Save to Firebase
      const organizationId = userData?.roles[0]?.organizationId;
      if (organizationId) {
        try {
          await updateSettings(organizationId, updatedSettings);
          // Reload settings from Firebase to ensure consistency
          await loadSettings();
          setSuccess(`Field ${fieldDialogMode === 'add' ? 'created' : 'updated'} successfully!`);
          setTimeout(() => setSuccess(''), 3000);
        } catch (saveError: any) {
          console.error('Error saving to Firebase:', saveError);
          setError(`Failed to save field: ${saveError.message || 'Unknown error'}`);
          // Don't return here, still close the dialog since local state is updated
        }
      }
      
      // Always close the dialog and reset form
      setOpenFieldDialog(false);
      setFieldForm({});
      setSelectedField(null);
    } catch (error: any) {
      console.error('Error saving field:', error);
      setError(`Failed to save field: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      const updatedCategories = (settings.fieldCategories || []).filter(cat => cat.id !== categoryId);
      const updatedSettings = {
        ...settings,
        fieldCategories: updatedCategories
      };
      
      setSettings(updatedSettings);
      
      // Save to Firebase
      const organizationId = userData?.roles[0]?.organizationId;
      if (organizationId) {
        await updateSettings(organizationId, updatedSettings);
      }
      
      setSuccess('Category deleted successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      console.error('Error deleting category:', error);
      setError('Failed to delete category');
    }
  };

  const handleDeleteField = async (categoryId: string, fieldName: string) => {
    try {
      const updatedCategories = (settings.fieldCategories || []).map(category => {
        if (category.id === categoryId) {
          return {
            ...category,
            fields: (category.fields || []).filter(field => field.name !== fieldName)
          };
        }
        return category;
      });

      const updatedSettings = {
        ...settings,
        fieldCategories: updatedCategories
      };
      
      setSettings(updatedSettings);
      
      // Save to Firebase
      const organizationId = userData?.roles[0]?.organizationId;
      if (organizationId) {
        await updateSettings(organizationId, updatedSettings);
      }
      
      setSuccess('Field deleted successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      console.error('Error deleting field:', error);
      setError('Failed to delete field');
    }
  };

  const tabs = [
    { id: 0, name: 'General', icon: <SettingsIcon /> },
    { id: 1, name: 'Notifications', icon: <NotificationsIcon /> },
    { id: 2, name: 'Roles & Permissions', icon: <SecurityIcon /> },
    { id: 3, name: 'Academies', icon: <BusinessIcon /> },
    { id: 4, name: 'Player Parameters', icon: <SportsIcon /> },
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-h-screen overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-secondary-900">Settings</h1>
          <p className="text-secondary-600 mt-1 font-normal text-sm sm:text-base">Configure your organization settings</p>
        </div>
      </div>

      {/* Error and Success Alerts */}
      {error && (
        <Alert variant="error">
          {error}
        </Alert>
      )}

      {success && (
        <Alert variant="success">
          {success}
        </Alert>
      )}

      {/* Tabs */}
      <Card>
        <div className="border-b border-secondary-200">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-semibold text-sm whitespace-nowrap transition-colors duration-200 ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {tab.icon}
                  {tab.name}
                </div>
              </button>
            ))}
          </nav>
        </div>

        <CardBody className="p-8">
          {/* General Settings */}
          {activeTab === 0 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-secondary-900 mb-2">General Settings</h3>
                <p className="text-secondary-600 font-normal">Configure basic settings for your organization.</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Select
                  label="Default Language"
                  value={settings.generalSettings?.defaultLanguage || 'en'}
                  disabled={!canWrite('settings')}
                  onChange={async (e) => {
                    const currentGeneralSettings = {
                      defaultLanguage: 'en',
                      timezone: 'UTC',
                      currency: 'USD',
                      ...settings.generalSettings
                    };
                    const updatedSettings = {
                      ...settings,
                      generalSettings: {
                        ...currentGeneralSettings,
                        defaultLanguage: e.target.value
                      }
                    };
                    setSettings(updatedSettings);
                    
                    // Auto-save to Firebase
                    try {
                      const organizationId = userData?.roles[0]?.organizationId;
                      if (organizationId) {
                        await updateSettings(organizationId, updatedSettings);
                        setSuccess('Settings saved automatically!');
                        setTimeout(() => setSuccess(''), 2000);
                      }
                    } catch (error: any) {
                      setError(`Failed to save settings: ${error.message || 'Unknown error'}`);
                    }
                  }}
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                </Select>
                
                <Select
                  label="Timezone"
                  value={settings.generalSettings?.timezone || 'UTC'}
                  disabled={!canWrite('settings')}
                  onChange={async (e) => {
                    const currentGeneralSettings = {
                      defaultLanguage: 'en',
                      timezone: 'UTC',
                      currency: 'USD',
                      ...settings.generalSettings
                    };
                    const updatedSettings = {
                      ...settings,
                      generalSettings: {
                        ...currentGeneralSettings,
                        timezone: e.target.value
                      }
                    };
                    setSettings(updatedSettings);
                    
                    // Auto-save to Firebase
                    try {
                      const organizationId = userData?.roles[0]?.organizationId;
                      if (organizationId) {
                        await updateSettings(organizationId, updatedSettings);
                        setSuccess('Settings saved automatically!');
                        setTimeout(() => setSuccess(''), 2000);
                      }
                    } catch (error: any) {
                      setError(`Failed to save settings: ${error.message || 'Unknown error'}`);
                    }
                  }}
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                </Select>
                
                <Select
                  label="Currency"
                  value={settings.generalSettings?.currency || 'USD'}
                  disabled={!canWrite('settings')}
                  onChange={async (e) => {
                    const currentGeneralSettings = {
                      defaultLanguage: 'en',
                      timezone: 'UTC',
                      currency: 'USD',
                      ...settings.generalSettings
                    };
                    const updatedSettings = {
                      ...settings,
                      generalSettings: {
                        ...currentGeneralSettings,
                        currency: e.target.value
                      }
                    };
                    setSettings(updatedSettings);
                    
                    // Auto-save to Firebase
                    try {
                      const organizationId = userData?.roles[0]?.organizationId;
                      if (organizationId) {
                        await updateSettings(organizationId, updatedSettings);
                        setSuccess('Settings saved automatically!');
                        setTimeout(() => setSuccess(''), 2000);
                      }
                    } catch (error: any) {
                      setError(`Failed to save settings: ${error.message || 'Unknown error'}`);
                    }
                  }}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CAD">CAD (C$)</option>
                </Select>
              </div>
            </div>
          )}

          {/* Notifications */}
          {activeTab === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-secondary-900 mb-2">Notification Settings</h3>
                <p className="text-secondary-600 font-normal">Control how and when you receive notifications.</p>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-secondary-50 rounded-lg">
                  <div>
                    <h4 className="font-semibold text-secondary-900">Email Notifications</h4>
                    <p className="text-sm text-secondary-600 font-normal">Receive notifications via email for important updates.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.notificationSettings?.emailNotifications || false}
                      disabled={!canWrite('settings')}
                      onChange={async (e) => {
                        const currentNotificationSettings = {
                          emailNotifications: false,
                          smsNotifications: false,
                          ...settings.notificationSettings
                        };
                        const updatedSettings = {
                          ...settings,
                          notificationSettings: {
                            ...currentNotificationSettings,
                            emailNotifications: e.target.checked
                          }
                        };
                        setSettings(updatedSettings);
                        
                        // Auto-save to Firebase
                        try {
                          const organizationId = userData?.roles[0]?.organizationId;
                          if (organizationId) {
                            await updateSettings(organizationId, updatedSettings);
                            setSuccess('Settings saved automatically!');
                            setTimeout(() => setSuccess(''), 2000);
                          }
                        } catch (error: any) {
                          setError(`Failed to save settings: ${error.message || 'Unknown error'}`);
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-secondary-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-secondary-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                  </label>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-secondary-50 rounded-lg">
                  <div>
                    <h4 className="font-semibold text-secondary-900">SMS Notifications</h4>
                    <p className="text-sm text-secondary-600 font-normal">Receive urgent notifications via SMS.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.notificationSettings?.smsNotifications || false}
                      disabled={!canWrite('settings')}
                      onChange={async (e) => {
                        const currentNotificationSettings = {
                          emailNotifications: false,
                          smsNotifications: false,
                          ...settings.notificationSettings
                        };
                        const updatedSettings = {
                          ...settings,
                          notificationSettings: {
                            ...currentNotificationSettings,
                            smsNotifications: e.target.checked
                          }
                        };
                        setSettings(updatedSettings);
                        
                        // Auto-save to Firebase
                        try {
                          const organizationId = userData?.roles[0]?.organizationId;
                          if (organizationId) {
                            await updateSettings(organizationId, updatedSettings);
                            setSuccess('Settings saved automatically!');
                            setTimeout(() => setSuccess(''), 2000);
                          }
                        } catch (error: any) {
                          setError(`Failed to save settings: ${error.message || 'Unknown error'}`);
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-secondary-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-secondary-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Roles & Permissions */}
          {activeTab === 2 && (
            <RolePermissions />
          )}

          {/* Academies */}
          {activeTab === 3 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-secondary-900">Academy Management</h3>
                  <p className="text-secondary-600 font-normal">Manage academies within your organization.</p>
                </div>
                {canWrite('academies') && (
                  <Button
                    onClick={() => {
                      setSelectedAcademyForEdit(null);
                      setAcademyDialogMode('add');
                      setAcademyForm({ name: '', country: '', city: '', location: '', imageUrl: '' });
                      setOpenAcademyDialog(true);
                    }}
                    icon={<AddIcon />}
                  >
                    Add Academy
                  </Button>
                )}
              </div>
              
              <div className="space-y-4">
                {academies.map((academy) => (
                  <Card key={academy.id}>
                    <CardBody>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold text-secondary-900">{academy.name}</h4>
                            {academy.country && (
                              <Badge variant="primary" size="sm">{academy.country}</Badge>
                            )}
                            <Badge variant="secondary" size="sm">{academy.city}</Badge>
                            {academy.location && (
                              <Badge variant="secondary" size="sm">{academy.location}</Badge>
                            )}
                          </div>
                          <p className="text-sm text-secondary-600 font-normal">
                            Created: {academy.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {canWrite('academies') && (
                            <button
                              onClick={() => {
                                setSelectedAcademyForEdit(academy);
                                setAcademyDialogMode('edit');
                                setAcademyForm({
                                  name: academy.name,
                                  country: academy.country || '',
                                  city: academy.city,
                                  location: academy.location,
                                  imageUrl: academy.imageUrl
                                });
                                setOpenAcademyDialog(true);
                              }}
                              className="p-2 text-secondary-400 hover:text-primary-600 transition-colors"
                            >
                              <EditIcon />
                            </button>
                          )}
                          {canDelete('academies') && (
                            <button
                              onClick={async () => {
                                if (window.confirm(`Are you sure you want to delete ${academy.name}?`)) {
                                  try {
                                    const organizationId = userData?.roles[0]?.organizationId;
                                    if (!organizationId) return;
                                    await deleteAcademy(organizationId, academy.id);
                                    await loadAcademies();
                                    setSuccess('Academy deleted successfully!');
                                    setTimeout(() => setSuccess(''), 3000);
                                  } catch (error) {
                                    console.error('Error deleting academy:', error);
                                    setError('Failed to delete academy');
                                  }
                                }
                              }}
                              className="p-2 text-secondary-400 hover:text-error-600 transition-colors"
                            >
                              <DeleteIcon />
                            </button>
                          )}
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                ))}
                
                {academies.length === 0 && (
                  <Card>
                    <CardBody className="text-center py-8">
                      <p className="text-secondary-600 font-normal mb-2">No academies found</p>
                      <p className="text-sm text-secondary-500 font-normal">Create your first academy to get started</p>
                    </CardBody>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* Field Categories */}
          {activeTab === 4 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-secondary-900">Player Parameters</h3>
                  <p className="text-secondary-600 font-normal">Create categories for player information. DOB and Gender are always required.</p>
                </div>
                {canWrite('settings') && (
                  <Button
                    onClick={() => {
                      setSelectedCategory(null);
                      setCategoryDialogMode('add');
                      setCategoryForm({
                        name: '',
                        description: '',
                        order: (settings.fieldCategories?.length || 0) + 1,
                        type: 'parameter',
                        fields: []
                      });
                      setOpenCategoryDialog(true);
                    }}
                    icon={<AddIcon />}
                  >
                    Add Category
                  </Button>
                )}
              </div>
              
              <Alert variant="info">
                <strong>Required Fields:</strong> Date of Birth and Gender are automatically required for all players.
              </Alert>
              
              <div className="space-y-4">
                {settings.fieldCategories?.sort((a, b) => a.order - b.order).map((category) => (
                  <Card key={category.id}>
                    <CardBody>
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <h4 className="text-lg font-semibold text-secondary-900">{category.name}</h4>
                          <Badge variant="primary" size="sm">
                            {(category.fields || []).length} fields
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          {canWrite('settings') && (
                            <button
                              onClick={() => {
                                setSelectedCategory(category);
                                setCategoryDialogMode('edit');
                                setCategoryForm(category);
                                setOpenCategoryDialog(true);
                              }}
                              className="p-2 text-secondary-400 hover:text-primary-600 transition-colors"
                            >
                              <EditIcon />
                            </button>
                          )}
                          {canDelete('settings') && (
                            <button
                              onClick={() => {
                                if (window.confirm('Are you sure you want to delete this category? All fields within it will also be deleted.')) {
                                  handleDeleteCategory(category.id);
                                }
                              }}
                              className="p-2 text-secondary-400 hover:text-error-600 transition-colors"
                            >
                              <DeleteIcon />
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <p className="text-secondary-600 font-normal mb-4">
                        {category.description || 'No description'}
                      </p>
                      
                      <div className="flex justify-between items-center mb-4">
                        <h5 className="font-semibold text-secondary-900">Custom Fields</h5>
                        {canWrite('settings') ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              console.log('Add Field clicked for category:', category.id);
                              setSelectedField(null);
                              setSelectedCategoryId(category.id);
                              setFieldDialogMode('add');
                              setFieldForm({
                                name: '',
                                type: 'text',
                                defaultValue: '',
                                required: false,
                                order: (category.fields?.length || 0) + 1,
                                description: '',
                                unit: '',
                                maximum: '',
                                options: []
                              });
                              setOpenFieldDialog(true);
                            }}
                            icon={<AddIcon />}
                          >
                            Add Field
                          </Button>
                        ) : (
                          <span className="text-sm text-secondary-500">No write permissions</span>
                        )}
                      </div>
                      
                      {category.fields && category.fields.length > 0 ? (
                        <div className="space-y-3">
                          {category.fields.sort((a, b) => a.order - b.order).map((field) => (
                            <div key={field.name} className="border border-secondary-200 rounded-lg p-4">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <h6 className="font-semibold text-secondary-900">{field.name}</h6>
                                    <Badge variant="secondary" size="sm">{field.type}</Badge>
                                    {field.required && (
                                      <Badge variant="error" size="sm">Required</Badge>
                                    )}
                                  </div>
                                  {field.description && (
                                    <p className="text-sm text-secondary-600 font-normal">{field.description}</p>
                                  )}
                                  {field.unit && (
                                    <p className="text-xs text-secondary-500 font-normal">Unit: {field.unit}</p>
                                  )}
                                  {field.maximum && (
                                    <p className="text-xs text-secondary-500 font-normal">Maximum: {field.maximum}</p>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  {canWrite('settings') && (
                                    <button
                                      onClick={() => {
                                        setSelectedField(field);
                                        setSelectedCategoryId(category.id);
                                        setFieldDialogMode('edit');
                                        setFieldForm(field);
                                        setOpenFieldDialog(true);
                                      }}
                                      className="p-1 text-secondary-400 hover:text-primary-600 transition-colors"
                                    >
                                      <EditIcon />
                                    </button>
                                  )}
                                  {canDelete('settings') && (
                                    <button
                                      onClick={() => {
                                        if (window.confirm('Are you sure you want to delete this field?')) {
                                          handleDeleteField(category.id, field.name);
                                        }
                                      }}
                                      className="p-1 text-secondary-400 hover:text-error-600 transition-colors"
                                    >
                                      <DeleteIcon />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-secondary-600 font-normal">
                          No custom fields added yet. Click "Add Field" to create your first field.
                        </div>
                      )}
                    </CardBody>
                  </Card>
                ))}
                
                {(!settings.fieldCategories || settings.fieldCategories.length === 0) && (
                  <Card>
                    <CardBody className="text-center py-8">
                      <p className="text-secondary-600 font-normal mb-2">No categories created yet</p>
                      <p className="text-sm text-secondary-500 font-normal">Create your first category to organize player information</p>
                    </CardBody>
                  </Card>
                )}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Add Academy Modal */}
      {openAcademyDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-secondary-200">
            {/* Modal Header */}
            <div className="bg-white border-b border-secondary-200 p-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                    <BusinessIcon />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-secondary-900">
                      {academyDialogMode === 'add' ? 'Add New Academy' : 'Edit Academy'}
                    </h3>
                    <p className="text-secondary-600 text-sm font-normal">
                      {academyDialogMode === 'add' ? 'Create a new academy' : 'Update academy information'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOpenAcademyDialog(false)}
                  className="text-secondary-400 hover:text-secondary-600 transition-colors duration-200 p-2 hover:bg-secondary-100 rounded-lg"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <Input
                label="Academy Name"
                value={academyForm.name || ''}
                onChange={(e) => setAcademyForm({ ...academyForm, name: e.target.value })}
                required
                placeholder="Enter academy name"
              />
              
              <Select
                label="Country"
                value={academyForm.country || ''}
                onChange={(e) => {
                  setAcademyForm({ 
                    ...academyForm, 
                    country: e.target.value,
                    city: '' // Reset city when country changes
                  });
                }}
                required
              >
                <option value="">Select a country</option>
                {countryOptions.map((country) => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </Select>
              
              <Select
                label="City"
                value={academyForm.city || ''}
                onChange={(e) => setAcademyForm({ ...academyForm, city: e.target.value })}
                required
                disabled={!academyForm.country}
              >
                <option value="">Select a city</option>
                {academyForm.country && 
                 cityOptions[academyForm.country]?.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </Select>
              
              <Input
                label="Location (Address)"
                value={academyForm.location || ''}
                onChange={(e) => setAcademyForm({ ...academyForm, location: e.target.value })}
                placeholder="Enter detailed address/location"
              />
              
              <Input
                label="Image URL (optional)"
                value={academyForm.imageUrl || ''}
                onChange={(e) => setAcademyForm({ ...academyForm, imageUrl: e.target.value })}
                placeholder="Enter image URL"
              />
            </div>
            
            {/* Modal Footer */}
            <div className="bg-secondary-50 p-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setOpenAcademyDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveAcademy}
                loading={loading}
                disabled={!academyForm.name || !academyForm.country || !academyForm.city}
                className="bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800"
              >
                {academyDialogMode === 'add' ? 'Create Academy' : 'Update Academy'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {openCategoryDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-secondary-200">
            {/* Modal Header */}
            <div className="bg-white border-b border-secondary-200 p-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                    <SportsIcon />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-secondary-900">
                      {categoryDialogMode === 'add' ? 'Add New Category' : 'Edit Category'}
                    </h3>
                    <p className="text-secondary-600 text-sm font-normal">
                      {categoryDialogMode === 'add' ? 'Create a new field category' : 'Update category information'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOpenCategoryDialog(false)}
                  className="text-secondary-400 hover:text-secondary-600 transition-colors duration-200 p-2 hover:bg-secondary-100 rounded-lg"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <Input
                label="Category Name"
                value={categoryForm.name || ''}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                required
                placeholder="Enter category name"
              />
              
              <Input
                label="Description"
                value={categoryForm.description || ''}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                placeholder="Enter category description"
              />
            </div>
            
            {/* Modal Footer */}
            <div className="bg-secondary-50 p-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setOpenCategoryDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveCategory}
                loading={loading}
                disabled={!categoryForm.name}
                className="bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800"
              >
                {categoryDialogMode === 'add' ? 'Create Category' : 'Update Category'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Field Modal */}
      {openFieldDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-secondary-200">
            {/* Modal Header */}
            <div className="bg-white border-b border-secondary-200 p-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                    <AddIcon />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-secondary-900">
                      {fieldDialogMode === 'add' ? 'Add New Field' : 'Edit Field'}
                    </h3>
                    <p className="text-secondary-600 text-sm font-normal">
                      {fieldDialogMode === 'add' ? 'Create a new custom field' : 'Update field information'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOpenFieldDialog(false)}
                  className="text-secondary-400 hover:text-secondary-600 transition-colors duration-200 p-2 hover:bg-secondary-100 rounded-lg"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <Input
                label="Field Name"
                value={fieldForm.name || ''}
                onChange={(e) => setFieldForm({ ...fieldForm, name: e.target.value })}
                required
                placeholder="Enter field name"
              />
              
              <Select
                label="Field Type"
                value={fieldForm.type || 'text'}
                onChange={(e) => setFieldForm({ ...fieldForm, type: e.target.value as any })}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="select">Select</option>
                <option value="multiselect">Multi-Select</option>
                <option value="date">Date</option>
                <option value="boolean">Yes/No</option>
              </Select>
              
              <Input
                label="Description"
                value={fieldForm.description || ''}
                onChange={(e) => setFieldForm({ ...fieldForm, description: e.target.value })}
                placeholder="Enter field description"
              />
              
              <Input
                label="Unit (optional)"
                value={fieldForm.unit || ''}
                onChange={(e) => setFieldForm({ ...fieldForm, unit: e.target.value })}
                placeholder="e.g., kg, cm, years"
              />
              
              <Input
                label="Maximum Number (optional)"
                value={fieldForm.maximum || ''}
                onChange={(e) => setFieldForm({ ...fieldForm, maximum: e.target.value })}
                placeholder="Enter maximum value for numbers"
                type="number"
              />
              
              <Input
                label="Default Value (optional)"
                value={fieldForm.defaultValue || ''}
                onChange={(e) => setFieldForm({ ...fieldForm, defaultValue: e.target.value })}
                placeholder="Enter default value"
              />
              
              <div className="flex items-center gap-3 p-4 bg-secondary-50 rounded-lg">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fieldForm.required || false}
                    onChange={(e) => setFieldForm({ ...fieldForm, required: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-secondary-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-secondary-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
                <div>
                  <p className="font-semibold text-secondary-900">Required Field</p>
                  <p className="text-sm text-secondary-600 font-normal">Make this field mandatory for all players</p>
                </div>
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="bg-secondary-50 p-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setOpenFieldDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveField}
                loading={loading}
                disabled={!fieldForm.name || !fieldForm.type}
                className="bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800"
              >
                {fieldDialogMode === 'add' ? 'Create Field' : 'Update Field'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;