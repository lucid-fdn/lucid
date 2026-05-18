/**
 * Email Template Renderer
 * 
 * Renders React Email templates to HTML + plain text
 */

import React from 'react';
import { render } from '@react-email/render';
import { InviteEmail } from './InviteEmail';
import { ContactEmail } from './ContactEmail';
import { NewsletterWelcomeEmail } from './NewsletterWelcomeEmail';
import type { MailType } from '../index';

/** Escape untrusted strings before interpolating into raw HTML templates. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface TemplateResult {
  subject: string;
  html: string;
  text: string;
}

/**
 * Render an email template
 * 
 * @param type - Email type
 * @param vars - Template variables
 * @returns Rendered subject, HTML, and plain text
 */
export async function renderTemplate(
  type: MailType,
  vars: Record<string, unknown>
): Promise<TemplateResult> {
  
  switch (type) {
    case 'invite': {
      const subject = `You're invited to join ${vars.orgName}`;
      const inviteVars = vars as unknown as React.ComponentProps<typeof InviteEmail>;
      const html = await render(<InviteEmail {...inviteVars} />);
      const text = await render(<InviteEmail {...inviteVars} />, { plainText: true });
      
      console.log('[TEMPLATE] ✅ Invite template rendered', {
        htmlLength: html.length,
        textLength: text.length
      });
      
      return { subject, html, text };
    }
    
    case 'contact': {
      const subject = `New contact form submission from ${vars.name}`;
      const contactVars = vars as unknown as React.ComponentProps<typeof ContactEmail>;
      const html = await render(<ContactEmail {...contactVars} />);
      const text = await render(<ContactEmail {...contactVars} />, { plainText: true });
      return { subject, html, text };
    }
    
    case 'newsletter': {
      const subject = `Welcome to Lucid Studio Newsletter`;
      const newsletterVars = vars as unknown as React.ComponentProps<typeof NewsletterWelcomeEmail>;
      const html = await render(<NewsletterWelcomeEmail {...newsletterVars} />);
      const text = await render(<NewsletterWelcomeEmail {...newsletterVars} />, { plainText: true });
      return { subject, html, text };
    }
    
    case 'passwordless': {
      const subject = `Your login code for Lucid Studio`;
      const html = `
        <html>
          <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h1>Your Login Code</h1>
            <p>Use this code to log in:</p>
            <h2 style="background: #f0f0f0; padding: 10px; text-align: center; letter-spacing: 8px;">${escapeHtml(String(vars.code))}</h2>
            <p>Or click this link: <a href="${escapeHtml(String(vars.link))}">${escapeHtml(String(vars.link))}</a></p>
            <p>This code expires in 10 minutes.</p>
          </body>
        </html>
      `;
      const text = `Your login code: ${vars.code}\n\nOr use this link: ${vars.link}\n\nExpires in 10 minutes.`;
      return { subject, html, text };
    }
    
    case 'alert': {
      const subject = (vars.subject as string) || String(vars.title) || 'Alert from Lucid Studio';
      const actionUrl = vars.actionUrl ? escapeHtml(String(vars.actionUrl)) : ''
      const actionLabel = vars.actionLabel ? escapeHtml(String(vars.actionLabel)) : 'View Details'
      const html = `
        <html>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 0; margin: 0; background: #f5f5f5;">
            <div style="max-width: 560px; margin: 40px auto; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e5e5;">
              <div style="padding: 32px;">
                <h1 style="margin: 0 0 12px; font-size: 20px; color: #111;">${escapeHtml(String(vars.title))}</h1>
                <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.5; color: #555;">${escapeHtml(String(vars.message))}</p>
                ${actionUrl ? `<a href="${actionUrl}" style="display: inline-block; padding: 10px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">${actionLabel}</a>` : ''}
              </div>
              <div style="padding: 16px 32px; border-top: 1px solid #eee; background: #fafafa;">
                <p style="margin: 0; font-size: 12px; color: #999;">Lucid Studio · Usage Alert</p>
              </div>
            </div>
          </body>
        </html>
      `;
      const text = `${vars.title}\n\n${vars.message}${actionUrl ? `\n\n${actionLabel}: ${actionUrl}` : ''}`;
      return { subject, html, text };
    }
    
    case 'receipt': {
      const subject = `Receipt for ${vars.amount}`;
      const html = `
        <html>
          <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h1>Payment Receipt</h1>
            <p>Amount: ${escapeHtml(String(vars.amount))}</p>
            <p>Transaction ID: ${escapeHtml(String(vars.transactionId))}</p>
            <p>Thank you for your payment!</p>
          </body>
        </html>
      `;
      const text = `Payment Receipt\n\nAmount: ${vars.amount}\nTransaction ID: ${vars.transactionId}\n\nThank you!`;
      return { subject, html, text };
    }
    
    default:
      throw new Error(`Unknown email template: ${type}`);
  }
}
