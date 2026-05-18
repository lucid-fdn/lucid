/**
 * Organization Invite Email Template
 */

import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Img,
} from '@react-email/components';

interface InviteEmailProps {
  orgName: string;
  role: string;
  acceptUrl: string;
  inviterName?: string;
  message?: string;
}

export function InviteEmail({
  orgName,
  role,
  acceptUrl,
  inviterName,
  message,
}: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            {/* Lucid Logo */}
            <Img
              src="https://ik.imagekit.io/g1noocuou2/lucid_black_big.png"
              width="120"
              height="120"
              alt="Lucid"
              style={logo}
            />
            
            <Text style={heading}>Join {orgName}</Text>
            
            {inviterName && (
              <Text style={text}>
                {inviterName} has invited you to join {orgName}
              </Text>
            )}
            
            <Text style={text}>
              You've been invited as <strong>{role}</strong>.
            </Text>
            
            {message && (
              <>
                <Hr style={hr} />
                <Text style={messageText}>
                  <strong>{inviterName || 'The inviter'} says:</strong>
                </Text>
                <Text style={messageBox}>
                  {message}
                </Text>
              </>
            )}
            
            {/* Bulletproof button that Gmail NEVER promotes */}
            <div style={{ textAlign: 'center' }}>
              <table role="presentation" border={0} cellPadding={0} cellSpacing={0} style={{ margin: '0 auto' }}>
                <tbody>
                  <tr>
                    <td
                      align="center"
                      style={{
                        borderRadius: '8px',
                        backgroundColor: '#5e6ad2',
                      }}
                    >
                      <a
                        href={acceptUrl}
                        target="_blank"
                        style={{
                          backgroundColor: '#081D3C',
                          borderRadius: '8px',
                          color: '#ffffff',
                          fontSize: '16px',
                          fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
                          fontWeight: 'bold',
                          textDecoration: 'none',
                          padding: '0px 22px',
                          display: 'inline-block',
                          lineHeight: '48px',
                        }}
                      >
                        Accept Invite
                      </a>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p 
              style={{
                fontSize: '12px',
                lineHeight: '16px',
                color: '#8898aa',
                textAlign: 'center',
                marginTop: '16px',
                marginBottom: '16px'
              }}
            >
                This link expires in 7 days. If you didn't expect this invitation, you can ignore this email.
            </p>
            
            <Hr style={hr} />
            
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '48px 0 48px',
  marginBottom: '64px',
};

const section = {
  padding: '0 48px',
};

const logo = {
  margin: '0 auto 32px',
  display: 'block',
};

const heading = {
  fontSize: '32px',
  lineHeight: '1.3',
  fontWeight: '700',
  color: '#484848',
};

const text = {
  fontSize: '16px',
  lineHeight: '26px',
  color: '#484848',
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
};

const _footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  textAlign: 'center' as const,
  marginTop: '16px',
};

const messageText = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#484848',
  marginTop: '16px',
  marginBottom: '8px',
};

const messageBox = {
  fontSize: '16px',
  lineHeight: '26px',
  color: '#484848',
  backgroundColor: '#f6f9fc',
  padding: '16px',
  borderRadius: '5px',
  borderLeft: '3px solid #5e6ad2',
  fontStyle: 'italic',
};
