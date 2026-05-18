import { User } from '@privy-io/react-auth';

export const PERMISSIONS = {
  // Chat permissions
  READ_CHAT: 'READ_CHAT',
  WRITE_CHAT: 'WRITE_CHAT',
  DELETE_CHAT: 'DELETE_CHAT',
  
  // User permissions
  UPDATE_PROFILE: 'UPDATE_PROFILE',
  
  // Premium features
  ACCESS_PREMIUM: 'ACCESS_PREMIUM',
  ACCESS_API: 'ACCESS_API',
  
  // Admin permissions
  ADMIN_ACCESS: 'ADMIN_ACCESS',
  MANAGE_USERS: 'MANAGE_USERS',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export interface Role {
  name: string;
  permissions: Permission[];
}

// Define basic roles
export const ROLES = {
  USER: 'user',
  PREMIUM: 'premium',
  ADMIN: 'admin',
} as const;

// Define permissions for each role
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  [ROLES.USER]: [
    PERMISSIONS.READ_CHAT,
    PERMISSIONS.WRITE_CHAT,
    PERMISSIONS.UPDATE_PROFILE,
  ],
  [ROLES.PREMIUM]: [
    PERMISSIONS.READ_CHAT,
    PERMISSIONS.WRITE_CHAT,
    PERMISSIONS.DELETE_CHAT,
    PERMISSIONS.UPDATE_PROFILE,
    PERMISSIONS.ACCESS_PREMIUM,
    PERMISSIONS.ACCESS_API,
  ],
  [ROLES.ADMIN]: Object.values(PERMISSIONS) as Permission[],
};

export function hasPermission(user: User | null, permission: Permission): boolean {
  if (!user) return false;
  
  // Get user role from metadata (you'll need to set this up in your user management system)
  const userRole = (user as unknown as Record<string, string>).role || ROLES.USER;
  
  // Get permissions for the role
  const rolePermissions = ROLE_PERMISSIONS[userRole] || [];
  
  return rolePermissions.includes(permission);
}

export function hasRole(user: User | null, role: string): boolean {
  if (!user) return false;
  return (user as unknown as Record<string, string>).role === role;
}

// Helper to check multiple permissions
export function hasPermissions(user: User | null, permissions: Permission[]): boolean {
  return permissions.every(permission => hasPermission(user, permission));
} 