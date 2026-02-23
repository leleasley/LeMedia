import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cookies Policy - LeMedia",
  description: "Cookies Policy for LeMedia",
};

export default function CookiesPage() {
  return (
    <main className="min-h-screen bg-slate-900 text-gray-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <Link href="/login" className="text-blue-400 hover:text-blue-300">
            ← Back to Login
          </Link>
        </div>

        <article className="prose prose-invert max-w-none">
          <h1 className="text-4xl font-bold mb-8 text-white">Cookies Policy</h1>

          <p className="mb-6 text-gray-300">
            <strong>Last Updated:</strong> February 2026
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">Introduction</h2>
          <p className="mb-4 text-gray-300">
            LeMedia uses cookies and similar technologies to enable your account to function properly, enhance security, and improve your experience. This policy explains what cookies we use and how you can control them.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">What Are Cookies?</h2>
          <p className="mb-4 text-gray-300">
            Cookies are small text files stored on your device. They help websites remember information about you, like your login status and preferences. Similar technologies include local storage, session storage, and web beacons.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">Cookie Consent</h2>
          <p className="mb-4 text-gray-300">
            <strong>By default, we do not set non-essential cookies until you accept them.</strong> When you first visit LeMedia, you&apos;ll see a cookie consent banner. Only essential cookies (required for authentication and security) are set by default.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">Types of Cookies We Use</h2>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">1. Essential Cookies (Always Required)</h3>
          <p className="mb-4 text-gray-300">
            These cookies are necessary for the app to function. <strong>You cannot disable these without losing functionality.</strong>
          </p>
          <table className="w-full border-collapse mb-6 text-sm">
            <thead>
              <tr className="border-b border-gray-600">
                <th className="text-left py-2 px-2">Cookie Name</th>
                <th className="text-left py-2 px-2">Purpose</th>
                <th className="text-left py-2 px-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-700">
                <td className="py-2 px-2 font-mono text-xs">lemedia_session</td>
                <td className="py-2 px-2">Maintains your logged-in session</td>
                <td className="py-2 px-2">30 days (configurable)</td>
              </tr>
              <tr className="border-b border-gray-700">
                <td className="py-2 px-2 font-mono text-xs">lemedia_csrf</td>
                <td className="py-2 px-2">Prevents CSRF attacks on form submissions</td>
                <td className="py-2 px-2">30 days</td>
              </tr>
              <tr className="border-b border-gray-700">
                <td className="py-2 px-2 font-mono text-xs">lemedia_flash</td>
                <td className="py-2 px-2">Displays one-time success messages</td>
                <td className="py-2 px-2">Session</td>
              </tr>
              <tr className="border-b border-gray-700">
                <td className="py-2 px-2 font-mono text-xs">lemedia_flash_error</td>
                <td className="py-2 px-2">Displays one-time error messages</td>
                <td className="py-2 px-2">Session</td>
              </tr>
              <tr>
                <td className="py-2 px-2 font-mono text-xs">lemedia_consent</td>
                <td className="py-2 px-2">Stores your cookie consent choice</td>
                <td className="py-2 px-2">1 year</td>
              </tr>
            </tbody>
          </table>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">2. Analytics & Performance Cookies (Requires Consent)</h3>
          <p className="mb-4 text-gray-300">
            Currently, we do not implement third-party analytics cookies. Future analytics implementation will require explicit consent.
          </p>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">3. Third-Party Cookies</h3>
          <p className="mb-4 text-gray-300">
            <strong>Cloudflare Turnstile:</strong> On the login page, Cloudflare may set cookies for bot detection. This is essential for account security.
          </p>
          <p className="mb-4 text-gray-300">
            <strong>Third-Party Integrations:</strong> When you authorize SSO providers (Google, GitHub, OIDC), those services may set their own cookies. Consult their privacy policies for details.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">Browser Storage Technologies</h2>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">Local Storage</h3>
          <p className="mb-4 text-gray-300">
            We use browser local storage to remember:
          </p>
          <ul className="list-disc list-inside mb-4 text-gray-300 space-y-2">
            <li>Your color theme preference (dark/light mode)</li>
            <li>UI state (like sidebar open/closed)</li>
            <li>Consent preferences</li>
          </ul>
          <p className="mb-4 text-gray-300">
            Local storage persists until you manually clear it or uninstall the app.
          </p>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">Session Storage</h3>
          <p className="mb-4 text-gray-300">
            Session storage is used for temporary data during your browsing session (like unsubmitted form data) and is automatically cleared when you close your browser.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">Managing Your Cookie Preferences</h2>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">Change Your Preferences</h3>
          <p className="mb-4 text-gray-300">
            You can change your cookie consent at any time by:
          </p>
          <ol className="list-decimal list-inside mb-4 text-gray-300 space-y-2">
            <li>Looking for the cookie banner on the login page</li>
            <li>Accessing your account settings (coming soon)</li>
            <li>Clearing your browser cookies and revisiting the app</li>
          </ol>

          <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">Browser Settings</h3>
          <p className="mb-4 text-gray-300">
            Your browser provides controls to manage cookies:
          </p>
          <ul className="list-disc list-inside mb-4 text-gray-300 space-y-2">
            <li><strong>Chrome:</strong> Settings → Privacy and security → Cookies and other site data</li>
            <li><strong>Firefox:</strong> Preferences → Privacy & Security → Cookies and Site Data</li>
            <li><strong>Safari:</strong> Preferences → Privacy → Manage Website Data</li>
            <li><strong>Edge:</strong> Settings → Privacy, search, and services → Cookies and other site data</li>
          </ul>

          <p className="mb-4 text-gray-300 mt-6">
            <strong>Warning:</strong> Disabling essential cookies may prevent you from logging in or using LeMedia properly.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">Data Sharing via Cookies</h2>
          <p className="mb-4 text-gray-300">
            When you accept cookies, we may:
          </p>
          <ul className="list-disc list-inside mb-4 text-gray-300 space-y-2">
            <li>Store your consent preference with us</li>
            <li>Allow Cloudflare Turnstile to set bot-detection cookies for security</li>
            <li>Allow SSO providers to set authentication cookies</li>
          </ul>
          <p className="mb-4 text-gray-300">
            Your authentication tokens are never shared with third parties without explicit authorization.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">Do Not Track (DNT)</h2>
          <p className="mb-4 text-gray-300">
            If your browser is configured with &quot;Do Not Track&quot; enabled, we respect that preference and will limit non-essential cookies accordingly.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">Policy Updates</h2>
          <p className="mb-4 text-gray-300">
            We may update this Cookies Policy periodically. Any material changes will be reflected in the &quot;Last Updated&quot; date above.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4 text-white">Contact</h2>
          <p className="mb-4 text-gray-300">
            For questions about our cookie practices, please contact your server administrator or refer to our <Link href="/privacy" className="text-blue-400 hover:text-blue-300">Privacy Policy</Link>.
          </p>

          <div className="mt-12 pt-8 border-t border-gray-700">
            <p className="text-sm text-gray-400">
              © 2026 LeMedia. All rights reserved. This Cookies Policy explains our use of cookies and similar technologies.
            </p>
          </div>
        </article>
      </div>
    </main>
  );
}
