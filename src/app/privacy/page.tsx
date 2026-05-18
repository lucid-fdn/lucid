import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | Lucid Chrome Extension',
  description: 'Privacy policy for Lucid Chrome Extension - Learn how we collect, use, store, and protect your information',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <main className="mx-auto max-w-4xl px-6 py-16 lg:px-8">
        <h1 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl dark:text-white">
          Privacy Policy for Lucid Chrome Extension
        </h1>
        <p className="mt-4 text-lg font-medium text-gray-500 dark:text-gray-400">
          Effective Date: December 18, 2025
        </p>

        <div className="mt-12 space-y-12">
          {/* Introduction */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Introduction
            </h2>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
              Lucid is a Chrome extension that rewards users for their activity on ChatGPT (chatgpt.com and chat.openai.com). 
              This Privacy Policy explains how we collect, use, store, and protect your information when you use the Lucid Chrome Extension.
            </p>
          </section>

          {/* Data We Collect */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Data We Collect
            </h2>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
              We collect the following data solely to provide the core reward functionality of the extension:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-600 dark:text-gray-300">
              <li>
                <strong className="text-gray-900 dark:text-white">ChatGPT conversation content</strong> (text prompts and responses) from chatgpt.com and chat.openai.com.
              </li>
              <li>
                <strong className="text-gray-900 dark:text-white">Wallet identifiers and authentication information</strong> via Privy (including email and name, if you choose to provide them).
              </li>
              <li>
                <strong className="text-gray-900 dark:text-white">Usage metrics</strong>: message counts, token estimates, timestamps, and reward balances.
              </li>
            </ul>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed mt-6 mb-4">
              We do <strong className="text-gray-900 dark:text-white">not</strong> collect:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-600 dark:text-gray-300">
              <li>Browsing history from other websites</li>
              <li>Location data</li>
              <li>Passwords</li>
              <li>Payment card details</li>
              <li>Any data from websites other than chatgpt.com and chat.openai.com</li>
            </ul>
          </section>

          {/* How We Use Your Data */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              How We Use Your Data
            </h2>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
              Collected data is used exclusively to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-600 dark:text-gray-300">
              <li>Compute and attribute rewards based on your ChatGPT activity</li>
              <li>Associate rewards with your user account</li>
              <li>Display progress and reward balances within the extension</li>
            </ul>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed mt-4">
              We do not sell your data, share it for marketing purposes, or use it for any purpose unrelated to the extension&apos;s reward functionality.
            </p>
          </section>

          {/* Data Transmission and Security */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Data Transmission and Security
            </h2>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
              Conversation content and usage data are transmitted securely over HTTPS to our backend (api.lucid.foundation). 
              We implement industry-standard security measures, including encryption in transit and at rest, and strict access controls to protect your information.
            </p>
          </section>

          {/* Data Storage and Retention */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Data Storage and Retention
            </h2>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
              We retain your data only as long as necessary to provide the reward service and manage your account. 
              When you disconnect your wallet via Privy or uninstall the extension, data collection stops immediately, 
              and associated personal data is deleted or anonymized in accordance with applicable laws.
            </p>
          </section>

          {/* Third-Party Services */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Third-Party Services
            </h2>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
              We use Privy for wallet authentication and account association. Privy&apos;s privacy practices are governed by their own policy. 
              We do not share your data with any other third parties except as required by law.
            </p>
          </section>

          {/* User Rights and Choices */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              User Rights and Choices
            </h2>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
              You can:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-600 dark:text-gray-300">
              <li>Disconnect your wallet via Privy at any time</li>
              <li>Uninstall the extension to stop all data collection</li>
              <li>Contact us to request access, correction, or deletion of your personal data</li>
            </ul>
          </section>

          {/* Compliance with Chrome Web Store Policy */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Compliance with Chrome Web Store Policy
            </h2>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
              Our use of user data fully complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. 
              Data is collected only as necessary for the extension&apos;s core functionality and is not used for any prohibited purposes.
            </p>
          </section>

          {/* Changes to This Policy */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Changes to This Policy
            </h2>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
              We may update this policy from time to time. Material changes will be communicated through the extension or our website. 
              Continued use of the extension after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          {/* Contact Us */}
          <section className="pt-8 border-t border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              Contact Us
            </h2>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
              If you have questions or requests regarding your data, please contact us at:{' '}
              <a 
                href="mailto:privacy@lucid.foundation" 
                className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 underline"
              >
                privacy@lucid.foundation
              </a>
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
