// Shared TypeScript types for Helios Client Portal

// Re-export media asset types
export * from './media-assets.js';

// Re-export user lifecycle types
export * from './user-lifecycle.js';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  organizationId: string;
  department?: string;
  isActive: boolean;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  USER = 'user'
}

export interface Organization {
  id: string;
  name: string;
  domain: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  isSetupComplete: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Module {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon?: string;
  version: string;
  isAvailable: boolean;
  configSchema?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationModule {
  id: string;
  organizationId: string;
  moduleId: string;
  isEnabled: boolean;
  isConfigured: boolean;
  config?: Record<string, any>;
  lastSyncAt?: Date;
  syncStatus?: string;
  syncError?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationSettings {
  id: string;
  organizationId: string;
  key: string;
  value: string;
  isSensitive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLog {
  id: string;
  userId: string;
  organizationId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
}

// Google Workspace Module Types
export interface GoogleWorkspaceConfig {
  organizationId: string;
  serviceAccountKey: string; // encrypted JSON key
  adminEmail: string;
  domain: string;
  scopes?: string[];
  isValid: boolean;
  lastValidatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse extends ApiResponse<{
  user: User;
  tokens: AuthTokens;
  organization?: Organization;
}> {}

// Organization setup types
export interface OrganizationSetupRequest {
  organizationName: string;
  organizationDomain: string;
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName: string;
  logo?: string;
  primaryColor?: string;
}

// Module configuration types
export interface ModuleConfigRequest {
  moduleId: string;
  config: Record<string, any>;
}

// Context types for React
export interface OrganizationContextType {
  organization?: Organization;
  isSetupComplete: boolean;
  isLoading: boolean;
  error?: string;
  refreshOrganization: () => Promise<void>;
}

export interface AuthContextType {
  user?: User;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  isLoading: boolean;
  error?: string;
}

// Dashboard types
export interface DashboardStats {
  totalUsers: number;
  adminUsers: number;
  enabledModules: number;
  syncedGoogleUsers: number;
  lastSync?: Date;
}

// Google Workspace synced data types
export interface GoogleUser {
  id: string;
  organizationId: string;
  googleId: string;
  email: string;
  givenName?: string;
  familyName?: string;
  fullName?: string;
  isAdmin: boolean;
  isSuspended: boolean;
  orgUnitPath?: string;
  department?: string;
  jobTitle?: string;
  lastLoginTime?: Date;
  creationTime?: Date;
  rawData?: Record<string, any>;
  lastSyncAt: Date;
}

export interface GoogleGroup {
  id: string;
  organizationId: string;
  googleId: string;
  email: string;
  name?: string;
  description?: string;
  memberCount: number;
  rawData?: Record<string, any>;
  lastSyncAt: Date;
}

export interface GoogleOrgUnit {
  id: string;
  organizationId: string;
  googleId: string;
  name: string;
  path: string;
  parentId?: string;
  description?: string;
  rawData?: Record<string, any>;
  lastSyncAt: Date;
}