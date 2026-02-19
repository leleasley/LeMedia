import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy - LeMedia",
  description: "Privacy Policy for LeMedia",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-900 text-gray-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <Link href="/login" className="text-blue-400 hover:text-blue-300">
            ← Back to Login
          </Link>
        </div>

        <article className="prose prose-invert max-w-none">
          <h1 className="text-4xl font-bold mb-8 text-white">Privacy Policy</h1>

          <p className="mb-6 text-gray-300">
            <strong>Last Updated:</strong> February 2026
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">Introduction</h2>
          <p className="mb-4 text-gray-300">
            LeMedia ("we", "our", or "us") operates the LeMedia application. This Privacy Policy explains how we collect, use, disclose, and otherwise handle your information when you use our application.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">1. Information We Collect</h2>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">1.1 Account Information</h3>
          <p className="mb-4 text-gray-300">
            When you create an account, we collect:
          </p>
          <ul className="list-disc list-inside mb-4 text-gray-300 space-y-2">
            <li>Username and password</li>
            <li>Email address (if provided)</li>
            <li>Display name (if provided)</li>
            <li>Profile avatar (if provided)</li>
          </ul>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">1.2 Media Activity & Preferences</h3>
          <p className="mb-4 text-gray-300">
            To provide personalized recommendations and features, we collect:
          </p>
          <ul className="list-disc list-inside mb-4 text-gray-300 space-y-2">
            <li>Media requests and availability checks</li>
            <li>Reviews and ratings</li>
            <li>Watchlist and activity history</li>
            <li>Media preferences and browsing history</li>
            <li>Calendar feed subscriptions</li>
          </ul>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">1.3 Third-Party Integrations</h3>
          <p className="mb-4 text-gray-300">
            We integrate with external media providers. When you authorize access, we collect:
          </p>
          <ul className="list-disc list-inside mb-4 text-gray-300 space-y-2">
            <li>Jellyfin/Plex availability data for your media library</li>
            <li>TMDB (The Movie Database) information for media details</li>
            <li>SSO/Social login information (Google, GitHub, OIDC providers)</li>
            <li>Sonarr/Radarr integration data (if configured)</li>
          </ul>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">1.4 Technical & Security Information</h3>
          <p className="mb-4 text-gray-300">
            For security and functionality:
          </p>
          <ul className="list-disc list-inside mb-4 text-gray-300 space-y-2">
            <li>Session tokens and authentication data</li>
            <li>IP addresses and user-agent information (for rate limiting and security)</li>
            <li>Device labels and browser information</li>
            <li>Cloudflare Turnstile verification tokens (for bot protection)</li>
            <li>WebAuthn/passkey credentials (stored securely)</li>
          </ul>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">1.5 Push Notifications & Preferences</h3>
          <p className="mb-4 text-gray-300">
            When you enable push notifications:
          </p>
          <ul className="list-disc list-inside mb-4 text-gray-300 space-y-2">
            <li>Web push subscription endpoints</li>
            <li>Push notification preferences</li>
            <li>Device and browser capabilities</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">2. How We Use Your Information</h2>
          <ul className="list-disc list-inside mb-4 text-gray-300 space-y-2">
            <li>Provide and improve the LeMedia service</li>
            <li>Authenticate and manage your account</li>
            <li>Enable personalized recommendations</li>
            <li>Send notifications about media availability and requests</li>
            <li>Prevent fraud, abuse, and security threats</li>
            <li>Comply with legal obligations</li>
            <li>Analyze usage patterns and improve features</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">3. Third-Party Data Sharing</h2>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">3.1 Cloudflare</h3>
          <p className="mb-4 text-gray-300">
            We use Cloudflare Turnstile for bot protection. When you interact with the login form, Cloudflare may collect:
          </p>
          <ul className="list-disc list-inside mb-4 text-gray-300 space-y-2">
            <li>Bot detection tokens</li>
            <li>IP addresses</li>
            <li>Browser information</li>
          </ul>
          <p className="mb-4 text-gray-300">
            <a href="https://www.cloudflare.com/privacypolicy/" className="text-blue-400 hover:text-blue-300">Cloudflare Privacy Policy</a>
          </p>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">3.2 Media Providers</h3>
          <p className="mb-4 text-gray-300">
            Data is shared with third-party services you authorize:
          </p>
          <ul className="list-disc list-inside mb-4 text-gray-300 space-y-2">
            <li><strong>TMDB:</strong> Media queries and your activity</li>
            <li><strong>Jellyfin/Plex:</strong> Availability checks for media in your library</li>
            <li><strong>SSO Providers:</strong> Google, GitHub, or OIDC providers receive authentication requests</li>
            <li><strong>Sonarr/Radarr:</strong> If configured, we sync media requests</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">4. Data Storage & Retention</h2>
          <p className="mb-4 text-gray-300">
            We retain your data for as long as your account exists. You can request data deletion by contacting an administrator. Session data and rate-limiting data are typically retained for short periods (hours to days). Application data is retained until account deletion.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">5. Cookie Usage</h2>
          <p className="mb-4 text-gray-300">
            See our <Link href="/cookies" className="text-blue-400 hover:text-blue-300">Cookies Policy</Link> for detailed information about how we use cookies and similar tracking technologies.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">6. Your Privacy Rights</h2>
          <p className="mb-4 text-gray-300">
            Depending on your location, you may have certain rights:
          </p>
          <ul className="list-disc list-inside mb-4 text-gray-300 space-y-2">
            <li><strong>Access:</strong> Request a copy of your data</li>
            <li><strong>Deletion:</strong> Request removal of your account and data</li>
            <li><strong>Correction:</strong> Update inaccurate information</li>
            <li><strong>Opt-out:</strong> Disable notifications and analytics</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">7. Security</h2>
          <p className="mb-4 text-gray-300">
            We implement industry-standard security measures to protect your information:
          </p>
          <ul className="list-disc list-inside mb-4 text-gray-300 space-y-2">
            <li>HTTPS encryption for all data in transit</li>
            <li>Secure session token management</li>
            <li>WebAuthn/passkey support for secure authentication</li>
            <li>Rate limiting and bot protection</li>
            <li>Regular security updates and patching</li>
          </ul>
          <p className="mb-4 text-gray-300">
            However, no security system is impenetrable. We encourage you to set a strong password and enable multi-factor authentication.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">8. Changes to This Policy</h2>
          <p className="mb-4 text-gray-300">
            We may update this Privacy Policy from time to time. We will notify you of any material changes by updating the "Last Updated" date.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">9. Contact Us</h2>
          <p className="mb-4 text-gray-300">
            If you have questions about this Privacy Policy or our privacy practices, please contact your server administrator.
          </p>

          <div className="mt-12 pt-8 border-t border-gray-700">
            <p className="text-sm text-gray-400">
              © 2026 LeMedia. All rights reserved. This Privacy Policy is provided for our users' information and protection.
            </p>
          </div>
        </article>
      </div>
    </main>
  );
}
