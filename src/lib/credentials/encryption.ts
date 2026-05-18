/**
 * Credential Encryption/Decryption
 * Uses AES-256-GCM for secure credential storage
 */

import crypto from 'crypto';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * Get encryption key from environment
 */
function getEncryptionKey(): string {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY environment variable is not set');
  }
  
  if (key.length < 32) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must be at least 32 characters long');
  }
  
  return key;
}

/**
 * Derive encryption key from master key using PBKDF2
 */
function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    masterKey,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    'sha512'
  );
}

/**
 * Encrypt credential data
 */
export function encryptCredential(data: unknown): string {
  try {
    const masterKey = getEncryptionKey();
    
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Derive encryption key
    const key = deriveKey(masterKey, salt);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt data
    const jsonData = JSON.stringify(data);
    let encrypted = cipher.update(jsonData, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get authentication tag
    const tag = cipher.getAuthTag();
    
    // Combine salt + iv + tag + encrypted data
    const combined = Buffer.concat([
      salt,
      iv,
      tag,
      Buffer.from(encrypted, 'hex')
    ]);
    
    // Return as base64
    return combined.toString('base64');
  } catch (error) {
    console.error('[encryption] Error encrypting credential:', error);
    throw new Error('Failed to encrypt credential data');
  }
}

/**
 * Decrypt credential data
 */
export function decryptCredential(encryptedData: string): unknown {
  try {
    const masterKey = getEncryptionKey();
    
    // Decode from base64
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + TAG_LENGTH
    );
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    // Derive encryption key
    const key = deriveKey(masterKey, salt);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt data
    let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    // Parse JSON
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('[encryption] Error decrypting credential:', error);
    throw new Error('Failed to decrypt credential data');
  }
}

/**
 * Check if encryption key is configured
 */
export function isEncryptionConfigured(): boolean {
  try {
    const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
    return !!key && key.length >= 32;
  } catch {
    return false;
  }
}

/**
 * Generate a secure encryption key (for setup)
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Mask sensitive data for display
 */
export function maskCredentialData(data: Record<string, unknown>, type: string): Record<string, unknown> {
  switch (type) {
    case 'api_key':
      return {
        key: '••••••••',
        headerName: data.headerName,
        prefix: data.prefix,
      };
    
    case 'basic_auth':
      return {
        username: data.username,
        password: '••••••••',
      };
    
    case 'oauth2':
      return {
        accessToken: '••••••••',
        refreshToken: data.refreshToken ? '••••••••' : undefined,
        expiresAt: data.expiresAt,
      };
    
    case 'custom_headers':
      const maskedHeaders: Record<string, string> = {};
      const headers = (data.headers && typeof data.headers === 'object' ? data.headers : {}) as Record<string, string>;
      for (const [key, value] of Object.entries(headers)) {
        // Mask values that look sensitive
        const isSensitive = key.toLowerCase().includes('auth') ||
                          key.toLowerCase().includes('key') ||
                          key.toLowerCase().includes('token') ||
                          key.toLowerCase().includes('secret');
        maskedHeaders[key] = isSensitive ? '••••••••' : value;
      }
      return { headers: maskedHeaders };
    
    default:
      return { masked: true };
  }
}

/**
 * Validate credential data structure
 */
export function validateCredentialData(type: string, data: Record<string, unknown>): {
  valid: boolean;
  error?: string;
} {
  try {
    switch (type) {
      case 'api_key':
        if (!data.key || typeof data.key !== 'string') {
          return { valid: false, error: 'API key is required' };
        }
        break;
      
      case 'basic_auth':
        if (!data.username || typeof data.username !== 'string') {
          return { valid: false, error: 'Username is required' };
        }
        if (!data.password || typeof data.password !== 'string') {
          return { valid: false, error: 'Password is required' };
        }
        break;
      
      case 'oauth2':
        if (!data.accessToken || typeof data.accessToken !== 'string') {
          return { valid: false, error: 'Access token is required' };
        }
        break;
      
      case 'custom_headers':
        if (!data.headers || typeof data.headers !== 'object') {
          return { valid: false, error: 'Headers object is required' };
        }
        break;
      
      default:
        return { valid: false, error: 'Invalid credential type' };
    }
    
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}
