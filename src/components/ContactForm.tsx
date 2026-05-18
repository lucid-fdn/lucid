'use client';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { getFieldConfig } from '@/lib/validation-rules';
import { Button } from '@/components/ui/button';

// Base schema with all possible fields
const baseSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  company: z.string().optional(),
  email: z.string().optional(), // Validation handled by React Hook Form only - not Zod
  phoneNumber: z.string().optional(),
  role: z.string().optional(),
  companySize: z.string().optional(),
  useCase: z.string().optional(),
  timeline: z.string().optional(),
  budget: z.string().optional(),
  partnershipType: z.string().optional(),
  priority: z.string().optional(),
  description: z.string().optional(),
  message: z.string().min(10, 'Message must be at least 10 characters'),
  agreeToPolicies: z.boolean().refine(val => val === true, 'You must agree to the privacy policy'),
  solanaWallet: z.string().optional(),
  discordId: z.string().optional(),
  twitterId: z.string().optional(),
  resume: z.string().optional(),
  coverLetter: z.string().optional(),
  portfolio: z.string().optional(),
  linkedin: z.string().optional(),
  github: z.string().optional(),
});


interface ContactConfig {
  title: string;
  subtitle?: string;
  description?: string;
  formTitle?: string;
  formDescription?: string;
  fields: {
    company?: boolean;
    role?: boolean;
    companySize?: boolean;
    useCase?: boolean;
    timeline?: boolean;
    budget?: boolean;
    partnershipType?: boolean;
    description?: boolean;
    priority?: boolean;
    solanaWallet?: boolean;
    discordId?: boolean;
    twitterId?: boolean;
    resume?: boolean;
    coverLetter?: boolean;
    portfolio?: boolean;
    linkedin?: boolean;
    github?: boolean;
  };
  submitText: string;
  successMessage: string;
  hideMessage?: boolean;
  hideNames?: boolean;
}

interface ContactFormProps {
  onSuccess?: () => void;
  className?: string;
  config?: ContactConfig;
  apiEndpoint?: string;
}

// Create dynamic schema based on config
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const createSchema = (config?: ContactConfig) => {
  if (!config) return baseSchema;
  
  const schemaFields: Record<string, z.ZodTypeAny> = {
    agreeToPolicies: z.boolean().refine(val => val === true, 'You must agree to the privacy policy'),
  };

  // Add name fields only if not hidden
  if (!config.hideNames) {
    schemaFields.firstName = z.string().min(1, 'First name is required');
    schemaFields.lastName = z.string().min(1, 'Last name is required');
  }

  // Email validation handled entirely by React Hook Form (not Zod)
  // Skip Zod validation for email - React Hook Form will handle it
  // schemaFields.email = z.string().min(1, 'Email is required');

  // Add message field only if not hidden
  if (!config.hideMessage) {
    schemaFields.message = z.string().min(10, 'Message must be at least 10 characters');
  }

  // Add required fields based on config
  if (config.fields.company) {
    schemaFields.company = z.string().min(1, 'Company is required');
  }
  if (config.fields.role) {
    schemaFields.role = z.string().min(1, 'Role is required');
  }
  if (config.fields.companySize) {
    schemaFields.companySize = z.string().min(1, 'Company size is required');
  }
  if (config.fields.useCase) {
    schemaFields.useCase = z.string().min(1, 'Use case is required');
  }
  if (config.fields.timeline) {
    schemaFields.timeline = z.string().min(1, 'Timeline is required');
  }
  if (config.fields.budget) {
    schemaFields.budget = z.string().min(1, 'Budget is required');
  }
  if (config.fields.partnershipType) {
    schemaFields.partnershipType = z.string().min(1, 'Partnership type is required');
  }
  if (config.fields.priority) {
    schemaFields.priority = z.string().min(1, 'Priority is required');
  }
  if (config.fields.description) {
    schemaFields.description = z.string().min(10, 'Description must be at least 10 characters');
  }
  if (config.fields.solanaWallet) {
    schemaFields.solanaWallet = z.string()
      .min(1, 'Solana wallet address is required')
      .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana wallet address');
  }
  if (config.fields.discordId) {
    schemaFields.discordId = z.string().min(1, 'Discord ID is required');
  }
  if (config.fields.twitterId) {
    schemaFields.twitterId = z.string().min(1, 'Twitter ID is required');
  }

  return z.object(schemaFields);
};

export default function ContactForm({ onSuccess, className, config, apiEndpoint = '/api/contact' }: ContactFormProps) {
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  type DynamicFormData = z.infer<ReturnType<typeof createSchema>>;

  const { register, handleSubmit, formState: { errors, isSubmitting, isValid }, reset } = useForm<DynamicFormData>({
    mode: 'onBlur' // Enable validation on blur for better UX
  });

  const onSubmit = async (data: DynamicFormData) => {
    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          source: config?.title || 'General Contact',
          formType: config?.formTitle || 'Contact Form'
        }),
      });

      if (response.ok) {
        reset();
        setStatusMessage({ type: 'success', text: config?.successMessage || 'Thank you for your message. We\'ll get back to you soon.' });
        onSuccess?.();
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setStatusMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to send message. Please try again.' });
    }
  };

  const companySizeOptions = [
    '1-10 employees',
    '11-50 employees',
    '51-200 employees',
    '201-500 employees',
    '501-1000 employees',
    '1000+ employees'
  ];

  const timelineOptions = [
    'Immediately',
    'Within 1 month',
    'Within 3 months',
    'Within 6 months',
    'Within 1 year',
    'Just exploring'
  ];

  const budgetOptions = [
    'Under $10K',
    '$10K - $50K',
    '$50K - $100K',
    '$100K - $500K',
    '$500K - $1M',
    '$1M+',
    'Prefer not to say'
  ];

  const partnershipTypeOptions = [
    'Technology Integration',
    'Channel Partnership',
    'Strategic Alliance',
    'Investment Opportunity',
    'Other'
  ];

  const priorityOptions = [
    'Low',
    'Medium',
    'High',
    'Critical'
  ];

  return (
    <div className={`mx-auto max-w-2xl ${className}`}>
      {statusMessage && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${statusMessage.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {statusMessage.text}
        </div>
      )}
      {(config?.formTitle || config?.formDescription) && (
        <div className="text-center mb-8">
          {config?.formTitle && (
            <h3 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {config.formTitle}
            </h3>
          )}
          {config?.formDescription && (
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              {config.formDescription}
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
        {!config?.hideNames && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              First name *
            </label>
            <input
              {...register('firstName', { required: 'First name is required' })}
              type="text"
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200"
            />
            {errors.firstName && <p className="mt-1 text-sm text-red-600">{String(errors.firstName.message)}</p>}
          </div>

          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Last name *
            </label>
            <input
              {...register('lastName', { required: 'Last name is required' })}
              type="text"
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200"
            />
            {errors.lastName && <p className="mt-1 text-sm text-red-600">{String(errors.lastName.message)}</p>}
          </div>
        </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email address *
          </label>
          <input
            {...register('email', getFieldConfig('email').validationRules as any)} // eslint-disable-line @typescript-eslint/no-explicit-any
            type="email"
            placeholder="Enter your email address"
            className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200 ${
              errors.email 
                ? 'border-red-500 focus:border-red-500 bg-red-50 dark:bg-red-900/20' 
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:border-blue-500'
            }`}
          />
          {errors.email && <p className="mt-1 text-sm text-red-600">{String(errors.email.message)}</p>}
        </div>

        {config?.fields.company && (
          <div>
            <label htmlFor="company" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Company *
            </label>
            <input
              {...register('company', { required: 'Company is required' })}
              type="text"
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200"
            />
            {errors.company && <p className="mt-1 text-sm text-red-600">{String(errors.company.message)}</p>}
          </div>
        )}

        {config?.fields.role && (
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Role *
            </label>
            <input
              {...register('role', { required: 'Role is required' })}
              type="text"
              placeholder="e.g., CTO, AI Engineer, Product Manager"
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200"
            />
            {errors.role && <p className="mt-1 text-sm text-red-600">{String(errors.role.message)}</p>}
          </div>
        )}

        {config?.fields.companySize && (
          <div>
            <label htmlFor="companySize" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Company Size *
            </label>
            <select
              {...register('companySize')}
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200"
            >
              <option value="">Select company size</option>
              {companySizeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {errors.companySize && <p className="mt-1 text-sm text-red-600">{String(errors.companySize.message)}</p>}
          </div>
        )}

        {config?.fields.useCase && (
          <div>
            <label htmlFor="useCase" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Use Case *
            </label>
            <textarea
              {...register('useCase')}
              rows={3}
              placeholder="Describe how you plan to use Lucid's AI infrastructure"
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200"
            />
            {errors.useCase && <p className="mt-1 text-sm text-red-600">{String(errors.useCase.message)}</p>}
          </div>
        )}

        {config?.fields.timeline && (
          <div>
            <label htmlFor="timeline" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Timeline *
            </label>
            <select
              {...register('timeline')}
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200"
            >
              <option value="">Select timeline</option>
              {timelineOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {errors.timeline && <p className="mt-1 text-sm text-red-600">{String(errors.timeline.message)}</p>}
          </div>
        )}

        {config?.fields.budget && (
          <div>
            <label htmlFor="budget" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Budget *
            </label>
            <select
              {...register('budget')}
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200"
            >
              <option value="">Select budget range</option>
              {budgetOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {errors.budget && <p className="mt-1 text-sm text-red-600">{String(errors.budget.message)}</p>}
          </div>
        )}

        {config?.fields.partnershipType && (
          <div>
            <label htmlFor="partnershipType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Partnership Type *
            </label>
            <select
              {...register('partnershipType')}
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200"
            >
              <option value="">Select partnership type</option>
              {partnershipTypeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {errors.partnershipType && <p className="mt-1 text-sm text-red-600">{String(errors.partnershipType.message)}</p>}
          </div>
        )}

        {config?.fields.priority && (
          <div>
            <label htmlFor="priority" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Priority *
            </label>
            <select
              {...register('priority')}
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200"
            >
              <option value="">Select priority</option>
              {priorityOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {errors.priority && <p className="mt-1 text-sm text-red-600">{String(errors.priority.message)}</p>}
          </div>
        )}

        {config?.fields.solanaWallet && (
          <div>
            <label htmlFor="solanaWallet" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Solana Wallet Address *
            </label>
            <input
              {...register('solanaWallet', getFieldConfig('solanaWallet').validationRules as any)} // eslint-disable-line @typescript-eslint/no-explicit-any
              type="text"
              placeholder="e.g., 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
              className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200 ${
                errors.solanaWallet 
                  ? 'border-red-500 focus:border-red-500 bg-red-50 dark:bg-red-900/20' 
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:border-blue-500'
              }`}
            />
            {errors.solanaWallet && <p className="mt-1 text-sm text-red-600">{String(errors.solanaWallet.message)}</p>}
          </div>
        )}

        {config?.fields.discordId && (
          <div>
            <label htmlFor="discordId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Discord ID *
            </label>
            <input
              {...register('discordId', getFieldConfig('discordId').validationRules as any)} // eslint-disable-line @typescript-eslint/no-explicit-any
              type="text"
              placeholder="e.g., username#1234 or @username"
              className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200 ${
                errors.discordId 
                  ? 'border-red-500 focus:border-red-500 bg-red-50 dark:bg-red-900/20' 
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:border-blue-500'
              }`}
            />
            {errors.discordId && <p className="mt-1 text-sm text-red-600">{String(errors.discordId.message)}</p>}
          </div>
        )}

        {config?.fields.twitterId && (
          <div>
            <label htmlFor="twitterId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Twitter/X ID *
            </label>
            <input
              {...register('twitterId', getFieldConfig('twitterId').validationRules as any)} // eslint-disable-line @typescript-eslint/no-explicit-any
              type="text"
              placeholder="e.g., @username or username"
              className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200 ${
                errors.twitterId 
                  ? 'border-red-500 focus:border-red-500 bg-red-50 dark:bg-red-900/20' 
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:border-blue-500'
              }`}
            />
            {errors.twitterId && <p className="mt-1 text-sm text-red-600">{String(errors.twitterId.message)}</p>}
          </div>
        )}

        {config?.fields.resume && (
          <div>
            <label htmlFor="resume" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Resume/CV URL *
            </label>
            <input
              {...register('resume', { required: 'Resume/CV URL is required' })}
              type="url"
              placeholder="https://your-resume.com or Google Drive/Dropbox link"
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200"
            />
            {errors.resume && <p className="mt-1 text-sm text-red-600">{String(errors.resume.message)}</p>}
          </div>
        )}

        {config?.fields.coverLetter && (
          <div>
            <label htmlFor="coverLetter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Cover Letter *
            </label>
            <textarea
              {...register('coverLetter', { required: 'Cover letter is required' })}
              rows={4}
              placeholder="Tell us why you're interested in joining Lucid and what makes you a great fit for this role"
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200"
            />
            {errors.coverLetter && <p className="mt-1 text-sm text-red-600">{String(errors.coverLetter.message)}</p>}
          </div>
        )}

        {config?.fields.portfolio && (
          <div>
            <label htmlFor="portfolio" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Portfolio/GitHub URL
            </label>
            <input
              {...register('portfolio')}
              type="url"
              placeholder="https://github.com/yourusername or portfolio website"
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200"
            />
            {errors.portfolio && <p className="mt-1 text-sm text-red-600">{String(errors.portfolio.message)}</p>}
          </div>
        )}

        {config?.fields.linkedin && (
          <div>
            <label htmlFor="linkedin" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              LinkedIn Profile
            </label>
            <input
              {...register('linkedin')}
              type="url"
              placeholder="https://linkedin.com/in/yourprofile"
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200"
            />
            {errors.linkedin && <p className="mt-1 text-sm text-red-600">{String(errors.linkedin.message)}</p>}
          </div>
        )}

        {config?.fields.github && (
          <div>
            <label htmlFor="github" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              GitHub Profile
            </label>
            <input
              {...register('github')}
              type="url"
              placeholder="https://github.com/yourusername"
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200"
            />
            {errors.github && <p className="mt-1 text-sm text-red-600">{String(errors.github.message)}</p>}
          </div>
        )}

        {config?.fields.description && (
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description *
            </label>
            <textarea
              {...register('description')}
              rows={4}
              placeholder="Provide more details about your inquiry"
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200"
            />
            {errors.description && <p className="mt-1 text-sm text-red-600">{String(errors.description.message)}</p>}
          </div>
        )}

        {!config?.hideMessage && (
        <div>
          <label htmlFor="message" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Message *
          </label>
          <textarea
            {...register('message', { required: 'Message is required', minLength: { value: 10, message: 'Message must be at least 10 characters' } })}
            rows={4}
            placeholder="Tell us more about your project or inquiry"
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors duration-200"
          />
          {errors.message && <p className="mt-1 text-sm text-red-600">{String(errors.message.message)}</p>}
        </div>
        )}

        <div className="flex items-start">
          <div className="flex items-center h-5">
            <input
              {...register('agreeToPolicies', { required: 'You must agree to the privacy policy' })}
              type="checkbox"
              className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-gray-700"
            />
          </div>
          <div className="ml-3 text-sm">
            <label htmlFor="agreeToPolicies" className="font-medium text-gray-700 dark:text-gray-300">
              I agree to the privacy policy and terms of service
            </label>
          </div>
        </div>
        {errors.agreeToPolicies && <p className="mt-1 text-sm text-red-600">{String(errors.agreeToPolicies.message)}</p>}


        <div className="mt-8">
          <Button
            type="submit"
            disabled={isSubmitting || !isValid || Object.keys(errors).length > 0}
            size="lg"
            className="w-full rounded-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting && <ArrowPathIcon className="h-5 w-5 animate-spin" />}
            {isSubmitting ? 'Sending...' : (config?.submitText || 'Send Message')}
          </Button>
        </div>
      </form>
    </div>
  );
}
