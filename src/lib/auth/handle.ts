/**
 * Handle Generation Utility
 * Generates unique, URL-safe user handles with collision handling
 */

import 'server-only'
import { supabase } from '@/lib/db/client'

interface PrivyUserInput {
  preferred_username?: string
  email?: { address: string }
  wallet?: { address: string }
}

/**
 * Generates a base handle from user info
 * Priority: preferred_username > email username > random
 */
function generateBaseHandle(privyUser: PrivyUserInput): string {
  // Try preferred username first
  if (privyUser.preferred_username) {
    return sanitizeHandle(privyUser.preferred_username);
  }

  // Try email username
  if (privyUser.email?.address) {
    const emailUsername = privyUser.email.address.split('@')[0];
    return sanitizeHandle(emailUsername);
  }

  // Try wallet address (first 8 chars)
  if (privyUser.wallet?.address) {
    return `user_${privyUser.wallet.address.slice(2, 10).toLowerCase()}`;
  }
  
  // Fallback to random
  return `user_${generateRandomSuffix()}`;
}

/**
 * Sanitizes a string into a valid handle
 * Rules: lowercase, alphanumeric + underscore, 3-32 chars
 */
function sanitizeHandle(input: string): string {
  let handle = input
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')  // Replace invalid chars with underscore
    .replace(/_+/g, '_')           // Collapse multiple underscores
    .replace(/^_|_$/g, '');        // Trim underscores from edges
  
  // Ensure minimum length
  if (handle.length < 3) {
    handle = `user_${handle}_${generateRandomSuffix()}`;
  }
  
  // Enforce maximum length
  if (handle.length > 32) {
    handle = handle.slice(0, 32);
  }
  
  return handle;
}

/**
 * Generates a random 4-character suffix for collision handling
 */
function generateRandomSuffix(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return suffix;
}

/**
 * Checks if a handle exists in the database
 */
async function handleExists(handle: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('handle', handle)
    .single();
  
  return !!data && !error;
}

/**
 * Generates a unique handle with collision handling
 * Tries base handle, then appends random suffixes until unique
 */
export async function generateUniqueHandle(privyUser: PrivyUserInput): Promise<string> {
  const baseHandle = generateBaseHandle(privyUser);
  
  // Try base handle first
  if (!(await handleExists(baseHandle))) {
    return baseHandle;
  }
  
  // Collision: Try with random suffixes (max 5 attempts)
  for (let i = 0; i < 5; i++) {
    const suffix = generateRandomSuffix();
    const candidate = `${baseHandle.slice(0, 28)}_${suffix}`;
    
    if (!(await handleExists(candidate))) {
      return candidate;
    }
  }
  
  // Ultimate fallback: timestamp-based
  const timestamp = Date.now().toString(36).slice(-6);
  return `${baseHandle.slice(0, 26)}_${timestamp}`;
}

/**
 * Validates a handle format (for user-chosen handles)
 */
export function validateHandle(handle: string): { valid: boolean; error?: string } {
  if (!handle) {
    return { valid: false, error: 'Handle is required' };
  }
  
  if (handle.length < 3 || handle.length > 32) {
    return { valid: false, error: 'Handle must be 3-32 characters' };
  }
  
  if (!/^[a-z0-9_]+$/.test(handle)) {
    return { valid: false, error: 'Handle can only contain lowercase letters, numbers, and underscores' };
  }
  
  if (handle.startsWith('_') || handle.endsWith('_')) {
    return { valid: false, error: 'Handle cannot start or end with underscore' };
  }
  
  return { valid: true };
}
