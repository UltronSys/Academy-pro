import { 
  doc, 
  getDoc, 
  setDoc, 
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Settings } from '../types';

const COLLECTION_NAME = 'settings';

export const getSettingsByOrganization = async (organizationId: string): Promise<Settings | null> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, organizationId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as Settings;
      // Ensure fieldCategories have proper structure
      if (data.fieldCategories) {
        data.fieldCategories = data.fieldCategories.map(category => ({
          ...category,
          fields: Array.isArray(category.fields) ? category.fields : []
        }));

        // Debug: Log loaded field categories with their default values
        console.log('📥 Loaded settings - field categories with defaults:',
          data.fieldCategories.map(cat => ({
            category: cat.name,
            fields: cat.fields?.map(f => ({
              name: f.name,
              defaultValue: f.defaultValue,
              type: f.type
            }))
          }))
        );
      }
      return data;
    }
    
    // Return default settings if none exist
    return createDefaultSettings(organizationId);
  } catch (error) {
    console.error('Error getting settings:', error);
    throw error;
  }
};

export const createDefaultSettings = async (organizationId: string): Promise<Settings> => {
  const defaultSettings: Settings = {
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
    paymentMethods: ['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer'],
    customRoles: [],
    playerStatusOptions: ['Active', 'Inactive', 'Suspended'],
    fieldCategories: [],
    academySpecificSettings: {},
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  };

  try {
    const docRef = doc(db, COLLECTION_NAME, organizationId);
    await setDoc(docRef, defaultSettings);
    return defaultSettings;
  } catch (error) {
    console.error('Error creating default settings:', error);
    throw error;
  }
};

export const updateSettings = async (organizationId: string, updates: Partial<Settings>): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, organizationId);
    
    // Clean up undefined values and ensure proper data structure
    const cleanField = (field: any) => {
      // Properly handle defaultValue - don't use || which converts false/0 to ''
      let defaultValue = '';
      if (field.defaultValue !== undefined && field.defaultValue !== null) {
        defaultValue = field.defaultValue;
      }

      const cleaned = {
        name: field.name || '',
        type: field.type || 'text',
        required: field.required === true,
        order: field.order || 0,
        description: field.description || '',
        ...(field.unit && { unit: field.unit }),
        ...(field.maximum !== undefined && field.maximum !== null && field.maximum !== '' && { maximum: field.maximum }),
        defaultValue: defaultValue,
        options: Array.isArray(field.options) ? field.options : []
      };

      // Log what's being saved
      console.log('💾 Saving field:', field.name, {
        defaultValue: cleaned.defaultValue,
        defaultValueType: typeof cleaned.defaultValue,
        maximum: cleaned.maximum
      });

      return cleaned;
    };
    
    // Ensure field categories are properly serialized with fields arrays
    const dataToSave = {
      ...updates,
      fieldCategories: (updates.fieldCategories || []).map(category => ({
        id: category.id,
        name: category.name || '',
        description: category.description || '',
        order: category.order || 0,
        type: category.type || 'parameter',
        fields: Array.isArray(category.fields) 
          ? category.fields.map(cleanField)
          : []
      })),
      updatedAt: Timestamp.now()
    };
    
    // Remove any keys with undefined values
    Object.keys(dataToSave).forEach(key => {
      if (dataToSave[key as keyof typeof dataToSave] === undefined) {
        delete dataToSave[key as keyof typeof dataToSave];
      }
    });
    
    // Use setDoc with merge option to create document if it doesn't exist
    await setDoc(docRef, dataToSave, { merge: true });
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
};

export const getFieldCategoriesForAcademy = (settings: Settings, academyId: string) => {
  // Check if academy has specific field categories
  const academySettings = settings.academySpecificSettings[academyId];
  if (academySettings && academySettings.fieldCategories) {
    return academySettings.fieldCategories;
  }
  
  // Return organization-wide categories as fallback
  return settings.fieldCategories;
};