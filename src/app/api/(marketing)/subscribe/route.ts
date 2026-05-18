import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import { NextRequest, NextResponse } from 'next/server';
import { saveToNewsletter } from '@/ports/db';
import { ErrorService } from '@/lib/errors/error-service';

export const dynamic = 'force-dynamic'

// Lazy init to avoid build-time crash when env vars are missing
let _mg: ReturnType<InstanceType<typeof Mailgun>['client']> | null | undefined;
function getMg() {
  if (_mg === undefined) {
    const mailgun = new Mailgun(FormData);
    _mg = process.env.MAILGUN_API_KEY
      ? mailgun.client({
          username: 'api',
          key: process.env.MAILGUN_API_KEY,
          url: 'https://api.mailgun.net'
        })
      : null;
  }
  return _mg;
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    // Store in database using facade (optional)
    try {
      await saveToNewsletter({
        email,
        subscribed_at: new Date(),
      });
    } catch (dbError) {
      ErrorService.captureException(dbError, {
      severity: 'error',
      context: {
        endpoint: '/(marketing)/subscribe/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
      // Don't fail the entire request if database fails
    }

    // Add to Mailgun mailing list (optional)
    const mg = getMg();
    if (mg) {
      try {
        await mg.lists.members.createMember('newsletter@sandboxa1e0d806a9ab404c83f4d680811935f7.mailgun.org', {
          address: email,
          subscribed: true,
        });

        // Send confirmation email using Mailgun template
        await mg.messages.create('sandboxa1e0d806a9ab404c83f4d680811935f7.mailgun.org', {
          from: `Newsletter <news@sandboxa1e0d806a9ab404c83f4d680811935f7.mailgun.org>`,
          to: email,
          subject: 'Welcome to Our Newsletter!',
          template: 'confirmation-email',
          'h:X-Email': email,
        });
      } catch (mailgunError) {
        console.error('Mailgun error:', mailgunError);
        // Don't fail the entire request if Mailgun fails
      }
    }

    return NextResponse.json({ message: 'Subscribed successfully!' });
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '/(marketing)/subscribe/route.ts',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: 'route.ts'
      }
    });
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
  }
}
