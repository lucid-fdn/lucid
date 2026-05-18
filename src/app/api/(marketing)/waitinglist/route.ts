import { NextRequest, NextResponse } from 'next/server';
import { saveToWaitinglist } from '@/ports/db';
import { sendTransactional } from '@/lib/mail';
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { 
      email, 
      solanaWallet,
      discordId,
      twitterId,
      agreeToPolicies
    } = await req.json();

    // Validate required fields
    if (!email || !solanaWallet || !discordId || !twitterId) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    // Save to database using facade
    try {
      await saveToWaitinglist({
        email,
        solana_wallet: solanaWallet,
        discord_id: discordId,
        twitter_id: twitterId,
        status: 'pending',
        metadata: {
          agreed_to_policies: agreeToPolicies,
          signup_date: new Date().toISOString(),
          user_agent: req.headers.get('user-agent'),
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
        }
      });
    } catch (dbError: unknown) {
      ErrorService.captureException(dbError, {
      severity: 'error',
      context: {
        endpoint: '/(marketing)/waitinglist/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
      
      // Handle duplicate entries
      if (dbError instanceof Error && 'code' in dbError && (dbError as { code: string }).code === '23505') {
        return NextResponse.json({ 
          error: 'This email or wallet is already on the waiting list' 
        }, { status: 409 });
      }
      
      return NextResponse.json({ error: 'Failed to save submission' }, { status: 500 });
    }

    // Send email notification via centralized system
    try {
      await sendTransactional('alert', 'waitinglist@lucid.foundation', {
        subject: '🎉 New Waiting List Signup',
        title: '🎉 New Waiting List Signup',
        message: `Email: ${email}\nSolana Wallet: ${solanaWallet}\nDiscord ID: ${discordId}\nTwitter ID: ${twitterId}\nAgreed to Privacy Policy: ${agreeToPolicies ? 'Yes' : 'No'}\n\nSigned up on ${new Date().toLocaleString()}`,
      });
    } catch (_emailError) {
      ErrorService.captureException(_emailError, {
      severity: 'error',
      context: {
        endpoint: '/(marketing)/waitinglist/route.ts',
        method: 'REQUEST'
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
          text: '🎉 New Waiting List Signup!',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*🚀 New Waiting List Signup*\n\n*Email:* <mailto:${email}|${email}>\n*Solana Wallet:* \`${solanaWallet}\`\n*Discord ID:* ${discordId}\n*Twitter ID:* <https://twitter.com/${twitterId.replace('@', '')}|${twitterId}>\n*Status:* 🟡 Pending\n*Agreed to Privacy Policy:* ${agreeToPolicies ? '✅ Yes' : '❌ No'}`,
              },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `Signed up at ${new Date().toLocaleString()}`,
                },
              ],
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '📧 Email' },
                  url: `mailto:${email}`,
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '🐦 Twitter' },
                  url: `https://twitter.com/${twitterId.replace('@', '')}`,
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
          console.error('Slack send failed:', await slackResponse.text());
        }
      } catch (slackError) {
        console.error('Slack notification error:', slackError);
      }
    }

    return NextResponse.json({ 
      success: true,
      message: 'Successfully joined the waiting list!' 
    });
  } catch (error: unknown) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/(marketing)/waitinglist/route.ts',
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
