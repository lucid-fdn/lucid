'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import ContactForm from '@/components/ContactForm'
import HeroPattern from '@/components/hero-pattern'

// Contact page configurations for different sources
const contactConfigs = {
  enterprise: {
    title: "Ready to deploy AI at scale?",
    subtitle: "Enterprise Solutions",
    description: " Let's discuss your enterprise needs. We'llhelp you find the right plan and pricing for your business.",
    formDescription: "Tell us about your AI infrastructure needs and we'll get back to you within 24 hours.",
    fields: {
      company: true,
      role: true,
      companySize: true,
      useCase: true,
      timeline: true,
      budget: true
    },
    submitText: "Contact Enterprise Sales",
    successMessage: "Thank you for your enterprise inquiry. Our sales team will contact you within 24 hours."
  },
  sales: {
    title: "Sales Inquiry",
    subtitle: "Interested in Lucid's AI infrastructure solutions?",
    description: "Get in touch with our sales team to learn more about how Lucid can transform your business with unified AI infrastructure.",
    fields: {
      company: true,
      role: true,
      useCase: true,
      timeline: true
    },
    submitText: "Contact Sales",
    successMessage: "Thank you for your inquiry. Our sales team will get back to you soon."
  },
  partnership: {
    title: "Partnership Inquiry",
    subtitle: "Let's build the future of AI together.",
    description: "Interested in partnering with Lucid? We&apos;re always looking for innovative companies to collaborate with.",
    fields: {
      company: true,
      role: true,
      partnershipType: true,
      description: true
    },
    submitText: "Submit Partnership Inquiry",
    successMessage: "Thank you for your partnership inquiry. Our partnerships team will review your submission."
  },
  support: {
    title: "Support Request",
    subtitle: "Need help with your Lucid implementation?",
    description: "Our support team is here to help you get the most out of your Lucid AI infrastructure.",
    fields: {
      company: true,
      priority: true,
      description: true
    },
    submitText: "Submit Support Request",
    successMessage: "Thank you for your support request. We'll get back to you as soon as possible."
  },
  waitinglist: {
    title: "Join the Waiting List",
    subtitle: "Be the first to experience Lucid",
    description: "Sign up for early access to Lucid's revolutionary AI infrastructure platform.",
    formTitle: "Reserve Your Spot",
    formDescription: "Join our exclusive waiting list and be among the first to access Lucid when we launch.",
    fields: {
      solanaWallet: true,
      discordId: true,
      twitterId: true
    },
    submitText: "Join Waiting List",
    successMessage: "You&apos;re on the list! We&apos;ll notify you when Lucid launches.",
    hideMessage: true,
    hideNames: true
  },
  careers: {
    title: "Apply to Join Our Team",
    subtitle: "Build the future of AI infrastructure",
    description: "We&apos;re looking for talented individuals to help us revolutionize AI verification and build trustworthy AI systems.",
    formTitle: "Job Application",
    formDescription: "Tell us about yourself and why you&apos;re interested in joining Lucid.",
    fields: {
      company: true,
      role: true,
      resume: true,
      coverLetter: true,
      portfolio: true,
      linkedin: true,
      github: true
    },
    submitText: "Submit Application",
    successMessage: "Thank you for your application! We'll review your submission and get back to you soon.",
    hideMessage: false,
    hideNames: false
  },
  default: {
    title: "Get in touch with Lucid",
    subtitle: "Ready to build the Internet of AI together?",
    description: "Let's discuss how Lucid can transform your business with unified AI infrastructure.",
    fields: {
      company: true,
      role: true,
      useCase: true
    },
    submitText: "Send Message",
    successMessage: "Thank you for your message. We'll get back to you soon."
  }
}

function ContactPageContent() {
  const searchParams = useSearchParams()
  const from = (searchParams?.get('from') as keyof typeof contactConfigs) || 'default'
  
  const config = contactConfigs[from] || contactConfigs.default

  return (
    <div className="isolate bg-white dark:bg-gray-900">
      <HeroPattern
        title={config.title}
        subtitle={config.subtitle}
        description={config.description}
      />
      
      {/* Form Section */}
      <div className="px-6 pb-24 sm:pb-32 lg:px-8">
      
        <ContactForm 
          className="mt-16 sm:mt-20" 
          config={config}
          apiEndpoint={from === 'waitinglist' ? '/api/waitinglist' : '/api/contact'}
        />
      </div>
      
      <div className="bg-white py-8 sm:py-16 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl divide-y divide-gray-100 lg:mx-0 lg:max-w-none dark:divide-white/10">
            <div className="grid grid-cols-1 gap-10 py-16 lg:grid-cols-3 border-t border-gray-100 dark:border-white/10">
              <div>
                <h2 className="text-4xl font-semibold tracking-tight text-pretty text-gray-900 dark:text-white">
                  Get in touch
                </h2>
                <p className="mt-4 text-base/7 text-gray-600 dark:text-gray-400">
                  Connect with our team across different departments. We&apos;re here to help you succeed with Lucid&apos;s AI infrastructure.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:col-span-2 lg:gap-8">
                <div className="rounded-2xl bg-gray-50 p-10 dark:bg-gray-800/50">
                  <h3 className="text-base/7 font-semibold text-gray-900 dark:text-white">Partnerships</h3>
                  <dl className="mt-3 space-y-1 text-sm/6 text-gray-600 dark:text-gray-400">
                    <div>
                      <dt className="sr-only">Email</dt>
                      <dd>
                        <a
                          href="mailto:partnerships@lucid.foundation"
                          className="font-semibold text-indigo-600 dark:text-indigo-400"
                        >
                          partnerships@lucid.foundation
                        </a>
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="rounded-2xl bg-gray-50 p-10 dark:bg-gray-800/50">
                  <h3 className="text-base/7 font-semibold text-gray-900 dark:text-white">Media & Press</h3>
                  <dl className="mt-3 space-y-1 text-sm/6 text-gray-600 dark:text-gray-400">
                    <div>
                      <dt className="sr-only">Email</dt>
                      <dd>
                        <a href="mailto:media@lucid.foundation" className="font-semibold text-indigo-600 dark:text-indigo-400">
                          media@lucid.foundation
                        </a>
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="rounded-2xl bg-gray-50 p-10 dark:bg-gray-800/50">
                  <h3 className="text-base/7 font-semibold text-gray-900 dark:text-white">Careers</h3>
                  <dl className="mt-3 space-y-1 text-sm/6 text-gray-600 dark:text-gray-400">
                    <div>
                      <dt className="sr-only">Email</dt>
                      <dd>
                        <a
                          href="mailto:careers@lucid.foundation"
                          className="font-semibold text-indigo-600 dark:text-indigo-400"
                        >
                          careers@lucid.foundation
                        </a>
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="rounded-2xl bg-gray-50 p-10 dark:bg-gray-800/50">
                  <h3 className="text-base/7 font-semibold text-gray-900 dark:text-white">Support</h3>
                  <dl className="mt-3 space-y-1 text-sm/6 text-gray-600 dark:text-gray-400">
                    <div>
                      <dt className="sr-only">Email</dt>
                      <dd>
                        <a href="mailto:support@lucid.foundation" className="font-semibold text-indigo-600 dark:text-indigo-400">
                          support@lucid.foundation
                        </a>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-10 py-16 lg:grid-cols-3">
              <div>
                <h2 className="text-4xl font-semibold tracking-tight text-pretty text-gray-900 dark:text-white">
                  Our Headquarters
                </h2>
                <p className="mt-4 text-base/7 text-gray-600 dark:text-gray-400">
                  Located in Delaware, Lucid operates as a global AI infrastructure company serving clients worldwide with enterprise-grade solutions.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:col-span-2 lg:gap-8">
                <div className="rounded-2xl bg-gray-50 p-10 dark:bg-gray-800/50">
                  <h3 className="text-base/7 font-semibold text-gray-900 dark:text-white">Delaware</h3>
                  <address className="mt-3 space-y-1 text-sm/6 text-gray-600 not-italic dark:text-gray-400">
                    <p>901 N Market St.</p>
                    <p>Wilmington, DE 19801</p>
                  </address>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ContactPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white dark:bg-gray-900" />}>
      <ContactPageContent />
    </Suspense>
  );
}
