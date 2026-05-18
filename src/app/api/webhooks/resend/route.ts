/**
 * Resend Webhook Handler
 * 
 * Handles email events from Resend:
 * - delivered
 * - bounced
 * - complained
 * 
 * Automatically suppresses bounced/complained addresses
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    // Verify webhook signature (Resend uses Svix for webhook signing)
    const signingSecret = process.env.RESEND_WEBHOOK_SECRET;

    if (!signingSecret) {
      console.error('[mail:webhook] Signing key not configured; rejecting request');
      return Response.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    const svixId = req.headers.get('svix-id');
    const svixTimestamp = req.headers.get('svix-timestamp');
    const svixSignature = req.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error('[mail:webhook] Missing required signature headers');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Timestamp replay protection: reject if older than 5 minutes
    const timestampSeconds = parseInt(svixTimestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (isNaN(timestampSeconds) || Math.abs(now - timestampSeconds) > 300) {
      console.error('[mail:webhook] Signature timestamp too old or invalid');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Read raw body for signature verification
    const rawBody = await req.text();

    // Svix signing secret starts with "whsec_" prefix — strip it and base64-decode
    const secretBytes = Buffer.from(
      signingSecret.startsWith('whsec_') ? signingSecret.slice(6) : signingSecret,
      'base64'
    );

    // Signed content = "${svix-id}.${svix-timestamp}.${body}"
    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
    const computedSignature = createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');

    // svix-signature header contains space-separated entries like "v1,<base64>"
    const expectedSignatures = svixSignature.split(' ').map((s) => s.split(',')[1]).filter(Boolean);
    const isValid = expectedSignatures.some((expected) => {
      try {
        const expectedBuf = Buffer.from(expected, 'base64');
        const computedBuf = Buffer.from(computedSignature, 'base64');
        return expectedBuf.length === computedBuf.length && timingSafeEqual(expectedBuf, computedBuf);
      } catch {
        return false;
      }
    });

    if (!isValid) {
      console.error('[mail:webhook] Svix signature verification failed');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    
    // Map Resend events to our types
    const eventTypeMap: Record<string, string> = {
      'email.sent': 'sent',
      'email.delivered': 'delivered',
      'email.bounced': 'bounce',
      'email.complained': 'complaint',
      'email.opened': 'open',
      'email.clicked': 'click',
    };
    
    const eventType = eventTypeMap[event.type];
    if (!eventType) {
      return Response.json({ ignored: true });
    }
    
    const providerId = event.data?.id || event.data?.email_id;
    const toAddress = event.data?.to;
    
    // Find email record
    const { data: email } = await getSupabase()
      .from('emails')
      .select('id')
      .eq('provider_id', providerId)
      .maybeSingle();
    
    // Handle bounce/complaint → suppress address
    if (eventType === 'bounce' || eventType === 'complaint') {
      if (toAddress) {
        // Add to suppression list
        const { error: suppressError } = await getSupabase()
          .from('email_suppressions')
          .insert({
            address: toAddress,
            reason: eventType,
          });
        
        // Ignore duplicate key errors
        if (suppressError && suppressError.code !== '23505') {
          console.error('[mail:webhook] Failed to suppress:', suppressError);
        }
      }
      
      // Optionally update email status to failed
      if (email) {
        await getSupabase()
          .from('emails')
          .update({
            status: 'failed',
            error: `${eventType}: ${event.data?.reason || 'Unknown'}`
          })
          .eq('id', email.id);
      }
    }
    
    return Response.json({ 
      received: true,
      event: eventType,
      email_id: email?.id 
    });
    
  } catch (error: unknown) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/api/webhooks/resend',
        method: 'POST'
      },
      tags: {
        layer: 'api',
        route: 'webhooks-resend'
      }
    });
    return Response.json(
      { error: 'Internal error' }, 
      { status: 500 }
    );
  }
}
