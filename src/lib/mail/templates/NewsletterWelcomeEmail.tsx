/**
 * Newsletter Welcome Email Template
 */

import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
} from '@react-email/components';

interface NewsletterWelcomeEmailProps {
  firstName?: string;
}

export function NewsletterWelcomeEmail({ firstName }: NewsletterWelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={heading}>
              Welcome to Lucid Studio Newsletter
            </Text>
            
            <Text style={text}>
              {firstName ? `Hi ${firstName},` : 'Hi there,'}
            </Text>
            
            <Text style={text}>
              Thanks for subscribing! You'll now receive updates about new features,
              product insights, and exclusive content.
            </Text>
            
            <Button style={button} href={process.env.NEXT_PUBLIC_APP_URL || 'https://lucid.studio'}>
              Visit Lucid Studio
            </Button>
            
            <Text style={footer}>
              You're receiving this because you subscribed to our newsletter.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
};

const section = {
  padding: '0 48px',
};

const heading = {
  fontSize: '28px',
  fontWeight: '700',
  color: '#484848',
  marginBottom: '20px',
};

const text = {
  fontSize: '16px',
  lineHeight: '26px',
  color: '#484848',
  marginBottom: '15px',
};

const button = {
  backgroundColor: '#5e6ad2',
  borderRadius: '5px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 20px',
  margin: '24px 0',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  marginTop: '30px',
};
