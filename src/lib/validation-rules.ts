/**
 * Comprehensive validation rules for all form fields
 */

// ============================================================================
// EMAIL VALIDATION
// ============================================================================

export const emailValidationRules = {
  required: 'Email is required',
  validate: {
    hasAt: (value: string) => value.includes('@') || 'Please include @ symbol',
    hasDomain: (value: string) => {
      const atIndex = value.indexOf('@');
      return atIndex > 0 && atIndex < value.length - 1 || 'Please include domain after @';
    },
    hasTld: (value: string) => {
      const atIndex = value.indexOf('@');
      if (atIndex === -1) return true; // Will be caught by hasDomain
      const domain = value.substring(atIndex + 1);
      return domain.includes('.') && domain.split('.').pop()!.length >= 2 || 'Please include valid domain (e.g., .com)';
    },
    validFormat: (value: string) => {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      return emailRegex.test(value) || 'Please enter a valid email address';
    },
    notTooLong: (value: string) => value.length <= 254 || 'Email address is too long',
    notEmpty: (value: string) => value.trim().length > 0 || 'Email cannot be empty'
  }
};

// ============================================================================
// SOLANA WALLET VALIDATION
// ============================================================================

export const solanaWalletValidationRules = {
  required: 'Solana wallet address is required',
  validate: {
    notEmpty: (value: string) => value.trim().length > 0 || 'Wallet address cannot be empty',
    validLength: (value: string) => {
      const trimmed = value.trim();
      return (trimmed.length >= 32 && trimmed.length <= 44) || 'Wallet address must be 32-44 characters';
    },
    validFormat: (value: string) => {
      const solanaRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      return solanaRegex.test(value.trim()) || 'Invalid Solana wallet address format';
    },
    notTooLong: (value: string) => value.length <= 50 || 'Wallet address is too long'
  }
};

// ============================================================================
// DISCORD ID VALIDATION
// ============================================================================

export const discordIdValidationRules = {
  required: 'Discord ID is required',
  validate: {
    notEmpty: (value: string) => value.trim().length > 0 || 'Discord ID cannot be empty',
    validFormat: (value: string) => {
      const trimmed = value.trim();
      // Accept both username#1234 and @username formats
      const discordRegex = /^(@?[a-zA-Z0-9._]{2,32}#?\d{4}|@?[a-zA-Z0-9._]{2,32})$/;
      return discordRegex.test(trimmed) || 'Please enter a valid Discord ID (e.g., username#1234 or @username)';
    },
    notTooLong: (value: string) => value.length <= 50 || 'Discord ID is too long'
  }
};

// ============================================================================
// TWITTER ID VALIDATION
// ============================================================================

export const twitterIdValidationRules = {
  required: 'Twitter/X ID is required',
  validate: {
    notEmpty: (value: string) => value.trim().length > 0 || 'Twitter ID cannot be empty',
    validFormat: (value: string) => {
      const trimmed = value.trim();
      // Accept both @username and username formats
      const twitterRegex = /^@?[a-zA-Z0-9_]{1,15}$/;
      return twitterRegex.test(trimmed) || 'Please enter a valid Twitter ID (e.g., @username or username)';
    },
    notTooLong: (value: string) => value.length <= 20 || 'Twitter ID is too long'
  }
};

// ============================================================================
// TEXT FIELD VALIDATION
// ============================================================================

export const createTextValidationRules = (fieldName: string, minLength = 1, maxLength = 255) => ({
  required: `${fieldName} is required`,
  validate: {
    notEmpty: (value: string) => value.trim().length > 0 || `${fieldName} cannot be empty`,
    minLength: (value: string) => value.trim().length >= minLength || `${fieldName} must be at least ${minLength} characters`,
    maxLength: (value: string) => value.length <= maxLength || `${fieldName} is too long (max ${maxLength} characters)`
  }
});

// ============================================================================
// PHONE NUMBER VALIDATION
// ============================================================================

export const phoneValidationRules = {
  validate: {
    validFormat: (value: string) => {
      if (!value || value.trim().length === 0) return true; // Optional field
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
      return phoneRegex.test(value.replace(/[\s\-\(\)]/g, '')) || 'Please enter a valid phone number';
    },
    notTooLong: (value: string) => value.length <= 20 || 'Phone number is too long'
  }
};

// ============================================================================
// MESSAGE/TEXTAREA VALIDATION
// ============================================================================

export const createMessageValidationRules = (fieldName: string, minLength = 10) => ({
  required: `${fieldName} is required`,
  validate: {
    notEmpty: (value: string) => value.trim().length > 0 || `${fieldName} cannot be empty`,
    minLength: (value: string) => value.trim().length >= minLength || `${fieldName} must be at least ${minLength} characters`,
    maxLength: (value: string) => value.length <= 2000 || `${fieldName} is too long (max 2000 characters)`
  }
});

// ============================================================================
// CHECKBOX VALIDATION
// ============================================================================

export const checkboxValidationRules = {
  required: 'This field is required',
  validate: {
    checked: (value: boolean) => value === true || 'You must agree to continue'
  }
};

// ============================================================================
// STYLING UTILITIES
// ============================================================================

export const getInputClasses = (hasError: boolean, baseClasses = "") => {
  const defaultClasses = "mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200";
  const classes = baseClasses || defaultClasses;
  
  if (hasError) {
    return `${classes} border-red-500 focus:border-red-500 bg-red-50 dark:bg-red-900/20`;
  }
  
  return `${classes} border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:border-blue-500`;
};

export const getTextareaClasses = (hasError: boolean) => {
  const baseClasses = "mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200 resize-vertical";
  
  if (hasError) {
    return `${baseClasses} border-red-500 focus:border-red-500 bg-red-50 dark:bg-red-900/20`;
  }
  
  return `${baseClasses} border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:border-blue-500`;
};

// ============================================================================
// HELP TEXT UTILITIES
// ============================================================================

export const getFieldHelpText = (hasError: boolean, errorMessage?: string, helpText?: string) => {
  if (hasError && errorMessage) {
    return {
      text: errorMessage,
      className: "mt-1 text-sm text-red-600",
      isError: true
    };
  }
  
  if (helpText) {
    return {
      text: helpText,
      className: "mt-1 text-xs text-gray-500 dark:text-gray-400",
      isError: false
    };
  }
  
  return null;
};

// ============================================================================
// FIELD-SPECIFIC HELP TEXTS
// ============================================================================

export const fieldHelpTexts = {
  email: "Enter a valid email like: user@example.com",
  solanaWallet: "Enter your Solana wallet address (32-44 characters)",
  discordId: "Enter your Discord ID like: username#1234 or @username",
  twitterId: "Enter your Twitter/X ID like: @username or username",
  phone: "Enter your phone number (optional)",
  message: "Please provide more details about your inquiry",
  company: "Enter your company name",
  role: "Enter your job title or role",
  firstName: "Enter your first name",
  lastName: "Enter your last name"
};

// ============================================================================
// VALIDATION RULE FACTORY
// ============================================================================

export const createValidationRules = (fieldType: string, options: Record<string, unknown> = {}) => {
  switch (fieldType) {
    case 'email':
      return emailValidationRules;
    case 'solanaWallet':
      return solanaWalletValidationRules;
    case 'discordId':
      return discordIdValidationRules;
    case 'twitterId':
      return twitterIdValidationRules;
    case 'phone':
      return phoneValidationRules;
    case 'text':
      return createTextValidationRules(String(options.fieldName || 'Field'), options.minLength as number | undefined, options.maxLength as number | undefined);
    case 'message':
      return createMessageValidationRules(String(options.fieldName || 'Message'), options.minLength as number | undefined);
    case 'checkbox':
      return checkboxValidationRules;
    default:
      return { required: `${options.fieldName || 'Field'} is required` };
  }
};

// ============================================================================
// FORM FIELD CONFIGURATION
// ============================================================================

export const getFieldConfig = (fieldType: string, options: Record<string, unknown> = {}) => {
  const validationRules = createValidationRules(fieldType, options);
  const helpText = fieldHelpTexts[fieldType as keyof typeof fieldHelpTexts] || options.helpText;
  
  return {
    validationRules,
    helpText,
    getClasses: (hasError: boolean) => fieldType === 'message' ? getTextareaClasses(hasError) : getInputClasses(hasError),
    getHelpText: (hasError: boolean, errorMessage?: string) => getFieldHelpText(hasError, errorMessage, helpText as string | undefined)
  };
};
