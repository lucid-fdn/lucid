/**
 * Centralized Email System
 * 
 * Simple, reliable email delivery with:
 * - Suppression list (legal compliance)
 * - Idempotency (prevents duplicates)
 * - Delivery tracking
 * - Provider abstraction (Resend today, SES later)
 * 
 * No Redis, no queue worker - Resend handles delivery
 */

import { Resend } from 'resend';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ErrorService } from '@/lib/errors/error-service';
import { maskEmail, maskIdentifier, redactLogValue, summarizeError } from '@/lib/logging/safe-log';
import { renderTemplate } from './templates';

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

// Supabase client (lazy to avoid build-time crash)
let _supabase: SupabaseClient | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key'
    );
  }
  return _supabase;
}

export type MailType = 
  | 'invite'
  | 'passwordless'
  | 'receipt'
  | 'alert'
  | 'contact'
  | 'newsletter';

export interface SendEmailOptions {
  /** Unique key to prevent duplicate sends (e.g., "invite:org123:user@example.com") */
  dedupeKey?: string;
}

export interface SendEmailResult {
  /** Email record ID in database */
  id: string;
  /** Email status (sent, suppressed, failed) */
  status: string;
  /** Provider message ID (if sent) */
  providerId?: string;
}

/**
 * Send a transactional email
 * 
 * @param type - Email type (determines template)
 * @param to - Recipient email address
 * @param vars - Template variables
 * @param options - Optional settings (dedupe key, etc.)
 * 
 * @example
 * ```ts
 * await sendTransactional('invite', 'user@example.com', {
 *   orgName: 'Acme Inc',
 *   role: 'admin',
 *   acceptUrl: 'https://app.example.com/invites/abc123'
 * }, {
 *   dedupeKey: `invite:${orgId}:${email}`
 * });
 * ```
 */
export async function sendTransactional(
  type: MailType,
  to: string,
  vars: Record<string, unknown>,
  options?: SendEmailOptions
): Promise<SendEmailResult> {
  
  // 1. Check suppression list (MUST be first)
  const { data: suppressed } = await getSupabase()
    .from('email_suppressions')
    .select('address, reason')
    .eq('address', to)
    .maybeSingle();
  
  if (suppressed) {
    console.log('[mail] Suppressed address:', maskEmail(to), 'reason:', suppressed.reason);
    
    // Log suppressed attempt
    const { data } = await getSupabase()
      .from('emails')
      .insert({
        type,
        to_address: to,
        status: 'suppressed',
        dedupe_key: options?.dedupeKey
      })
      .select('id')
      .single();
    
    return { 
      id: data!.id, 
      status: 'suppressed' 
    };
  }
  
  // 2. Check dedupe (DB-based, safe for multi-instance)
  if (options?.dedupeKey) {
    const { data: existing } = await getSupabase()
      .from('emails')
      .select('id, status, provider_id')
      .eq('dedupe_key', options.dedupeKey)
      .maybeSingle();
    
    if (existing) {
      // If already sent/queued, return existing
      if (existing.status === 'sent' || existing.status === 'queued') {
        console.log('[mail] Duplicate prevented (already sent/queued):', redactLogValue(options.dedupeKey, 'dedupeKey'));
        return { 
          id: existing.id, 
          status: existing.status,
          providerId: existing.provider_id 
        };
      }
      
      // If failed or suppressed, delete old record and retry
      console.log('[mail] Deleting old failed/suppressed record to retry:', {
        dedupe_key: redactLogValue(options.dedupeKey, 'dedupeKey'),
        old_status: existing.status
      });
      
      await getSupabase()
        .from('emails')
        .delete()
        .eq('id', existing.id);
    }
  }
  
  // 3. Render template
  const { subject, html, text } = await renderTemplate(type, vars);
  
  // 4. Create email record (status: queued)
  const { data: emailRecord, error: insertError } = await getSupabase()
    .from('emails')
    .insert({
      type,
      to_address: to,
      subject,
      status: 'queued',
      dedupe_key: options?.dedupeKey
    })
    .select('id')
    .single();
  
  // Log insert result
  console.log('[mail] Email record creation:', {
    success: !!emailRecord,
    hasError: !!insertError,
    errorCode: insertError?.code,
    errorMessage: insertError?.message,
    errorDetails: insertError?.details
  });
  
  if (insertError) {
    console.error('[mail] Failed to create email record:', insertError);
    ErrorService.captureException(insertError, {
      severity: 'error',
      context: { 
        type,
        to: maskEmail(to),
        operation: 'create_email_record'
      },
      tags: { 
        layer: 'mail-service'
      }
    });
  }
  
  // 5. Send via Resend (sync, no queue)
  try {
    // Ensure we have an email record before proceeding
    if (!emailRecord?.id) {
      throw new Error('Failed to create email record in database');
    }
    
    const { data, error } = await getResend().emails.send({
      from: getFromAddress(type),
      to,
      subject,
      html,
      text,
      tags: [
        { name: 'type', value: type },
        { name: 'email_id', value: emailRecord.id }
      ]
    });
    
    if (error) throw error;
    
    // 6. Update record (status: sent)
    await getSupabase()
      .from('emails')
      .update({
        status: 'sent',
        provider_id: data.id,
        sent_at: new Date().toISOString()
      })
      .eq('id', emailRecord!.id);
    
    console.log('[mail] Sent:', { 
      id: maskIdentifier(emailRecord!.id),
      provider_id: maskIdentifier(data.id),
      type,
      to: maskEmail(to),
    });
    
    return { 
      id: emailRecord!.id, 
      status: 'sent',
      providerId: data.id
    };
    
  } catch (error: unknown) {
    // 7. Update record (status: failed) - only if we have an email record
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (emailRecord?.id) {
      await getSupabase()
        .from('emails')
        .update({
          status: 'failed',
          error: errorMessage
        })
        .eq('id', emailRecord.id);
    }

    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        id: maskIdentifier(emailRecord?.id) || 'unknown',
        type,
        to: maskEmail(to),
        dedupeKey: redactLogValue(options?.dedupeKey, 'dedupeKey')
      },
      tags: {
        layer: 'mail-service',
        email_type: type
      }
    });

    console.error('[mail] Send failed:', {
      type,
      to: maskEmail(to),
      error: summarizeError(error).message,
      hasEmailRecord: !!emailRecord
    });

    throw error;
  }
}

/**
 * Get the from address for an email type
 * Uses verified subdomain (form.lucid.foundation) but with clean display names
 * Recipients see the name, not the subdomain (e.g., "Lucid Invites" not @form.lucid.foundation)
 */
function getFromAddress(type: MailType): string {
  switch (type) {
    case 'invite':
      // ✅ Verified subdomain with clean display name
      return 'Lucid Invites <invites@form.lucid.foundation>';
    case 'passwordless':
    case 'alert':
      return 'Lucid <hello@form.lucid.foundation>';
    case 'contact':
    case 'newsletter':
      return 'Lucid <hello@form.lucid.foundation>';
    default:
      return 'Lucid <hello@form.lucid.foundation>';
  }
}

/**
 * Manually suppress an email address
 * (Use for manual blocks, not for bounces - those are handled by webhook)
 */
export async function suppressEmail(
  address: string,
  reason: string = 'manual'
): Promise<void> {
  const { error } = await getSupabase()
    .from('email_suppressions')
    .insert({
      address,
      reason
    });
  
  // Ignore duplicate key errors
  if (error && error.code !== '23505') {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { 
        address,
        reason,
        operation: 'suppress_email'
      },
      tags: { 
        layer: 'mail-service'
      }
    });
  }
  
  console.log('[mail] Manually suppressed:', maskEmail(address));
}

/**
 * Check if an email address is suppressed
 */
export async function isEmailSuppressed(address: string): Promise<boolean> {
  const { data } = await getSupabase()
    .from('email_suppressions')
    .select('address')
    .eq('address', address)
    .maybeSingle();
  
  return !!data;
}
