/**
 * Contact Form Email Template
 */

import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
} from '@react-email/components';

interface ContactEmailProps {
  name: string;
  email: string;
  company?: string;
  message: string;
}

export function ContactEmail({ name, email, company, message }: ContactEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={heading}>New Contact Form Submission</Text>
            
            <Text style={text}><strong>Name:</strong> {name}</Text>
            <Text style={text}><strong>Email:</strong> {email}</Text>
            {company && <Text style={text}><strong>Company:</strong> {company}</Text>}
            
            <Hr style={hr} />
            
            <Text style={text}><strong>Message:</strong></Text>
            <Text style={messageStyle}>{message}</Text>
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
  fontSize: '24px',
  fontWeight: '700',
  color: '#484848',
};

const text = {
  fontSize: '16px',
  lineHeight: '26px',
  color: '#484848',
  marginBottom: '10px',
};

const messageStyle = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#666',
  padding: '20px',
  backgroundColor: '#f6f9fc',
  borderRadius: '5px',
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
};
