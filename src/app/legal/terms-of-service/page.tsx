import { type Metadata } from 'next'
import { Container } from '@/components/container'
import { FadeIn } from '@/components/FadeIn'
import { Heading } from '@/components/heading'
import HeroPattern from '@/components/hero-pattern'

export const metadata: Metadata = {
  title: 'Terms of Service - Lucid',
  description: 'Terms of Service for Lucid, a brand of RaijinLabs, Inc.',
}

export default function TermsOfService() {
  return (
    <div>
      <HeroPattern title="Terms of Service" description="Last Updated – June 2025"/>
      <Container className="py-16">
        <FadeIn>
          <div className="max-w-3xl">
            <Heading className="text-white">Lucid — Terms of Service</Heading>
            <p className="mt-2 text-base text-neutral-300">(A brand of RaijinLabs, Inc.)</p>

            <div className="mt-10 space-y-8 text-base text-neutral-300">
              <p>
                These Terms of Service (&quot;Terms&quot;, &quot;Terms of Service&quot;) govern your access to and use of the Lucid website, dashboards, AI modules, smart-contract integrations, Discord bots, and any content or functionality that links to or references these Terms (collectively, the &quot;Lucid Services&quot;). Lucid is a product line fully owned and operated by RaijinLabs, Inc. (&quot;RaijinLabs,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), a corporation. By using the Lucid Services you agree to be bound by (a) these Terms, (b) the RaijinLabs Privacy Policy, and (c) any supplemental guidelines posted within a given module or smart contract.
              </p>

              <p>
                If you do not agree to all provisions, do not use the Lucid Services.
              </p>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">1. Eligibility & Jurisdiction</h2>
                <p>
                  You must be at least 18 years old (or the age of majority in your jurisdiction) and legally competent to enter a contract.
                </p>
                <p>
                  You may not use the Lucid Services if you (i) are on any U.S. or global sanctions list, (ii) reside in a jurisdiction where digital-asset services are prohibited, or (iii) intend to violate applicable export-control or securities laws.
                </p>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">2. Core Purpose</h2>
                <p>
                  Lucid provides AI-powered tooling—NPC intelligence, in-game coaching, virtual-idol generation—plus optional Web3 functionality (NFT minting, token-gated APIs). Lucid does not sell investment contracts, equity, or profit-sharing arrangements of any kind.
                </p>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">3. Collectible Tokens — Disclaimers</h2>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium text-neutral-100">Collectible Only</h3>
                    <p>
                      Any Lucid-branded token (&quot;MYOKA&quot;) is released solely as a digital collectible—a gamified proof-of-fandom item with no intrinsic utility, governance power, profit share, fee reduction, or access privilege. You should acquire a MYOKA token only for its novelty or sentimental value, not for functional benefits.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium text-neutral-100">Not an Investment</h3>
                    <p>
                      MYOKA tokens are not offered or intended as (a) securities, (b) investment contracts, (c) revenue-sharing instruments, or (d) stores of value. RaijinLabs does not promise—or even suggest—that the token will appreciate, generate yield, or unlock future perks.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium text-neutral-100">No Development Obligation</h3>
                    <p>
                      RaijinLabs has no duty to develop additional features, markets, or use-cases for MYOKA. We may cease supporting the token, migrate to new contracts, or burn remaining supply at our sole discretion.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium text-neutral-100">Regulatory Status</h3>
                    <p>
                      Because digital-asset regulations differ worldwide and continue to evolve, possession of a MYOKA token could be restricted or outright prohibited in certain jurisdictions. You are solely responsible for ensuring that holding or transferring the token is lawful where you reside.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium text-neutral-100">Risk Warning</h3>
                    <p>
                      Collectible tokens may become illiquid, lose all resale value, or be rendered unusable by protocol changes, hacks, or regulatory action. Ownership is at your own risk; RaijinLabs provides no buyback, refund, or insurance.
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">4. Forward-Looking Statements & &quot;Best-Effort&quot; Roadmap</h2>
                <p>
                  Marketing materials, blog posts, and in-app announcements may describe planned features or future milestones. Such statements are forward-looking and inherently uncertain. Deadlines, specifications, and deliverables can change or be cancelled without notice; RaijinLabs assumes no liability for delays, revisions, or omissions.
                </p>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">5. Intellectual Property & Third-Party Marks</h2>
                <p>
                  All Lucid trademarks, logos, and code are owned by RaijinLabs.
                </p>
                <p>
                  Third-party game titles or logos that appear in compatibility lists are used nominatively to identify those games; RaijinLabs & Lucid are not endorsed by, affiliated with, or sponsored by any game publisher.
                </p>
                <p>
                  You may not reproduce or distribute our IP without written permission.
                </p>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">6. Prohibited Conduct</h2>
                <p>You agree not to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Violate laws, regulations, or third-party rights;</li>
                  <li>Deploy malware, scrape, or attempt to reverse-engineer our AI models;</li>
                  <li>Use Lucid Services to launder money, finance terrorism, or facilitate securities offerings;</li>
                  <li>Post illegal, hateful, or infringing content;</li>
                  <li>Imply partnership, sponsorship, or endorsement without a signed agreement.</li>
                </ul>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">7. No Warranty</h2>
                <p>
                  The Lucid Services are provided &quot;as is&quot; and &quot;as available.&quot; RaijinLabs disclaims all warranties—express, implied, statutory—including merchantability, fitness for a particular purpose, non-infringement, uninterrupted operation, or error-free output.
                </p>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">8. Limitation of Liability</h2>
                <p>
                  To the fullest extent permitted by law, RaijinLabs will not be liable for any indirect, incidental, special, consequential, punitive, or exemplary damages—nor any loss of profits, data, or goodwill—arising out of, or in connection with, your use of (or inability to use) the Lucid Services, even if we were advised of the possibility. Our aggregate liability shall not exceed USD 100 or the amount you paid RaijinLabs in the preceding 12 months, whichever is greater.
                </p>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">9. Indemnification</h2>
                <p>
                  You agree to indemnify, defend, and hold harmless RaijinLabs and its officers, directors, employees, and agents from any claims, damages, obligations, losses, or expenses (including reasonable attorney fees) arising from: (a) your use of the Lucid Services; (b) your violation of these Terms; or (c) your violation of any law or third-party right.
                </p>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">10. Modification & Suspension</h2>
                <p>
                  RaijinLabs may modify, suspend, or discontinue any Lucid feature at any time without liability. Updated Terms take effect once posted; continued use after the update equals acceptance.
                </p>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">11. Governing Law & Dispute Resolution</h2>
                <p>
                These Terms shall be governed by laws applicable to RaijinLabs, Inc. as a U.S. entity, without regard to conflict-of-law principles or the laws of any other jurisdiction. Any dispute, controversy, or claim arising out of or relating to these Terms, your use of the Lucid Services, or any associated token or smart contract may be resolved, at RaijinLabs&rsquo; sole discretion, through binding arbitration or in the competent courts of a jurisdiction we designate. You expressly waive any right to a jury trial or to participate in a class action proceeding.
                </p>
              </section>

              <section className="space-y-6">
                <h2 className="text-xl font-semibold text-neutral-100">12. Contact</h2>
                <p>
                  Questions? Email legal@raijinlabs.io
                </p>
              </section>
            </div>
          </div>
        </FadeIn>
      </Container>
    </div>
  )
} 