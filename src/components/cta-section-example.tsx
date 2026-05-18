import CTASection from './cta-section'

// Example usage of the CTASection component
export default function CTASectionExample() {
  return (
    <CTASection
      title="Boost your productivity today"
      description="Incididunt sint fugiat pariatur cupidatat consectetur sit cillum anim id veniam aliqua proident excepteur commodo do ea."
      primaryButton={{
        text: "Get started",
        href: "#"
      }}
      secondaryButton={{
        text: "Learn more",
        href: "#"
      }}
      backgroundGradient={{
        from: "#7775D6",
        to: "#E935C1"
      }}
    />
  )
}

// Example for Lucid AI platform
export function LucidCTASection() {
  return (
    <CTASection
      title="Ready to build the future of AI?"
      description="Join thousands of developers building on the Internet of AI. Deploy models, create agents, and scale your applications in <100ms."
      primaryButton={{
        text: "Start Building",
        href: "/get-started"
      }}
      secondaryButton={{
        text: "View Documentation",
        href: "/docs"
      }}
      backgroundGradient={{
        from: "#4f46e5",
        to: "#80caff"
      }}
    />
  )
}

// Example for enterprise sales
export function EnterpriseCTASection() {
  return (
    <CTASection
      title="Transform your business with AI"
      description="Get dedicated support, custom deployments, and enterprise-grade security. Scale your AI infrastructure with Lucid's decentralized network."
      primaryButton={{
        text: "Contact Sales",
        href: "/contact"
      }}
      secondaryButton={{
        text: "Schedule Demo",
        href: "/demo"
      }}
      backgroundGradient={{
        from: "#1e40af",
        to: "#7c3aed"
      }}
    />
  )
}

// Example for newsletter signup
export function NewsletterCTASection() {
  return (
    <CTASection
      title="Stay ahead of the AI revolution"
      description="Get the latest insights, product updates, and industry news delivered to your inbox. Join 10,000+ AI developers."
      primaryButton={{
        text: "Subscribe Now",
        href: "/newsletter"
      }}
      buttonNote="Unsubscribe anytime • We respect your privacy"
      backgroundGradient={{
        from: "#10b981",
        to: "#3b82f6"
      }}
    />
  )
}

// Example for pricing CTA
export function PricingCTASection() {
  return (
    <CTASection
      title="Choose your plan and start building"
      description="From individual developers to enterprise teams, we have the perfect plan for your AI needs. No hidden fees, cancel anytime."
      primaryButton={{
        text: "View Pricing",
        href: "/pricing"
      }}
      secondaryButton={{
        text: "Start Free Trial",
        href: "/trial"
      }}
      backgroundGradient={{
        from: "#f59e0b",
        to: "#ef4444"
      }}
    />
  )
}
