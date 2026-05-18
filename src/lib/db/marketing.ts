/**
 * Marketing operations (Contacts, Newsletter, Waitinglist)
 */

import { supabase, ErrorService } from './client'

export async function saveContact(contact: {
  first_name?: string;
  last_name?: string;
  company?: string;
  email: string;
  phone_number?: string;
  message?: string;
  agree_to_policies?: boolean;
  role?: string;
  company_size?: string;
  use_case?: string;
  timeline?: string;
  budget?: string;
  partnership_type?: string;
  priority?: string;
  description?: string;
  source?: string;
  form_type?: string;
  solana_wallet?: string;
  discord_id?: string;
  twitter_id?: string;
}) {
  const { error } = await supabase
    .from('contacts')
    .insert([contact]);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        email: contact.email,
        formType: contact.form_type,
        table: 'contacts',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'contacts'
      }
    });
    throw error;
  }
}

export async function saveToWaitinglist(data: {
  email: string;
  solana_wallet?: string;
  discord_id?: string;
  twitter_id?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}) {
  const { data: result, error } = await supabase
    .from('waitinglist')
    .insert([data])
    .select();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        email: data.email,
        table: 'waitinglist',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'waitinglist'
      }
    });
    throw error;
  }

  return result;
}

export async function saveToNewsletter(data: {
  email: string;
  subscribed_at?: Date;
}) {
  const { error } = await supabase
    .from('newsletter')
    .insert([data]);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        email: data.email,
        table: 'newsletter',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'newsletter'
      }
    });
    throw error;
  }
}
