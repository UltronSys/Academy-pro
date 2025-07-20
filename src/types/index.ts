import { Timestamp } from 'firebase/firestore';

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  roles: UserRole[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserRole {
  organizationId: string;
  academyId: string[]; // Empty array for org-wide roles
  role: string[]; // ["owner", "admin", "coach", "player", "guardian"]
}

export interface Organization {
  id: string;
  name: string;
  imageUrl: string;
  ownerId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Academy {
  id: string;
  name: string;
  country: string;
  city: string;
  location: string;
  imageUrl: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Player {
  id: string;
  userId: string;
  academyId: string[];
  organizationId: string;
  dob: Date;
  gender: string;
  guardianId: string[];
  playerParameters: Record<string, any>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ParameterField {
  name: string;
  type: 'text' | 'number' | 'date' | 'dropdown' | 'select' | 'multiselect' | 'boolean';
  unit?: string;
  maximum?: string;
  defaultValue: any;
  required: boolean;
  order: number;
  description?: string;
  options?: string[]; // For dropdown and select fields
}

export interface SkillField {
  name: string;
  maximum: number;
  defaultValue: number;
  description: string;
  order: number;
}

export interface FieldCategory {
  id: string;
  name: string;
  description?: string;
  order: number;
  type: 'parameter' | 'skill' | 'mixed'; // Type of fields this category contains
  fields: ParameterField[]; // Fields belonging to this category
}

export interface Settings {
  id: string;
  generalSettings: {
    defaultLanguage: string;
    timezone: string;
    currency: string;
  };
  notificationSettings: {
    emailNotifications: boolean;
    smsNotifications: boolean;
  };
  customRoles: string[];
  fieldCategories: FieldCategory[];
  academySpecificSettings: Record<string, {
    fieldCategories: FieldCategory[];
  }>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type RoleType = 'owner' | 'admin' | 'coach' | 'player' | 'guardian';

export type PermissionAction = 'read' | 'write' | 'delete';

export type ResourceType = 'users' | 'players' | 'academies' | 'settings' | 'finance' | 'events' | 'training' | 'reports';

export interface Permission {
  resource: ResourceType;
  actions: PermissionAction[];
}

export interface RolePermission {
  id: string;
  organizationId: string;
  roleName: string;
  permissions: Permission[];
  isBuiltIn: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}