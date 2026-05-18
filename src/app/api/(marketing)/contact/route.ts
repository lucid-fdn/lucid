import { NextRequest, NextResponse } from 'next/server';
import { saveContact } from '@/ports/db';
import { sendTransactional } from '@/lib/mail';
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { 
      firstName, 
      lastName, 
      company, 
      email, 
      phoneNumber, 
      message, 
      agreeToPolicies,
      role,
      companySize,
      useCase,
      timeline,
      budget,
      partnershipType,
      priority,
      description,
      source,
      formType,
      solanaWallet,
      discordId,
      twitterId
    } = await req.json();

    // Save to database using facade
    try {
      await saveContact({
        first_name: firstName,
        last_name: lastName,
        company,
        email,
        phone_number: phoneNumber,
        message,
        agree_to_policies: agreeToPolicies,
        role,
        company_size: companySize,
        use_case: useCase,
        timeline,
        budget,
        partnership_type: partnershipType,
        priority,
        description,
        source,
        form_type: formType,
        solana_wallet: solanaWallet,
        discord_id: discordId,
        twitter_id: twitterId,
      });
      
    } catch (dbError) {
      ErrorService.captureException(dbError, {
        severity: 'error',
        context: {
          endpoint: '/(marketing)/contact/route.ts',
          method: 'REQUEST',
          operation: 'saveContact'
        },
        tags: {
          layer: 'api',
          route: 'route.ts'
        }
      });
      return NextResponse.json({ error: 'Failed to save submission' }, { status: 500 });
    }

    // Send email via centralized system
    try {
      await sendTransactional('contact', 'contact@lucid.foundation', {
        name: `${firstName || ''} ${lastName || ''}`.trim() || 'N/A',
        email,
        company: company || undefined,
        message: [
          phoneNumber && `Phone: ${phoneNumber}`,
          role && `Role: ${role}`,
          companySize && `Company Size: ${companySize}`,
          useCase && `Use Case: ${useCase}`,
          timeline && `Timeline: ${timeline}`,
          budget && `Budget: ${budget}`,
          partnershipType && `Partnership Type: ${partnershipType}`,
          priority && `Priority: ${priority}`,
          description && `Description: ${description}`,
          solanaWallet && `Solana Wallet: ${solanaWallet}`,
          discordId && `Discord: ${discordId}`,
          twitterId && `Twitter: ${twitterId}`,
          message && `\nMessage:\n${message}`,
          `\nAgreed to Privacy Policy: ${agreeToPolicies ? 'Yes' : 'No'}`,
        ].filter(Boolean).join('\n'),
      });
    } catch (emailError) {
      ErrorService.captureException(emailError, {
        severity: 'error',
        context: {
          endpoint: '/(marketing)/contact/route.ts',
          method: 'REQUEST',
          operation: 'sendTransactional'
        },
        tags: {
          layer: 'api',
          route: 'route.ts'
        }
      });
      // Don't fail the entire request if email fails
    }

    // Send to Slack (optional)
    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        const slackPayload = {
          text: `🎉 New ${source || 'Contact'} Submission!`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*New ${source || 'Contact'} Inquiry*\n${firstName ? `*Name:* ${firstName} ${lastName || ''}\n` : ''}*Email:* <mailto:${email}|${email}>\n${company ? `*Company:* ${company}\n` : ''}${phoneNumber ? `*Phone:* ${phoneNumber}\n` : ''}${role ? `*Role:* ${role}\n` : ''}${companySize ? `*Company Size:* ${companySize}\n` : ''}${useCase ? `*Use Case:* ${useCase}\n` : ''}${timeline ? `*Timeline:* ${timeline}\n` : ''}${budget ? `*Budget:* ${budget}\n` : ''}${partnershipType ? `*Partnership Type:* ${partnershipType}\n` : ''}${priority ? `*Priority:* ${priority}\n` : ''}${description ? `*Description:* ${description}\n` : ''}${solanaWallet ? `*Solana Wallet:* ${solanaWallet}\n` : ''}${discordId ? `*Discord ID:* ${discordId}\n` : ''}${twitterId ? `*Twitter ID:* ${twitterId}\n` : ''}${message ? `\n*Message:*\n${message}\n` : ''}*Agreed to Privacy Policy:* ${agreeToPolicies ? 'Yes' : 'No'}`,
              },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'Reply' },
                  action_id: 'reply',
                  url: `mailto:${email}?subject=Re: Your Inquiry`,
                },
              ],
            },
          ],
        };

        const slackResponse = await fetch(process.env.SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slackPayload),
        });

        if (!slackResponse.ok) {
          ErrorService.captureException(new Error('Slack notification failed'), {
            severity: 'warning',
            context: { endpoint: '/(marketing)/contact/route.ts', operation: 'slackNotify' },
            tags: { layer: 'api', route: 'route.ts' }
          });
        }
      } catch (slackError) {
        ErrorService.captureException(slackError, {
          severity: 'warning',
          context: { endpoint: '/(marketing)/contact/route.ts', operation: 'slackNotify' },
          tags: { layer: 'api', route: 'route.ts' }
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/(marketing)/contact/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json({ error: 'Failed to process submission' }, { status: 500 });
  }
}
