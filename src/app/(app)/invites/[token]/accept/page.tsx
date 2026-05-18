import { redirect } from 'next/navigation';
import { getUserId } from '@/lib/auth/server-utils';
import { AcceptInvitePage } from '@/components/invites/accept-invite-page';

export const metadata = {
  title: 'Accept Invite',
  description: 'Join a workspace',
};

export default async function InviteAcceptRoute({ 
  params 
}: { 
  params: Promise<{ token: string }> 
}) {
  // Check if user is logged in
  const userId = await getUserId();
  
  if (!userId) {
    // Redirect to login with return URL
    redirect(`/login?returnTo=/invites/${(await params).token}/accept`);
  }
  
  // Render accept page
  return <AcceptInvitePage token={(await params).token} />;
}
