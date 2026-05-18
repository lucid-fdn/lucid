import { type Metadata } from 'next'
import { Container } from '@/components/container'
import { FadeIn } from '@/components/FadeIn'  
import HeroPattern from '@/components/hero-pattern'

export const metadata: Metadata = {
  title: 'Privacy Policy - Lucid',
  description: 'Privacy Policy for Lucid (operated by RaijinLabs, Inc.)',
}

export default function PrivacyPolicy() {
  return (
    <div>
      <HeroPattern title="Lucid — Privacy Policy" description="Last Updated – June 2025"/>
      <Container className="py-16">
        <FadeIn>
          <div className="max-w-3xl">
            <div className="space-y-8 text-base text-neutral-300">
              <p>
                RaijinLabs, Inc. (&quot;RaijinLabs,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), operating as &quot;Lucid,&quot; builds AI-powered workspace and agent deployment tools for businesses and creators. Protecting your privacy is fundamental to the trust our customers place in us. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use https://lucid.foundation, the Lucid Studio application, our related APIs, integrations, and any other services that link to this Privacy Policy (collectively, the &quot;Services&quot;).
              </p>

              <p>
                By accessing or using the Services, you acknowledge that you have read, understood, and agreed to the terms of this Privacy Policy. If you do not agree, do not use the Services.
              </p>

              <section className="space-y-8">
                <h2 className="text-xl font-semibold text-neutral-100">1. Information We Collect</h2>
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-neutral-100">1.1 Information You Provide Directly</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Account Information: Name, email address, username, password, wallet address, and other identifiers used to register or authenticate.</li>
                    <li>Profile & Content: Biographical details, avatars, messages, support tickets, and any files you upload.</li>
                    <li>Payment Information: Billing name, address, partial bank details, or token-transaction metadata processed by PCI-DSS compliant partners.</li>
                  </ul>

                  <h3 className="text-lg font-medium text-neutral-100">1.2 Information We Collect Automatically</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Usage Data: Log files, device identifiers, browser type, OS, referral URL, clickstream data, and session timestamps.</li>
                    <li>Cookies & Similar Technologies: We use cookies, web beacons, and local storage to keep you logged in, personalize content, and analyze traffic. See Section 7.</li>
                  </ul>

                  <h3 className="text-lg font-medium text-neutral-100">1.3 Blockchain & Smart-Contract Data</h3>
                  <p>
                    Interactions with public blockchains (e.g., wallet address, token balances, NFT metadata, transaction IDs) are, by design, public and immutable. RaijinLabs cannot modify or erase on-chain data.
                  </p>

                  <h3 className="text-lg font-medium text-neutral-100">1.4 Information from Third Parties</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Analytics & Ad Providers: Non-identifiable metrics about site performance and campaign effectiveness.</li>
                    <li>Integration Partners: Data you allow us to import from Discord, GitHub, or other platforms.</li>
                  </ul>
                </div>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">2. How We Use Your Information</h2>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Provide, operate, and maintain the Services;</li>
                  <li>Authenticate users and secure accounts;</li>
                  <li>Process transactions and smart-contract interactions;</li>
                  <li>Customize content, recommendations, and marketing;</li>
                  <li>Monitor, detect, and prevent fraud, abuse, and security incidents;</li>
                  <li>Comply with legal and regulatory obligations.</li>
                </ul>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">3. Legal Bases for Processing (EEA & UK)</h2>
                <p>We rely on the following legal bases under the GDPR:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Contractual necessity – to deliver the Services you request;</li>
                  <li>Legitimate interests – to improve, secure, and market our Services;</li>
                  <li>Consent – for optional cookies and marketing;</li>
                  <li>Legal obligation – to satisfy KYC/AML or tax requirements.</li>
                </ul>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">4. How We Share Information</h2>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Service Providers: Hosting, analytics, customer support, payment processing.</li>
                  <li>Business Transfers: In connection with a merger, acquisition, or asset sale.</li>
                  <li>Legal Compliance: When required by subpoena, court order, or applicable law.</li>
                  <li>Community Visibility: On-chain data is inherently public; exercise caution when associating a wallet with personal details.</li>
                </ul>
                <p>We do not sell or rent personal data.</p>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">5. Security</h2>
                <p>
                  We implement appropriate technical, administrative, and physical safeguards (e.g., TLS 1.3, encryption at rest, least-privilege access) to protect your data. However, no system is completely secure.
                </p>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">6. Your Rights & Choices</h2>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Access/Correction: Update your account information at any time.</li>
                  <li>Deletion: Request erasure, subject to legal retention.</li>
                  <li>Marketing Opt-Out: Click &quot;unsubscribe&quot; or update preferences.</li>
                  <li>Cookie Controls: Manage via browser or our cookie banner.</li>
                  <li>GDPR/CCPA Requests: Contact us at privacy@raijinlabs.io.</li>
                </ul>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">7. Cookies & Tracking Technologies</h2>
                <p>We use:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Essential Cookies – for login and security;</li>
                  <li>Analytics Cookies – to understand user behavior;</li>
                  <li>Marketing Cookies – only with your consent.</li>
                </ul>
                <p>Disabling cookies may limit functionality.</p>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">8. International Transfers</h2>
                <p>
                  We operate globally. If you are located in the EEA/UK, your data may be transferred outside your jurisdiction. We rely on Standard Contractual Clauses or equivalent safeguards.
                </p>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">9. Children&apos;s Privacy</h2>
                <p>
                  Our Services are not directed to children under 13 (or under 16 in some jurisdictions). We do not knowingly collect data from minors. Contact us if you believe we have done so.
                </p>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">10. Changes to This Policy</h2>
                <p>
                  We may update this Privacy Policy. Significant changes will be posted on this page or communicated via email/in-app notification.
                </p>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">11. Contact Us</h2>
                <p>
                  RaijinLabs, Inc.<br />
                  privacy@raijinlabs.io
                </p>
              </section>
            </div>
          </div>
        </FadeIn>
      </Container>
    </div>
  )
} 